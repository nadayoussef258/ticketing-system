// ==============================================
// MODELS — aligned with new ERD schema
// ==============================================

export interface Project {
  id: string;
  name: string;
  code: string;
  description?: string;
  color: string;
  status: 'active' | 'archived';
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  role: 'admin' | 'project_admin' | 'user';
  project_id?: string | null;   // set when role = 'project_admin'
  email?: string;        // joined from auth.users
  banned_until?: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  project_id: string;
  project_name?: string;
  requester_name: string;
  requester_email: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  status: TicketStatus;
  assigned_to?: string;
  assigned_to_id?: string | null;
  attachments?: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
  // joined
  projects?: Project;
  assignee?: UserProfile;
}

export type TicketCategory = 'hardware' | 'software' | 'network' | 'access' | 'email' | 'printer' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_name: string;
  author_id?: string;
  content: string;
  is_agent_reply: boolean;
  attachments?: string[];
  created_at: string;
}

export interface ChatSession {
  id: string;
  project_id: string;
  session_id: string;
  user_name: string;
  status: 'open' | 'closed';
  last_message?: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  project_id: string;
  session_id: string;
  sender_name: string;
  sender_role: 'user' | 'agent';
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  role: 'admin' | 'project_admin' | 'user';
  full_name: string;
  project_id?: string | null;   // for project_admin (and optionally regular users) linked to a project
  project_name?: string;
}

// For the admin users table (joined view)
export interface ManagedUser {
  user_id: string;
  email: string;
  full_name: string;
  user_role: string;   // 'admin' | 'project_admin' | 'user'
  project_id?: string | null;
  project_name?: string | null;
  banned_until?: string | null;
  created_at: string;
}