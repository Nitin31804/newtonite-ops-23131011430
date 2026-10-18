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
  name: string;
  email: string;
  is_active?: boolean;
  deactivated_at?: string | null;
  memberships: Array<{
    team_id: string;
    team_name?: string;
    role: Role;
  }>;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
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

export interface WorkItemDetailData {
  item: WorkItem;
  activity: ActivityEvent[];
  comments: Comment[];
  currentUserRole: Role | null;
}

export interface StatsData {
  total: number;
  unassignedUrgent: number;
  assignedToMe: number;
  awaitingApproval: number;
}
