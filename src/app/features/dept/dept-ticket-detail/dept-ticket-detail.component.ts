import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket, TicketComment, TicketPart, TicketStatus, ServiceDepartment } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';
import { TransferDialogComponent } from '../../../shared components/transfer-dialog/transfer-dialog.component';
import { TicketPartsComponent } from '../../../shared components/ticket-parts/ticket-parts.component';

/**
 * Ticket page for a department account.
 *  - Received ticket (inbox): reply, change status, transfer, archive.
 *  - Sent ticket: follow it like a client (reply, archive).
 */
@Component({
  selector: 'app-dept-ticket-detail',
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent,
            PriorityBadgeComponent, StatusBadgeComponent, TransferDialogComponent, TicketPartsComponent],
  templateUrl: './dept-ticket-detail.component.html',
  styleUrls: ['../../portal/ticket-detail/ticket-detail.component.css', './dept-ticket-detail.component.css'],
})
export class DeptTicketDetailComponent implements OnInit, OnDestroy {
  /** Same five statuses as the tasks system; 'closed' = Stopped (needs a reason) */
  readonly STATUSES: TicketStatus[] = ['open', 'in_progress', 'in_review', 'closed', 'resolved'];

  ticket = signal<Ticket | null>(null);
  comments = signal<TicketComment[]>([]);
  /** departments working on the ticket (empty = ordinary ticket) */
  parts = signal<TicketPart[]>([]);
  loading = signal(true);
  notFound = signal(false);

  sending = signal(false);
  replyText = '';
  replyFiles: File[] = [];
  replyFileError = signal('');

  statusDraft: TicketStatus = 'open';
  /** reason typed when the draft status is 'closed' (Stopped) */
  reasonDraft = '';
  savingStatus = signal(false);
  statusMsg = signal('');
  statusError = signal('');

  archiving = signal(false);
  archiveError = signal('');

  showTransfer = signal(false);

  private commentsChannel: any;
  private ticketChannel: any;
  private routeSub?: Subscription;

  readonly myDeptId = computed(() => this.auth.user()?.service_department_id ?? null);
  readonly deptName = computed(() => this.sdSvc.label(this.auth.user()?.service_department));

  /** 'inbox' = sent TO my department, 'sent' = sent FROM it, 'part' = shared with it. */
  readonly side = computed<'inbox' | 'sent' | 'part' | null>(() => {
    const t = this.ticket();
    const mine = this.myDeptId();
    if (!t || !mine) return null;
    if (t.to_department_id === mine) return 'inbox';
    if (t.from_department_id === mine) return 'sent';
    if (this.parts().some(p => p.department_id === mine)) return 'part';
    return null;
  });

  readonly isShared = computed(() => this.parts().some(p => !p.is_lead));

  /** My department updates its own part; the responsible one manages who takes part. */
  readonly canEditPart = (p: TicketPart): boolean => p.department_id === this.myDeptId();

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public sdSvc: ServiceDepartmentService,
    public deptSvc: DepartmentService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
    private notificationSvc: NotificationService,
    private i18n: TranslationService,
  ) {}

  ngOnInit() {
    this.sdSvc.load().catch(err => console.warn('Could not load departments:', err));
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
    this.statusMsg.set('');
    this.statusError.set('');
    try {
      const [ticket, comments] = await Promise.all([
        this.ticketSvc.getTicketById(id),
        this.ticketSvc.getComments(id),
      ]);
      this.ticket.set(ticket);
      await this.loadParts();
      this.statusDraft = ticket?.status ?? 'open';
      this.reasonDraft = ticket?.status_reason ?? '';
      this.comments.set(comments);
      await this.notificationSvc.markTicketNotificationsRead(id);
      const me = this.auth.getCurrentUserId();

      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        if (comment.author_id !== me) this.comments.update(c => [...c, comment]);
      });

      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        const before = this.ticket();
        if (before && updated.to_department_id !== before.to_department_id) {
          // moved to another department: reload (joins) or lose access
          this.load(id);
          return;
        }
        this.ticket.update(t => t ? { ...t, ...updated } : t);
        this.loadParts();   // a department's part may be what changed
        if (!this.savingStatus()) {
          this.statusDraft = updated.status;
          this.reasonDraft = updated.status_reason ?? '';
        }
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

  async loadParts() {
    const t = this.ticket();
    if (!t) return;
    try { this.parts.set(await this.ticketSvc.getParts(t.id)); } catch { this.parts.set([]); }
  }

  async onPartsChanged() {
    const id = this.ticket()?.id;
    if (!id) return;
    try {
      const t = await this.ticketSvc.getTicketById(id);
      this.ticket.set(t);
      this.statusDraft = t?.status ?? 'open';
      this.reasonDraft = t?.status_reason ?? '';
    } catch { /* keep what we have */ }
    await this.loadParts();
  }

  // ===== Display helpers =====

  /** Who opened it: a client project or another department. */
  sourceLabel(t: Ticket): string {
    return t.from_department ? this.sdSvc.label(t.from_department) : (t.project_name ?? t.projects?.name ?? '');
  }

  senderLabel(c: TicketComment): string {
    return c.author_id === this.auth.getCurrentUserId() ? this.i18n.t('detail.you') : c.author_name;
  }

  get canReply(): boolean {
    const t = this.ticket();
    if (!t) return false;
    if (this.side() === 'part') return t.status !== 'resolved';
    return this.side() === 'inbox' ? t.status !== 'closed' : (t.status !== 'closed' && t.status !== 'resolved');
  }

  get canArchive(): boolean {
    const t = this.ticket();
    return !!t && !t.archived_at && (t.status === 'resolved' || t.status === 'closed');
  }

  get canTransfer(): boolean {
    const t = this.ticket();
    return this.side() === 'inbox' && !!t && t.status !== 'resolved' && t.status !== 'closed';
  }

  // ===== Status (receiving department only) =====

  /** Something to save: a new status, or a new reason for a stopped ticket. */
  get statusChanged(): boolean {
    const t = this.ticket();
    if (!t) return false;
    if (this.statusDraft !== t.status) return true;
    return t.status === 'closed' && this.reasonDraft.trim() !== (t.status_reason ?? '');
  }

  /** Stopping needs a reason. */
  get canSaveStatus(): boolean {
    return this.statusChanged && (this.statusDraft !== 'closed' || !!this.reasonDraft.trim());
  }

  async saveStatus() {
    const t = this.ticket();
    if (!t || !this.canSaveStatus) return;
    const reason = this.statusDraft === 'closed' ? this.reasonDraft.trim() : null;
    this.savingStatus.set(true);
    this.statusMsg.set('');
    this.statusError.set('');
    try {
      await this.ticketSvc.updateTicket(t.id, { status: this.statusDraft, status_reason: reason });
      this.ticket.update(x => x ? { ...x, status: this.statusDraft, status_reason: reason } : x);
      if (!reason) this.reasonDraft = '';
      this.statusMsg.set(this.i18n.t('detail.statusSaved'));
      setTimeout(() => this.statusMsg.set(''), 3000);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      this.statusError.set(msg.includes('reason is required')
        ? this.i18n.t('detail.reasonRequired')
        : (msg || this.i18n.t('common.saveFailed')));
      this.statusDraft = t.status;
      this.reasonDraft = t.status_reason ?? '';
    } finally {
      this.savingStatus.set(false);
    }
  }

  // ===== Transfer =====

  onTransferred(_target: ServiceDepartment) {
    this.showTransfer.set(false);
    // The department no longer sees the ticket after the transfer
    this.router.navigate(['/dept/dashboard']);
  }

  // ===== Archive =====

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

  // ===== Replies =====

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
      // is_agent_reply is decided by the database (receiving side = true)
      const comment = await this.ticketSvc.addComment(
        ticket.id, this.replyText.trim(), this.side() !== 'sent', user.full_name, user.id, attachments
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