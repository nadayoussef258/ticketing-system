import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { AppUser } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<AppUser | null>(null);

  readonly user       = this._user.asReadonly();
  readonly role       = computed(() => this._user()?.role ?? null);
  readonly isLoggedIn = computed(() => !!this._user());

  /** Main IT admin — full access (projects, team, logs, assignment). */
  readonly isAdmin  = computed(() => this.role() === 'admin');
  /** IT team member — sees only the tickets assigned to them. */
  readonly isStaff  = computed(() => this.role() === 'it_staff');
  /** Anyone on the IT side (admin or team member). */
  readonly isItTeam = computed(() => this.isAdmin() || this.isStaff());
  /** Client accounts (a project's shared account). */
  readonly isClient = computed(() => this.role() === 'project_admin' || this.role() === 'user');

  constructor(private supabase: SupabaseService, private router: Router) {
    // Keep the local state in sync if the session ends (logout in another tab,
    // expired refresh token...). No Supabase calls inside this callback.
    this.supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && this._user()) {
        this._user.set(null);
        this.router.navigate(['/auth/login']);
      }
    });
  }

  /** Runs once at startup (provideAppInitializer), before any guard. */
  async init(): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) await this.loadUserProfile(session.user.id, session.user.email ?? '');
    } catch (err) {
      console.error('Session restore failed:', err);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await this.loadUserProfile(data.user.id, data.user.email ?? '');
    if (!this._user()) {
      await this.supabase.auth.signOut();
      throw new Error('This account has no profile. Contact your administrator.');
    }
    this.router.navigateByUrl(this.homeUrl());
  }

  async logout(): Promise<void> {
    this._user.set(null);
    await this.supabase.auth.signOut();
    this.router.navigate(['/auth/login']);
  }

  /** Landing page for the current role. */
  homeUrl(): string {
    if (!this._user()) return '/auth/login';
    return this.isItTeam() ? '/admin/dashboard' : '/portal/dashboard';
  }

  getCurrentUserId(): string | null {
    return this._user()?.id ?? null;
  }

  private async loadUserProfile(userId: string, email: string): Promise<void> {
    const { data: profile, error } = await this.supabase.client
      .from('user_profiles')
      .select('role, full_name, project_id, projects(name)')
      .eq('id', userId)
      .maybeSingle();

    if (error) { console.error('loadUserProfile error:', error); return; }
    if (!profile) { console.warn('No user_profile row for:', userId); return; }

    this._user.set({
      id: userId,
      email,
      role: profile['role'],
      full_name: profile['full_name'],
      project_id: profile['project_id'] ?? null,
      project_name: (profile['projects'] as any)?.name ?? undefined,
    });
  }
}