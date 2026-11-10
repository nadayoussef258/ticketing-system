import { Component, computed, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Ticket } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class PortalDashboardComponent implements OnInit {
  tickets = signal<Ticket[]>([]);
  loading = signal(true);

  // مشتقة مباشرة من جدول notifications بدل channels منفصلة لكل تذكرة
  ticketsWithNewReply = computed(() => {
    const ids = this.notificationSvc.notifications()
      .filter(n => !n.is_read && n.type === 'new_comment' && n.ticket_id)
      .map(n => n.ticket_id as string);
    return new Set(ids);
  });

  get stats() {
    const t = this.tickets();
    return [
      { label: 'status.open',        count: t.filter(x => x.status === 'open').length,        color: '#475569' },
      { label: 'status.in_progress', count: t.filter(x => x.status === 'in_progress').length, color: '#1d4ed8' },
      { label: 'status.in_review',   count: t.filter(x => x.status === 'in_review').length,   color: '#b45309' },
      { label: 'status.closed',      count: t.filter(x => x.status === 'closed').length,      color: '#b91c1c' },
      { label: 'status.resolved',    count: t.filter(x => x.status === 'resolved').length,    color: '#15803d' },
    ];
  }

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public deptSvc: DepartmentService,
    public sdSvc: ServiceDepartmentService,
    public notificationSvc: NotificationService,
  ) {}

  /** Active tickets or the archive */
  view = signal<'active' | 'archived'>('active');

  async setView(v: 'active' | 'archived') {
    if (this.view() === v) return;
    this.view.set(v);
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      this.tickets.set(await this.ticketSvc.getMyTickets(this.view() === 'archived'));
    } catch (err) {
      console.error('Failed to load tickets:', err);
      this.tickets.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async ngOnInit() {
    await this.load();
    // نتأكد إن الإشعارات محمّلة للكلاينت حتى لو الجرس مخفي عنده
    await this.notificationSvc.init();
  }
}