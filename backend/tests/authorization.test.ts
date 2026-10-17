import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

describe('Critical Behavior: Resource-Level Team & Role Authorization', () => {
  beforeEach(async () => {
    await runSeed(db);
  });

  it('Scenario 5a: Cross-team unauthorized user receives 403 Forbidden on access', async () => {
    const complianceItemId = 'wi-103'; // Belongs to team-cmp
    const engUserId = 'usr-eng-1'; // Member of team-eng only

    const res = await request(app)
      .get(`/api/items/${complianceItemId}`)
      .set('x-user-id', engUserId);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });

  it('Scenario 5b: VIEWER role cannot create work items (403 Forbidden)', async () => {
    const viewerId = 'usr-viewer'; // Role: VIEWER across all teams

    const res = await request(app)
      .post('/api/items')
      .set('x-user-id', viewerId)
      .send({
        title: 'Viewer Attempting Creation',
        description: 'Should be rejected because role is VIEWER only.',
        type: 'incident',
        priority: 'LOW',
        team_id: 'team-eng',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Viewers cannot create work items');
  });

  it('Scenario 5c: Global ADMIN can access and manage items across any team', async () => {
    const adminId = 'usr-admin';
    const complianceItemId = 'wi-103';

    const res = await request(app)
      .get(`/api/items/${complianceItemId}`)
      .set('x-user-id', adminId);

    expect(res.status).toBe(200);
    expect(res.body.item.id).toBe(complianceItemId);
  });
});
