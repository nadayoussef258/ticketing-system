import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface AppNotification {
  id: string;
  type: 'new_ticket' | 'new_comment';
  ticket_id: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  notifications = signal<AppNotification[]>([]);
  unreadCount = signal(0);

  private channel: any;

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  async init() {
    const userId = this.auth.getCurrentUserId();
    if (!userId) return;

    await this.loadNotifications(userId);

    this.channel = this.supabase.client
      .channel(`notifications-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          this.notifications.update(list => [n, ...list]);
          this.unreadCount.update(c => c + 1);
        })
      .subscribe();
  }

  private async loadNotifications(userId: string) {
    const { data, error } = await this.supabase.client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    this.notifications.set((data ?? []) as AppNotification[]);
    this.unreadCount.set((data ?? []).filter((n: any) => !n.is_read).length);
  }

  async markAsRead(id: string) {
    await this.supabase.client.from('notifications').update({ is_read: true }).eq('id', id);
    this.notifications.update(list => list.map(n => n.id === id ? { ...n, is_read: true } : n));
    this.unreadCount.update(c => Math.max(0, c - 1));
  }

  async markAllAsRead() {
    const userId = this.auth.getCurrentUserId();
    if (!userId) return;
    await this.supabase.client.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    this.notifications.update(list => list.map(n => ({ ...n, is_read: true })));
    this.unreadCount.set(0);
  }

  destroy() {
    this.channel?.unsubscribe();
  }
}