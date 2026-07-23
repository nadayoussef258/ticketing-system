// ticket-detail.component.ts
import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { TeamService } from '../../../core/services/team.service';
import { Ticket, TicketComment, UserProfile } from '../../../core/models';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, DatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css']
})
export class AdminTicketDetailComponent implements OnInit, OnDestroy {
  ticket = signal<Ticket | null>(null);
  comments = signal<TicketComment[]>([]);
  teamMembers = signal<UserProfile[]>([]);
  loading = signal(true);
  sending = signal(false);
  replyText = '';
  editStatus = '';
  editPriority = '';
  editAssigned = '';
  saveMsg = signal('');
  saveError = signal(false);
  replyFiles: File[] = [];
  replyFileError = signal('');
  private ticketChannel: any;
  private commentsChannel: any;

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    private teamSvc: TeamService,
    private supabase: SupabaseService,  
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [ticket, comments, members] = await Promise.all([
        this.ticketSvc.getTicketById(id),
        this.ticketSvc.getComments(id),
        this.teamSvc.getAssignableStaff(),
      ]);
      this.ticket.set(ticket);
      this.comments.set(comments);
      this.teamMembers.set(members);
      if (ticket) {
        this.editStatus = ticket.status;
        this.editPriority = ticket.priority;
        this.editAssigned = ticket.assigned_to_id ?? '';
      }

      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        const currentUserId = this.auth.user()?.id;
        if (comment.author_id !== currentUserId) {
          this.comments.update(c => [...c, comment]);
        }
      });

      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        this.ticket.set(updated);
      });
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.ticketChannel?.unsubscribe();
    this.commentsChannel?.unsubscribe();
  }

  onReplyFileSelect(event: Event) {
  this.replyFileError.set('');
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  for (const file of files) {
    const isAccepted =
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type === 'application/pdf';
    if (!isAccepted) { this.replyFileError.set(`"${file.name}" نوع غير مدعوم (صور/فيديو/PDF فقط)`); continue; }
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
        ticket.id, this.replyText.trim(), true, user.full_name, user.id, attachments
      );
      this.comments.update(c => [...c, comment]);
      this.replyText = '';
      this.replyFiles = [];
    } finally {
      this.sending.set(false);
    }
  }
  async updateField(field: 'status' | 'priority' | 'assigned_to_id', value: any) {
    const ticket = this.ticket();
    if (!ticket) return;
    try {
      await this.ticketSvc.updateTicket(ticket.id, { [field]: value });
      this.ticket.update(t => t ? { ...t, [field]: value } : t);
      this.showSaveMsg('Saved successfully', false);
    } catch {
      this.showSaveMsg('Failed to save', true);
    }
  }

  private showSaveMsg(msg: string, isError: boolean) {
    this.saveMsg.set(msg);
    this.saveError.set(isError);
    setTimeout(() => this.saveMsg.set(''), 3000);
  }
}