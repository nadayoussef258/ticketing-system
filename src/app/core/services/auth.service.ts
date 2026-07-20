import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { AppUser } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<AppUser | null>(null);

  readonly user     = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly isAdmin    = computed(() => this._user()?.role === 'admin');

  constructor(private supabase: SupabaseService, private router: Router) {
    this.restoreSession();
  }

  private async restoreSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) await this.loadUserProfile(session.user.id);
  }

  async login(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await this.loadUserProfile(data.user.id);
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    this._user.set(null);
    this.router.navigate(['/auth/login']);
  }

  private async loadUserProfile(userId: string): Promise<void> {
    // Load from user_profiles table, joined with the linked project (if any)
    const { data: profile, error } = await this.supabase.client
      .from('user_profiles')
      .select('role, full_name, project_id, projects(name)')
      .eq('id', userId)
      .maybeSingle();

    if (error) { console.error('loadUserProfile error:', error); return; }
    if (!profile) { console.warn('No user_profile row for:', userId); return; }

    const { data: authUser } = await this.supabase.auth.getUser();

    this._user.set({
      id: userId,
      email: authUser.user?.email ?? '',
      role: profile['role'],
      full_name: profile['full_name'],
      project_id: profile['project_id'] ?? null,
      project_name: (profile['projects'] as any)?.name ?? undefined,
    });

    const destination = profile['role'] === 'admin' || profile['role'] === 'project_admin'
      ? '/admin/dashboard'
      : '/portal/dashboard';
    this.router.navigate([destination]);
  }

  getCurrentUserId(): string | null {
    return this._user()?.id ?? null;
  }
}