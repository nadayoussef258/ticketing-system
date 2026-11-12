import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { Ticket, TicketComment, TicketPart } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';
import { NotificationService } from '../../../core/services/notification.service';
import { TicketPartsComponent } from '../../../shared components/ticket-parts/ticket-parts.component';

@Component({
  selector: 'app-ticket-detail',
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent, TicketPartsComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css']
})
export class PortalTicketDetailComponent implements OnInit, OnDestroy {

  ticket = signal<Ticket | null>(null);
  comments = signal<TicketComment[]>([]);
  /** departments working on the ticket (read-only here) */
  parts = signal<TicketPart[]>([]);
  loading = signal(true);
  sending = signal(false);
  replyText = '';
  replyFiles: File[] = [];
  replyFileError = signal('');
  archiving = signal(false);
  archiveError = signal('');
  notFound = signal(false);
  private commentsChannel: any;
  private ticketChannel: any;
  private routeSub?: Subscription;

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public deptSvc: DepartmentService,
    public sdSvc: ServiceDepartmentService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private notificationSvc: NotificationService,
    private i18n: TranslationService,
  ) {}

  ngOnInit() {
    // Re-load when the id changes while staying on this page
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  private async load(id: string) {
    this.unsubscribe();
    this.loading.set(true);
    this.notFound.set(false);
    this.replyText = '';
    this.replyFiles = [];
    try {
      const [ticket, comments] = await Promise.all([
        this.ticketSvc.getTicketById(id),
        this.ticketSvc.getComments(id),
      ]);
      this.ticket.set(ticket);
      this.comments.set(comments);
      this.ticketSvc.getParts(id).then(p => this.parts.set(p)).catch(() => this.parts.set([]));
      await this.notificationSvc.markTicketNotificationsRead(id);
      const currentUserId = this.auth.getCurrentUserId();

      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        if (comment.author_id !== currentUserId) {
          this.comments.update(c => [...c, comment]);
        }
      });

      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        const before = this.ticket();
        if (before && updated.to_department_id !== before.to_department_id) {
          this.load(id);   // transferred to another department: refresh its name
          return;
        }
        this.ticket.update(t => t ? { ...t, ...updated } : updated);
        this.ticketSvc.getParts(id).then(p => this.parts.set(p)).catch(() => {});
      });
    } catch (err) {
      console.warn('Ticket not available:', err);
      this.ticket.set(null);
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private unsubscribe() {
    this.commentsChannel?.unsubscribe();
    this.ticketChannel?.unsubscribe();
    this.commentsChannel = this.ticketChannel = null;
  }

  /** Name of the department handling the ticket ("IT Support" when unknown). */
  get handlerLabel(): string {
    return this.sdSvc.label(this.ticket()?.to_department) || this.i18n.t('detail.itSupport');
  }

  get canArchive(): boolean {
    const t = this.ticket();
    return !!t && !t.archived_at && (t.status === 'resolved' || t.status === 'closed');
  }

  async toggleArchive() {
    const t = this.ticket();
    if (!t) return;
    this.archiving.set(true);
    this.archiveError.set('');
    try {
      const archive = !t.archived_at;
      await this.ticketSvc.setArchived(t.id, archive);
      this.ticket.update(x => x ? { ...x, archived_at: archive ? new Date().toISOString() : null } : x);
    } catch (err: any) {
      this.archiveError.set(err?.message ?? this.i18n.t('common.saveFailed'));
    } finally {
      this.archiving.set(false);
    }
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
    if (!isAccepted) { this.replyFileError.set(this.i18n.t('file.badType', { name: file.name })); continue; }
    if (file.size > 15 * 1024 * 1024) { this.replyFileError.set(this.i18n.t('file.tooBig', { name: file.name })); continue; }
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
    } catch (err: any) {
      this.replyFileError.set(err?.message ?? this.i18n.t('common.sendFailed'));
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.unsubscribe();
  }
}