import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TranslationService } from '../i18n/translation.service';
import { ServiceDepartment, ServiceDepartmentCategory } from '../models';

type Named = { name_ar: string; name_en: string } | null | undefined;

/**
 * Departments that receive / send tickets (IT, Finance, Marketing…)
 * and their ticket categories. Not to be confused with DepartmentService
 * (the requester's department inside a client project).
 */
@Injectable({ providedIn: 'root' })
export class ServiceDepartmentService {
  private supabase = inject(SupabaseService);
  private i18n = inject(TranslationService);

  /** Cache used for labels everywhere (filled by load()). */
  readonly departments = signal<ServiceDepartment[]>([]);
  readonly categories = signal<ServiceDepartmentCategory[]>([]);
  private loaded: Promise<void> | null = null;

  /** Loads departments + categories once; pass force=true after changing them. */
  load(force = false): Promise<void> {
    if (!this.loaded || force) {
      this.loaded = (async () => {
        const [d, c] = await Promise.all([
          this.supabase.client.from('service_departments').select('*')
            .order('is_head', { ascending: false })
            .order('sort_order', { ascending: true })
            .order('name_en', { ascending: true }),
          this.supabase.client.from('service_department_categories').select('*')
            .order('sort_order', { ascending: true })
            .order('name_en', { ascending: true }),
        ]);
        if (d.error) throw d.error;
        if (c.error) throw c.error;
        this.departments.set((d.data ?? []) as ServiceDepartment[]);
        this.categories.set((c.data ?? []) as ServiceDepartmentCategory[]);
      })().catch(err => { this.loaded = null; throw err; });
    }
    return this.loaded;
  }

  head(): ServiceDepartment | undefined {
    return this.departments().find(d => d.is_head);
  }

  byId(id: string | null | undefined): ServiceDepartment | undefined {
    return id ? this.departments().find(d => d.id === id) : undefined;
  }

  /** Active departments a ticket can be sent to, minus the ids given. */
  targets(exclude: (string | null | undefined)[] = []): ServiceDepartment[] {
    return this.departments().filter(d => d.is_active && !exclude.includes(d.id));
  }

  categoriesOf(departmentId: string | null | undefined, activeOnly = true): ServiceDepartmentCategory[] {
    return this.categories().filter(c =>
      c.service_department_id === departmentId && (!activeOnly || c.is_active));
  }

  /** Name in the current language. */
  label(d: Named): string {
    if (!d) return '';
    return this.i18n.lang() === 'ar' ? (d.name_ar || d.name_en) : (d.name_en || d.name_ar);
  }

  /** Category label for a ticket (falls back to the code). */
  categoryLabel(departmentId: string | null | undefined, code: string): string {
    const c = this.categories().find(x => x.service_department_id === departmentId && x.code === code)
           ?? this.categories().find(x => x.code === code);
    return c ? this.label(c) : code;
  }

  // ===== Admin: departments =====

  async create(dept: Pick<ServiceDepartment, 'code' | 'name_ar' | 'name_en' | 'color'>): Promise<ServiceDepartment> {
    const { data, error } = await this.supabase.client
      .from('service_departments')
      .insert({
        code: dept.code.trim().toUpperCase(),
        name_ar: dept.name_ar.trim(),
        name_en: dept.name_en.trim(),
        color: dept.color,
        sort_order: this.departments().length,
      })
      .select()
      .single();
    if (error) throw this.friendly(error, 'sdept.duplicate');
    await this.load(true);
    return data as ServiceDepartment;
  }

  async update(id: string, changes: Partial<Pick<ServiceDepartment, 'code' | 'name_ar' | 'name_en' | 'color' | 'is_active'>>): Promise<void> {
    const payload: Record<string, unknown> = { ...changes };
    if (typeof changes.code === 'string') payload['code'] = changes.code.trim().toUpperCase();
    if (typeof changes.name_ar === 'string') payload['name_ar'] = changes.name_ar.trim();
    if (typeof changes.name_en === 'string') payload['name_en'] = changes.name_en.trim();
    const { error } = await this.supabase.client.from('service_departments').update(payload).eq('id', id);
    if (error) throw this.friendly(error, 'sdept.duplicate');
    await this.load(true);
  }

  // ===== Admin: categories =====

  async addCategory(departmentId: string, name_ar: string, name_en: string): Promise<void> {
    const sort = this.categoriesOf(departmentId, false).filter(c => c.code !== 'other').length + 1;
    const { error } = await this.supabase.client
      .from('service_department_categories')
      .insert({
        service_department_id: departmentId,
        code: this.makeCode(name_en, departmentId),
        name_ar: name_ar.trim(),
        name_en: name_en.trim(),
        sort_order: sort,
      });
    if (error) throw this.friendly(error, 'sdept.catDuplicate');
    await this.load(true);
  }

  async updateCategory(id: string, changes: Partial<Pick<ServiceDepartmentCategory, 'name_ar' | 'name_en' | 'is_active'>>): Promise<void> {
    const payload: Record<string, unknown> = { ...changes };
    if (typeof changes.name_ar === 'string') payload['name_ar'] = changes.name_ar.trim();
    if (typeof changes.name_en === 'string') payload['name_en'] = changes.name_en.trim();
    const { error } = await this.supabase.client.from('service_department_categories').update(payload).eq('id', id);
    if (error) throw this.friendly(error, 'sdept.catDuplicate');
    await this.load(true);
  }

  /** a-z, 0-9, _ ; unique inside the department (stored in tickets.category). */
  private makeCode(nameEn: string, departmentId: string): string {
    let base = nameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    if (!base) base = 'cat';
    const used = new Set(this.categoriesOf(departmentId, false).map(c => c.code));
    let code = base, n = 2;
    while (used.has(code)) code = `${base}_${n++}`;
    return code;
  }

  private friendly(error: any, duplicateKey: string): Error {
    if (error?.code === '23505') return new Error(this.i18n.t(duplicateKey));
    if (error?.code === '23514') return new Error(error?.message?.includes('head department')
      ? error.message : this.i18n.t('sdept.invalid'));
    return new Error(error?.message ?? this.i18n.t('common.saveFailed'));
  }
}