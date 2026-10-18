export type Role = 'ADMIN' | 'LEAD' | 'MEMBER' | 'VIEWER';

export type WorkItemType = 
  | 'incident' 
  | 'customer_issue' 
  | 'payment_investigation' 
  | 'compliance' 
  | 'operational_task';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type WorkItemStatus = 
  | 'OPEN' 
  | 'IN_PROGRESS' 
  | 'AWAITING_APPROVAL' 
  | 'RESOLVED' 
  | 'CLOSED';

export interface User {
  id: string;
  email: string;
  name: string;
  is_active?: boolean;
  token_version?: number;
  deactivated_at?: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface TeamMembership {
  id: string;
  user_id: string;
  team_id: string;
  role: Role;
  created_at: string;
}

export interface AuthUser extends User {
  is_active: boolean;
  token_version: number;
  deactivated_at?: string | null;
  memberships: Array<{
    team_id: string;
    team_name?: string;
    role: Role;
  }>;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: WorkItemType;
  priority: Priority;
  status: WorkItemStatus;
  team_id: string;
  assignee_id: string | null;
  created_by_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  team_name?: string;
  assignee_name?: string;
  creator_name?: string;
}

export interface ActivityEvent {
  id: string;
  work_item_id: string;
  actor_id: string;
  actor_name?: string;
  event_type: string;
  details: any;
  created_at: string;
}

export interface Comment {
  id: string;
  work_item_id: string;
  author_id: string;
  author_name?: string;
  content: string;
  created_at: string;
}

export interface OutboxJob {
  id: string;
  event_type: string;
  payload: any;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}
