import { Routes } from '@angular/router';
import { authGuard, itTeamGuard, adminOnlyGuard, clientGuard, deptGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },

  // Auth
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [{
      path: 'login',
      loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    }],
  },

  // Admin (IT Team)
  {
    path: 'admin',
    canActivate: [authGuard, itTeamGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/admin/dashboard/dashboard.component').then(m => m.AdminDashboardComponent),
      },
      {
        path: 'ticket/:id',
        loadComponent: () => import('./features/admin/ticket-detail/ticket-detail.component').then(m => m.AdminTicketDetailComponent),
      },
      {
        path: 'new-ticket',
        canActivate: [adminOnlyGuard],
        loadComponent: () => import('./features/portal/new-ticket/new-ticket.component').then(m => m.NewTicketComponent),
      },
      {
        path: 'departments',
        canActivate: [adminOnlyGuard],
        loadComponent: () => import('./features/admin/departments/departments.component').then(m => m.DepartmentsComponent),
      },
      {
        path: 'projects',
        canActivate: [adminOnlyGuard],
        loadComponent: () => import('./features/admin/projects/projects.component').then(m => m.ProjectsComponent),
      },
      {
        path: 'team',
        canActivate: [adminOnlyGuard],
        loadComponent: () => import('./features/admin/team/team.component').then(m => m.TeamComponent),
      },
       {
        path: 'logs',
        canActivate: [adminOnlyGuard],
        loadComponent: () => import('./features/admin/logs/logs.component').then(m => m.LogsComponent),
      },
    ],
  },

  // Portal (Client users)
  {
    path: 'portal',
    canActivate: [authGuard, clientGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/portal/dashboard/dashboard.component').then(m => m.PortalDashboardComponent),
      },
      {
        path: 'new-ticket',
        loadComponent: () => import('./features/portal/new-ticket/new-ticket.component').then(m => m.NewTicketComponent),
      },
      {
        path: 'ticket/:id',
        loadComponent: () => import('./features/portal/ticket-detail/ticket-detail.component').then(m => m.PortalTicketDetailComponent),
      },
    ],
  },

  // Department accounts (Finance, Marketing…)
  {
    path: 'dept',
    canActivate: [authGuard, deptGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dept/dept-dashboard/dept-dashboard.component').then(m => m.DeptDashboardComponent),
      },
      {
        path: 'new-ticket',
        loadComponent: () => import('./features/portal/new-ticket/new-ticket.component').then(m => m.NewTicketComponent),
      },
      {
        path: 'ticket/:id',
        loadComponent: () => import('./features/dept/dept-ticket-detail/dept-ticket-detail.component').then(m => m.DeptTicketDetailComponent),
      },
    ],
  },

  { path: '**', redirectTo: 'auth/login' },
];