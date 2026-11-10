// features/admin/departments/departments.component.ts
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ServiceDepartmentService } from '../../../core/services/service-department.service';
import { TeamService } from '../../../core/services/team.service';
import { ManagedUser, ServiceDepartment, ServiceDepartmentCategory } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

/**
 * IT admin: departments that receive / send tickets (IT, Finance, Marketing…),
 * their ticket categories and their login accounts.
 */
@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, NavbarComponent],
  templateUrl: './departments.component.html',
  styleUrls: ['../projects/projects.component.css', './departments.component.css'],
})
export class DepartmentsComponent implements OnInit {
  readonly PRESET_COLORS = ['#19587b', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  loading = signal(true);
  saving = signal(false);
  toast = signal('');
  toastError = signal(false);

  users = signal<ManagedUser[]>([]);

  /** IT first, then the others. */
  readonly departments = computed(() => this.sdSvc.departments());

  /** Active departments or the archive (archived = is_active false) */
  tab = signal<'active' | 'archived'>('active');
  readonly shown = computed(() =>
    this.departments().filter(d => this.tab() === 'active' ? d.is_active : !d.is_active));
  readonly archivedCount = computed(() => this.departments().filter(d => !d.is_active).length);

  newDept = { name_ar: '', name_en: '', code: '', color: '#ec4899' };

  // Edit
  editTarget = signal<ServiceDepartment | null>(null);
  editForm = { name_ar: '', name_en: '', code: '', color: '#19587b' };

  // Categories
  catTarget = signal<ServiceDepartment | null>(null);
  newCat = { name_ar: '', name_en: '' };
  editingCatId = signal<string | null>(null);
  editCat = { name_ar: '', name_en: '' };
  catBusy = signal(false);
  catError = signal('');

  // Account
  accountTarget = signal<ServiceDepartment | null>(null);
  accountForm = { full_name: '', email: '', password: '' };
  showAccountPassword = false;
  addingAccount = signal(false);

  constructor(
    public sdSvc: ServiceDepartmentService,
    private teamSvc: TeamService,
    private i18n: TranslationService,
  ) {}

  async ngOnInit() {
    this.loading.set(true);
    try {
      await Promise.all([this.sdSvc.load(true), this.loadUsers()]);
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadUsers() {
    try {
      this.users.set(await this.teamSvc.listAllUsers());
    } catch (err) {
      console.warn('Could not load accounts:', err);
    }
  }

  // ===== Helpers =====

  accountsOf(d: ServiceDepartment): ManagedUser[] {
    return this.users().filter(u => u.user_role === 'dept_user' && u.service_department_id === d.id);
  }

  categoriesOf(d: ServiceDepartment): ServiceDepartmentCategory[] {
    return this.sdSvc.categoriesOf(d.id, false);
  }

  activeCategoryCount(d: ServiceDepartment): number {
    return this.sdSvc.categoriesOf(d.id, true).length;
  }

  /** Name in the other language, shown under the main one. */
  secondaryName(d: { name_ar: string; name_en: string }): string {
    return this.i18n.lang() === 'ar' ? d.name_en : d.name_ar;
  }

  private validNames(ar: string, en: string): boolean {
    const a = ar.trim().length, e = en.trim().length;
    return a >= 2 && a <= 100 && e >= 2 && e <= 100;
  }

  private validCode(code: string): boolean {
    return /^[A-Z0-9-]{1,20}$/.test(code.trim().toUpperCase());
  }

  // ===== Create =====

  canCreate(): boolean {
    return this.validNames(this.newDept.name_ar, this.newDept.name_en) && this.validCode(this.newDept.code);
  }

  async createDepartment() {
    if (!this.canCreate()) return;
    this.saving.set(true);
    try {
      const created = await this.sdSvc.create(this.newDept);
      this.newDept = { name_ar: '', name_en: '', code: '', color: this.nextColor() };
      this.showToast(this.i18n.t('sdept.created'));
      this.openCategories(created);
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    } finally {
      this.saving.set(false);
    }
  }

  private nextColor(): string {
    const used = new Set(this.departments().map(d => d.color.toLowerCase()));
    return this.PRESET_COLORS.find(c => !used.has(c)) ?? this.PRESET_COLORS[0];
  }

  // ===== Edit / activate =====

  openEdit(d: ServiceDepartment) {
    this.editTarget.set(d);
    this.editForm = { name_ar: d.name_ar, name_en: d.name_en, code: d.code, color: d.color };
  }

  canSaveEdit(): boolean {
    return this.validNames(this.editForm.name_ar, this.editForm.name_en) && this.validCode(this.editForm.code);
  }

  async saveEdit() {
    const d = this.editTarget();
    if (!d || !this.canSaveEdit()) return;
    this.saving.set(true);
    try {
      await this.sdSvc.update(d.id, this.editForm);
      this.editTarget.set(null);
      this.showToast(this.i18n.t('sdept.updated'));
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    } finally {
      this.saving.set(false);
    }
  }

  /** Archive = the department stops receiving tickets and leaves the lists; restore brings it back. */
  async toggleActive(d: ServiceDepartment) {
    if (d.is_head) return;
    if (d.is_active && !confirm(this.i18n.t('sdept.confirmArchive', { name: this.sdSvc.label(d) }))) return;
    try {
      await this.sdSvc.update(d.id, { is_active: !d.is_active });
      this.showToast(this.i18n.t(d.is_active ? 'sdept.archivedToast' : 'sdept.restoredToast', { name: this.sdSvc.label(d) }));
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    }
  }

  // ===== Categories =====

  openCategories(d: ServiceDepartment) {
    this.catTarget.set(d);
    this.newCat = { name_ar: '', name_en: '' };
    this.editingCatId.set(null);
    this.catError.set('');
  }

  canAddCategory(): boolean {
    return !!(this.newCat.name_ar.trim() && this.newCat.name_en.trim());
  }

  async addCategory() {
    const d = this.catTarget();
    if (!d || this.catBusy()) return;
    if (!this.canAddCategory()) { this.catError.set(this.i18n.t('sdept.catNames')); return; }
    this.catBusy.set(true);
    this.catError.set('');
    try {
      await this.sdSvc.addCategory(d.id, this.newCat.name_ar, this.newCat.name_en);
      this.newCat = { name_ar: '', name_en: '' };
    } catch (err: any) {
      this.catError.set(err?.message ?? this.i18n.t('common.saveFailed'));
    } finally {
      this.catBusy.set(false);
    }
  }

  startCatEdit(c: ServiceDepartmentCategory) {
    this.editingCatId.set(c.id);
    this.editCat = { name_ar: c.name_ar, name_en: c.name_en };
    this.catError.set('');
  }

  async saveCatEdit(c: ServiceDepartmentCategory) {
    if (!this.editCat.name_ar.trim() || !this.editCat.name_en.trim()) {
      this.catError.set(this.i18n.t('sdept.catNames'));
      return;
    }
    this.catBusy.set(true);
    try {
      await this.sdSvc.updateCategory(c.id, this.editCat);
      this.editingCatId.set(null);
    } catch (err: any) {
      this.catError.set(err?.message ?? this.i18n.t('common.saveFailed'));
    } finally {
      this.catBusy.set(false);
    }
  }

  /** "other" is the fallback category and always stays on. */
  async toggleCategory(c: ServiceDepartmentCategory) {
    if (c.code === 'other') return;
    this.catBusy.set(true);
    this.catError.set('');
    try {
      await this.sdSvc.updateCategory(c.id, { is_active: !c.is_active });
    } catch (err: any) {
      this.catError.set(err?.message ?? this.i18n.t('common.saveFailed'));
    } finally {
      this.catBusy.set(false);
    }
  }

  // ===== Accounts =====

  openAddAccount(d: ServiceDepartment) {
    this.accountTarget.set(d);
    this.accountForm = { full_name: '', email: '', password: '' };
    this.showAccountPassword = false;
  }

  canAddAccount(): boolean {
    const f = this.accountForm;
    return !!(f.email.trim() && f.password.length >= 6);
  }

  async submitAddAccount() {
    const d = this.accountTarget();
    if (!d || !this.canAddAccount()) return;
    this.addingAccount.set(true);
    try {
      await this.teamSvc.createUser({
        email: this.accountForm.email.trim(),
        password: this.accountForm.password,
        full_name: this.accountForm.full_name.trim() || this.sdSvc.label(d),
        role: 'dept_user',
        service_department_id: d.id,
      });
      this.accountTarget.set(null);
      await this.loadUsers();
      this.showToast(this.i18n.t('sdept.accountAdded', { name: this.sdSvc.label(d) }));
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    } finally {
      this.addingAccount.set(false);
    }
  }

  private showToast(msg: string, isError = false) {
    this.toast.set(msg);
    this.toastError.set(isError);
    setTimeout(() => this.toast.set(''), 4000);
  }
}