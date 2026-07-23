import { Component, computed, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Ticket } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgFor, NgIf, DatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
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
      { label: 'Total',       count: t.length,                                         color: '#4f46e5' },
      { label: 'Open',        count: t.filter(x => x.status === 'open').length,        color: '#4f46e5' },
      { label: 'In Progress', count: t.filter(x => x.status === 'in_progress').length, color: '#d97706' },
      { label: 'Resolved',    count: t.filter(x => x.status === 'resolved').length,    color: '#059669' },
    ];
  }

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public notificationSvc: NotificationService,
  ) {}

  async ngOnInit() {
    try {
      this.tickets.set(await this.ticketSvc.getMyTickets());
    } finally {
      this.loading.set(false);
    }
    // نتأكد إن الإشعارات محمّلة للكلاينت حتى لو الجرس مخفي عنده
    await this.notificationSvc.init();
  }
}