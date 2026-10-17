import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { generateToken, authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * Public minimal personas endpoint for the demo switcher
 * Returns only id, name, and team roles (no sensitive emails or private data)
 */
router.get('/personas', async (req: Request, res: Response) => {
  try {
    const users = await db('users').select('id', 'name');
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
    const users = await db('users').select('id', 'name', 'email');
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
      memberships: memberships.filter((m) => m.user_id === u.id),
    }));

    res.json(result);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * Generate JWT for demo persona switching or direct API client authentication
 */
router.post('/token', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.body.userId || req.body.id;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const token = generateToken({ id: user.id, email: user.email });
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
        memberships,
      },
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
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

    const token = generateToken({ id: user.id, email: user.email });
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
        memberships,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal login error' });
  }
});

/**
 * Get current authenticated profile
 */
router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
