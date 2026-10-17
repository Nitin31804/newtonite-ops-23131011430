import { Knex } from 'knex';
import { db } from '../config/database.js';

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export class OutboxWorker {
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private database: Knex;

  constructor(database: Knex = db) {
    this.database = database;
  }

  /**
   * Process a single batch of pending outbox jobs.
   * Can be invoked directly by tests or by the background interval.
   */
  async processBatch(batchSize = 10): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, succeeded: 0, failed: 0 };
    const nowIso = new Date().toISOString();

    // Find pending jobs scheduled for execution
    const jobs = await this.database('outbox_jobs')
      .where('status', 'PENDING')
      .where('next_run_at', '<=', nowIso)
      .orderBy('created_at', 'asc')
      .limit(batchSize);

    for (const job of jobs) {
      result.processed++;

      // Optimistic claim on job: set status to PROCESSING
      const rowsClaimed = await this.database('outbox_jobs')
        .where({ id: job.id, status: 'PENDING' })
        .update({
          status: 'PROCESSING',
          attempts: job.attempts + 1,
          updated_at: new Date().toISOString(),
        });

      if (rowsClaimed === 0) {
        // Another worker claimed this job
        continue;
      }

      try {
        const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
        await this.handleJobEvent(job.event_type, payload);

        // Mark COMPLETED
        await this.database('outbox_jobs')
          .where({ id: job.id })
          .update({
            status: 'COMPLETED',
            updated_at: new Date().toISOString(),
          });
        result.succeeded++;
      } catch (err: any) {
        result.failed++;
        const nextAttempts = job.attempts + 1;
        const isMaxReached = nextAttempts >= job.max_attempts;

        // Exponential backoff: 2^attempts * 5 seconds
        const backoffSeconds = Math.pow(2, nextAttempts) * 5;
        const nextRun = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await this.database('outbox_jobs')
          .where({ id: job.id })
          .update({
            status: isMaxReached ? 'FAILED' : 'PENDING',
            last_error: err?.message || 'Unknown processing error',
            next_run_at: isMaxReached ? job.next_run_at : nextRun,
            updated_at: new Date().toISOString(),
          });
      }
    }

    return result;
  }

  /**
   * Idempotent business handlers for outbox events
   */
  private async handleJobEvent(eventType: string, payload: any): Promise<void> {
    switch (eventType) {
      case 'WORK_ITEM_ASSIGNED':
        // e.g. send email or push notification to assignee
        // Handler is idempotent: re-delivery doesn't cause harm
        break;

      case 'APPROVAL_REQUIRED':
        // e.g. notify all team leads of pending review
        break;

      case 'ITEM_RESOLVED':
        // e.g. notify reporter that work is completed
        break;

      case 'TEST_FAILURE_TRIGGER':
        // Used in unit tests to simulate worker retry and failure
        throw new Error('Simulated worker processing failure for retry testing.');

      default:
        break;
    }
  }

  start(intervalMs = 3000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalTimer = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (err) {
        console.error('OutboxWorker batch error:', err);
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
  }
}

export const outboxWorker = new OutboxWorker();
