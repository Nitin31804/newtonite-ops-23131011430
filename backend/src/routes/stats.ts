import { Router, Response } from 'express';
import { db } from '../config/database.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user!.memberships.some((m) => m.role === 'ADMIN');
    const userTeamIds = req.user!.memberships.map((m) => m.team_id);

    const baseQuery = () => {
      const q = db('work_items');
      if (!isAdmin) {
        q.whereIn('team_id', userTeamIds);
      }
      return q;
    };

    // Run parallel count queries for dashboard metrics scoped to caller's authorized teams
    const [total, unassignedUrgent, assignedToMe, awaitingApproval] = await Promise.all([
      baseQuery().count('* as count').first(),
      baseQuery()
        .whereNull('assignee_id')
        .whereIn('priority', ['URGENT', 'HIGH'])
        .whereIn('status', ['OPEN', 'IN_PROGRESS'])
        .count('* as count')
        .first(),
      baseQuery()
        .where('assignee_id', userId)
        .whereNotIn('status', ['CLOSED'])
        .count('* as count')
        .first(),
      baseQuery().where('status', 'AWAITING_APPROVAL').count('* as count').first(),
    ]);

    res.json({
      total: Number(total?.count || 0),
      unassignedUrgent: Number(unassignedUrgent?.count || 0),
      assignedToMe: Number(assignedToMe?.count || 0),
      awaitingApproval: Number(awaitingApproval?.count || 0),
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

export default router;
