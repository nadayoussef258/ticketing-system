// ticket-detail.component.ts
import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { TeamService } from '../../../core/services/team.service';
import { Ticket, TicketComment, UserProfile } from '../../../core/models';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
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
  archiving = signal(false);
  notFound = signal(false);
  private ticketChannel: any;
  private commentsChannel: any;
  private routeSub?: Subscription;

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public deptSvc: DepartmentService,
    private teamSvc: TeamService,
    private supabase: SupabaseService,  
    private route: ActivatedRoute,
    private i18n: TranslationService,
  ) {}

  ngOnInit() {
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

      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        if (comment.author_id !== this.auth.getCurrentUserId()) {
          this.comments.update(c => [...c, comment]);
        }
      });

      // Realtime payload has no joined data (project, assignee) — merge, don't replace
      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        this.ticket.update(t => t ? { ...t, ...updated } : updated);
        this.syncEditFields();
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
      const comment = await this.ticketSvc.addComment(
        ticket.id, this.replyText.trim(), true, user.full_name, user.id, attachments
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
      if (field === 'status' && value !== 'resolved' && value !== 'closed') {
        patch.archived_at = null;   // re-opening takes it out of the archive (DB does the same)
      }
      this.ticket.update(t => t ? { ...t, ...patch } : t);
      this.showSaveMsg(this.i18n.t('common.saved'), false);
    } catch (err: any) {
      this.syncEditFields();        // put the dropdown back to the real value
      this.showSaveMsg(err?.message ?? this.i18n.t('common.saveFailed'), true);
    }
  }

  private showSaveMsg(msg: string, isError: boolean) {
    this.saveMsg.set(msg);
    this.saveError.set(isError);
    setTimeout(() => this.saveMsg.set(''), 3000);
  }
}