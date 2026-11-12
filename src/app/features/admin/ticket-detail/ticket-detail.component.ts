// ticket-detail.component.ts
import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';
import { TransferDialogComponent } from '../../../shared components/transfer-dialog/transfer-dialog.component';
import { TicketPartsComponent } from '../../../shared components/ticket-parts/ticket-parts.component';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { TeamService } from '../../../core/services/team.service';
import { ServiceDepartment, Ticket, TicketComment, TicketPart, UserProfile } from '../../../core/models';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent,
            PriorityBadgeComponent, StatusBadgeComponent, TransferDialogComponent, TicketPartsComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css', './ticket-detail-departments.component.css']
})
export class AdminTicketDetailComponent implements OnInit, OnDestroy {
  ticket = signal<Ticket | null>(null);
  comments = signal<TicketComment[]>([]);
  /** departments working on the ticket (empty = ordinary ticket) */
  parts = signal<TicketPart[]>([]);
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
  archiving = signal(false);
  notFound = signal(false);
  showTransfer = signal(false);
  /** Stopping a ticket asks for the reason first */
  stopOpen = signal(false);
  stopReason = '';
  private ticketChannel: any;
  private commentsChannel: any;
  private routeSub?: Subscription;

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public deptSvc: DepartmentService,
    public sdSvc: ServiceDepartmentService,
    private teamSvc: TeamService,
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
    private i18n: TranslationService,
  ) {}

  ngOnInit() {
    this.sdSvc.load().catch(err => console.warn('Could not load departments:', err));

    // Re-load when the id changes while staying on this page
    // (e.g. clicking a notification for another ticket).
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this.load(id);
    });

    if (this.auth.isAdmin()) {
      this.teamSvc.getAssignableStaff()
        .then(list => this.teamMembers.set(list))
        .catch(err => console.warn('Could not load team list:', err));
    }
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
      this.syncEditFields();
      await this.loadParts();

      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        if (comment.author_id !== this.auth.getCurrentUserId()) {
          this.comments.update(c => [...c, comment]);
        }
      });

      // Realtime payload has no joined data (project, assignee) — merge, don't replace
      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        const before = this.ticket();
        if (before && updated.to_department_id !== before.to_department_id) {
          this.load(id);   // transferred: reload to get the new department (or lose access)
          return;
        }
        this.ticket.update(t => t ? { ...t, ...updated } : updated);
        this.syncEditFields();
        this.loadParts();   // a department's part may be what changed
      });
    } catch (err) {
      // e.g. a team member whose ticket was re-assigned to someone else
      console.warn('Ticket not available:', err);
      this.ticket.set(null);
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async loadParts() {
    const t = this.ticket();
    if (!t) return;
    try { this.parts.set(await this.ticketSvc.getParts(t.id)); } catch { this.parts.set([]); }
  }

  /** After a department part changed: the ticket's overall status may have too. */
  async onPartsChanged() {
    const id = this.ticket()?.id;
    if (!id) return;
    try {
      const t = await this.ticketSvc.getTicketById(id);
      this.ticket.set(t);
      this.syncEditFields();
    } catch { /* keep what we have */ }
    await this.loadParts();
  }

  get isShared(): boolean {
    return this.parts().some(p => !p.is_lead);
  }

  /** IT admin and the IT member it is assigned to may share the ticket. */
  get canManageParts(): boolean {
    const t = this.ticket();
    return !!t && (this.auth.isAdmin() || t.assigned_to_id === this.auth.getCurrentUserId());
  }

  readonly canEditPart = (p: TicketPart): boolean =>
    this.auth.isAdmin() || (p.is_lead && this.ticket()?.assigned_to_id === this.auth.getCurrentUserId());

  private syncEditFields() {
    const t = this.ticket();
    if (!t) return;
    this.editStatus = t.status;
    this.editPriority = t.priority;
    this.editAssigned = t.assigned_to_id ?? '';
  }

  private unsubscribe() {
    this.ticketChannel?.unsubscribe();
    this.commentsChannel?.unsubscribe();
    this.ticketChannel = this.commentsChannel = null;
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.unsubscribe();
  }

  /** Name shown for the assignee (from the joined profile or the stored name). */
  get assigneeName(): string {
    const t = this.ticket();
    return t?.assignee?.full_name ?? t?.assigned_to ?? this.i18n.t('common.unassigned');
  }

  // ===== Departments =====

  /** Client project or sending department. */
  sourceLabel(t: Ticket): string {
    return t.from_department ? this.sdSvc.label(t.from_department) : (t.projects?.name ?? t.project_name ?? '');
  }

  /** Assignment to the IT team only applies while the ticket is in IT. */
  get inIt(): boolean {
    const t = this.ticket();
    return !t?.to_department || t.to_department.is_head;
  }

  /** IT sent this ticket to another department: IT is the requester here. */
  get itIsRequester(): boolean {
    return !!this.ticket()?.from_department?.is_head;
  }

  /** Admin: any open ticket. IT staff: tickets assigned to them (DB enforces the same). */
  get canTransfer(): boolean {
    const t = this.ticket();
    if (!t || t.status === 'resolved' || t.status === 'closed') return false;
    return this.auth.isAdmin() || t.assigned_to_id === this.auth.getCurrentUserId();
  }

  onTransferred(target: ServiceDepartment) {
    this.showTransfer.set(false);
    if (!this.auth.isAdmin()) {
      // IT staff lose access once the ticket leaves IT
      this.router.navigate(['/admin/dashboard']);
      return;
    }
    this.showSaveMsg(this.i18n.t('detail.transferred', { name: this.sdSvc.label(target) }), false);
    const id = this.ticket()?.id;
    if (id) this.load(id);
  }

  get canArchive(): boolean {
    const t = this.ticket();
    return !!t && !t.archived_at && (t.status === 'resolved' || t.status === 'closed');
  }

  async toggleArchive() {
    const t = this.ticket();
    if (!t) return;
    this.archiving.set(true);
    try {
      const archive = !t.archived_at;
      await this.ticketSvc.setArchived(t.id, archive);
      this.ticket.update(x => x ? { ...x, archived_at: archive ? new Date().toISOString() : null } : x);
      this.showSaveMsg(this.i18n.t(archive ? 'archive.done' : 'archive.restored'), false);
    } catch (err: any) {
      this.showSaveMsg(err?.message ?? this.i18n.t('common.saveFailed'), true);
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
      // is_agent_reply is decided by the database (false when IT is the requester)
      const comment = await this.ticketSvc.addComment(
        ticket.id, this.replyText.trim(), !this.itIsRequester, user.full_name, user.id, attachments
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

  /** Status dropdown: "Stopped" needs a reason, the others are saved right away. */
  onStatusChange(value: string) {
    if (value === 'closed') {
      this.stopReason = '';
      this.stopOpen.set(true);
      return;
    }
    this.updateField('status', value);
  }

  cancelStop() {
    this.stopOpen.set(false);
    this.syncEditFields();
  }

  async confirmStop() {
    const ticket = this.ticket();
    const reason = this.stopReason.trim();
    if (!ticket || !reason) return;
    try {
      await this.ticketSvc.updateTicket(ticket.id, { status: 'closed', status_reason: reason });
      this.ticket.update(t => t ? { ...t, status: 'closed', status_reason: reason } : t);
      this.stopOpen.set(false);
      this.showSaveMsg(this.i18n.t('common.saved'), false);
    } catch (err: any) {
      this.showSaveMsg(this.errorText(err), true);
    }
  }

  private errorText(err: any): string {
    const msg: string = err?.message ?? '';
    if (msg.includes('reason is required')) return this.i18n.t('detail.reasonRequired');
    return msg || this.i18n.t('common.saveFailed');
  }

  async updateField(field: 'status' | 'priority' | 'assigned_to_id', value: any) {
    const ticket = this.ticket();
    if (!ticket) return;
    try {
      await this.ticketSvc.updateTicket(ticket.id, { [field]: value });
      const patch: Partial<Ticket> = { [field]: value };
      if (field === 'assigned_to_id') {
        const m = this.teamMembers().find(x => x.id === value);
        patch.assignee = m ? ({ full_name: m.full_name } as any) : undefined;
        patch.assigned_to = m?.full_name;
      }
      if (field === 'status') {
        patch.status_reason = null;   // the reason only applies while stopped (DB does the same)
        if (value !== 'resolved' && value !== 'closed') patch.archived_at = null;   // re-opening un-archives
      }
      this.ticket.update(t => t ? { ...t, ...patch } : t);
      this.showSaveMsg(this.i18n.t('common.saved'), false);
    } catch (err: any) {
      this.syncEditFields();        // put the dropdown back to the real value
      this.showSaveMsg(this.errorText(err), true);
    }
  }

  private showSaveMsg(msg: string, isError: boolean) {
    this.saveMsg.set(msg);
    this.saveError.set(isError);
    setTimeout(() => this.saveMsg.set(''), 3000);
  }
}