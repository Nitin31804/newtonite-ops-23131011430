import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/config/database.js';
import { runSeed } from '../src/db/seed.js';
import { itemService } from '../src/services/itemService.js';
import { OutboxWorker } from '../src/workers/outboxWorker.js';

describe('Critical Behavior: Reliable Asynchronous Processing (Transactional Outbox)', () => {
  beforeEach(async () => {
    await runSeed(db, { force: true });
  });

  it('Scenario 6a: State transition creates outbox notification job atomically in same transaction', async () => {
    const worker = new OutboxWorker(db);
    const itemId = 'wi-101'; // OPEN in team-eng

    // Transition from OPEN -> IN_PROGRESS
    await itemService.transitionStatus(itemId, 'usr-eng-1', 'MEMBER', 'IN_PROGRESS');

    // Verify outbox job was created
    const job = await db('outbox_jobs')
      .where('payload', 'like', `%${itemId}%`)
      .orderBy('created_at', 'desc')
      .first();

    expect(job).toBeTruthy();
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(0);

    // Run a worker batch to process it
    const batchResult = await worker.processBatch(10);
    expect(batchResult.succeeded).toBeGreaterThanOrEqual(1);

    // Verify job is now marked COMPLETED
    const updatedJob = await db('outbox_jobs').where({ id: job.id }).first();
    expect(updatedJob.status).toBe('COMPLETED');
  });

  it('Scenario 6b: Failing outbox jobs retry with backoff and mark FAILED on max_attempts', async () => {
    const worker = new OutboxWorker(db);
    const jobId = uuidv4();

    // Insert a job that triggers a failure
    await db('outbox_jobs').insert({
      id: jobId,
      event_type: 'TEST_FAILURE_TRIGGER',
      payload: JSON.stringify({ test: true }),
      status: 'PENDING',
      attempts: 0,
      max_attempts: 2,
      next_run_at: new Date(Date.now() - 1000), // Ready to run
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Attempt 1: Should fail and increment attempts to 1, status remains PENDING
    const batch1 = await worker.processBatch(10);
    expect(batch1.failed).toBe(1);

    let jobState = await db('outbox_jobs').where({ id: jobId }).first();
    expect(jobState.status).toBe('PENDING');
    expect(jobState.attempts).toBe(1);
    expect(jobState.last_error).toContain('Simulated worker processing failure');

    // Force next_run_at to past so it can run again
    await db('outbox_jobs').where({ id: jobId }).update({ next_run_at: new Date(Date.now() - 1000) });

    // Attempt 2: Reaches max_attempts (2) -> Should be marked FAILED
    const batch2 = await worker.processBatch(10);
    expect(batch2.failed).toBe(1);

    jobState = await db('outbox_jobs').where({ id: jobId }).first();
    expect(jobState.status).toBe('FAILED');
    expect(jobState.attempts).toBe(2);
  });
});
