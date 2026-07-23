import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Ticket, TicketComment } from '../models';

@Injectable({ providedIn: 'root' })
export class TicketService {
  constructor(private supabase: SupabaseService) {}

  // ===== Tickets =====

  /** Admin: all tickets with project + assignee info */
  async getAllTickets(): Promise<Ticket[]> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select('*, projects(name, color, code), assignee:user_profiles!assigned_to_id(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  /** User/Portal: own tickets or assigned tickets */
  async getMyTickets(): Promise<Ticket[]> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select('*, projects(name, color, code)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  async getTicketById(id: string): Promise<Ticket | null> {
    const { data, error } = await this.supabase.client
      .from('tickets')
      .select('*, projects(name, color, code), assignee:user_profiles!assigned_to_id(full_name, id)')
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

  async assignTicket(ticketId: string, assigneeId: string | null, assigneeName: string | null): Promise<void> {
    const { error } = await this.supabase.client
      .from('tickets')
      .update({
        assigned_to_id: assigneeId,
        assigned_to: assigneeName,
        updated_at: new Date().toISOString(),
      })
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