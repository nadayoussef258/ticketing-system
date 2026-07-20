import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UserProfile, ManagedUser } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private functionsUrl = `${environment.supabaseUrl}/functions/v1`;

  constructor(private supabase: SupabaseService) {}

  private async getAuthHeader(): Promise<Record<string, string>> {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  private async callFunction<T>(name: string, body: unknown): Promise<T> {
    const headers = await this.getAuthHeader();
    const res = await fetch(`${this.functionsUrl}/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json as T;
  }

  /** IT-only staff for the ticket assign-to dropdown (excludes project_admins/clients) */
  async getAssignableStaff(): Promise<UserProfile[]> {
    const { data, error } = await this.supabase.client
      .rpc('get_it_staff');
    if (error) throw error;
    return (data ?? []) as UserProfile[];
  }

  /** Get all managed users (IT + clients) for the Team Management admin panel */
  async listAllUsers(): Promise<ManagedUser[]> {
    const { data, error } = await this.supabase.client.rpc('get_all_users');
    if (error) throw error;
    return (data ?? []) as ManagedUser[];
  }

  /** Create a new user (admin or user role) via Edge Function */
  async createUser(params: {
    email: string;
    password: string;
    role: 'admin' | 'user';
    full_name: string;
  }): Promise<{ user_id: string }> {
    // Use existing Edge Function (smooth-worker = admin-create-user)
    return this.callFunction('smooth-worker', params);
  }

  /** Reset password via Edge Function */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    await this.callFunction('dynamic-api', { user_id: userId, new_password: newPassword });
  }

  /** Disable/enable/delete user via Edge Function */
  async setUserStatus(userId: string, action: 'disable' | 'enable' | 'delete'): Promise<void> {
    await this.callFunction('super-worker', { user_id: userId, action });
  }

  /**
   * Assign ticket to team member and send email notification.
   * Email is sent via Supabase Edge Function that uses Resend / SMTP.
   */
  async notifyAssignment(params: {
    assignee_email: string;
    assignee_name: string;
    ticket_number: string;
    ticket_subject: string;
    ticket_url: string;
  }): Promise<void> {
    try {
      await this.callFunction('notify-assignment', params);
    } catch (err) {
      // Email failure should not block the assignment
      console.warn('Assignment email failed (non-critical):', err);
    }
  }
}