import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { generateToken, authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * Minimal personas endpoint for the demo switcher (Protected by Authentication)
 * Returns id, name, email, and team roles
 */
router.get('/personas', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await db('users').select('id', 'name', 'email', 'is_active', 'deactivated_at');
    const memberships = await db('team_memberships')
      .join('teams', 'team_memberships.team_id', 'teams.id')
      .select(
        'team_memberships.user_id',
        'team_memberships.team_id',
        'teams.name as team_name',
        'team_memberships.role'
      );

    const result = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      is_active: Boolean(u.is_active !== undefined ? u.is_active : true),
      deactivated_at: u.deactivated_at,
      memberships: memberships.filter((m) => m.user_id === u.id),
    }));

    res.json(result);
  } catch (error) {
    console.error('List personas error:', error);
    res.status(500).json({ error: 'Failed to load personas' });
  }
});

/**
 * List all users and their team roles (Protected by Authentication)
 */
router.get('/users', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await db('users').select('id', 'name', 'email', 'is_active', 'token_version', 'deactivated_at', 'created_at');
    const memberships = await db('team_memberships')
      .join('teams', 'team_memberships.team_id', 'teams.id')
      .select(
        'team_memberships.user_id',
        'team_memberships.team_id',
        'teams.name as team_name',
        'team_memberships.role'
      );

    const result = users.map((u) => ({
      ...u,
      is_active: Boolean(u.is_active !== undefined ? u.is_active : true),
      memberships: memberships.filter((m) => m.user_id === u.id),
    }));

    res.json(result);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

// Dummy hash for constant-time comparison to prevent user enumeration timing attacks
const DUMMY_HASH = '$2a$10$wT8q6kF5H6g5j7k8l9m0n.o1p2q3r4s5t6u7v8w9x0y1z2a3b4c5d';

/**
 * Login endpoint
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { email, password } = parsed.data;

    const user = await db('users').where({ email }).first();
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const isValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !isValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Defense: Account Deactivation Check
    if (user.is_active === 0 || user.is_active === false) {
      res.status(403).json({ error: 'Access Denied: This account has been deactivated. Please contact Security Operations.' });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      token_version: user.token_version,
    });

    const memberships = await db('team_memberships')
      .join('teams', 'team_memberships.team_id', 'teams.id')
      .where({ 'team_memberships.user_id': user.id })
      .select('team_memberships.team_id', 'teams.name as team_name', 'team_memberships.role');

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_active: Boolean(user.is_active !== undefined ? user.is_active : true),
        memberships,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal login error' });
  }
});

/**
 * Deactivate user endpoint (Admin Only)
 * Marks user as inactive, increments token_version to immediately revoke all active JWT sessions,
 * unassigns active work items to prevent orphaned incidents, and records audit trails.
 */
router.post('/users/:id/deactivate', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = req.params.id as string;
    const isAdmin = req.user?.memberships.some((m) => m.role === 'ADMIN');

    if (!isAdmin) {
      res.status(403).json({ error: 'Access denied: Only an administrator can deactivate user accounts.' });
      return;
    }

    if (req.user?.id === targetUserId) {
      res.status(400).json({ error: 'Self-deactivation error: Administrators cannot deactivate their own account.' });
      return;
    }

    const targetUser = await db('users').where({ id: targetUserId }).first();
    if (!targetUser) {
      res.status(404).json({ error: 'Target user does not exist.' });
      return;
    }

    let unassignedCount = 0;
    await db.transaction(async (trx) => {
      // 1. Mark user as inactive & increment token_version (instantly invalidates all active JWT tokens)
      await trx('users')
        .where({ id: targetUserId })
        .update({
          is_active: false,
          token_version: trx.raw('token_version + 1'),
          deactivated_at: new Date().toISOString(),
        });

      // 2. Orphan Protection: Reclaim any active work items assigned to this user
      const activeItems = await trx('work_items')
        .where({ assignee_id: targetUserId })
        .whereIn('status', ['OPEN', 'IN_PROGRESS'])
        .select('id', 'title');

      unassignedCount = activeItems.length;
      if (activeItems.length > 0) {
        await trx('work_items')
          .where({ assignee_id: targetUserId })
          .whereIn('status', ['OPEN', 'IN_PROGRESS'])
          .update({
            assignee_id: null,
            status: 'OPEN',
            updated_at: new Date().toISOString(),
          });

        for (const item of activeItems) {
          await trx('activity_events').insert({
            id: uuidv4(),
            work_item_id: item.id,
            actor_id: req.user!.id,
            event_type: 'UNASSIGNED',
            details: JSON.stringify({
              previousAssigneeId: targetUserId,
              reason: `Assignee account deactivated during offboarding by administrator (${req.user!.name})`,
            }),
            created_at: new Date().toISOString(),
          });
        }
      }

      // 3. Queue an outbox security event for audit and webhook dispatch
      await trx('outbox_jobs').insert({
        id: uuidv4(),
        event_type: 'USER_DEACTIVATED',
        payload: JSON.stringify({
          deactivatedUserId: targetUserId,
          deactivatedEmail: targetUser.email,
          deactivatedBy: req.user!.id,
          unassignedWorkItems: unassignedCount,
          timestamp: new Date().toISOString(),
        }),
        status: 'PENDING',
        attempts: 0,
        max_attempts: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    res.json({
      message: `User ${targetUser.name} (${targetUser.email}) deactivated successfully. All active sessions revoked.`,
      unassignedWorkItems: unassignedCount,
    });
  } catch (error) {
    console.error('User deactivation error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

/**
 * Reactivate user endpoint (Admin Only)
 * Marks user as active, clears deactivated_at, and increments token_version
 * (ensuring old pre-deactivation tokens remain revoked).
 */
router.post('/users/:id/reactivate', authMiddleware, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = req.params.id as string;
    const isAdmin = req.user?.memberships.some((m) => m.role === 'ADMIN');

    if (!isAdmin) {
      res.status(403).json({ error: 'Access denied: Only an administrator can reactivate user accounts.' });
      return;
    }

    const targetUser = await db('users').where({ id: targetUserId }).first();
    if (!targetUser) {
      res.status(404).json({ error: 'Target user does not exist.' });
      return;
    }

    await db('users')
      .where({ id: targetUserId })
      .update({
        is_active: true,
        token_version: db.raw('token_version + 1'), // Prior tokens remain revoked; fresh login required
        deactivated_at: null,
      });

    res.json({
      message: `User ${targetUser.name} (${targetUser.email}) reactivated successfully. User may now sign in.`,
    });
  } catch (error) {
    console.error('User reactivation error:', error);
    res.status(500).json({ error: 'Failed to reactivate user' });
  }
});

/**
 * Get current authenticated profile
 */
router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

/**
 * Setup status endpoint (Public)
 * Returns whether the database has 0 users and requires Day-0 admin bootstrapping
 */
router.get('/setup-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const existingUsers = await db('users').count('* as count').first().catch(() => null);
    const userCount = Number(existingUsers?.count || 0);
    const isProduction = process.env.NODE_ENV === 'production';
    const hasSetupToken = !!process.env.SETUP_TOKEN;

    res.json({
      needsSetup: userCount === 0,
      requiresToken: isProduction || hasSetupToken,
      setupEnabled: !isProduction || hasSetupToken,
    });
  } catch (error) {
    console.error('Setup status check error:', error);
    res.status(500).json({ error: 'Failed to verify system setup status' });
  }
});

const setupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  setupToken: z.string().optional(),
});

/**
 * Initial Administrator Setup endpoint (One-Time Bootstrap)
 * Allows creating the first administrator when the system has 0 users.
 * Requires operator-held SETUP_TOKEN when configured or in production.
 * Atomic transaction prevents simultaneous setup requests from racing.
 * Permanently locks (HTTP 403 Forbidden) once the first administrator is created.
 */
router.post('/setup', async (req: Request, res: Response): Promise<void> => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const configuredToken = process.env.SETUP_TOKEN;

    // Security Gate 1: If in production and no SETUP_TOKEN is configured in the environment,
    // interactive public setup is strictly prohibited to prevent arbitrary takeover.
    // Operators must use automated container env variables (INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD).
    if (isProduction && !configuredToken) {
      res.status(403).json({
        error: 'Interactive setup is disabled in production without an operator SETUP_TOKEN. Use INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables to bootstrap.',
      });
      return;
    }

    // Security Gate 2: If a SETUP_TOKEN is configured, require caller to provide the exact secret.
    if (configuredToken) {
      const incomingToken = req.body.setupToken || (req.headers['x-setup-token'] as string);
      if (!incomingToken || incomingToken !== configuredToken) {
        res.status(401).json({
          error: 'Unauthorized: Invalid or missing setup security token (X-Setup-Token).',
        });
        return;
      }
    }

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }

    const { name, email, password } = parsed.data;
    let adminResult: any = null;

    // Execute setup atomically inside a database transaction to eliminate TOCTOU race conditions
    try {
      await db.transaction(async (trx) => {
        const existingUsers = await trx('users').count('* as count').first();
        const userCount = Number(existingUsers?.count || 0);

        if (userCount > 0) {
          throw new Error('SETUP_LOCKED');
        }

        // Ensure default core teams exist
        const teamCount = Number((await trx('teams').count('* as count').first())?.count || 0);
        if (teamCount === 0) {
          await trx('teams').insert([
            { id: 'team-eng', name: 'Engineering & Platform', description: 'Core infrastructure, incident response, and software bugs.' },
            { id: 'team-pay', name: 'Finance & Payment Ops', description: 'High-risk payment investigations, chargebacks, and settlement discrepancies.' },
            { id: 'team-cmp', name: 'Legal & Compliance', description: 'Regulatory requests, AML checks, and audit investigations.' },
            { id: 'team-ops', name: 'Customer Operations', description: 'Tier-3 customer escalation and operational triage.' },
          ]);
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const adminId = 'usr-admin-' + uuidv4().substring(0, 8);
        const normalizedEmail = email.toLowerCase().trim();

        await trx('users').insert({
          id: adminId,
          email: normalizedEmail,
          name,
          password_hash: passwordHash,
          is_active: true,
          token_version: 1,
          created_at: new Date().toISOString(),
        });

        // Assign global admin membership across all teams
        await trx('team_memberships').insert([
          { id: uuidv4(), user_id: adminId, team_id: 'team-eng', role: 'ADMIN' },
          { id: uuidv4(), user_id: adminId, team_id: 'team-pay', role: 'ADMIN' },
          { id: uuidv4(), user_id: adminId, team_id: 'team-cmp', role: 'ADMIN' },
          { id: uuidv4(), user_id: adminId, team_id: 'team-ops', role: 'ADMIN' },
        ]);

        await trx('system_metadata').insert({
          key: 'seed_completed',
          value: 'true',
          updated_at: new Date().toISOString(),
        }).catch(() => {});

        const token = generateToken({ id: adminId, email: normalizedEmail, token_version: 1 });
        const memberships = await trx('team_memberships')
          .join('teams', 'team_memberships.team_id', 'teams.id')
          .where({ 'team_memberships.user_id': adminId })
          .select('team_memberships.team_id', 'teams.name as team_name', 'team_memberships.role');

        adminResult = {
          token,
          user: {
            id: adminId,
            name,
            email: normalizedEmail,
            memberships,
          },
        };
      });
    } catch (trxErr: any) {
      if (trxErr?.message === 'SETUP_LOCKED') {
        res.status(403).json({
          error: 'System setup is already completed and permanently locked. Initial administrator exists.',
        });
        return;
      }
      throw trxErr;
    }

    res.status(201).json({
      message: 'Initial administrator provisioned successfully',
      token: adminResult.token,
      user: adminResult.user,
    });
  } catch (error) {
    console.error('Initial setup error:', error);
    res.status(500).json({ error: 'Failed to complete initial administrator setup' });
  }
});

export default router;
