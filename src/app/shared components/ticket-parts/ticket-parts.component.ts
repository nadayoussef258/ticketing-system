import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { TicketService } from '../../core/services/ticket.service';
import { ServiceDepartmentService } from '../../core/services/service-department.service';
import { ServiceDepartment, Ticket, TicketPart, TicketStatus } from '../../core/models';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';

/**
 * Departments working on a ticket, each with its part and its own status.
 *   <app-ticket-parts [ticket]="t" [parts]="parts()" [canManage]="..." [canEditPart]="fn" (changed)="reload()" />
 * No parts = an ordinary ticket: only the "share" button shows (when allowed).
 */
@Component({
  selector: 'app-ticket-parts',
  standalone: true,
  imports: [FormsModule, NgFor, NgIf, TranslatePipe, StatusBadgeComponent],
  template: `
    <div class="info-card p-4 mb-3" *ngIf="parts.length || canManage">
      <div class="tp-head">
        <div class="section-label mb-0">{{ 'parts.title' | t }}</div>
        <button type="button" class="tp-btn" *ngIf="canManage && !ticket.archived_at" (click)="openAdd()">
          <i class="bi bi-diagram-3"></i>{{ 'parts.share' | t }}
        </button>
      </div>

      <p class="tp-hint" *ngIf="!parts.length">{{ 'parts.shareHint' | t }}</p>

      <ng-container *ngIf="parts.length">
        <div class="tp-progress">
          <div class="tp-bar"><span [style.width.%]="donePct"></span></div>
          <span>{{ 'parts.progress' | t: { done: doneCount, total: parts.length } }}</span>
        </div>

        <div class="tp-row" *ngFor="let p of parts" [style.--dept-color]="p.department?.color ?? '#9ca3af'">
          <span class="tp-dot"></span>
          <div class="tp-main">
            <div class="tp-name">
              <bdi>{{ sdSvc.label(p.department) }}</bdi>
              <span class="tp-lead" *ngIf="p.is_lead">{{ 'parts.lead' | t }}</span>
            </div>
            <div class="tp-role" *ngIf="p.role_note" dir="auto">{{ p.role_note }}</div>
            <div class="tp-reason" *ngIf="p.status === 'closed' && p.status_reason">
              <i class="bi bi-pause-circle"></i> <span dir="auto">{{ p.status_reason }}</span>
            </div>

            <!-- this department's own status -->
            <div class="tp-edit" *ngIf="editingId() === p.id">
              <select class="manage-select" [(ngModel)]="draftStatus">
                <option *ngFor="let s of STATUSES" [value]="s">{{ ('status.' + s) | t }}</option>
              </select>
              <textarea *ngIf="draftStatus === 'closed'" class="reply-input" rows="2" dir="auto" maxlength="1000"
                        [placeholder]="'detail.stopReasonPh' | t" [(ngModel)]="draftReason"></textarea>
              <div class="d-flex gap-2">
                <button type="button" class="btn-send" (click)="saveStatus(p)"
                        [disabled]="busy() || (draftStatus === 'closed' && !draftReason.trim())">
                  <span *ngIf="busy()" class="spinner-border spinner-border-sm"></span>{{ 'common.save' | t }}
                </button>
                <button type="button" class="btn-archive" (click)="editingId.set(null)">{{ 'common.cancel' | t }}</button>
              </div>
            </div>
          </div>
          <div class="tp-side">
            <app-status-badge [status]="p.status" />
            <div class="tp-actions" *ngIf="editingId() !== p.id && !ticket.archived_at">
              <button type="button" class="tp-icon" *ngIf="canEditPart(p)" (click)="startEdit(p)"
                      [title]="'parts.update' | t" [attr.aria-label]="'parts.update' | t"><i class="bi bi-pencil"></i></button>
              <button type="button" class="tp-icon danger" *ngIf="canManage && !p.is_lead" (click)="remove(p)"
                      [title]="'parts.remove' | t" [attr.aria-label]="'parts.remove' | t"><i class="bi bi-x-lg"></i></button>
            </div>
          </div>
        </div>
      </ng-container>

      <div class="save-error mt-3" *ngIf="error()"><i class="bi bi-x-circle me-1"></i>{{ error() }}</div>
    </div>

    <!-- Share with a department -->
    <div class="tp-overlay" *ngIf="adding()" (click)="adding.set(false)">
      <div class="tp-box" role="dialog" aria-modal="true" [attr.aria-label]="'parts.addTitle' | t" (click)="$event.stopPropagation()">
        <p class="tp-title"><i class="bi bi-diagram-3 me-2"></i>{{ 'parts.addTitle' | t }}</p>
        <p class="tp-hint">{{ 'parts.shareHint' | t }}</p>
        <p class="tp-hint" *ngIf="!targets().length">{{ 'parts.noTargets' | t }}</p>
        <div class="tp-grid" *ngIf="targets().length" role="radiogroup">
          <label class="tp-option" *ngFor="let d of targets()" [class.selected]="addDeptId === d.id" [style.--dept-color]="d.color">
            <input type="radio" name="tp-dept" [value]="d.id" [(ngModel)]="addDeptId" />
            <span class="tp-dot"></span><span class="tp-opt-name" dir="auto">{{ sdSvc.label(d) }}</span>
          </label>
        </div>
        <label class="form-label small fw-semibold text-muted" for="tpRole">{{ 'parts.role' | t }} <span class="text-danger">*</span></label>
        <textarea id="tpRole" class="reply-input mb-3" rows="3" dir="auto" maxlength="500"
                  [placeholder]="'parts.rolePh' | t" [(ngModel)]="addRole"></textarea>
        <div class="save-error mb-3" *ngIf="addError()"><i class="bi bi-x-circle me-1"></i>{{ addError() }}</div>
        <div class="d-flex gap-2 justify-content-end">
          <button type="button" class="btn-archive" (click)="adding.set(false)">{{ 'common.cancel' | t }}</button>
          <button type="button" class="btn-send" (click)="add()" [disabled]="busy() || !addDeptId || !addRole.trim()">
            <span *ngIf="busy()" class="spinner-border spinner-border-sm"></span>{{ 'parts.add' | t }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
    .tp-hint { font-size: 0.8rem; color: #6b7280; margin: 0 0 8px; }
    .tp-btn { display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #19587b; border: 1px solid #b6d1e0;
              border-radius: 9px; padding: 6px 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
    .tp-btn:hover { background: #e9f2f7; }
    .tp-progress { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; color: #6b7280; margin-bottom: 12px; }
    .tp-bar { flex: 1; height: 6px; border-radius: 6px; background: #eef2f5; overflow: hidden; }
    .tp-bar span { display: block; height: 100%; background: #16a34a; border-radius: 6px; }
    .tp-row { --dept-color: #9ca3af; display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px;
              border: 1px solid #e1e7ec; border-radius: 10px; margin-bottom: 8px; }
    .tp-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--dept-color); flex: none; margin-top: 6px; }
    .tp-main { flex: 1; min-width: 0; }
    .tp-name { font-size: 0.88rem; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .tp-lead { font-size: 0.68rem; font-weight: 600; color: #19587b; background: #e9f2f7; border-radius: 99px; padding: 1px 8px; }
    .tp-role { font-size: 0.8rem; color: #4b5563; margin-top: 2px; white-space: pre-wrap; }
    .tp-reason { font-size: 0.78rem; color: #991b1b; margin-top: 4px; }
    .tp-edit { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .tp-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .tp-actions { display: flex; gap: 2px; }
    .tp-icon { border: none; background: transparent; color: #9ca3af; padding: 4px 7px; border-radius: 7px; cursor: pointer; }
    .tp-icon:hover { color: #19587b; background: #f3f4f6; }
    .tp-icon.danger:hover { color: #dc2626; background: #fef2f2; }
    .tp-overlay { position: fixed; inset: 0; z-index: 1060; background: rgba(17,24,39,.45); display: flex; align-items: flex-start; justify-content: center; padding: 10vh 16px 16px; }
    .tp-box { width: 100%; max-width: 480px; max-height: 85vh; overflow-y: auto; background: #fff; border-radius: 16px; padding: 22px; box-shadow: 0 12px 40px rgba(17,24,39,.18); }
    .tp-title { font-size: 1rem; font-weight: 700; color: #111827; margin: 0 0 6px; }
    .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-bottom: 14px; }
    .tp-option { --dept-color: #19587b; position: relative; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
                 cursor: pointer; background: #f9fafb; border: 1px solid #e1e7ec; font-size: 0.85rem; font-weight: 600; color: #374151; }
    .tp-option input { position: absolute; opacity: 0; pointer-events: none; }
    .tp-option.selected { background: #fff; border-color: var(--dept-color); box-shadow: 0 0 0 1px var(--dept-color) inset; color: #111827; }
    .tp-option .tp-dot { margin-top: 0; }
    .tp-opt-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class TicketPartsComponent {
  @Input({ required: true }) ticket!: Ticket;
  @Input() parts: TicketPart[] = [];
  /** May add / remove departments (IT admin, the responsible department). */
  @Input() canManage = false;
  /** May update this department's status. */
  @Input() canEditPart: (p: TicketPart) => boolean = () => false;
  /** Something changed: reload the ticket and the parts. */
  @Output() changed = new EventEmitter<void>();

  readonly STATUSES: TicketStatus[] = ['open', 'in_progress', 'in_review', 'closed', 'resolved'];

  sdSvc = inject(ServiceDepartmentService);
  private ticketSvc = inject(TicketService);
  private i18n = inject(TranslationService);

  busy = signal(false);
  error = signal('');
  editingId = signal<string | null>(null);
  draftStatus: TicketStatus = 'open';
  draftReason = '';

  adding = signal(false);
  addError = signal('');
  targets = signal<ServiceDepartment[]>([]);
  addDeptId = '';
  addRole = '';

  get doneCount(): number { return this.parts.filter(p => p.status === 'resolved').length; }
  get donePct(): number { return this.parts.length ? (this.doneCount / this.parts.length) * 100 : 0; }

  startEdit(p: TicketPart) {
    this.error.set('');
    this.draftStatus = p.status;
    this.draftReason = p.status_reason ?? '';
    this.editingId.set(p.id);
  }

  async saveStatus(p: TicketPart) {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.ticketSvc.setPartStatus(p.id, this.draftStatus, this.draftStatus === 'closed' ? this.draftReason.trim() : null);
      this.editingId.set(null);
      this.changed.emit();
    } catch (err: any) {
      this.error.set(this.message(err));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(p: TicketPart) {
    if (!confirm(this.i18n.t('parts.confirmRemove', { name: this.sdSvc.label(p.department) }))) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.ticketSvc.removePart(p.id);
      this.changed.emit();
    } catch (err: any) {
      this.error.set(this.message(err));
    } finally {
      this.busy.set(false);
    }
  }

  async openAdd() {
    this.addDeptId = '';
    this.addRole = '';
    this.addError.set('');
    try { await this.sdSvc.load(true); } catch { /* keep the cached list */ }
    const taken = [this.ticket.to_department_id, ...this.parts.map(p => p.department_id)];
    this.targets.set(this.sdSvc.targets(taken));
    this.adding.set(true);
  }

  async add() {
    if (!this.addDeptId || !this.addRole.trim()) return;
    this.busy.set(true);
    this.addError.set('');
    try {
      await this.ticketSvc.addPart(this.ticket.id, this.addDeptId, this.addRole.trim());
      this.adding.set(false);
      this.changed.emit();
    } catch (err: any) {
      this.addError.set(this.message(err));
    } finally {
      this.busy.set(false);
    }
  }

  private message(err: any): string {
    const msg: string = err?.message ?? '';
    if (msg.includes('reason is required')) return this.i18n.t('detail.reasonRequired');
    if (msg.includes("department's part")) return this.i18n.t('parts.roleRequired');
    if (msg.includes('already has a part')) return this.i18n.t('parts.duplicate');
    return msg || this.i18n.t('common.saveFailed');
  }
}