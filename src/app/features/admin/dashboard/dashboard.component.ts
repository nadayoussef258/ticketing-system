// dashboard.component.ts
import { Component, computed, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ticket } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

type FilterStatus = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';
type FilterPriority = 'all' | 'low' | 'medium' | 'high' | 'critical';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgFor, NgIf, DatePipe, FormsModule, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  tickets = signal<Ticket[]>([]);
  loading = signal(true);
  newTicketIds = signal<Set<string>>(new Set());

  private realtimeChannel: any;

  filterStatus = signal<FilterStatus>('all');
filterPriority = signal<FilterPriority>('all');
search = signal('');

filtered = computed(() => {
  let list = this.tickets();
  if (this.filterStatus() !== 'all') list = list.filter(t => t.status === this.filterStatus());
  if (this.filterPriority() !== 'all') list = list.filter(t => t.priority === this.filterPriority());
  if (this.search().trim()) {
    const q = this.search().toLowerCase();
    list = list.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      t.projects?.name?.toLowerCase().includes(q)
    );
  }
  return list;
});

  newCount = computed(() => this.newTicketIds().size);

  stats = computed(() => {
    const t = this.tickets();
    return [
      { label: 'Total',       count: t.length, color: '#4f46e5' },
      { label: 'Open',        count: t.filter(x => x.status === 'open').length, color: '#4f46e5' },
      { label: 'In Progress', count: t.filter(x => x.status === 'in_progress').length, color: '#d97706' },
      { label: 'Resolved',    count: t.filter(x => x.status === 'resolved').length, color: '#059669' },
    ];
  });

  isNew(ticket: Ticket): boolean {
    return this.newTicketIds().has(ticket.id);
  }

constructor(public auth: AuthService, private ticketSvc: TicketService) {}
  async ngOnInit() {
    try {
      const data = await this.ticketSvc.getAllTickets();
      this.tickets.set(data);
    } finally {
      this.loading.set(false);
    }

    this.realtimeChannel = this.ticketSvc.subscribeToTickets((ticket) => {
      this.tickets.update(prev => [ticket, ...prev]);
      this.newTicketIds.update(ids => new Set([...ids, ticket.id]));
      setTimeout(() => {
        this.newTicketIds.update(ids => { const s = new Set(ids); s.delete(ticket.id); return s; });
      }, 10000);
    });
  }

  ngOnDestroy() {
    this.realtimeChannel?.unsubscribe();
  }
}