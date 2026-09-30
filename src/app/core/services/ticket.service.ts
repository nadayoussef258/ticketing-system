import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Ticket, TicketComment } from '../models';

@Injectable({ providedIn: 'root' })
export class TicketService {
  constructor(private supabase: SupabaseService) {}

  // ===== Tickets =====

  /**
   * IT side. RLS decides what comes back:
   * admin → every ticket, it_staff → only tickets assigned to them.
   * archived=false → active tickets, archived=true → the archive.
   */
  async getAllTickets(archived = false): Promise<Ticket[]> {
    let q = this.supabase.client
      .from('tickets')
      .select('*, projects(name, color, code), assignee:user_profiles!assigned_to_id(full_name), department:departments(id, name_ar, name_en)');
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data, error } = await q.order(archived ? 'archived_at' : 'created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  /** Client portal: the project's tickets (RLS scopes them to the project). */
  async getMyTickets(archived = false): Promise<Ticket[]> {
    let q = this.supabase.client
      .from('tickets')
      .select('*, projects(name, color, code), department:departments(id, name_ar, name_en)');
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data, error } = await q.order(archived ? 'archived_at' : 'created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  /** Archive / unarchive (only resolved or closed tickets — enforced in the DB too). */
  async setArchived(id: string, archived: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from('tickets')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;
  }

  async getTicketById(id: string): Promise<Ticket | null> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select('*, projects(name, color, code), assignee:user_profiles!assigned_to_id(full_name, id), department:departments(id, name_ar, name_en)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Ticket;
  }

  async createTicket(ticket: Partial<Ticket>, userId: string): Promise<Ticket> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .insert({ ...ticket, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data as Ticket;
  }

  async updateTicket(id: string, updates: Partial<Ticket>): Promise<void> {
    const { error } = await this.supabase.client
      .from('tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  /** assigned_to (the name) is filled in by the database trigger. */
  async assignTicket(ticketId: string, assigneeId: string | null): Promise<void> {
    const { error } = await this.supabase.client
      .from('tickets')
      .update({ assigned_to_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', ticketId);
    if (error) throw error;
  }

  // ===== Comments (was replies) =====

  async getComments(ticketId: string): Promise<TicketComment[]> {
    const { data, error } = await this.supabase.client
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TicketComment[];
  }

 async addComment(
    ticketId: string,
    content: string,
    isAgentReply: boolean,
    authorName: string,
    authorId: string,
    attachments: string[] = [],
  ): Promise<TicketComment> {
    const { data, error } = await this.supabase.client
      .from('ticket_comments')
      .insert({
        ticket_id: ticketId,
        content,
        is_agent_reply: isAgentReply,
        author_name: authorName,
        author_id: authorId,
        attachments,
      })
      .select()
      .single();
    if (error) throw error;
    return data as TicketComment;
  }

  // ===== Realtime =====

  subscribeToTickets(callback: (ticket: Ticket) => void) {
    return this.supabase.client
      .channel('tickets-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => callback(payload.new as Ticket))
      .subscribe();
  }

  subscribeToComments(ticketId: string, callback: (comment: TicketComment) => void) {
    return this.supabase.client
      .channel(`comments-${ticketId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${ticketId}` },
        (payload) => callback(payload.new as TicketComment))
      .subscribe();
  }

  subscribeToTicketUpdates(ticketId: string, callback: (ticket: Ticket) => void) {
    return this.supabase.client
      .channel(`ticket-update-${ticketId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${ticketId}` },
        (payload) => callback(payload.new as Ticket))
      .subscribe();
  }
}