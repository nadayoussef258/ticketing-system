// team.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { TeamService } from '../../../core/services/team.service';
import { ManagedUser } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, DatePipe, NavbarComponent],
  templateUrl: './team.component.html',
  styleUrls: ['./team.component.css'],
})
export class TeamComponent implements OnInit {
  users = signal<ManagedUser[]>([]);
  loading = signal(true);
  saving = signal(false);
  toast = signal('');
  toastError = signal(false);

  newUser = { email: '', password: '', full_name: '', role: 'admin' as 'admin' | 'user' };
  showPassword = false;

  resetTarget = signal<ManagedUser | null>(null);
  newPassword = '';
  showNewPassword = false;
  savingPassword = signal(false);

  deleteTarget = signal<ManagedUser | null>(null);
  deleting = signal(false);

  constructor(private teamSvc: TeamService) {}

  async ngOnInit() {
    await this.loadUsers();
  }

  async loadUsers() {
    this.loading.set(true);
    try {
      this.users.set(await this.teamSvc.listAllUsers());
    } catch (err: any) {
      this.showToast(err.message, true);
    } finally {
      this.loading.set(false);
    }
  }

  canCreate(): boolean {
    return !!(this.newUser.email && this.newUser.password.length >= 6 && this.newUser.full_name.trim());
  }

  async createUser() {
    if (!this.canCreate()) return;
    this.saving.set(true);
    try {
      await this.teamSvc.createUser(this.newUser);
      this.newUser = { email: '', password: '', full_name: '', role: 'admin' };
      await this.loadUsers();
      this.showToast('Account created successfully');
    } catch (err: any) {
      this.showToast(err.message ?? 'Failed to create user', true);
    } finally {
      this.saving.set(false);
    }
  }

  openResetModal(user: ManagedUser) {
    this.resetTarget.set(user);
    this.newPassword = '';
    this.showNewPassword = false;
  }

  async savePassword() {
    const u = this.resetTarget();
    if (!u || this.newPassword.length < 6) return;
    this.savingPassword.set(true);
    try {
      await this.teamSvc.updatePassword(u.user_id, this.newPassword);
      this.showToast('Password updated');
      this.resetTarget.set(null);
    } catch (err: any) {
      this.showToast(err.message, true);
    } finally {
      this.savingPassword.set(false);
    }
  }

  async toggleActive(user: ManagedUser) {
    try {
      await this.teamSvc.setUserStatus(user.user_id, user.banned_until ? 'enable' : 'disable');
      await this.loadUsers();
      this.showToast(user.banned_until ? 'Account enabled' : 'Account disabled');
    } catch (err: any) {
      this.showToast(err.message, true);
    }
  }

  async confirmDelete() {
    const u = this.deleteTarget();
    if (!u) return;
    this.deleting.set(true);
    try {
      await this.teamSvc.setUserStatus(u.user_id, 'delete');
      this.users.update(list => list.filter(x => x.user_id !== u.user_id));
      this.deleteTarget.set(null);
      this.showToast('User deleted');
    } catch (err: any) {
      this.showToast(err.message, true);
    } finally {
      this.deleting.set(false);
    }
  }

  private showToast(msg: string, isError = false) {
    this.toast.set(msg);
    this.toastError.set(isError);
    setTimeout(() => this.toast.set(''), 3500);
  }
}