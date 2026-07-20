import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  get auth() {
    return this.client.auth;
  }

  from(table: string) {
    return this.client.from(table);
  }

  channel(name: string) {
    return this.client.channel(name);
  }
}