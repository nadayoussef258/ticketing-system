import { Injectable, inject } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import { SupabaseService } from './supabase.service';
import { Department } from '../models';

@Injectable({ providedIn: 'root' })
export class DepartmentService {
  constructor(private supabase: SupabaseService) {}

  /** Departments of one project (RLS: admin/IT see all, a client only its own project). */
  async listByProject(projectId: string, activeOnly = false): Promise<Department[]> {
    let q = this.supabase.client
      .from('departments')
      .select('*')
      .eq('project_id', projectId);
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q
      .order('sort_order', { ascending: true })
      .order('name_en', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Department[];
  }

  /** Number of departments per project (for the project cards). */
  async countByProject(): Promise<Partial<Record<string, number>>> {
    const { data, error } = await this.supabase.client
      .from('departments')
      .select('project_id')
      .eq('is_active', true);
    if (error) throw error;
    const counts: Partial<Record<string, number>> = {};
    for (const row of data ?? []) counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
    return counts;
  }

  async create(projectId: string, name_ar: string, name_en: string, sort_order = 0): Promise<Department> {
    const { data, error } = await this.supabase.client
      .from('departments')
      .insert({ project_id: projectId, name_ar: name_ar.trim(), name_en: name_en.trim(), sort_order })
      .select()
      .single();
    if (error) throw this.friendly(error);
    return data as Department;
  }

  async update(id: string, changes: Partial<Pick<Department, 'name_ar' | 'name_en' | 'is_active' | 'sort_order'>>): Promise<void> {
    const payload: any = { ...changes };
    if (payload.name_ar) payload.name_ar = payload.name_ar.trim();
    if (payload.name_en) payload.name_en = payload.name_en.trim();
    const { error } = await this.supabase.client.from('departments').update(payload).eq('id', id);
    if (error) throw this.friendly(error);
  }

  /**
   * Deletes a department that has never been used.
   * Returns false (and deletes nothing) if tickets already use it —
   * the caller should deactivate it instead.
   */
  async remove(id: string): Promise<boolean> {
    const { error } = await this.supabase.client.from('departments').delete().eq('id', id);
    if (!error) return true;
    if (error.code === '23503') return false;   // foreign key: tickets use it
    throw this.friendly(error);
  }

  private i18n = inject(TranslationService);

  /** Department name in the current language. */
  label(d: Pick<Department, 'name_ar' | 'name_en'> | null | undefined): string {
    if (!d) return '';
    return this.i18n.lang() === 'ar' ? (d.name_ar || d.name_en) : (d.name_en || d.name_ar);
  }

  private friendly(error: any): Error {
    if (error?.code === '23505') return new Error(this.i18n.t('dept.duplicate'));
    if (error?.code === '23514') return new Error(this.i18n.t('dept.length'));
    return new Error(error?.message ?? 'Request failed');
  }
}