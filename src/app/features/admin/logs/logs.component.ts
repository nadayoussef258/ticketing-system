import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, NgClass, DatePipe } from '@angular/common';
import { AuditLogService, AuditLog } from '../../../core/services/audit-log.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

const ACTION_LABELS: Record<string, string> = {
  'ticket.status_changed': 'Changed ticket status',
  'ticket.priority_changed': 'Changed ticket priority',
  'ticket.assigned': 'Reassigned ticket',
  'ticket.it_replied': 'Replied to ticket',
  'ticket.client_replied': 'Client replied',
  'team.user_created': 'Created team member',
  'team.user_disabled': 'Disabled account',
  'team.user_enabled': 'Enabled account',
  'team.user_deleted': 'Deleted account',
  'team.password_reset': 'Reset password',
};

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [RouterLink, NgFor, NgIf, NgClass, DatePipe, NavbarComponent],
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
  constructor(private logSvc: AuditLogService) {}

 
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
    return ACTION_LABELS[action] ?? action;
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
    return 'bi-clock-history';
  }
}