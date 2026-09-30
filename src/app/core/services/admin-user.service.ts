import { Injectable } from '@angular/core';
import { TeamService } from './team.service';
import { ManagedUser } from '../models';

/**
 * Kept for the Projects page. Everything goes through TeamService
 * (one Edge Function: admin-users), so there is a single code path.
 */
@Injectable({ providedIn: 'root' })
export class AdminUserService {
  constructor(private team: TeamService) {}

  listManagedUsers(): Promise<ManagedUser[]> {
    return this.team.listAllUsers();
  }

  /** Client account for one project (e.g. the institute's shared login). */
  createProjectAdmin(project_id: string, params: {
    email: string;
    password: string;
    full_name?: string;
  }): Promise<{ user_id: string }> {
    return this.team.createUser({
      email: params.email,
      password: params.password,
      full_name: params.full_name ?? '',
      role: 'project_admin',
      project_id,
    });
  }

  updatePassword(userId: string, newPassword: string) { return this.team.updatePassword(userId, newPassword); }
  disableUser(userId: string) { return this.team.setUserStatus(userId, 'disable'); }
  enableUser(userId: string)  { return this.team.setUserStatus(userId, 'enable'); }
  deleteUser(userId: string)  { return this.team.setUserStatus(userId, 'delete'); }
}