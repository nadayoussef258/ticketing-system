import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  project_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(private supabase: SupabaseService) {}

  async listLogs(limit = 100): Promise<AuditLog[]> {
    const { data, error } = await this.supabase.client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AuditLog[];
  }
}