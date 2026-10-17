import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { generateToken, authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * List all users and their team roles.
 * Allows quick persona switching for demonstration and testing.
 */
router.get('/users', async (req: Request, res: Response) => {
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
 * Login endpoint
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (password) {
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
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
