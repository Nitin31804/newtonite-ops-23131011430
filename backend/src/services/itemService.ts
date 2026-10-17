import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { WorkItem, WorkItemStatus, Priority, WorkItemType, Role } from '../types/index.js';
import { validateTransition } from './workflowService.js';

export class ConflictError extends Error {
  statusCode = 409;
  latestItem?: any;
  constructor(message: string, latestItem?: any) {
    super(message);
    this.name = 'ConflictError';
    this.latestItem = latestItem;
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class ItemService {
  /**
   * List work items with server-side filtering, search, and cursor/offset pagination.
   * Handles high scale without loading full datasets into memory.
   */
  async listItems(params: {
    teamId?: string;
    allowedTeamIds?: string[];
    status?: WorkItemStatus;
    priority?: Priority;
    assigneeId?: string;
    view?: 'needs_attention' | 'assigned_to_me' | 'unassigned_urgent' | 'awaiting_approval';
    currentUserId?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(params.limit || 20, 100);
    const offset = params.offset || 0;

    let query = db('work_items')
      .leftJoin('teams', 'work_items.team_id', 'teams.id')
      .leftJoin('users as assignees', 'work_items.assignee_id', 'assignees.id')
      .leftJoin('users as creators', 'work_items.created_by_id', 'creators.id')
      .select(
        'work_items.*',
        'teams.name as team_name',
        'assignees.name as assignee_name',
        'creators.name as creator_name'
      );

    if (params.teamId) {
      query = query.where('work_items.team_id', params.teamId);
    } else if (params.allowedTeamIds) {
      query = query.whereIn('work_items.team_id', params.allowedTeamIds);
    }
    if (params.status) {
      query = query.where('work_items.status', params.status);
    }
    if (params.priority) {
      query = query.where('work_items.priority', params.priority);
    }
    if (params.assigneeId) {
      query = query.where('work_items.assignee_id', params.assigneeId);
    }

    // Specialized high-priority dashboard views
    if (params.view === 'assigned_to_me' && params.currentUserId) {
      query = query.where('work_items.assignee_id', params.currentUserId).whereNotIn('work_items.status', ['CLOSED']);
    } else if (params.view === 'unassigned_urgent') {
      query = query
        .whereNull('work_items.assignee_id')
        .whereIn('work_items.priority', ['URGENT', 'HIGH'])
        .whereIn('work_items.status', ['OPEN', 'IN_PROGRESS']);
    } else if (params.view === 'awaiting_approval') {
      query = query.where('work_items.status', 'AWAITING_APPROVAL');
    } else if (params.view === 'needs_attention') {
      // Urgent unassigned OR items awaiting approval
      query = query.where((builder) => {
        builder
          .where((sub) => {
            sub.whereNull('work_items.assignee_id').whereIn('work_items.priority', ['URGENT', 'HIGH']);
          })
          .orWhere('work_items.status', 'AWAITING_APPROVAL');
      });
    }

    // Text search on title and description (parameterized query + wildcard escaping)
    if (params.q) {
      const sanitized = params.q.trim().replace(/[%_\\]/g, '\\$&');
      const searchTerm = `%${sanitized}%`;
      query = query.where((builder) => {
        builder.where('work_items.title', 'like', searchTerm).orWhere('work_items.description', 'like', searchTerm);
      });
    }

    // Get total count for pagination metadata
    const countQuery = query.clone().clearSelect().count<{ count: string | number }>('* as count').first();
    const totalCountRes = await countQuery;
    const totalCount = Number(totalCountRes?.count || 0);

    const items = await query.orderBy('work_items.created_at', 'desc').limit(limit).offset(offset);

    return {
      items,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + items.length < totalCount,
      },
    };
  }

  /**
   * Get single work item with its activity log and comments
   */
  async getItemDetails(itemId: string) {
    const item = await db('work_items')
      .leftJoin('teams', 'work_items.team_id', 'teams.id')
      .leftJoin('users as assignees', 'work_items.assignee_id', 'assignees.id')
      .leftJoin('users as creators', 'work_items.created_by_id', 'creators.id')
      .where('work_items.id', itemId)
      .select(
        'work_items.*',
        'teams.name as team_name',
        'assignees.name as assignee_name',
        'creators.name as creator_name'
      )
      .first();

    if (!item) {
      throw new NotFoundError(`Work item with id '${itemId}' was not found.`);
    }

    const activity = await db('activity_events')
      .leftJoin('users', 'activity_events.actor_id', 'users.id')
      .where({ work_item_id: itemId })
      .select('activity_events.*', 'users.name as actor_name')
      .orderBy('activity_events.created_at', 'asc');

    const parsedActivity = activity.map((evt) => ({
      ...evt,
      details: typeof evt.details === 'string' ? JSON.parse(evt.details) : evt.details,
    }));

    const comments = await db('comments')
      .leftJoin('users', 'comments.author_id', 'users.id')
      .where({ work_item_id: itemId })
      .select('comments.*', 'users.name as author_name')
      .orderBy('comments.created_at', 'asc');

    return {
      item,
      activity: parsedActivity,
      comments,
    };
  }

  /**
   * CRITICAL BEHAVIOR 1: Atomic Claim with Conditional Update
   * Prevents race conditions when two users click "Claim" at the same time.
   */
  async claimItem(itemId: string, actorId: string) {
    return await db.transaction(async (trx) => {
      // Execute conditional update: only update if OPEN and assignee_id is currently NULL
      const updatedRows = await trx('work_items')
        .where({ id: itemId, status: 'OPEN' })
        .whereNull('assignee_id')
        .update({
          assignee_id: actorId,
          status: 'IN_PROGRESS', // claiming automatically moves from OPEN to IN_PROGRESS
          version: db.raw('version + 1'),
          updated_at: new Date(),
        });

      if (updatedRows === 0) {
        // Find out why: was it missing, already claimed, or in wrong state?
        const currentItem = await trx('work_items').where({ id: itemId }).first();
        if (!currentItem) {
          throw new NotFoundError(`Work item with id '${itemId}' not found.`);
        }
        if (currentItem.assignee_id) {
          throw new ConflictError(
            `Concurrent Claim Conflict: This work item has already been claimed by another user (Assignee ID: ${currentItem.assignee_id}).`,
            currentItem
          );
        }
        if (currentItem.status !== 'OPEN') {
          throw new BadRequestError(
            `Workflow Violation: Cannot claim item in '${currentItem.status}' status. Only OPEN items can be claimed.`
          );
        }
      }

      // Record Activity Log within the SAME transaction
      await trx('activity_events').insert({
        id: uuidv4(),
        work_item_id: itemId,
        actor_id: actorId,
        event_type: 'CLAIMED',
        details: JSON.stringify({ action: 'claimed', new_assignee_id: actorId }),
        created_at: new Date(),
      });

      // Record Outbox notification job in the SAME transaction
      await trx('outbox_jobs').insert({
        id: uuidv4(),
        event_type: 'WORK_ITEM_ASSIGNED',
        payload: JSON.stringify({ itemId, assigneeId: actorId }),
        status: 'PENDING',
        attempts: 0,
        max_attempts: 5,
        next_run_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return await trx('work_items').where({ id: itemId }).first();
    });
  }

  /**
   * CRITICAL BEHAVIOR 2: Optimistic Locking Update
   * Prevents stale edits when multiple users edit concurrently.
   */
  async updateItem(
    itemId: string,
    actorId: string,
    expectedVersion: number,
    data: {
      title?: string;
      description?: string;
      priority?: Priority;
      assignee_id?: string | null;
    }
  ) {
    return await db.transaction(async (trx) => {
      const currentItem = await trx('work_items').where({ id: itemId }).first();
      if (!currentItem) {
        throw new NotFoundError(`Work item with id '${itemId}' not found.`);
      }

      // Verify that assignee belongs to the work item's team
      if (data.assignee_id) {
        const membership = await trx('team_memberships')
          .where({ user_id: data.assignee_id, team_id: currentItem.team_id })
          .first();
        if (!membership) {
          throw new BadRequestError(
            `Cannot assign work item: User '${data.assignee_id}' is not a member of team '${currentItem.team_id}'.`
          );
        }
      }

      const updatePayload: any = {
        version: db.raw('version + 1'),
        updated_at: new Date(),
      };
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.priority !== undefined) updatePayload.priority = data.priority;
      if (data.assignee_id !== undefined) updatePayload.assignee_id = data.assignee_id;

      const updatedRows = await trx('work_items')
        .where({ id: itemId, version: expectedVersion })
        .update(updatePayload);

      if (updatedRows === 0) {
        const refreshedItem = await trx('work_items').where({ id: itemId }).first();
        throw new ConflictError(
          `Stale Update Conflict: Work item was modified by another user. Your version was ${expectedVersion}, but the server version is now ${refreshedItem?.version}. Please refresh before updating.`,
          refreshedItem
        );
      }

      // Append to audit trail
      await trx('activity_events').insert({
        id: uuidv4(),
        work_item_id: itemId,
        actor_id: actorId,
        event_type: 'UPDATED',
        details: JSON.stringify({ changes: data, previous_version: expectedVersion }),
        created_at: new Date(),
      });

      return await trx('work_items').where({ id: itemId }).first();
    });
  }

  /**
   * CRITICAL BEHAVIOR 3 & 4: Workflow State Transitions with Approval Gates
   */
  async transitionStatus(
    itemId: string,
    actorId: string,
    actorRole: Role,
    targetStatus: WorkItemStatus,
    reason?: string,
    expectedVersion?: number
  ) {
    return await db.transaction(async (trx) => {
      const currentItem = await trx('work_items').where({ id: itemId }).first();
      if (!currentItem) {
        throw new NotFoundError(`Work item with id '${itemId}' not found.`);
      }

      // Verify version if provided
      if (expectedVersion !== undefined && currentItem.version !== expectedVersion) {
        throw new ConflictError(
          `Stale Update Conflict: Current item version is ${currentItem.version}, expected ${expectedVersion}.`,
          currentItem
        );
      }

      // Check state machine & RBAC
      const validation = validateTransition(currentItem.status, targetStatus, actorRole, reason);
      if (!validation.valid) {
        if (validation.error?.includes('Permission denied')) {
          throw new ForbiddenError(validation.error);
        }
        throw new BadRequestError(validation.error || 'Invalid transition.');
      }

      // Update work item status
      await trx('work_items')
        .where({ id: itemId })
        .update({
          status: targetStatus,
          version: db.raw('version + 1'),
          updated_at: new Date(),
        });

      // Record Activity Log
      await trx('activity_events').insert({
        id: uuidv4(),
        work_item_id: itemId,
        actor_id: actorId,
        event_type: 'STATUS_CHANGED',
        details: JSON.stringify({
          from_status: currentItem.status,
          to_status: targetStatus,
          reason: reason || null,
        }),
        created_at: new Date(),
      });

      // Transactional Outbox Job for async processing
      let eventType = 'STATUS_CHANGED';
      if (targetStatus === 'AWAITING_APPROVAL') {
        eventType = 'APPROVAL_REQUIRED';
      } else if (targetStatus === 'RESOLVED') {
        eventType = 'ITEM_RESOLVED';
      }

      await trx('outbox_jobs').insert({
        id: uuidv4(),
        event_type: eventType,
        payload: JSON.stringify({ itemId, from: currentItem.status, to: targetStatus, reason }),
        status: 'PENDING',
        attempts: 0,
        max_attempts: 5,
        next_run_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return await trx('work_items').where({ id: itemId }).first();
    });
  }

  /**
   * Create work item with transactional activity log and outbox job
   */
  async createItem(
    actorId: string,
    data: {
      title: string;
      description: string;
      type: WorkItemType;
      priority: Priority;
      team_id: string;
      assignee_id?: string | null;
    }
  ) {
    const itemId = `wi-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    return await db.transaction(async (trx) => {
      // Verify that assignee belongs to the work item's team
      if (data.assignee_id) {
        const membership = await trx('team_memberships')
          .where({ user_id: data.assignee_id, team_id: data.team_id })
          .first();
        if (!membership) {
          throw new BadRequestError(
            `Cannot assign work item: User '${data.assignee_id}' is not a member of team '${data.team_id}'.`
          );
        }
      }

      const newItem: WorkItem = {
        id: itemId,
        title: data.title,
        description: data.description,
        type: data.type,
        priority: data.priority,
        status: data.assignee_id ? 'IN_PROGRESS' : 'OPEN',
        team_id: data.team_id,
        assignee_id: data.assignee_id || null,
        created_by_id: actorId,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await trx('work_items').insert(newItem);

      await trx('activity_events').insert({
        id: uuidv4(),
        work_item_id: itemId,
        actor_id: actorId,
        event_type: 'CREATED',
        details: JSON.stringify({ priority: data.priority, type: data.type }),
        created_at: new Date(),
      });

      await trx('outbox_jobs').insert({
        id: uuidv4(),
        event_type: 'WORK_ITEM_CREATED',
        payload: JSON.stringify({ itemId, teamId: data.team_id, priority: data.priority }),
        status: 'PENDING',
        attempts: 0,
        max_attempts: 5,
        next_run_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return newItem;
    });
  }

  /**
   * Add comment to item
   */
  async addComment(itemId: string, authorId: string, content: string) {
    return await db.transaction(async (trx) => {
      const commentId = uuidv4();
      const newComment = {
        id: commentId,
        work_item_id: itemId,
        author_id: authorId,
        content,
        created_at: new Date(),
      };

      await trx('comments').insert(newComment);

      await trx('activity_events').insert({
        id: uuidv4(),
        work_item_id: itemId,
        actor_id: authorId,
        event_type: 'COMMENT_ADDED',
        details: JSON.stringify({ comment_id: commentId }),
        created_at: new Date(),
      });

      return newComment;
    });
  }
}

export const itemService = new ItemService();
