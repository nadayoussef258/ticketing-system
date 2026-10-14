import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UserProfile, ManagedUser } from '../models';
import { environment } from '../../../environments/environment';

/** Error thrown by the admin-users Edge Function (keeps the server's error code). */
export class AdminFunctionError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

@Injectable({ providedIn: 'root' })
export class TeamService {
  private functionsUrl = `${environment.supabaseUrl}/functions/v1`;

  constructor(private supabase: SupabaseService) {}

  private async callAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    // Never leave the button spinning forever: give up after 30s
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${this.functionsUrl}/admin-users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new AdminFunctionError(
        err?.name === 'AbortError'
          ? 'The server did not respond in 30 seconds. Check the admin-users function logs in Supabase.'
          : 'Could not reach the server. Check your connection.',
      );
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AdminFunctionError(json.error ?? 'Request failed', json.code);
    return json as T;
  }

  /** "Assign to" list: the IT admin + active IT team members (admin only). */
  async getAssignableStaff(): Promise<UserProfile[]> {
    const { data, error } = await this.supabase.client.rpc('get_it_staff');
    if (error) throw error;
    return (data ?? []) as UserProfile[];
  }

  /** Every account (IT + client accounts) with email, role, project and status. */
  async listAllUsers(): Promise<ManagedUser[]> {
    const { data, error } = await this.supabase.client.rpc('get_managed_users');
    if (error) throw error;
    return (data ?? []) as ManagedUser[];
  }

  /** Create an IT team member, a client account linked to a project, or a department account. */
  async createUser(params: {
    email: string;
    password: string;
    full_name: string;
    role: 'it_staff' | 'project_admin' | 'dept_user';
    project_id?: string | null;
    service_department_id?: string | null;
  }): Promise<{ user_id: string }> {
    return this.callAdminUsers({ action: 'create', ...params });
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    await this.callAdminUsers({ action: 'reset_password', user_id: userId, new_password: newPassword });
  }

  async setUserStatus(userId: string, action: 'disable' | 'enable' | 'delete'): Promise<void> {
    await this.callAdminUsers({ action, user_id: userId });
  }
}