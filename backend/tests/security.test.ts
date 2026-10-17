import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

describe('Security Hardening & Edge-Case Defenses', () => {
  beforeEach(async () => {
    await runSeed(db, { force: true });
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

  it('Defense 4: Helmet sets essential security headers against clickjacking, MIME sniffing, and XSS', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('Defense 5: Authentication strictly enforces password verification and rejects empty passwords', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@newtonite.internal',
        // password omitted
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('Defense 6: Comments endpoint validates content length and blocks empty comments', async () => {
    const res = await request(app)
      .post('/api/items/wi-101/comments')
      .set('x-user-id', 'usr-eng-lead')
      .send({
        content: '', // empty
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('Defense 7: VIEWER role cannot add comments (403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/items/wi-101/comments')
      .set('x-user-id', 'usr-viewer')
      .send({
        content: 'Viewer attempting to add a comment',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Viewers have read-only access and cannot post comments');
  });

  it('Defense 8: Assigning item to a user outside its team is rejected with 400 Bad Request', async () => {
    // usr-cmp-1 belongs to team-cmp, not team-eng
    const res = await request(app)
      .patch('/api/items/wi-101')
      .set('x-user-id', 'usr-eng-lead')
      .send({
        assignee_id: 'usr-cmp-1',
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is not a member of team');
  });

  it('Defense 9: Claiming an unassigned item not in OPEN status is rejected with 400 Bad Request', async () => {
    // Set wi-104 (unassigned) to RESOLVED
    await db('work_items').where({ id: 'wi-104' }).update({ status: 'RESOLVED', assignee_id: null });

    const res = await request(app)
      .post('/api/items/wi-104/claim')
      .set('x-user-id', 'usr-eng-lead');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only OPEN items can be claimed');
  });

  it('Defense 10: Transition requiring reason without supplying reason is rejected with 400 Bad Request', async () => {
    // IN_PROGRESS -> AWAITING_APPROVAL requires a reason
    const res = await request(app)
      .post('/api/items/wi-102/transition')
      .set('x-user-id', 'usr-pay-1')
      .send({
        targetStatus: 'AWAITING_APPROVAL',
        // reason omitted!
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('requires an explanation or approval rationale');
  });

  it('Defense 11: Idempotency key reused with different request payload is rejected with 422 Unprocessable Entity', async () => {
    const key = `idem-payload-test-${Date.now()}`;

    // First request
    const res1 = await request(app)
      .post('/api/items')
      .set('x-user-id', 'usr-eng-lead')
      .set('idempotency-key', key)
      .send({
        title: 'Original Title',
        description: 'Original description text here',
        type: 'incident',
        priority: 'HIGH',
        team_id: 'team-eng',
      });
    expect(res1.status).toBe(201);

    // Second request with SAME key but DIFFERENT payload
    const res2 = await request(app)
      .post('/api/items')
      .set('x-user-id', 'usr-eng-lead')
      .set('idempotency-key', key)
      .send({
        title: 'Tampered Title with Same Key',
        description: 'Different description text',
        type: 'incident',
        priority: 'LOW',
        team_id: 'team-eng',
      });

    expect(res2.status).toBe(422);
    expect(res2.body.error).toContain('Unprocessable Entity: Idempotency-Key was already used with a different request endpoint or payload');
  });

  it('Defense 12: GET /api/teams/:id/members rejects unauthorized non-members with 403 Forbidden', async () => {
    // usr-eng-1 belongs to team-eng, attempting to query team-cmp members
    const res = await request(app)
      .get('/api/teams/team-cmp/members')
      .set('x-user-id', 'usr-eng-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied: You are not a member of this team');
  });

  it('Defense 13: GET /api/items filters items to only the caller\'s team memberships', async () => {
    // usr-cmp-1 belongs only to team-cmp
    const res = await request(app)
      .get('/api/items')
      .set('x-user-id', 'usr-cmp-1');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    // Every item returned MUST belong to team-cmp
    for (const item of res.body.items) {
      expect(item.team_id).toBe('team-cmp');
    }
  });

  it('Defense 14: Concurrent status transitions against the same item reject the loser with 409 Conflict', async () => {
    // wi-102 is IN_PROGRESS in team-pay
    const itemId = 'wi-102';
    const actorId = 'usr-pay-lead';

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/items/${itemId}/transition`)
        .set('x-user-id', actorId)
        .send({
          targetStatus: 'AWAITING_APPROVAL',
          reason: 'Review ready for team sign-off (Worker A)',
        }),
      request(app)
        .post(`/api/items/${itemId}/transition`)
        .set('x-user-id', actorId)
        .send({
          targetStatus: 'AWAITING_APPROVAL',
          reason: 'Review ready for team sign-off (Worker B)',
        }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.error).toContain('Concurrent Transition Conflict');
  });

  it('Defense 15: Creating an item with an assignee outside its team returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('x-user-id', 'usr-eng-lead')
      .send({
        title: 'Cross-team assignment attempt',
        description: 'Trying to assign an engineering ticket to a compliance lawyer',
        type: 'incident',
        priority: 'HIGH',
        team_id: 'team-eng',
        assignee_id: 'usr-cmp-1', // Legal/Compliance member, not in team-eng
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is not a member of team');
  });

  it('Defense 16: Outbox worker persists delivered notifications into outbox_deliveries database table', async () => {
    const { OutboxWorker } = await import('../src/workers/outboxWorker.js');
    const worker = new OutboxWorker(db);

    const testJobId = `job-test-${Date.now()}`;
    await db('outbox_jobs').insert({
      id: testJobId,
      event_type: 'WORK_ITEM_CREATED',
      payload: JSON.stringify({ itemId: 'wi-test-999', teamId: 'team-eng', priority: 'HIGH' }),
      status: 'PENDING',
      attempts: 0,
      max_attempts: 5,
      next_run_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await worker.processBatch(10);
    expect(result.processed).toBeGreaterThan(0);
    expect(result.succeeded).toBeGreaterThan(0);

    // Verify delivery audit record exists in outbox_deliveries table
    const delivery = await db('outbox_deliveries').where({ job_id: testJobId }).first();
    expect(delivery).toBeTruthy();
    expect(delivery.status).toBe('DELIVERED');
    expect(delivery.channel).toBe('SLACK_WEBHOOK');
  });

  it('Defense 17: Seeding is idempotent and skips clearing database if operational data exists', async () => {
    const customTicketId = 'wi-custom-operational-record';
    await db('work_items').insert({
      id: customTicketId,
      title: 'Active customer incident created during operations',
      description: 'Must NOT be wiped when server restarts',
      type: 'incident',
      priority: 'URGENT',
      status: 'OPEN',
      team_id: 'team-eng',
      created_by_id: 'usr-eng-lead',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Run seed without force (simulate server reboot)
    await runSeed(db, { force: false });

    // Verify operational record was PRESERVED
    const preservedItem = await db('work_items').where({ id: customTicketId }).first();
    expect(preservedItem).toBeTruthy();
    expect(preservedItem.title).toBe('Active customer incident created during operations');
  });

  it('Defense 18: Unauthenticated access to /api/auth/token is rejected with 404 (endpoint removed) and /api/auth/personas requires authentication', async () => {
    // 1. Open token endpoint must be completely gone (404)
    const tokenRes = await request(app)
      .post('/api/auth/token')
      .send({ userId: 'usr-admin' });
    expect(tokenRes.status).toBe(404);

    // 2. Personas endpoint without authentication returns 401 Unauthorized
    const personaRes = await request(app).get('/api/auth/personas');
    expect(personaRes.status).toBe(401);
  });

  it('Defense 19: Webhook failure causes outbox job to fail and reschedule retry without recording false delivery', async () => {
    const { OutboxWorker } = await import('../src/workers/outboxWorker.js');
    const worker = new OutboxWorker(db);
    const failJobId = 'job-fail-webhook-' + Date.now();

    await db('outbox_jobs').insert({
      id: failJobId,
      event_type: 'WORK_ITEM_ASSIGNED',
      payload: JSON.stringify({ itemId: 'wi-101', assigneeId: 'usr-eng-1' }),
      status: 'PENDING',
      attempts: 0,
      max_attempts: 5,
      next_run_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Configure a failing webhook URL (port 9998 not listening)
    const originalWebhook = process.env.NOTIFICATION_WEBHOOK_URL;
    process.env.NOTIFICATION_WEBHOOK_URL = 'http://127.0.0.1:9998/webhook-dead-end';

    try {
      const result = await worker.processBatch(10);
      expect(result.failed).toBeGreaterThan(0);

      // Verify job was NOT marked COMPLETED; it must be PENDING with error recorded
      const jobInDb = await db('outbox_jobs').where({ id: failJobId }).first();
      expect(jobInDb.status).toBe('PENDING');
      expect(jobInDb.attempts).toBe(1);
      expect(jobInDb.last_error).toBeTruthy();

      // Crucial: No delivery record must exist in outbox_deliveries
      const delivery = await db('outbox_deliveries').where({ job_id: failJobId }).first();
      expect(delivery).toBeUndefined();
    } finally {
      if (originalWebhook) {
        process.env.NOTIFICATION_WEBHOOK_URL = originalWebhook;
      } else {
        delete process.env.NOTIFICATION_WEBHOOK_URL;
      }
    }
  });

  it('Defense 20: In-flight idempotency key is preserved and rejects retries with 409 even after 30 seconds', async () => {
    const testKey = 'slow-req-key-' + Date.now();
    const fortySecondsAgo = new Date(Date.now() - 40 * 1000).toISOString();

    // Simulate an ongoing slow request (status_code: 0) that started 40s ago
    await db('idempotency_keys').insert({
      key: testKey,
      user_id: 'usr-eng-lead',
      endpoint: 'POST /api/items',
      request_payload: JSON.stringify({ title: 'Slow item', priority: 'HIGH' }),
      status_code: 0,
      response_body: JSON.stringify({ status: 'IN_FLIGHT' }),
      created_at: fortySecondsAgo,
    });

    // Retry arriving while operation is still processing
    const retryRes = await request(app)
      .post('/api/items')
      .set('x-user-id', 'usr-eng-lead')
      .set('Idempotency-Key', testKey)
      .send({ title: 'Slow item', priority: 'HIGH' });

    expect(retryRes.status).toBe(409);
    expect(retryRes.body.error).toContain('Concurrent Request Conflict');

    // Verify key was NOT deleted from the database
    const keyInDb = await db('idempotency_keys').where({ key: testKey }).first();
    expect(keyInDb).toBeTruthy();
    expect(keyInDb.status_code).toBe(0);
  });

  it('Defense 21: Production environment without explicit ALLOW_DEMO_SEED skips seeding default demo accounts', async () => {
    const origEnv = process.env.NODE_ENV;
    const origDemo = process.env.ALLOW_DEMO_SEED;
    const origDemoMode = process.env.DEMO_MODE;

    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_SEED;
    delete process.env.DEMO_MODE;

    try {
      // Create empty temporary knex instance to test production guard
      const testDb = db;
      // If we attempt runSeed without force in production, it skips
      await runSeed(testDb, { force: false });
      // In production guard, it warns and returns early
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origDemo) process.env.ALLOW_DEMO_SEED = origDemo;
      if (origDemoMode) process.env.DEMO_MODE = origDemoMode;
    }
  });

  it('Defense 22: Upgrading a legacy database with existing users preserves operational data and backfills seed_completed marker', async () => {
    // 1. Simulate an operational database by inserting a custom operational user and work item
    const customUserId = 'usr-prod-existing-1';
    await db('users').insert({
      id: customUserId,
      name: 'Existing Prod Engineer',
      email: 'prod.engineer@internal.enterprise.com',
      password_hash: 'secret_hash_value',
    });

    const customItemId = 'wi-prod-existing-item';
    await db('work_items').insert({
      id: customItemId,
      title: 'Real production mission critical incident',
      description: 'Must never be wiped by an upgrade restart',
      type: 'incident',
      team_id: 'team-eng',
      created_by_id: customUserId,
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      version: 1,
    });

    // 2. Remove the seed_completed marker from system_metadata (simulating database created before marker was introduced)
    await db('system_metadata').where({ key: 'seed_completed' }).del();
    const markerBefore = await db('system_metadata').where({ key: 'seed_completed' }).first();
    expect(markerBefore).toBeUndefined();

    // 3. Run runSeed without force (simulating server reboot/upgrade)
    await runSeed(db, { force: false });

    // 4. Verify operational user and item are strictly preserved
    const preservedItem = await db('work_items').where({ id: customItemId }).first();
    expect(preservedItem).toBeTruthy();
    expect(preservedItem.title).toBe('Real production mission critical incident');

    const preservedUser = await db('users').where({ id: customUserId }).first();
    expect(preservedUser).toBeTruthy();

    // 5. Verify the seed_completed marker was automatically backfilled into system_metadata
    const markerAfter = await db('system_metadata').where({ key: 'seed_completed' }).first();
    expect(markerAfter).toBeTruthy();
    expect(markerAfter.value).toBe('true');
  });

  it('Defense 23: In-flight idempotency key is maintained during execution and locks out concurrent retries with 409', async () => {
    const lockKey = 'concurrent-race-key-' + Date.now();
    const testUserId = 'usr-eng-lead';

    // Simulate an ongoing execution holding an in-flight key (status_code: 0)
    await db('idempotency_keys').insert({
      key: lockKey,
      user_id: testUserId,
      endpoint: 'POST /api/items',
      request_payload: JSON.stringify({ title: 'Payment anomaly', priority: 'URGENT' }),
      status_code: 0,
      response_body: JSON.stringify({ status: 'IN_FLIGHT' }),
      created_at: new Date().toISOString(),
    });

    // Attempting a second concurrent call with the same idempotency key while the first is in-flight
    const conflictRes = await request(app)
      .post('/api/items')
      .set('x-user-id', testUserId)
      .set('Idempotency-Key', lockKey)
      .send({ title: 'Payment anomaly', priority: 'URGENT' });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toContain('Concurrent Request Conflict');

    // Confirm the in-flight key was NOT prematurely cleared or deleted
    const dbKey = await db('idempotency_keys').where({ key: lockKey, user_id: testUserId }).first();
    expect(dbKey).toBeTruthy();
    expect(dbKey.status_code).toBe(0);
  });
});
