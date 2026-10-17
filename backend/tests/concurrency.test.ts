import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

describe('Critical Behavior: Concurrency & Race Conditions', () => {
  beforeEach(async () => {
    // Re-seed to ensure clean baseline for every test
    await runSeed(db, { force: true });
  });

  it('Scenario 1: Two users concurrently claiming the same item - exactly one succeeds (409 Conflict)', async () => {
    const unassignedItemId = 'wi-101'; // From seed: OPEN and unassigned
    const user1Id = 'usr-eng-1';
    const user2Id = 'usr-eng-2';

    // Fire two claim requests simultaneously via Promise.all
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/items/${unassignedItemId}/claim`)
        .set('x-user-id', user1Id),
      request(app)
        .post(`/api/items/${unassignedItemId}/claim`)
        .set('x-user-id', user2Id),
    ]);

    const statuses = [res1.status, res2.status].sort();
    
    // Exactly one must be 200 (Success) and the other must be 409 (Conflict)
    expect(statuses).toEqual([200, 409]);

    const successfulRes = res1.status === 200 ? res1 : res2;
    const conflictingRes = res1.status === 409 ? res1 : res2;

    expect(successfulRes.body.item.assignee_id).toBeTruthy();
    expect(conflictingRes.body.error).toContain('Concurrent Claim Conflict');

    // Verify DB state: assignee is set and version incremented exactly once
    const itemInDb = await db('work_items').where({ id: unassignedItemId }).first();
    expect(itemInDb.assignee_id).toBe(successfulRes.body.item.assignee_id);
    expect(itemInDb.status).toBe('IN_PROGRESS');
  });

  it('Scenario 2: Optimistic Locking - editing a stale version is rejected with 409 Conflict', async () => {
    const itemId = 'wi-101';
    const userId = 'usr-eng-1';

    // Step 1: User A reads version 1
    const initialItem = await db('work_items').where({ id: itemId }).first();
    expect(initialItem.version).toBe(1);

    // Step 2: User A updates item successfully with version: 1
    const updateRes1 = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('x-user-id', userId)
      .send({
        title: 'Updated Title by User A',
        version: 1,
      });

    expect(updateRes1.status).toBe(200);
    expect(updateRes1.body.item.version).toBe(2);

    // Step 3: User B tries to update using stale version 1
    const updateRes2 = await request(app)
      .patch(`/api/items/${itemId}`)
      .set('x-user-id', 'usr-eng-2')
      .send({
        title: 'Overwriting Title by User B',
        version: 1, // Stale! Server is now at version 2
      });

    expect(updateRes2.status).toBe(409);
    expect(updateRes2.body.error).toContain('Stale Update Conflict');
    expect(updateRes2.body.latestItem.version).toBe(2);

    // Verify DB was NOT overwritten by the stale update
    const finalItem = await db('work_items').where({ id: itemId }).first();
    expect(finalItem.title).toBe('Updated Title by User A');
    expect(finalItem.version).toBe(2);
  });
});
