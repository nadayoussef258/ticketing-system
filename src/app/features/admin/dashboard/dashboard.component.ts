// dashboard.component.ts
import { Component, computed, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { FormsModule } from '@angular/forms';
import { Ticket, UserProfile } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { TeamService } from '../../../core/services/team.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

type FilterStatus = 'all' | 'open' | 'in_progress' | 'in_review' | 'resolved' | 'closed';
type FilterPriority = 'all' | 'low' | 'medium' | 'high' | 'critical';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgFor, NgIf, TranslatePipe, TranslateDatePipe, FormsModule, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css', './dashboard-departments.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  tickets = signal<Ticket[]>([]);
  loading = signal(true);
  newTicketIds = signal<Set<string>>(new Set());

  private realtimeChannel: any;

  /** Active tickets or the archive */
  view = signal<'active' | 'archived'>('active');
  /** Admin only: 'all' | 'unassigned' | <team member id> */
  filterAssignee = signal<string>('all');
  staff = signal<UserProfile[]>([]);

  /** Shared tickets: ticket id → parts done / total */
  shared = signal<Map<string, { done: number; total: number }>>(new Map());

  /** NEW: 'all' | <receiving department id> (IT, Finance, Marketing…) */
  filterTarget = signal<string>('all');

  filterStatus = signal<FilterStatus>('all');
  filterPriority = signal<FilterPriority>('all');
  search = signal('');

  filtered = computed(() => {
    let list = this.tickets();
    if (this.filterStatus() !== 'all') list = list.filter(t => t.status === this.filterStatus());
    if (this.filterPriority() !== 'all') list = list.filter(t => t.priority === this.filterPriority());
    const target = this.filterTarget();
    if (target !== 'all') list = list.filter(t => t.to_department_id === target);
    const a = this.filterAssignee();
    if (a === 'unassigned') list = list.filter(t => !t.assigned_to_id);
    else if (a !== 'all') list = list.filter(t => t.assigned_to_id === a);
    if (this.search().trim()) {
      const q = this.search().toLowerCase();
      list = list.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        t.ticket_number?.toLowerCase().includes(q) ||
        t.requester_name?.toLowerCase().includes(q) ||
        t.projects?.name?.toLowerCase().includes(q) ||
        this.sourceLabel(t).toLowerCase().includes(q) ||
        this.sdSvc.label(t.to_department).toLowerCase().includes(q)
      );
    }
    return list;
  });

  newCount = computed(() => this.newTicketIds().size);

  stats = computed(() => {
    const t = this.tickets();
    return [
      { label: 'status.open',        count: t.filter(x => x.status === 'open').length,        color: '#475569' },
      { label: 'status.in_progress', count: t.filter(x => x.status === 'in_progress').length, color: '#1d4ed8' },
      { label: 'status.in_review',   count: t.filter(x => x.status === 'in_review').length,   color: '#b45309' },
      { label: 'status.closed',      count: t.filter(x => x.status === 'closed').length,      color: '#b91c1c' },
      { label: 'status.resolved',    count: t.filter(x => x.status === 'resolved').length,    color: '#15803d' },
    ];
  });

  isNew(ticket: Ticket): boolean {
    return this.newTicketIds().has(ticket.id);
  }

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    private teamSvc: TeamService,
    public sdSvc: ServiceDepartmentService,
  ) {}

  async ngOnInit() {
    this.sdSvc.load().catch(err => console.warn('Could not load departments:', err));
    await this.load();

    if (this.auth.isAdmin()) {
      this.teamSvc.getAssignableStaff()
        .then(list => this.staff.set(list))
        .catch(err => console.warn('Could not load team list:', err));
    }

    this.realtimeChannel = this.ticketSvc.subscribeToTickets(async (raw) => {
      if (this.view() !== 'active') return;   // new tickets are never archived
      // The realtime payload has no joined data (project, departments) — fetch the full row
      const ticket = await this.ticketSvc.getTicketById(raw.id).catch(() => raw);
      if (!ticket || this.tickets().some(t => t.id === ticket.id)) return;
      this.tickets.update(prev => [ticket, ...prev]);
      this.newTicketIds.update(ids => new Set([...ids, ticket.id]));
      setTimeout(() => {
        this.newTicketIds.update(ids => { const s = new Set(ids); s.delete(ticket.id); return s; });
      }, 10000);
    });
  }

  /** Client project or sending department. */
  sourceLabel(t: Ticket): string {
    return t.from_department ? this.sdSvc.label(t.from_department) : (t.projects?.name ?? t.project_name ?? '');
  }

  async setView(v: 'active' | 'archived') {
    if (this.view() === v) return;
    this.view.set(v);
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const list = await this.ticketSvc.getAllTickets(this.view() === 'archived');
      this.tickets.set(list);
      this.loadShared(list.map(t => t.id));
    } catch (err) {
      console.error('Failed to load tickets:', err);
      this.tickets.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadShared(ids: string[]) {
    try {
      const map = new Map<string, { done: number; total: number }>();
      for (const p of await this.ticketSvc.getPartsFor(ids)) {
        const e = map.get(p.ticket_id) ?? { done: 0, total: 0 };
        e.total++;
        if (p.status === 'resolved') e.done++;
        map.set(p.ticket_id, e);
      }
      this.shared.set(map);
    } catch { this.shared.set(new Map()); }
  }

  ngOnDestroy() {
    this.realtimeChannel?.unsubscribe();
  }
}