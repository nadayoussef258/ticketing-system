import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { Ticket, TicketComment } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-ticket-detail',
  imports: [RouterLink, FormsModule, NgFor, NgIf, DatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css']
})
export class PortalTicketDetailComponent implements OnInit, OnDestroy {

  ticket = signal<Ticket | null>(null);
  comments = signal<TicketComment[]>([]);
  loading = signal(true);
  sending = signal(false);
  replyText = '';
  replyFiles: File[] = [];
  replyFileError = signal('');
  private commentsChannel: any;
  private ticketChannel: any;

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
      private notificationSvc: NotificationService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [ticket, comments] = await Promise.all([
        this.ticketSvc.getTicketById(id),
        this.ticketSvc.getComments(id),
      ]);
      this.ticket.set(ticket);
      this.comments.set(comments);
await this.notificationSvc.markTicketNotificationsRead(id); 
      const currentUserId = this.auth.getCurrentUserId();

      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        if (comment.author_id !== currentUserId) {
          this.comments.update(c => [...c, comment]);
        }
      });

      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        this.ticket.update(t => t ? { ...t, ...updated } : updated);
      });
    } finally {
      this.loading.set(false);
    }
  }

  onReplyFileSelect(event: Event) {
    this.replyFileError.set('');
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    for (const file of files) {
      const isAccepted = file.type.startsWith('image/') || file.type.startsWith('video/');
      if (!isAccepted) { this.replyFileError.set(`"${file.name}" ليس صورة أو فيديو`); continue; }
      if (file.size > 15 * 1024 * 1024) { this.replyFileError.set(`"${file.name}" أكبر من 15MB`); continue; }
      this.replyFiles.push(file);
    }
    input.value = '';
  }

  removeReplyFile(i: number) {
    this.replyFiles.splice(i, 1);
  }

  private async uploadReplyAttachments(ticketId: string): Promise<string[]> {
    const urls: string[] = [];
    for (const file of this.replyFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${ticketId}/${Date.now()}-${safeName}`;
      const { error } = await this.supabase.client.storage.from('ticket-attachments').upload(path, file);
      if (error) throw error;
      const { data } = this.supabase.client.storage.from('ticket-attachments').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  async sendReply() {
    const user = this.auth.user();
    const ticket = this.ticket();
    if (!user || !ticket || !this.replyText.trim()) return;
    this.sending.set(true);
    try {
      const attachments = this.replyFiles.length ? await this.uploadReplyAttachments(ticket.id) : [];
      const comment = await this.ticketSvc.addComment(
        ticket.id, this.replyText.trim(), false, user.full_name, user.id, attachments
      );
      this.comments.update(c => [...c, comment]);
      this.replyText = '';
      this.replyFiles = [];
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy() {
    this.commentsChannel?.unsubscribe();
    this.ticketChannel?.unsubscribe();
  }
}