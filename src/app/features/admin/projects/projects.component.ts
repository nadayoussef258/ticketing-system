// features/admin/projects/projects.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgFor, NgIf, DatePipe } from '@angular/common';
import { ProjectService } from '../../../core/services/project.service';
import { AdminUserService } from '../../../core/services/admin-user.service';
import { Project } from '../../../core/models';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [RouterLink, FormsModule, NgFor, NgIf, DatePipe, NavbarComponent],
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

  readonly PRESET_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

  constructor(
    private projectSvc: ProjectService,
    private adminUserSvc: AdminUserService,
  ) {}

  async ngOnInit() {
    await this.loadProjects();
  }

  async loadProjects() {
    this.loading.set(true);
    try {
      this.projects.set(await this.projectSvc.getAll());
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
      await this.projectSvc.create(payload);
      this.newProject = { name: '', code: '', description: '', color: '#6366f1' };
      await this.loadProjects();
      this.showToast('Project created successfully');
    } catch (err: any) {
      this.showToast(err.message ?? 'Failed to create project', true);
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
      this.showToast('Project updated');
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
      this.showToast(newStatus === 'active' ? 'Project activated' : 'Project archived');
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
      this.showToast('Project deleted');
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
      this.showToast(`Admin added to "${project.name}"`);
    } catch (err: any) {
      this.showToast(err.message ?? 'Failed to add admin', true);
    } finally {
      this.addingAdmin.set(false);
    }
  }

  private showToast(msg: string, isError = false) {
    this.toast.set(msg);
    this.toastError.set(isError);
    setTimeout(() => this.toast.set(''), 3500);
  }
}