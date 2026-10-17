import { WorkItemStatus, Role } from '../types/index.js';

export interface TransitionRule {
  from: WorkItemStatus;
  to: WorkItemStatus;
  allowedRoles: Role[];
  requiresReason?: boolean;
}

export const WORKFLOW_TRANSITIONS: TransitionRule[] = [
  // 1. OPEN -> IN_PROGRESS: Anyone with Member, Lead, or Admin can start working
  {
    from: 'OPEN',
    to: 'IN_PROGRESS',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
  },
  // 2. IN_PROGRESS -> AWAITING_APPROVAL: Work completed, submitted for review
  {
    from: 'IN_PROGRESS',
    to: 'AWAITING_APPROVAL',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
    requiresReason: true,
  },
  // 3. AWAITING_APPROVAL -> RESOLVED: GATED! ONLY LEAD OR ADMIN CAN APPROVE
  {
    from: 'AWAITING_APPROVAL',
    to: 'RESOLVED',
    allowedRoles: ['LEAD', 'ADMIN'],
    requiresReason: true,
  },
  // 4. AWAITING_APPROVAL -> IN_PROGRESS: Rejected / sent back for changes by LEAD or ADMIN
  {
    from: 'AWAITING_APPROVAL',
    to: 'IN_PROGRESS',
    allowedRoles: ['LEAD', 'ADMIN'],
    requiresReason: true,
  },
  // 5. RESOLVED -> CLOSED: Final closure
  {
    from: 'RESOLVED',
    to: 'CLOSED',
    allowedRoles: ['MEMBER', 'LEAD', 'ADMIN'],
  },
  // 6. CLOSED -> OPEN: Reopening item (Leads/Admins only)
  {
    from: 'CLOSED',
    to: 'OPEN',
    allowedRoles: ['LEAD', 'ADMIN'],
    requiresReason: true,
  },
];

export function validateTransition(
  currentStatus: WorkItemStatus,
  targetStatus: WorkItemStatus,
  userRole: Role,
  reason?: string
): { valid: boolean; error?: string } {
  if (currentStatus === targetStatus) {
    return { valid: false, error: `Work item is already in status '${currentStatus}'.` };
  }

  const matchingRule = WORKFLOW_TRANSITIONS.find(
    (rule) => rule.from === currentStatus && rule.to === targetStatus
  );

  if (!matchingRule) {
    return {
      valid: false,
      error: `Invalid workflow transition: Cannot transition directly from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  // Enforce required transition rationale/reason
  if (matchingRule.requiresReason && (!reason || reason.trim().length === 0)) {
    return {
      valid: false,
      error: `Workflow Error: Transition from '${currentStatus}' to '${targetStatus}' requires an explanation or approval rationale.`,
    };
  }

  // Admin always has permission
  if (userRole === 'ADMIN') {
    return { valid: true };
  }

  if (!matchingRule.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      error: `Permission denied: Transition from '${currentStatus}' to '${targetStatus}' requires one of [${matchingRule.allowedRoles.join(', ')}], but your role is '${userRole}'.`,
    };
  }

  return { valid: true };
}
