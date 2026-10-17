import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthenticatedRequest, getUserRoleInTeam } from '../middleware/auth.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { itemService, ConflictError, ForbiddenError, NotFoundError, BadRequestError } from '../services/itemService.js';
import { db } from '../config/database.js';

const router = Router();

// Apply auth middleware to all item routes
router.use(authMiddleware);

const createItemSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().min(5, 'Description must be at least 5 characters').max(10000),
  type: z.enum(['incident', 'customer_issue', 'payment_investigation', 'compliance', 'operational_task']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  team_id: z.string().min(1, 'Team ID is required'),
  assignee_id: z.string().nullable().optional(),
});

const updateItemSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255).optional(),
  description: z.string().min(5, 'Description must be at least 5 characters').max(10000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assignee_id: z.string().nullable().optional(),
  version: z.number().int().positive('Version number must be a positive integer'),
});

const transitionSchema = z.object({
  targetStatus: z.enum(['OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED']),
  reason: z.string().max(2000).optional(),
  version: z.number().int().positive().optional(),
});

const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000, 'Comment exceeds maximum length of 5000 characters'),
});

/**
 * List work items with server-side filtering and pagination
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { teamId, status, priority, assigneeId, view, q, limit, offset } = req.query;

    const result = await itemService.listItems({
      teamId: teamId as string,
      status: status as any,
      priority: priority as any,
      assigneeId: assigneeId as string,
      view: view as any,
      currentUserId: req.user!.id,
      q: q as string,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json(result);
  } catch (error) {
    console.error('List items error:', error);
    res.status(500).json({ error: 'Failed to retrieve work items' });
  }
});

/**
 * Create a new work item (Supports Idempotency-Key header)
 */
router.post('/', idempotencyMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    // Role check: User must be Member, Lead, or Admin of target team
    const role = getUserRoleInTeam(req.user!, parsed.data.team_id);
    if (!role) {
      res.status(403).json({ error: 'Access denied: You are not a member of the selected team.' });
      return;
    }
    if (role === 'VIEWER') {
      res.status(403).json({ error: 'Access denied: Viewers cannot create work items.' });
      return;
    }

    const created = await itemService.createItem(req.user!.id, parsed.data);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create item error:', error);
    res.status(500).json({ error: error.message || 'Failed to create work item' });
  }
});

/**
 * Get work item details, activity history, and comments
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemData = await itemService.getItemDetails(req.params.id);

    // Verify user has access to this team's work item
    const role = getUserRoleInTeam(req.user!, itemData.item.team_id);
    if (!role) {
      res.status(403).json({ error: 'Access denied: You do not have permission to view work items for this team.' });
      return;
    }

    res.json({
      ...itemData,
      currentUserRole: role,
    });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Get item details error:', error);
    res.status(500).json({ error: 'Failed to retrieve item details' });
  }
});

/**
 * CRITICAL BEHAVIOR 1: Claim Work Item (Atomic conditional claim)
 */
router.post('/:id/claim', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;

    // Check existing item team
    const existing = await db('work_items').where({ id: itemId }).first();
    if (!existing) {
      res.status(404).json({ error: 'Work item not found' });
      return;
    }

    const role = getUserRoleInTeam(req.user!, existing.team_id);
    if (!role) {
      res.status(403).json({ error: 'Access denied: You are not a member of this team.' });
      return;
    }
    if (role === 'VIEWER') {
      res.status(403).json({ error: 'Access denied: Viewers cannot claim work items.' });
      return;
    }

    const updated = await itemService.claimItem(itemId, req.user!.id);
    res.json({ message: 'Item claimed successfully', item: updated });
  } catch (error: any) {
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message, latestItem: error.latestItem });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Claim error:', error);
    res.status(500).json({ error: error.message || 'Failed to claim work item' });
  }
});

/**
 * CRITICAL BEHAVIOR 2: Optimistic Update Work Item
 */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;
    const parsed = updateItemSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { title, description, priority, assignee_id, version } = parsed.data;

    const existing = await db('work_items').where({ id: itemId }).first();
    if (!existing) {
      res.status(404).json({ error: 'Work item not found' });
      return;
    }

    const role = getUserRoleInTeam(req.user!, existing.team_id);
    if (!role || role === 'VIEWER') {
      res.status(403).json({ error: 'Access denied: Insufficient permissions to edit this item.' });
      return;
    }

    // Ownership protection: If item is assigned to another engineer, non-Lead/Admin members cannot modify it
    if (existing.assignee_id && existing.assignee_id !== req.user!.id && role === 'MEMBER') {
      res.status(403).json({
        error: 'Access denied: Only the assigned engineer, a Team Lead, or an Admin can edit this active work item.',
      });
      return;
    }

    const updated = await itemService.updateItem(itemId, req.user!.id, Number(version), {
      title,
      description,
      priority,
      assignee_id,
    });

    res.json({ message: 'Item updated successfully', item: updated });
  } catch (error: any) {
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message, latestItem: error.latestItem });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Update item error:', error);
    res.status(500).json({ error: error.message || 'Failed to update work item' });
  }
});

/**
 * CRITICAL BEHAVIOR 3 & 4: Transition State Machine
 */
router.post('/:id/transition', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;
    const parsed = transitionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { targetStatus, reason, version } = parsed.data;

    const existing = await db('work_items').where({ id: itemId }).first();
    if (!existing) {
      res.status(404).json({ error: 'Work item not found' });
      return;
    }

    const role = getUserRoleInTeam(req.user!, existing.team_id);
    if (!role) {
      res.status(403).json({ error: 'Access denied: You are not a member of this team.' });
      return;
    }

    // Ownership protection: If an item is assigned, other non-Lead members cannot transition it
    if (existing.assignee_id && existing.assignee_id !== req.user!.id && role === 'MEMBER') {
      res.status(403).json({
        error: 'Access denied: Only the assigned engineer, a Team Lead, or an Admin can transition this active item.',
      });
      return;
    }

    const updated = await itemService.transitionStatus(
      itemId,
      req.user!.id,
      role,
      targetStatus,
      reason,
      version !== undefined ? Number(version) : undefined
    );

    res.json({ message: `Status transitioned to ${targetStatus}`, item: updated });
  } catch (error: any) {
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message, latestItem: error.latestItem });
      return;
    }
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Transition error:', error);
    res.status(500).json({ error: error.message || 'Failed to transition work item status' });
  }
});

/**
 * Add comment to work item
 */
router.post('/:id/comments', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemId = req.params.id;
    const parsed = commentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { content } = parsed.data;

    const existing = await db('work_items').where({ id: itemId }).first();
    if (!existing) {
      res.status(404).json({ error: 'Work item not found' });
      return;
    }

    const role = getUserRoleInTeam(req.user!, existing.team_id);
    if (!role) {
      res.status(403).json({ error: 'Access denied to this team.' });
      return;
    }

    const comment = await itemService.addComment(itemId, req.user!.id, content.trim());
    res.status(201).json({ message: 'Comment added', comment });
  } catch (error: any) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

export default router;
