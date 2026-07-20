import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIf, NgFor } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { TicketCategory, TicketPriority } from '../../../core/models';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ACCEPTED_TYPES = ['image/', 'video/'];

@Component({
  selector: 'app-new-ticket',
  imports: [FormsModule, NgIf, NgFor, RouterLink, NavbarComponent],
  templateUrl: './new-ticket.component.html',
  styleUrls: ['./new-ticket.component.css']
})
export class NewTicketComponent {

  form: { subject: string; description: string; priority: TicketPriority; category: TicketCategory } = {
    subject: '',
    description: '',
    priority: 'medium',
    category: 'other',
  };

  selectedFiles: File[] = [];
  fileError = signal('');
  loading = signal(false);
  error = signal('');

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    private supabase: SupabaseService,
    private router: Router,
  ) {}

  onFileSelect(event: Event) {
    this.fileError.set('');
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    for (const file of files) {
      const isAccepted = ACCEPTED_TYPES.some(t => file.type.startsWith(t));
      if (!isAccepted) {
        this.fileError.set(`"${file.name}" ليس صورة أو فيديو`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        this.fileError.set(`"${file.name}" أكبر من 15MB`);
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
    if (!user) return;
    if (!user.project_id) {
      this.error.set('Your account is not linked to a project. Contact your administrator.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const ticket = await this.ticketSvc.createTicket(
        {
          ...this.form,
          project_id: user.project_id,
          requester_name: user.full_name,
          requester_email: user.email,
        },
        user.id
      );

      if (this.selectedFiles.length) {
        const attachments = await this.uploadAttachments(ticket.id);
        await this.ticketSvc.updateTicket(ticket.id, { attachments });
      }

      this.router.navigate(['/portal/ticket', ticket.id]);
    } catch (err: any) {
      this.error.set(err.message ?? 'Failed to submit ticket.');
    } finally {
      this.loading.set(false);
    }
  }
}