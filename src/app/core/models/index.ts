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

/** Requester's department inside a client project (table: departments) */
export interface Department {
  id: string;
  project_id: string;
  name_ar: string;
  name_en: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** Department that receives / sends tickets: IT, Finance, Marketing… (table: service_departments) */
export interface ServiceDepartment {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  color: string;
  is_head: boolean;          // true only for IT
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** Ticket categories of one service department (table: service_department_categories) */
export interface ServiceDepartmentCategory {
  id: string;
  service_department_id: string;
  code: string;              // stored in tickets.category
  name_ar: string;
  name_en: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export type UserRole = 'admin' | 'it_staff' | 'project_admin' | 'user' | 'dept_user';

export interface UserProfile {
  id: string;
  full_name: string;
  role: UserRole;
  project_id?: string | null;              // set when role = 'project_admin'
  service_department_id?: string | null;   // set when role = 'dept_user'
  email?: string;        // joined from auth.users
  banned_until?: string | null;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  project_id: string | null;               // null when an internal department opened the ticket
  project_name?: string | null;
  requester_name: string;
  requester_email: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  status: TicketStatus;
  /** why the ticket is stopped (status 'closed'); null otherwise */
  status_reason?: string | null;
  assigned_to?: string;
  assigned_to_id?: string | null;
  attachments?: string[];
  created_by?: string;
  department_id?: string | null;
  to_department_id: string;                // receiving department (IT for all old tickets)
  from_department_id?: string | null;      // sending department, if internal
  archived_at?: string | null;
  archived_by?: string | null;
  created_at: string;
  updated_at: string;
  // joined
  projects?: Project | null;
  assignee?: UserProfile;
  department?: Pick<Department, 'id' | 'name_ar' | 'name_en'> | null;
  to_department?: Pick<ServiceDepartment, 'id' | 'code' | 'name_ar' | 'name_en' | 'color' | 'is_head'> | null;
  from_department?: Pick<ServiceDepartment, 'id' | 'code' | 'name_ar' | 'name_en' | 'color' | 'is_head'> | null;
}

/** IT category codes (kept for existing code); categories are now per department */
export type ItTicketCategory = 'hardware' | 'software' | 'network' | 'access' | 'email' | 'printer' | 'other';
export type TicketCategory = string;
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
/** Same five statuses as the tasks system:
 *  open = جديدة · in_progress = قيد التنفيذ · in_review = في المراجعة · closed = متوقفة (needs a reason) · resolved = مكتملة */
export type TicketStatus   = 'open' | 'in_progress' | 'in_review' | 'resolved' | 'closed';

/** One department's part of a shared ticket (table: ticket_parts). No rows = ordinary ticket. */
export interface TicketPart {
  id: string;
  ticket_id: string;
  department_id: string;
  is_lead: boolean;            // the responsible (receiving) department
  role_note: string | null;    // what this department does
  status: TicketStatus;
  status_reason: string | null;
  added_by?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  department?: Pick<ServiceDepartment, 'id' | 'code' | 'name_ar' | 'name_en' | 'color'> | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_name: string;
  author_id?: string;
  content: string;
  is_agent_reply: boolean;   // set by the server: true = reply from the receiving department
  attachments?: string[];
  created_at: string;
}

export type NotificationType = 'new_ticket' | 'new_comment' | 'assigned' | 'transferred';

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
  role: UserRole;
  full_name: string;
  project_id?: string | null;   // for project_admin (and optionally regular users) linked to a project
  project_name?: string;
  service_department_id?: string | null;   // for dept_user (admin / it_staff belong to IT)
  service_department_name?: string;
  service_department?: Pick<ServiceDepartment, 'id' | 'code' | 'name_ar' | 'name_en' | 'color'> | null;
}

// For the admin users table (joined view)
export interface ManagedUser {
  user_id: string;
  email: string;
  full_name: string;
  user_role: UserRole;
  project_id?: string | null;
  project_name?: string | null;
  service_department_id?: string | null;
  service_department_name?: string | null;
  banned_until?: string | null;
  created_at: string;
}