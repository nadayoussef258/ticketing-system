import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Ticket, TicketComment, TicketPart, TicketStatus } from '../models';

/** Joined data every ticket screen needs. */
const DEPT_JOINS =
  'department:departments(id, name_ar, name_en), ' +
  'to_department:service_departments!to_department_id(id, code, name_ar, name_en, color, is_head), ' +
  'from_department:service_departments!from_department_id(id, code, name_ar, name_en, color, is_head)';

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
      .select(`*, projects(name, color, code), assignee:user_profiles!assigned_to_id(full_name), ${DEPT_JOINS}`);
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data, error } = await q.order(archived ? 'archived_at' : 'created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  /** Client portal: the project's tickets (RLS scopes them to the project). */
  async getMyTickets(archived = false): Promise<Ticket[]> {
    let q = this.supabase.client
      .from('tickets')
      .select(`*, projects(name, color, code), ${DEPT_JOINS}`);
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data, error } = await q.order(archived ? 'archived_at' : 'created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  /**
   * Department account: tickets received by the department (inbox)
   * or sent by it (sent). RLS limits a dept_user to its own department.
   */
  async getDepartmentTickets(departmentId: string, box: 'inbox' | 'sent', archived = false): Promise<Ticket[]> {
    let q = this.supabase.client
      .from('tickets')
      .select(`*, projects(name, color, code), ${DEPT_JOINS}`)
      .eq(box === 'inbox' ? 'to_department_id' : 'from_department_id', departmentId);
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data, error } = await q.order(archived ? 'archived_at' : 'created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
  }

  /**
   * Move a ticket to another department (database function transfer_ticket):
   * status goes back to open, the assignee is cleared and a note is added
   * to the conversation.
   */
  async transferTicket(ticketId: string, toDepartmentId: string, note?: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('transfer_ticket', {
      p_ticket_id: ticketId,
      p_to_department_id: toDepartmentId,
      p_note: note?.trim() || null,
    });
    if (error) throw error;
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
      .select(`*, projects(name, color, code), assignee:user_profiles!assigned_to_id(full_name, id), ${DEPT_JOINS}`)
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

  // ===== Shared tickets: department parts =====

  async getParts(ticketId: string): Promise<TicketPart[]> {
    const { data, error } = await this.supabase.client
      .from('ticket_parts')
      .select('*, department:service_departments(id, code, name_ar, name_en, color)')
      .eq('ticket_id', ticketId)
      .order('is_lead', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TicketPart[];
  }

  /** Parts of many tickets at once (lists: "shared 1/3" badges). */
  async getPartsFor(ticketIds: string[]): Promise<Pick<TicketPart, 'ticket_id' | 'status' | 'is_lead'>[]> {
    if (!ticketIds.length) return [];
    const { data, error } = await this.supabase.client
      .from('ticket_parts').select('ticket_id, status, is_lead').in('ticket_id', ticketIds);
    if (error) throw error;
    return (data ?? []) as any;
  }

  async addPart(ticketId: string, departmentId: string, role: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('ticket_add_part', {
      p_ticket_id: ticketId, p_department_id: departmentId, p_role: role,
    });
    if (error) throw error;
  }

  async setPartStatus(partId: string, status: TicketStatus, reason: string | null): Promise<void> {
    const { error } = await this.supabase.client.rpc('ticket_set_part_status', {
      p_part_id: partId, p_status: status, p_reason: reason,
    });
    if (error) throw error;
  }

  async removePart(partId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('ticket_remove_part', { p_part_id: partId });
    if (error) throw error;
  }

  /** Department account: tickets another department shared with it. */
  async getSharedTickets(departmentId: string, archived = false): Promise<Ticket[]> {
    const { data: rows, error: pErr } = await this.supabase.client
      .from('ticket_parts').select('ticket_id').eq('department_id', departmentId).eq('is_lead', false);
    if (pErr) throw pErr;
    const ids = (rows ?? []).map((r: any) => r.ticket_id);
    if (!ids.length) return [];
    let q = this.supabase.client
      .from('tickets')
      .select(`*, projects(name, color, code), ${DEPT_JOINS}`)
      .in('id', ids);
    q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
    const { data, error } = await q.order(archived ? 'archived_at' : 'created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Ticket[];
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