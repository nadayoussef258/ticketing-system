// team.component.ts
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TeamService, AdminFunctionError } from '../../../core/services/team.service';
import { AuthService } from '../../../core/services/auth.service';
import { ManagedUser } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent],
  templateUrl: './team.component.html',
  styleUrls: ['./team.component.css'],
})
export class TeamComponent implements OnInit {
  users = signal<ManagedUser[]>([]);
  loading = signal(true);
  saving = signal(false);
  toast = signal('');
  toastError = signal(false);

  /** 'it' = IT admin + team members, 'clients' = project accounts, 'depts' = department accounts */
  tab = signal<'it' | 'clients' | 'depts'>('it');
  itUsers     = computed(() => this.users().filter(u => u.user_role === 'admin' || u.user_role === 'it_staff'));
  clientUsers = computed(() => this.users().filter(u => u.user_role === 'project_admin' || u.user_role === 'user'));
  deptUsers   = computed(() => this.users().filter(u => u.user_role === 'dept_user'));
  visibleUsers = computed(() =>
    this.tab() === 'it' ? this.itUsers() : this.tab() === 'depts' ? this.deptUsers() : this.clientUsers());

  // New accounts created here are IT team members.
  // Client accounts are created from the Projects page (they need a project).
  newUser = { email: '', password: '', full_name: '' };
  showPassword = false;

  resetTarget = signal<ManagedUser | null>(null);
  newPassword = '';
  showNewPassword = false;
  savingPassword = signal(false);

  deleteTarget = signal<ManagedUser | null>(null);
  deleting = signal(false);

  constructor(private teamSvc: TeamService, public auth: AuthService, private i18n: TranslationService) {}

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
      await this.teamSvc.createUser({
        email: this.newUser.email.trim(),
        password: this.newUser.password,
        full_name: this.newUser.full_name.trim(),
        role: 'it_staff',
      });
      this.newUser = { email: '', password: '', full_name: '' };
      this.tab.set('it');
      await this.loadUsers();
      this.showToast(this.i18n.t('team.created'));
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
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
      this.showToast(this.i18n.t('team.passwordUpdated'));
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
      this.showToast(this.i18n.t(user.banned_until ? 'team.enabled' : 'team.disabledToast'));
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
      this.showToast(this.i18n.t('team.deleted'));
    } catch (err: any) {
      this.deleteTarget.set(null);
      if (err instanceof AdminFunctionError && err.code === 'HAS_HISTORY') {
        this.showToast(this.i18n.t('team.hasHistory', { name: u.full_name }), true);
      } else {
        this.showToast(err.message, true);
      }
    } finally {
      this.deleting.set(false);
    }
  }

  roleLabel(role: string): string {
    switch (role) {
      case 'admin':         return this.i18n.t('role.admin');
      case 'it_staff':      return this.i18n.t('role.staff');
      case 'project_admin': return this.i18n.t('role.client');
      case 'dept_user':     return this.i18n.t('role.dept');
      default:              return this.i18n.t('role.user');
    }
  }

  /** The IT admin row and your own row have no disable/delete. */
  canManage(u: ManagedUser): boolean {
    return u.user_role !== 'admin' && u.user_id !== this.auth.getCurrentUserId();
  }

  private showToast(msg: string, isError = false) {
    this.toast.set(msg);
    this.toastError.set(isError);
    setTimeout(() => this.toast.set(''), 3500);
  }
}