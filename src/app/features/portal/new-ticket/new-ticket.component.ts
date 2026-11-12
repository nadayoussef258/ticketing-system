import { Component, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf, NgFor } from '@angular/common';
import { TranslatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { Ticket, TicketCategory, TicketPriority } from '../../../core/models';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/** Icons kept for the IT categories; other departments get a generic one. */
const CATEGORY_ICONS: Record<string, string> = {
  hardware: '🖥️', software: '💾', network: '🌐', access: '🔑',
  email: '✉️', printer: '🖨️', other: '📋',
};

/**
 * One form for everyone who can open a ticket:
 *  - client  (project account)   → /portal/new-ticket
 *  - dept    (Finance, Marketing…) → /dept/new-ticket
 *  - admin   (IT admin)          → /admin/new-ticket
 */
@Component({
  selector: 'app-new-ticket',
  imports: [FormsModule, NgIf, NgFor, RouterLink, NavbarComponent, TranslatePipe],
  templateUrl: './new-ticket.component.html',
  styleUrls: ['./new-ticket.component.css']
})
export class NewTicketComponent implements OnInit {

  form: {
    to_department_id: string;
    requester_name: string;
    subject: string;
    description: string;
    priority: TicketPriority;
    category: TicketCategory;
  } = {
    to_department_id: '',
    requester_name: '',   // shared accounts: the person types their name every time
    subject: '',
    description: '',
    priority: 'medium',
    category: 'other',
  };

  readonly mode = computed<'client' | 'dept' | 'admin'>(() =>
    this.auth.isAdmin() ? 'admin' : this.auth.isDept() ? 'dept' : 'client');

  /** Department the ticket is sent FROM (null for client projects). */
  readonly myDepartmentId = computed<string | null>(() => {
    if (this.mode() === 'dept') return this.auth.user()?.service_department_id ?? null;
    if (this.mode() === 'admin') return this.sdSvc.head()?.id ?? null;
    return null;
  });

  /** Departments this user can send to. */
  readonly targets = computed(() =>
    this.sdSvc.targets(this.mode() === 'client' ? [] : [this.myDepartmentId()]));

  targetsLoading = signal(true);

  /** Other departments that work on the ticket too (optional): id → their part */
  share: Record<string, { on: boolean; role: string }> = {};

  /** Departments that can take a part: not the receiver, not the sender. */
  get shareOptions() {
    return this.sdSvc.targets([this.form.to_department_id, this.myDepartmentId()]);
  }

  private get sharedParts(): { id: string; role: string }[] {
    return this.shareOptions
      .filter(d => this.share[d.id]?.on)
      .map(d => ({ id: d.id, role: (this.share[d.id]?.role ?? '').trim() }));
  }

  toggleShare(id: string) {
    const cur = this.share[id] ?? { on: false, role: '' };
    this.share[id] = { ...cur, on: !cur.on };
  }

  selectedFiles: File[] = [];
  fileError = signal('');
  loading = signal(false);
  error = signal('');

  constructor(
    public auth: AuthService,
    public sdSvc: ServiceDepartmentService,
    private ticketSvc: TicketService,
    private supabase: SupabaseService,
    private router: Router,
    private i18n: TranslationService,
  ) {}

  async ngOnInit() {
    const user = this.auth.user();
    if (this.mode() === 'admin' && user) this.form.requester_name = user.full_name;

    // Departments that can receive tickets
    try {
      await this.sdSvc.load(true);
      // Clients keep sending to IT by default, as before
      if (this.mode() === 'client') this.form.to_department_id = this.sdSvc.head()?.id ?? '';
      else if (this.targets().length === 1) this.form.to_department_id = this.targets()[0].id;
    } catch (err) {
      console.warn('Could not load departments:', err);
    } finally {
      this.targetsLoading.set(false);
    }
  }

  get orgName(): string {
    const u = this.auth.user();
    if (this.mode() === 'admin') return 'IT Team';
    if (this.mode() === 'dept') return this.sdSvc.label(u?.service_department);
    return u?.project_name ?? '';
  }

  get backUrl(): string {
    return this.auth.homeUrl();
  }

  /** Clients with only IT available don't need to choose. */
  get showTargetPicker(): boolean {
    return this.mode() !== 'client' || this.targets().length > 1;
  }

  get categories() {
    return this.sdSvc.categoriesOf(this.form.to_department_id);
  }

  categoryIcon(code: string): string {
    return CATEGORY_ICONS[code] ?? '📌';
  }

  /** Categories differ per department: keep the choice if it exists, else "other". */
  onTargetChange() {
    if (!this.categories.some(c => c.code === this.form.category)) this.form.category = 'other';
  }

  get canSubmit(): boolean {
    const f = this.form;
    return f.requester_name.trim().length >= 2
      && !!f.to_department_id
      && this.categories.some(c => c.code === f.category)
      && f.subject.trim().length >= 5
      && f.description.trim().length >= 10
      && this.sharedParts.every(p => p.role.length > 0)
      && !this.loading()
      && !this.targetsLoading();
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

    const mode = this.mode();
    if (mode === 'client' && !user.project_id) {
      this.error.set(this.i18n.t('newTicket.noProject'));
      return;
    }
    if (mode !== 'client' && !this.myDepartmentId()) {
      this.error.set(this.i18n.t('newTicket.noDeptAccount'));
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      // Upload files FIRST, then create the ticket in one insert.
      // If an upload fails, no ticket is created — so no half-created duplicates.
      const ticketId = crypto.randomUUID();
      const attachments = this.selectedFiles.length ? await this.uploadAttachments(ticketId) : [];

      const payload: Partial<Ticket> = {
        id: ticketId,
        to_department_id: this.form.to_department_id,
        requester_name: this.form.requester_name.trim(),
        subject: this.form.subject.trim(),
        description: this.form.description.trim(),
        priority: this.form.priority,
        category: this.form.category,
        requester_email: user.email,
        attachments,
      };
      if (mode === 'client') {
        payload.project_id = user.project_id;
      } else {
        payload.project_id = null;
        payload.from_department_id = this.myDepartmentId();
      }

      const ticket = await this.ticketSvc.createTicket(payload, user.id);

      // shared from the start: each extra department with its part
      for (const p of this.sharedParts) {
        try { await this.ticketSvc.addPart(ticket.id, p.id, p.role); }
        catch (err) { console.warn('Could not share with a department:', err); }
      }

      const base = mode === 'admin' ? '/admin/ticket' : mode === 'dept' ? '/dept/ticket' : '/portal/ticket';
      this.router.navigate([base, ticket.id]);
    } catch (err: any) {
      this.error.set(err?.message ?? this.i18n.t('newTicket.failed'));
    } finally {
      this.loading.set(false);
    }
  }
}