import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';

describe('Critical Behavior: Request Idempotency & Retry Safety', () => {
  beforeEach(async () => {
    await runSeed(db);
  });

  it('Scenario 3: Repeated POST request with identical Idempotency-Key returns cached response without duplicate DB insert', async () => {
    const userId = 'usr-eng-1';
    const idempotencyKey = 'idem-req-key-9999';
    const payload = {
      title: 'Idempotent Payment Webhook Bug Investigation',
      description: 'Webhook listener dropped signature header causing retry storm.',
      type: 'incident',
      priority: 'HIGH',
      team_id: 'team-eng',
    };

    // First request
    const firstRes = await request(app)
      .post('/api/items')
      .set('x-user-id', userId)
      .set('idempotency-key', idempotencyKey)
      .send(payload);

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.id).toBeTruthy();
    const createdItemId = firstRes.body.id;

    // Small delay to ensure DB write of idempotency key completes
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Second repeated request (e.g. network retry or double-click by user)
    const secondRes = await request(app)
      .post('/api/items')
      .set('x-user-id', userId)
      .set('idempotency-key', idempotencyKey)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.headers['x-idempotency-hit']).toBe('true');
    expect(secondRes.body.id).toBe(createdItemId);

    // Verify DB contains ONLY 1 record
    const matches = await db('work_items').where({ title: payload.title });
    expect(matches.length).toBe(1);

    // Verify idempotency record exists
    const keyRecord = await db('idempotency_keys').where({ key: idempotencyKey }).first();
    expect(keyRecord).toBeTruthy();
    expect(keyRecord.status_code).toBe(201);
  });
});
