import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

describe('Security Hardening & Edge-Case Defenses', () => {
  beforeEach(async () => {
    await runSeed(db);
  });

  it('Defense 1: Schema validation blocks invalid enum priorities and malformed payloads on PATCH', async () => {
    const itemId = 'wi-101';

    const res = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('x-user-id', 'usr-eng-lead')
      .send({
        priority: 'SUPER_URGENT_OVERRIDE', // Invalid enum value
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('Defense 2: Collaborative ownership blocks non-assignee members from editing active items', async () => {
    // wi-102 is currently assigned to usr-pay-1 (Chloe Dubois)
    const itemId = 'wi-102';
    // Let's create another member in team-pay
    const otherMemberId = 'usr-other-pay-member';
    await db('users').insert({
      id: otherMemberId,
      name: 'Other Analyst',
      email: 'other.pay@newtonite.internal',
      password_hash: 'hash',
    });
    await db('team_memberships').insert({
      id: 'mem-other-pay',
      user_id: otherMemberId,
      team_id: 'team-pay',
      role: 'MEMBER',
    });

    const res = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('x-user-id', otherMemberId)
      .send({
        title: 'Unauthorized edit by colleague',
        version: 2,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Only the assigned engineer, a Team Lead, or an Admin can edit');
  });

  it('Defense 3: Collaborative ownership blocks non-assignee members from transitioning active items', async () => {
    // wi-102 is assigned to usr-pay-1 in IN_PROGRESS
    const itemId = 'wi-102';
    const otherMemberId = 'usr-other-pay-member-2';
    await db('users').insert({
      id: otherMemberId,
      name: 'Another Analyst',
      email: 'another.pay@newtonite.internal',
      password_hash: 'hash',
    });
    await db('team_memberships').insert({
      id: 'mem-other-pay-2',
      user_id: otherMemberId,
      team_id: 'team-pay',
      role: 'MEMBER',
    });

    const res = await request(app)
      .post(`/api/items/${itemId}/transition`)
      .set('x-user-id', otherMemberId)
      .send({
        targetStatus: 'AWAITING_APPROVAL',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Only the assigned engineer, a Team Lead, or an Admin can transition');
  });
});
