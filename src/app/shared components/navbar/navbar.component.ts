// shared/components/navbar/navbar.component.ts
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NgIf, NgFor } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService, AppNotification } from '../../core/services/notification.service';
import { TranslatePipe, TranslateDatePipe } from '../../core/i18n/t.pipe';
import { TranslationService } from '../../core/i18n/translation.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIf, NgFor, TranslatePipe, TranslateDatePipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input() orgName = '';
  /** @deprecated role now comes from AuthService; kept so existing templates still compile. */
  @Input() role: string = '';

  showDropdown = false;

  constructor(
    public auth: AuthService,
    public notificationSvc: NotificationService,
    private router: Router,
    private i18n: TranslationService,
  ) {}

  ngOnInit() {
    this.notificationSvc.init();
  }

  ngOnDestroy() {
    this.notificationSvc.destroy();
  }

  get roleLabel(): string {
    switch (this.auth.role()) {
      case 'admin':         return this.i18n.t('role.admin');
      case 'it_staff':      return this.i18n.t('role.staff');
      case 'project_admin':
      case 'user':          return this.i18n.t('role.client');
      case 'dept_user':     return this.i18n.t('role.dept');
      default:              return '';
    }
  }

  /**
   * Notifications are stored in English by the database
   * ("New ticket: <subject>", "Ticket assigned to you: TK-12", "New reply on TK-12").
   * Show a translated heading + the useful part (subject / ticket number).
   */
  notifTitle(n: AppNotification): string {
    const tail = this.stripPrefix(n.title, ['New ticket: ', 'Ticket assigned to you: ', 'Ticket transferred to your department: ', 'New reply on ']);
    const key = n.type === 'new_ticket'  ? 'notif.newTicket'
              : n.type === 'assigned'    ? 'notif.assigned'
              : n.type === 'transferred' ? 'notif.transferred'
              : 'notif.newReply';
    return `${this.i18n.t(key)}: ${tail}`;
  }

  notifDetail(n: AppNotification): string {
    if (!n.body) return '';
    if (n.type === 'new_comment') return n.body.replace(' replied: ', ': ');
    if (n.type === 'transferred') {
      const m = /^Transferred from (.*?): (.*)$/s.exec(n.body);
      if (m) return this.i18n.t('notif.transferredFrom', { from: m[1], subject: m[2] });
    }
    if (n.type === 'new_ticket') {
      const m = /^(.*) opened a new (low|medium|high|critical) priority ticket\.$/.exec(n.body);
      if (m) return this.i18n.t('notif.openedBy', { name: m[1], priority: this.i18n.t('priority.' + m[2]) });
    }
    return n.body;
  }

  private stripPrefix(text: string, prefixes: string[]): string {
    for (const p of prefixes) if (text.startsWith(p)) return text.slice(p.length);
    return text;
  }

  /** IT side (admin + team members) — shows the bell and IT nav. */
  get isAdminRole(): boolean {
    return this.auth.isItTeam();
  }

  /** Department account (Finance, Marketing…). */
  get isDeptRole(): boolean {
    return this.auth.isDept();
  }

  /** The bell is shown to the IT side and to department accounts. */
  get showBell(): boolean {
    return this.auth.isItTeam() || this.auth.isDept();
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  async onNotificationClick(n: AppNotification) {
    if (!n.is_read) await this.notificationSvc.markAsRead(n.id);
    this.showDropdown = false;
    if (n.ticket_id) {
      const base = this.isAdminRole ? '/admin/ticket' : this.isDeptRole ? '/dept/ticket' : '/portal/ticket';
      this.router.navigate([base, n.ticket_id]);
    }
  }

  async markAllRead() {
    await this.notificationSvc.markAllAsRead();
  }

  logout() { this.auth.logout(); }
}