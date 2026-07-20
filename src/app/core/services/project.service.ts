import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Project } from '../models';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Project[]> {
    const { data, error } = await this.supabase.client
      .from('projects')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Project[];
  }

  async getActive(): Promise<Project[]> {
    const { data, error } = await this.supabase.client
      .from('projects')
      .select('*')
      .eq('status', 'active')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Project[];
  }

  async getById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase.client
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Project;
  }

  async create(project: Partial<Project>): Promise<Project> {
    const { data, error } = await this.supabase.client
      .from('projects')
      .insert(project)
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  }

  async update(id: string, updates: Partial<Project>): Promise<void> {
    const { error } = await this.supabase.client
      .from('projects')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  }

  async setStatus(id: string, status: 'active' | 'archived'): Promise<void> {
    const { error } = await this.supabase.client
      .from('projects')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('projects')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}