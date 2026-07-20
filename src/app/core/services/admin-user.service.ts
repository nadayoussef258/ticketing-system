import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';
import { ManagedUser } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private functionsUrl = `${environment.supabaseUrl}/functions/v1`;

  constructor(private supabase: SupabaseService) {}

  /** Returns the current session's access token, needed to call Edge Functions */
  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  private async callFunction<T>(name: string, body: unknown): Promise<T> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.functionsUrl}/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json as T;
  }

  /** Lists all users joined with org + role + email, via the get_managed_users() SQL function */
  async listManagedUsers(): Promise<ManagedUser[]> {
    const { data, error } = await this.supabase.client.rpc('get_managed_users');
    if (error) throw error;
    return (data ?? []) as ManagedUser[];
  }

  /** Creates a project_admin scoped to a single project (or a regular admin/user) */
  async createUser(params: {
    email: string;
    password: string;
    role: 'admin' | 'project_admin' | 'user';
    project_id?: string | null;
    full_name?: string;
  }): Promise<{ user_id: string }> {
    return this.callFunction('smooth-worker', params);
  }

  /** Convenience wrapper: create an admin scoped to one project */
  async createProjectAdmin(project_id: string, params: {
    email: string;
    password: string;
    full_name?: string;
  }): Promise<{ user_id: string }> {
    return this.createUser({ ...params, role: 'project_admin', project_id });
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    await this.callFunction('dynamic-api', { user_id: userId, new_password: newPassword });
  }

  async disableUser(userId: string): Promise<void> {
    await this.callFunction('super-worker', { user_id: userId, action: 'disable' });
  }

  async enableUser(userId: string): Promise<void> {
    await this.callFunction('super-worker', { user_id: userId, action: 'enable' });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.callFunction('super-worker', { user_id: userId, action: 'delete' });
  }
}