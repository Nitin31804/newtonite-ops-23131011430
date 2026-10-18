import { Router, Response } from 'express';
import { db } from '../config/database.js';
import { authMiddleware, AuthenticatedRequest, getUserRoleInTeam } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

/**
 * List all teams
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const teams = await db('teams').select('*').orderBy('name', 'asc');
    res.json(teams);
  } catch (error) {
    console.error('List teams error:', error);
    res.status(500).json({ error: 'Failed to retrieve teams' });
  }
});

/**
 * Get team members for a specific team (Scoped to team members or Admin)
 */
router.get('/:id/members', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const teamId = req.params.id as string;

    const role = getUserRoleInTeam(req.user!, teamId);
    if (!role) {
      res.status(403).json({ error: 'Access denied: You are not a member of this team.' });
      return;
    }

    const members = await db('team_memberships')
      .join('users', 'team_memberships.user_id', 'users.id')
      .where({ 'team_memberships.team_id': teamId })
      .select('users.id', 'users.name', 'users.email', 'users.is_active', 'team_memberships.role');

    const formattedMembers = members.map((m) => ({
      ...m,
      is_active: Boolean(m.is_active !== undefined ? m.is_active : true),
    }));

    res.json(formattedMembers);
  } catch (error) {
    console.error('List team members error:', error);
    res.status(500).json({ error: 'Failed to retrieve team members' });
  }
});

export default router;
