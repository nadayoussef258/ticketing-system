import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, NgClass } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AuditLogService, AuditLog } from '../../../core/services/audit-log.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

/** Known actions have a translation key: log.<action> */
const KNOWN_ACTIONS = new Set([
  'ticket.status_changed', 'ticket.priority_changed', 'ticket.assigned',
  'ticket.it_replied', 'ticket.client_replied', 'ticket.archived', 'ticket.unarchived',
  'team.user_created', 'team.user_disabled', 'team.user_enabled',
  'team.user_deleted', 'team.password_reset',
]);

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [RouterLink, NgFor, NgIf, NgClass, TranslatePipe, TranslateDatePipe, NavbarComponent],
  templateUrl: './logs.component.html',
  styleUrls: ['./logs.component.css'],
})
export class LogsComponent implements OnInit {
  logs = signal<AuditLog[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  hasMore = signal(true);

  private pageSize = 30;
  private offset = 0;
  constructor(private logSvc: AuditLogService, public i18n: TranslationService) {}

 
  async ngOnInit() {
    this.loading.set(true);
    try {
      const data = await this.logSvc.listLogs(this.pageSize, 0);
      this.logs.set(data);
      this.offset = data.length;
      this.hasMore.set(data.length === this.pageSize);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore() {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    try {
      const data = await this.logSvc.listLogs(this.pageSize, this.offset);
      this.logs.update(l => [...l, ...data]);
      this.offset += data.length;
      this.hasMore.set(data.length === this.pageSize);
    } finally {
      this.loadingMore.set(false);
    }
  }
attachmentsOf(l: AuditLog): string[] {
  return (l.details?.['attachments'] as string[]) ?? [];
}
  label(action: string): string {
    return KNOWN_ACTIONS.has(action) ? this.i18n.t('log.' + action) : action;
  }

  /** status / priority values are stored as keys (in_progress, high...) — translate them. */
  fromTo(l: AuditLog, side: 'from' | 'to'): string {
    const v = String(l.details?.[side] ?? '');
    if (l.action === 'ticket.status_changed')   return this.i18n.t('status.' + v);
    if (l.action === 'ticket.priority_changed') return this.i18n.t('priority.' + v);
    if (v === 'Unassigned') return this.i18n.t('common.unassigned');
    return v;
  }
isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
}
  icon(action: string): string {
    if (action.includes('deleted') || action.includes('disabled')) return 'bi-x-circle';
    if (action.includes('created') || action.includes('enabled')) return 'bi-check-circle';
    if (action.includes('replied')) return 'bi-chat-dots';
    if (action.includes('assigned')) return 'bi-person-check';
    if (action.includes('status')) return 'bi-arrow-repeat';
    if (action.includes('priority')) return 'bi-flag';
    if (action.includes('password')) return 'bi-key';
    if (action.includes('unarchived')) return 'bi-box-arrow-up';
    if (action.includes('archived')) return 'bi-archive';
    return 'bi-clock-history';
  }
}