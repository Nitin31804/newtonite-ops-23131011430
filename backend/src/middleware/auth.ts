import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { AuthUser, Role } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'newtonite-secret-key-2026';

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateToken(user: { id: string; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let userId: string | null = null;

    // 1. Check Authorization Bearer Header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
        userId = decoded.id;
      } catch (err) {
        res.status(401).json({ error: 'Invalid or expired authentication token.' });
        return;
      }
    } 
    // 2. Controlled fallback to X-User-Id header ONLY in dev/test/demo mode
    else if (req.headers['x-user-id']) {
      const isProduction = process.env.NODE_ENV === 'production';
      const allowDemoAuth = process.env.ALLOW_DEV_DEMO_AUTH === 'true';

      if (isProduction && !allowDemoAuth) {
        res.status(401).json({
          error: 'Security Error: Header-based authentication (X-User-Id) is disabled in production. Provide a valid Bearer JWT token.',
        });
        return;
      }

      userId = req.headers['x-user-id'] as string;
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required. Please provide Bearer token or X-User-Id header.' });
      return;
    }

    // Load user and their team memberships
    const userRow = await db('users').where({ id: userId }).first();
    if (!userRow) {
      res.status(401).json({ error: 'User does not exist.' });
      return;
    }

    const memberships = await db('team_memberships')
      .join('teams', 'team_memberships.team_id', 'teams.id')
      .where({ 'team_memberships.user_id': userId })
      .select(
        'team_memberships.team_id',
        'teams.name as team_name',
        'team_memberships.role'
      );

    req.user = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      created_at: userRow.created_at,
      memberships,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal authentication error.' });
  }
}

/**
 * Helper to determine user's role within a specific team.
 * Admin role applies globally across all teams.
 */
export function getUserRoleInTeam(user: AuthUser, teamId: string): Role | null {
  // Check if user has global ADMIN role in any membership
  const isAdmin = user.memberships.some((m) => m.role === 'ADMIN');
  if (isAdmin) return 'ADMIN';

  const membership = user.memberships.find((m) => m.team_id === teamId);
  return membership ? membership.role : null;
}

/**
 * Middleware factory to enforce specific minimum role on a given team
 */
export function requireTeamRole(allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const teamId = (req.params.teamId || req.body.team_id || req.query.teamId) as string;
    if (!teamId) {
      res.status(400).json({ error: 'Team ID is required to evaluate permissions.' });
      return;
    }

    const role = getUserRoleInTeam(req.user, teamId);
    if (!role) {
      res.status(403).json({ error: 'Access denied: You are not a member of this team.' });
      return;
    }

    if (role === 'ADMIN') {
      next();
      return;
    }

    if (!allowedRoles.includes(role)) {
      res.status(403).json({
        error: `Insufficient permissions. Required: [${allowedRoles.join(', ')}], current role: ${role}`,
      });
      return;
    }

    next();
  };
}
