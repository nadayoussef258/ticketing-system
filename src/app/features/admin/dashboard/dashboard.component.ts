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
import { DepartmentService } from '../../../core/services/Department.service';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

type FilterStatus = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';
type FilterPriority = 'all' | 'low' | 'medium' | 'high' | 'critical';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, NgFor, NgIf, TranslatePipe, TranslateDatePipe, FormsModule, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
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

  /** 'all' | <department id> — options come from the loaded tickets */
  filterDepartment = signal<string>('all');
  departmentOptions = computed(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const t of this.tickets()) {
      if (t.department && !map.has(t.department.id)) {
        const project = t.projects?.code ? `${t.projects.code} · ` : '';
        map.set(t.department.id, { id: t.department.id, label: project + this.deptSvc.label(t.department) });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  });

  filterStatus = signal<FilterStatus>('all');
filterPriority = signal<FilterPriority>('all');
search = signal('');

filtered = computed(() => {
  let list = this.tickets();
  if (this.filterStatus() !== 'all') list = list.filter(t => t.status === this.filterStatus());
  if (this.filterPriority() !== 'all') list = list.filter(t => t.priority === this.filterPriority());
  const d = this.filterDepartment();
  if (d !== 'all') list = list.filter(t => t.department?.id === d);
  const a = this.filterAssignee();
  if (a === 'unassigned') list = list.filter(t => !t.assigned_to_id);
  else if (a !== 'all') list = list.filter(t => t.assigned_to_id === a);
  if (this.search().trim()) {
    const q = this.search().toLowerCase();
    list = list.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      t.ticket_number?.toLowerCase().includes(q) ||
      t.requester_name?.toLowerCase().includes(q) ||
      t.projects?.name?.toLowerCase().includes(q)
    );
  }
  return list;
});

  newCount = computed(() => this.newTicketIds().size);

  stats = computed(() => {
    const t = this.tickets();
    return [
      { label: 'stat.total',       count: t.length, color: '#4f46e5' },
      { label: 'status.open',        count: t.filter(x => x.status === 'open').length, color: '#4f46e5' },
      { label: 'status.in_progress', count: t.filter(x => x.status === 'in_progress').length, color: '#d97706' },
      { label: 'status.resolved',    count: t.filter(x => x.status === 'resolved').length, color: '#059669' },
    ];
  });

  isNew(ticket: Ticket): boolean {
    return this.newTicketIds().has(ticket.id);
  }

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    private teamSvc: TeamService,
    public deptSvc: DepartmentService,
  ) {}

  async ngOnInit() {
    await this.load();

    if (this.auth.isAdmin()) {
      this.teamSvc.getAssignableStaff()
        .then(list => this.staff.set(list))
        .catch(err => console.warn('Could not load team list:', err));
    }

    this.realtimeChannel = this.ticketSvc.subscribeToTickets((ticket) => {
      if (this.view() !== 'active') return;   // new tickets are never archived
      this.tickets.update(prev => [ticket, ...prev]);
      this.newTicketIds.update(ids => new Set([...ids, ticket.id]));
      setTimeout(() => {
        this.newTicketIds.update(ids => { const s = new Set(ids); s.delete(ticket.id); return s; });
      }, 10000);
    });
  }

  async setView(v: 'active' | 'archived') {
    if (this.view() === v) return;
    this.view.set(v);
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      this.tickets.set(await this.ticketSvc.getAllTickets(this.view() === 'archived'));
    } catch (err) {
      console.error('Failed to load tickets:', err);
      this.tickets.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.realtimeChannel?.unsubscribe();
  }
}