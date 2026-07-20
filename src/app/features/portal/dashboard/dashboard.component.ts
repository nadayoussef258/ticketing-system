import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
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
export class PortalDashboardComponent implements OnInit, OnDestroy {
  tickets = signal<Ticket[]>([]);
  loading = signal(true);

  ticketsWithNewReply = signal(new Set<string>());

  private channels: any[] = [];

  get stats() {
    const t = this.tickets();
    return [
      { label: 'Total',       count: t.length,                                         color: '#4f46e5' },
      { label: 'Open',        count: t.filter(x => x.status === 'open').length,        color: '#4f46e5' },
      { label: 'In Progress', count: t.filter(x => x.status === 'in_progress').length, color: '#d97706' },
      { label: 'Resolved',    count: t.filter(x => x.status === 'resolved').length,    color: '#059669' },
    ];
  }

  constructor(public auth: AuthService, private ticketSvc: TicketService) {}

  async ngOnInit() {
    try {
      const data = await this.ticketSvc.getMyTickets();
      this.tickets.set(data);
      this.subscribeToComments(data);
    } finally {
      this.loading.set(false);
    }
  }

  private subscribeToComments(tickets: Ticket[]) {
    const currentUserId = this.auth.getCurrentUserId();

    for (const ticket of tickets) {
      const ch = this.ticketSvc.subscribeToComments(ticket.id, (comment) => {
        // Only notify if it's an IT reply, not the client's own message
        if (comment.is_agent_reply && comment.author_id !== currentUserId) {
          this.ticketsWithNewReply.update(s => new Set([...s, ticket.id]));
        }
      });
      this.channels.push(ch);
    }
  }

  ngOnDestroy() {
    this.channels.forEach(ch => ch?.unsubscribe());
  }
}