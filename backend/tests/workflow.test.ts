import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

describe('Critical Behavior: Workflow State Machine & Approval Gates', () => {
  beforeEach(async () => {
    await runSeed(db, { force: true });
  });

  it('Scenario 4a: Direct invalid jump (OPEN -> CLOSED) is rejected with 400 Bad Request', async () => {
    const itemId = 'wi-101'; // Status: OPEN
    const userId = 'usr-eng-lead';

    const res = await request(app)
      .post(`/api/items/${itemId}/transition`)
      .set('x-user-id', userId)
      .send({
        targetStatus: 'CLOSED', // Invalid direct jump
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot transition directly from \'OPEN\' to \'CLOSED\'');

    // Verify status was NOT changed in DB
    const item = await db('work_items').where({ id: itemId }).first();
    expect(item.status).toBe('OPEN');
  });

  it('Scenario 4b: Awaiting approval cannot be approved by regular MEMBER (403 Forbidden)', async () => {
    const itemId = 'wi-103'; // Status: AWAITING_APPROVAL in team-cmp
    const regularMemberId = 'usr-cmp-1'; // Role: MEMBER in team-cmp

    const res = await request(app)
      .post(`/api/items/${itemId}/transition`)
      .set('x-user-id', regularMemberId)
      .send({
        targetStatus: 'RESOLVED',
        reason: 'Attempting to self-approve without lead authority',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('requires one of [LEAD, ADMIN]');

    // Verify item remains AWAITING_APPROVAL
    const item = await db('work_items').where({ id: itemId }).first();
    expect(item.status).toBe('AWAITING_APPROVAL');
  });

  it('Scenario 4c: Approval by Team LEAD succeeds with 200 and records audit event in same transaction', async () => {
    const itemId = 'wi-103'; // Status: AWAITING_APPROVAL in team-cmp
    const leadId = 'usr-cmp-lead'; // Role: LEAD in team-cmp

    const res = await request(app)
      .post(`/api/items/${itemId}/transition`)
      .set('x-user-id', leadId)
      .send({
        targetStatus: 'RESOLVED',
        reason: 'GDPR scrub logs and deletion verified by compliance lead.',
      });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('RESOLVED');

    // Verify DB update
    const item = await db('work_items').where({ id: itemId }).first();
    expect(item.status).toBe('RESOLVED');

    // Verify transactional audit trail
    const auditEvent = await db('activity_events')
      .where({ work_item_id: itemId, event_type: 'STATUS_CHANGED' })
      .where('details', 'like', '%RESOLVED%')
      .first();

    expect(auditEvent).toBeTruthy();
    expect(auditEvent.actor_id).toBe(leadId);
    const details = JSON.parse(auditEvent.details);
    expect(details.to_status).toBe('RESOLVED');
    expect(details.reason).toContain('GDPR scrub logs');
  });
});
