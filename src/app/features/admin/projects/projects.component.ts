// features/admin/projects/projects.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { TranslatePipe, TranslateDatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ProjectService } from '../../../core/services/project.service';
import { AdminUserService } from '../../../core/services/admin-user.service';
import { DepartmentService } from '../../../core/services/Department.service';
import { Department, Project } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, TranslatePipe, TranslateDatePipe, NavbarComponent],
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.css'],
})
export class ProjectsComponent implements OnInit {
  projects = signal<Project[]>([]);
  loading = signal(true);
  saving = signal(false);
  toast = signal('');
  toastError = signal(false);

  // New project form (no login credentials anymore — projects and accounts are separate)
  newProject = {
    name: '',
    code: '',
    description: '',
    color: '#6366f1',
  };

  // Edit modal
  editTarget = signal<Project | null>(null);
  editForm = { name: '', code: '', description: '', color: '#6366f1' };

  // Delete modal
  deleteTarget = signal<Project | null>(null);
  deleting = signal(false);

  // Add-admin modal
  addAdminTarget = signal<Project | null>(null);
  addAdminForm = { full_name: '', email: '', password: '' };
  showAddAdminPassword = false;
  addingAdmin = signal(false);

  // Departments modal
  deptCounts = signal<Partial<Record<string, number>>>({});
  deptTarget = signal<Project | null>(null);
  departments = signal<Department[]>([]);
  deptLoading = signal(false);
  deptBusy = signal(false);
  deptError = signal('');
  deptInfo = signal('');
  newDept = { name_ar: '', name_en: '' };
  editingDeptId = signal<string | null>(null);
  editDept = { name_ar: '', name_en: '' };

  readonly PRESET_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

  constructor(
    private projectSvc: ProjectService,
    private adminUserSvc: AdminUserService,
    public deptSvc: DepartmentService,
    private i18n: TranslationService,
  ) {}

  async ngOnInit() {
    await this.loadProjects();
  }

  async loadProjects() {
    this.loading.set(true);
    try {
      this.projects.set(await this.projectSvc.getAll());
      this.deptSvc.countByProject()
        .then(c => this.deptCounts.set(c))
        .catch(err => console.warn('Could not count departments:', err));
    } catch (err: any) {
      this.showToast(err.message, true);
    } finally {
      this.loading.set(false);
    }
  }

  canCreate(): boolean {
    return !!(this.newProject.name.trim() && this.newProject.code.trim());
  }

  async createProject() {
    if (!this.canCreate()) return;
    this.saving.set(true);
    try {
      const payload: any = {
        name: this.newProject.name.trim(),
        code: this.newProject.code.trim().toUpperCase(),
        description: this.newProject.description.trim() || null,
        color: this.newProject.color,
      };
      const created = await this.projectSvc.create(payload);
      this.newProject = { name: '', code: '', description: '', color: '#6366f1' };
      await this.loadProjects();
      this.showToast(this.i18n.t('projects.created'));
      this.openDepartments(created);
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    } finally {
      this.saving.set(false);
    }
  }

  openEdit(project: Project) {
    this.editTarget.set(project);
    this.editForm = {
      name: project.name,
      code: project.code,
      description: project.description ?? '',
      color: project.color,
    };
  }

  async saveEdit() {
    const p = this.editTarget();
    if (!p) return;
    this.saving.set(true);
    try {
      const payload: any = {
        name: this.editForm.name.trim(),
        code: this.editForm.code.trim().toUpperCase(),
        description: this.editForm.description.trim() || null,
        color: this.editForm.color,
      };
      await this.projectSvc.update(p.id, payload);
      await this.loadProjects();
      this.editTarget.set(null);
      this.showToast(this.i18n.t('projects.updated'));
    } catch (err: any) {
      this.showToast(err.message, true);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(project: Project) {
    try {
      const newStatus = project.status === 'active' ? 'archived' : 'active';
      await this.projectSvc.setStatus(project.id, newStatus);
      this.projects.update(list =>
        list.map(p => p.id === project.id ? { ...p, status: newStatus } : p)
      );
      this.showToast(this.i18n.t(newStatus === 'active' ? 'projects.activated' : 'projects.archived'));
    } catch (err: any) {
      this.showToast(err.message, true);
    }
  }

  async confirmDelete() {
    const p = this.deleteTarget();
    if (!p) return;
    this.deleting.set(true);
    try {
      await this.projectSvc.remove(p.id);
      this.projects.update(list => list.filter(x => x.id !== p.id));
      this.deleteTarget.set(null);
      this.showToast(this.i18n.t('projects.deleted'));
    } catch (err: any) {
      this.showToast(err.message, true);
    } finally {
      this.deleting.set(false);
    }
  }

  // ---- Add project-scoped admin ----

  openAddAdmin(project: Project) {
    this.addAdminTarget.set(project);
    this.addAdminForm = { full_name: '', email: '', password: '' };
    this.showAddAdminPassword = false;
  }

  canAddAdmin(): boolean {
    return !!(this.addAdminForm.email.trim() && this.addAdminForm.password.trim().length >= 6);
  }

  async submitAddAdmin() {
    const project = this.addAdminTarget();
    if (!project || !this.canAddAdmin()) return;
    this.addingAdmin.set(true);
    try {
      await this.adminUserSvc.createProjectAdmin(project.id, {
        email: this.addAdminForm.email.trim(),
        password: this.addAdminForm.password,
        full_name: this.addAdminForm.full_name.trim() || undefined,
      });
      this.addAdminTarget.set(null);
      this.showToast(this.i18n.t('projects.accountAdded', { name: project.name }));
    } catch (err: any) {
      this.showToast(err?.message ?? this.i18n.t('common.saveFailed'), true);
    } finally {
      this.addingAdmin.set(false);
    }
  }

  // ---- Departments ----

  async openDepartments(project: Project) {
    this.deptTarget.set(project);
    this.departments.set([]);
    this.newDept = { name_ar: '', name_en: '' };
    this.editingDeptId.set(null);
    this.deptError.set('');
    this.deptInfo.set('');
    this.deptLoading.set(true);
    try {
      this.departments.set(await this.deptSvc.listByProject(project.id));
    } catch (err: any) {
      this.deptError.set(err.message);
    } finally {
      this.deptLoading.set(false);
    }
  }

  closeDepartments() {
    this.deptTarget.set(null);
    this.refreshDeptCount();
  }

  canAddDept(): boolean {
    return this.newDept.name_ar.trim().length >= 2 && this.newDept.name_en.trim().length >= 2;
  }

  async addDepartment() {
    const project = this.deptTarget();
    if (!project || !this.canAddDept()) return;
    this.deptBusy.set(true);
    this.deptError.set('');
    this.deptInfo.set('');
    try {
      const nextOrder = this.departments().reduce((m, d) => Math.max(m, d.sort_order), 0) + 1;
      const d = await this.deptSvc.create(project.id, this.newDept.name_ar, this.newDept.name_en, nextOrder);
      this.departments.update(list => [...list, d]);
      this.newDept = { name_ar: '', name_en: '' };
    } catch (err: any) {
      this.deptError.set(err.message);
    } finally {
      this.deptBusy.set(false);
    }
  }

  startDeptEdit(d: Department) {
    this.editingDeptId.set(d.id);
    this.editDept = { name_ar: d.name_ar, name_en: d.name_en };
    this.deptError.set('');
  }

  async saveDeptEdit(d: Department) {
    if (this.editDept.name_ar.trim().length < 2 || this.editDept.name_en.trim().length < 2) {
      this.deptError.set(this.i18n.t('dept.bothNames'));
      return;
    }
    this.deptBusy.set(true);
    this.deptError.set('');
    try {
      await this.deptSvc.update(d.id, { name_ar: this.editDept.name_ar, name_en: this.editDept.name_en });
      this.departments.update(list => list.map(x => x.id === d.id
        ? { ...x, name_ar: this.editDept.name_ar.trim(), name_en: this.editDept.name_en.trim() } : x));
      this.editingDeptId.set(null);
    } catch (err: any) {
      this.deptError.set(err.message);
    } finally {
      this.deptBusy.set(false);
    }
  }

  async toggleDeptActive(d: Department) {
    this.deptBusy.set(true);
    this.deptError.set('');
    this.deptInfo.set('');
    try {
      await this.deptSvc.update(d.id, { is_active: !d.is_active });
      this.departments.update(list => list.map(x => x.id === d.id ? { ...x, is_active: !d.is_active } : x));
    } catch (err: any) {
      this.deptError.set(err.message);
    } finally {
      this.deptBusy.set(false);
    }
  }

  async deleteDepartment(d: Department) {
    this.deptBusy.set(true);
    this.deptError.set('');
    this.deptInfo.set('');
    try {
      const deleted = await this.deptSvc.remove(d.id);
      if (deleted) {
        this.departments.update(list => list.filter(x => x.id !== d.id));
      } else {
        // Used by existing tickets: keep it for history, just hide it from the form
        await this.deptSvc.update(d.id, { is_active: false });
        this.departments.update(list => list.map(x => x.id === d.id ? { ...x, is_active: false } : x));
        this.deptInfo.set(this.i18n.t('dept.deactivatedInstead', { name: this.deptSvc.label(d) }));
      }
    } catch (err: any) {
      this.deptError.set(err.message);
    } finally {
      this.deptBusy.set(false);
    }
  }

  private refreshDeptCount() {
    this.deptSvc.countByProject()
      .then(c => this.deptCounts.set(c))
      .catch(() => {});
  }

  private showToast(msg: string, isError = false) {
    this.toast.set(msg);
    this.toastError.set(isError);
    setTimeout(() => this.toast.set(''), 3500);
  }
}