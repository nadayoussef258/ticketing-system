import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf, NgFor } from '@angular/common';
import { TranslatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { Department, TicketCategory, TicketPriority } from '../../../core/models';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

@Component({
  selector: 'app-new-ticket',
  imports: [FormsModule, NgIf, NgFor, RouterLink, NavbarComponent, TranslatePipe],
  templateUrl: './new-ticket.component.html',
  styleUrls: ['./new-ticket.component.css']
})
export class NewTicketComponent implements OnInit {

  form: {
    requester_name: string;
    department_id: string;
    subject: string;
    description: string;
    priority: TicketPriority;
    category: TicketCategory;
  } = {
    requester_name: '',   // the project account is shared, so the person types their name every time
    department_id: '',
    subject: '',
    description: '',
    priority: 'medium',
    category: 'other',
  };

  departments = signal<Department[]>([]);
  departmentsLoading = signal(true);

  selectedFiles: File[] = [];
  fileError = signal('');
  loading = signal(false);
  error = signal('');

  constructor(
    public auth: AuthService,
    public deptSvc: DepartmentService,
    private ticketSvc: TicketService,
    private supabase: SupabaseService,
    private router: Router,
    private i18n: TranslationService,
  ) {}

  async ngOnInit() {
    const projectId = this.auth.user()?.project_id;
    if (!projectId) { this.departmentsLoading.set(false); return; }
    try {
      this.departments.set(await this.deptSvc.listByProject(projectId, true));
    } catch (err) {
      console.warn('Could not load departments:', err);
    } finally {
      this.departmentsLoading.set(false);
    }
  }

  /** Department is required only when the project has departments set up. */
  get needsDepartment(): boolean {
    return this.departments().length > 0;
  }

  get canSubmit(): boolean {
    const f = this.form;
    return f.requester_name.trim().length >= 2
      && f.subject.trim().length >= 5
      && f.description.trim().length >= 10
      && (!this.needsDepartment || !!f.department_id)
      && !this.loading()
      && !this.departmentsLoading();
  }

  onFileSelect(event: Event) {
    this.fileError.set('');
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    for (const file of files) {
      const isAccepted =
        file.type.startsWith('image/') ||
        file.type.startsWith('video/') ||
        file.type === 'application/pdf';
      if (!isAccepted) {
        this.fileError.set(this.i18n.t('file.badType', { name: file.name }));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        this.fileError.set(this.i18n.t('file.tooBig', { name: file.name }));
        continue;
      }
      this.selectedFiles.push(file);
    }
    input.value = ''; // allow re-selecting the same file
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
  }

  private async uploadAttachments(ticketId: string): Promise<string[]> {
    const urls: string[] = [];
    for (const file of this.selectedFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${ticketId}/${Date.now()}-${safeName}`;
      const { error } = await this.supabase.client.storage
        .from('ticket-attachments')
        .upload(path, file);
      if (error) throw error;
      const { data } = this.supabase.client.storage
        .from('ticket-attachments')
        .getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  async onSubmit() {
    const user = this.auth.user();
    if (!user || !this.canSubmit) return;
    if (!user.project_id) {
      this.error.set(this.i18n.t('newTicket.noProject'));
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      // Upload files FIRST, then create the ticket in one insert.
      // If an upload fails, no ticket is created — so no half-created duplicates.
      const ticketId = crypto.randomUUID();
      const attachments = this.selectedFiles.length ? await this.uploadAttachments(ticketId) : [];

      const ticket = await this.ticketSvc.createTicket(
        {
          id: ticketId,
          requester_name: this.form.requester_name.trim(),
          department_id: this.form.department_id || null,
          subject: this.form.subject.trim(),
          description: this.form.description.trim(),
          priority: this.form.priority,
          category: this.form.category,
          project_id: user.project_id,
          requester_email: user.email,
          attachments,
        },
        user.id
      );

      this.router.navigate(['/portal/ticket', ticket.id]);
    } catch (err: any) {
      this.error.set(err?.message ?? this.i18n.t('newTicket.failed'));
    } finally {
      this.loading.set(false);
    }
  }
}