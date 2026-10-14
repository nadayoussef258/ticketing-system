import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe } from '../../core/i18n/t.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { TicketService } from '../../core/services/ticket.service';
import { ServiceDepartmentService } from '../../core/services/service-department.service';
import { ServiceDepartment, Ticket } from '../../core/models';

/**
 * "Transfer to another department" dialog.
 * Used by the department ticket page and the IT admin ticket page.
 *   <app-transfer-dialog [ticket]="t" (transferred)="..." (closed)="..." />
 */
@Component({
  selector: 'app-transfer-dialog',
  standalone: true,
  imports: [FormsModule, NgFor, NgIf, TranslatePipe],
  template: `
    <div class="td-overlay" (click)="close()">
      <div class="td-box" role="dialog" aria-modal="true" [attr.aria-label]="'detail.transferTitle' | t" (click)="$event.stopPropagation()">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-1">
          <p class="td-title"><i class="bi bi-arrow-left-right me-2"></i>{{ 'detail.transferTitle' | t }}</p>
          <button type="button" class="td-x" (click)="close()" [attr.aria-label]="'common.close' | t"><i class="bi bi-x-lg"></i></button>
        </div>
        <p class="td-hint">{{ (adminView ? 'detail.transferHintAdmin' : 'detail.transferHint') | t }}</p>

        <div *ngIf="loading()" class="text-center py-3">
          <div class="spinner-border spinner-border-sm" style="color:#4f46e5;"></div>
        </div>

        <ng-container *ngIf="!loading()">
          <p class="td-empty" *ngIf="targets().length === 0">{{ 'detail.noTargets' | t }}</p>

          <div class="td-grid" *ngIf="targets().length > 0" role="radiogroup">
            <label class="td-option" *ngFor="let d of targets()"
                   [class.selected]="selectedId === d.id" [style.--dept-color]="d.color">
              <input type="radio" name="td-target" [value]="d.id" [(ngModel)]="selectedId" />
              <span class="td-dot"></span>
              <span class="td-name" dir="auto">{{ sdSvc.label(d) }}</span>
            </label>
          </div>

          <label class="td-label" for="td-note">{{ 'detail.transferNote' | t }}</label>
          <textarea id="td-note" class="td-input" rows="3" dir="auto" [(ngModel)]="note" maxlength="1000"></textarea>

          <div class="td-error" *ngIf="error()"><i class="bi bi-x-circle me-1"></i>{{ error() }}</div>

          <div class="d-flex gap-2 mt-3">
            <button type="button" class="td-btn-primary" (click)="submit()" [disabled]="!selectedId || saving()">
              <span *ngIf="saving()" class="spinner-border spinner-border-sm"></span>
              <i *ngIf="!saving()" class="bi bi-arrow-left-right"></i>
              {{ (saving() ? 'detail.transferring' : 'detail.transferBtn') | t }}
            </button>
            <button type="button" class="td-btn-secondary" (click)="close()" [disabled]="saving()">{{ 'common.cancel' | t }}</button>
          </div>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    .td-overlay {
      position: fixed; inset: 0; z-index: 1050;
      display: flex; align-items: center; justify-content: center; padding: 16px;
      background: rgba(17,24,39,0.5); backdrop-filter: blur(3px);
    }
    .td-box {
      width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto;
      background: #fff; border: 1px solid #e4e6ef; border-radius: 18px; padding: 26px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.12);
    }
    .td-title { font-size: 1rem; font-weight: 700; color: #111827; margin: 0; }
    .td-x { border: none; background: transparent; color: #9ca3af; font-size: 1rem; padding: 2px 4px; cursor: pointer; }
    .td-x:hover { color: #111827; }
    .td-hint { font-size: 0.8rem; color: #6b7280; margin: 6px 0 16px; line-height: 1.6; }
    .td-empty { font-size: 0.85rem; color: #9ca3af; text-align: center; padding: 12px 0; }

    .td-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-bottom: 16px; }
    .td-option {
      --dept-color: #4f46e5;
      position: relative; display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 10px; cursor: pointer;
      background: #f9fafb; border: 1px solid #e4e6ef;
      font-size: 0.85rem; font-weight: 600; color: #374151;
      transition: border-color 0.15s, background 0.15s;
    }
    .td-option:hover { background: #fff; border-color: #c7d2fe; }
    .td-option input { position: absolute; opacity: 0; pointer-events: none; }
    .td-option:focus-within { box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
    .td-option.selected { background: #fff; border-color: var(--dept-color); box-shadow: 0 0 0 1px var(--dept-color) inset; color: #111827; }
    .td-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--dept-color); flex-shrink: 0; }
    .td-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .td-label { display: block; font-size: 0.79rem; font-weight: 600; color: #374151; margin-bottom: 5px; }
    .td-input {
      width: 100%; resize: vertical; font-family: inherit; font-size: 0.85rem; color: #111827;
      background: #f9fafb; border: 1px solid #e4e6ef; border-radius: 10px; padding: 10px 13px; outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .td-input:focus { background: #fff; border-color: #a5b4fc; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .td-error { margin-top: 10px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; font-size: 0.8rem; }

    .td-btn-primary {
      display: inline-flex; align-items: center; gap: 6px;
      background: #4f46e5; color: #fff; border: none; border-radius: 9px;
      padding: 9px 20px; font-size: 0.85rem; font-weight: 600; cursor: pointer;
      box-shadow: 0 2px 6px rgba(79,70,229,0.2); transition: background 0.15s;
    }
    .td-btn-primary:hover:not(:disabled) { background: #4338ca; }
    .td-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .td-btn-secondary {
      display: inline-flex; align-items: center; background: #fff; color: #374151;
      border: 1px solid #e4e6ef; border-radius: 9px; padding: 9px 18px; font-size: 0.85rem; cursor: pointer;
    }
    .td-btn-secondary:hover:not(:disabled) { background: #f9fafb; }
  `],
})
export class TransferDialogComponent implements OnInit {
  @Input({ required: true }) ticket!: Ticket;
  /** IT admin wording (assignee is cleared). */
  @Input() adminView = false;
  /** Emits the department the ticket went to. */
  @Output() transferred = new EventEmitter<ServiceDepartment>();
  @Output() closed = new EventEmitter<void>();

  sdSvc = inject(ServiceDepartmentService);
  private ticketSvc = inject(TicketService);
  private i18n = inject(TranslationService);

  loading = signal(true);
  saving = signal(false);
  error = signal('');
  targets = signal<ServiceDepartment[]>([]);
  selectedId = '';
  note = '';

  async ngOnInit() {
    try {
      await this.sdSvc.load(true);
      // not the current department, and not the one that sent the ticket
      this.targets.set(this.sdSvc.targets([this.ticket.to_department_id, this.ticket.from_department_id]));
    } catch (err: any) {
      this.error.set(err?.message ?? this.i18n.t('common.saveFailed'));
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    const target = this.targets().find(d => d.id === this.selectedId);
    if (!target || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.ticketSvc.transferTicket(this.ticket.id, target.id, this.note);
      this.transferred.emit(target);
    } catch (err: any) {
      this.error.set(err?.message ?? this.i18n.t('common.saveFailed'));
    } finally {
      this.saving.set(false);
    }
  }

  close() {
    if (!this.saving()) this.closed.emit();
  }
}