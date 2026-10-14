import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Ticket } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

/** Home page of a department account: tickets received by / sent from the department. */
@Component({
  selector: 'app-dept-dashboard',
  imports: [RouterLink, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './dept-dashboard.component.html',
  styleUrls: ['../../portal/dashboard/dashboard.component.css', './dept-dashboard.component.css'],
})
export class DeptDashboardComponent implements OnInit {
  tickets = signal<Ticket[]>([]);
  loading = signal(true);

  box = signal<'inbox' | 'sent'>('inbox');
  view = signal<'active' | 'archived'>('active');

  readonly deptId = computed(() => this.auth.user()?.service_department_id ?? null);
  readonly deptName = computed(() => this.sdSvc.label(this.auth.user()?.service_department));

  /** Unread notifications grouped by type → highlight the matching tickets. */
  private unreadByType = computed(() => {
    const map = new Map<string, Set<string>>();
    for (const n of this.notificationSvc.notifications()) {
      if (n.is_read || !n.ticket_id) continue;
      if (!map.has(n.type)) map.set(n.type, new Set());
      map.get(n.type)!.add(n.ticket_id);
    }
    return map;
  });

  isNewReply(id: string): boolean {
    return this.unreadByType().get('new_comment')?.has(id) ?? false;
  }

  isNewTicket(id: string): boolean {
    const m = this.unreadByType();
    return !!(m.get('new_ticket')?.has(id) || m.get('transferred')?.has(id));
  }

  get stats() {
    const t = this.tickets();
    return [
      { label: 'stat.total',         count: t.length,                                         color: '#4f46e5' },
      { label: 'status.open',        count: t.filter(x => x.status === 'open').length,        color: '#4f46e5' },
      { label: 'status.in_progress', count: t.filter(x => x.status === 'in_progress').length, color: '#d97706' },
      { label: 'status.resolved',    count: t.filter(x => x.status === 'resolved').length,    color: '#059669' },
    ];
  }

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    public sdSvc: ServiceDepartmentService,
    public notificationSvc: NotificationService,
  ) {}

  async ngOnInit() {
    this.sdSvc.load().catch(err => console.warn('Could not load departments:', err));
    await this.load();
    await this.notificationSvc.init();
  }

  async setBox(b: 'inbox' | 'sent') {
    if (this.box() === b) return;
    this.box.set(b);
    await this.load();
  }

  async setView(v: 'active' | 'archived') {
    if (this.view() === v) return;
    this.view.set(v);
    await this.load();
  }

  /** Where the ticket came from (inbox) or where it went (sent). */
  counterpart(t: Ticket): string {
    if (this.box() === 'sent') return this.sdSvc.label(t.to_department);
    return t.from_department ? this.sdSvc.label(t.from_department) : (t.project_name ?? t.projects?.name ?? '');
  }

  counterpartColor(t: Ticket): string {
    const d = this.box() === 'sent' ? t.to_department : t.from_department;
    return d?.color ?? t.projects?.color ?? '#9ca3af';
  }

  private async load() {
    const deptId = this.deptId();
    this.loading.set(true);
    try {
      this.tickets.set(deptId
        ? await this.ticketSvc.getDepartmentTickets(deptId, this.box(), this.view() === 'archived')
        : []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
      this.tickets.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}