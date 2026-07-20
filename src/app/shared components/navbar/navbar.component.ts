// shared/components/navbar/navbar.component.ts
import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService, AppNotification } from '../../core/services/notification.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, NgIf, NgFor, DatePipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit, OnDestroy {
  @Input() orgName = '';
  @Input() role: 'admin' | 'user' | 'client' | 'it' = 'user';

  showDropdown = false;

  constructor(
    private auth: AuthService,
    public notificationSvc: NotificationService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.notificationSvc.init();
  }

  ngOnDestroy() {
    this.notificationSvc.destroy();
  }

  get roleLabel(): string {
    switch (this.role) {
      case 'admin': return 'IT Admin';
      case 'it':    return 'IT Team';
      case 'user':  return 'Client';
      case 'client':return 'Client';
      default:      return this.role;
    }
  }

  get isAdminRole(): boolean {
    return this.role === 'admin' || this.role === 'it';
  }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  async onNotificationClick(n: AppNotification) {
    if (!n.is_read) await this.notificationSvc.markAsRead(n.id);
    this.showDropdown = false;
    if (n.ticket_id) {
      const base = this.isAdminRole ? '/admin/ticket-detail' : '/portal/ticket';
      this.router.navigate([base, n.ticket_id]);
    }
  }

  async markAllRead() {
    await this.notificationSvc.markAllAsRead();
  }

  logout() { this.auth.logout(); }
}