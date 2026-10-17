import { Knex } from 'knex';
import { db } from '../config/database.js';

export interface DispatchedNotification {
  id: string;
  channel: 'EMAIL' | 'SLACK_WEBHOOK' | 'PUSH';
  recipient: string;
  title: string;
  body: string;
  timestamp: string;
}

export const dispatchedNotificationsLog: DispatchedNotification[] = [];

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

    // 1. Crash recovery: Reclaim zombie jobs stuck in PROCESSING for >2 minutes
    const zombieThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await this.database('outbox_jobs')
      .where('status', 'PROCESSING')
      .where('updated_at', '<=', zombieThreshold)
      .update({
        status: 'PENDING',
        last_error: 'Reclaimed from zombie PROCESSING state after worker crash or timeout.',
        updated_at: nowIso,
      });

    // 2. Crash recovery: Reclaim zombie in-flight idempotency keys abandoned by crashed server processes
    // A key is an abandoned zombie ONLY if status_code === 0 AND its distributed heartbeat lease (locked_until) has expired.
    // Active requests continuously refresh locked_until in the DB, protecting them across multiple processes and client drops.
    await this.database('idempotency_keys')
      .where('status_code', 0)
      .where(function () {
        this.where('locked_until', '<=', nowIso)
          .orWhere(function () {
            this.whereNull('locked_until').andWhere('created_at', '<=', new Date(Date.now() - 5 * 60 * 1000).toISOString());
          });
      })
      .del()
      .catch(() => {});

    // 3. Find pending jobs scheduled for execution
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
        await this.handleJobEvent(job.id, job.event_type, payload);

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
   * Idempotent business handlers for outbox events.
   * Dispatches to persistent database audit log and optional external webhooks.
   */
  private async handleJobEvent(jobId: string, eventType: string, payload: any): Promise<void> {
    const timestamp = new Date().toISOString();
    // Deterministic notification ID based strictly on outbox jobId so retries can be deduplicated by downstream receivers
    const notifId = `notif-${jobId}`;
    let notification: DispatchedNotification | null = null;

    switch (eventType) {
      case 'WORK_ITEM_CREATED': {
        notification = {
          id: notifId,
          channel: 'SLACK_WEBHOOK',
          recipient: `#team-${payload.teamId || 'ops'}`,
          title: `[NEW ${payload.priority || 'NORMAL'}] Incident Created`,
          body: `Work item '${payload.itemId}' created for team ${payload.teamId}.`,
          timestamp,
        };
        break;
      }

      case 'WORK_ITEM_ASSIGNED': {
        notification = {
          id: notifId,
          channel: 'EMAIL',
          recipient: payload.assigneeId || 'assigned-engineer',
          title: 'Work Item Assigned',
          body: `You have been assigned to work item ${payload.itemId}.`,
          timestamp,
        };
        break;
      }

      case 'APPROVAL_REQUIRED': {
        notification = {
          id: notifId,
          channel: 'SLACK_WEBHOOK',
          recipient: '#team-leads',
          title: '🚨 Approval Required: Work Item Waiting for Lead Sign-off',
          body: `Item ${payload.itemId} transitioned to AWAITING_APPROVAL. Rationale: ${payload.reason || 'None provided'}`,
          timestamp,
        };
        break;
      }

      case 'ITEM_RESOLVED': {
        notification = {
          id: notifId,
          channel: 'SLACK_WEBHOOK',
          recipient: '#ops-resolved',
          title: '✅ Work Item Resolved',
          body: `Item ${payload.itemId} was resolved. Rationale: ${payload.reason || 'Completed'}`,
          timestamp,
        };
        break;
      }

      case 'STATUS_CHANGED': {
        notification = {
          id: notifId,
          channel: 'PUSH',
          recipient: payload.itemId,
          title: `Status Changed: ${payload.from} -> ${payload.to}`,
          body: `Item ${payload.itemId} updated to status ${payload.to}. Reason: ${payload.reason || 'N/A'}`,
          timestamp,
        };
        break;
      }

      case 'TEST_FAILURE_TRIGGER':
        // Used in unit tests to simulate worker retry and failure
        throw new Error('Simulated worker processing failure for retry testing.');

      default:
        console.log(`[OUTBOX] Unhandled event type: ${eventType}`);
        break;
    }

    if (notification) {
      // 1. Pre-dispatch idempotency check: Check if this outbox job notification was ALREADY delivered
      // Prevents duplicate webhook dispatch if worker crashed after dispatch but before updating outbox_jobs to COMPLETED
      const existingDelivery = await this.database('outbox_deliveries')
        .where({ id: notification.id, status: 'DELIVERED' })
        .first();

      if (existingDelivery) {
        console.log(`[OUTBOX] Webhook ${notification.id} for job ${jobId} already confirmed DELIVERED. Skipping duplicate external HTTP call.`);
        return;
      }

      // 2. External Webhook dispatch if configured via environment
      // Must be verified BEFORE recording delivery; failures must bubble up for retry
      const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification),
          signal: AbortSignal.timeout(10000), // 10s fetch timeout to prevent worker loop hangs
        });

        if (!response.ok) {
          throw new Error(`External webhook dispatch to ${webhookUrl} failed with HTTP ${response.status}: ${response.statusText}`);
        }
      }

      // 3. Persist delivery audit record into database table only AFTER delivery succeeds
      // Guard against duplicate primary key in case of retry
      const alreadyLogged = await this.database('outbox_deliveries').where({ id: notification.id }).first();
      if (!alreadyLogged) {
        await this.database('outbox_deliveries').insert({
          id: notification.id,
          job_id: jobId,
          event_type: eventType,
          channel: notification.channel,
          recipient: notification.recipient,
          payload: JSON.stringify(notification),
          status: 'DELIVERED',
          delivered_at: timestamp,
        });
      }

      dispatchedNotificationsLog.push(notification);
      console.log(`[OUTBOX NOTIFICATION DELIVERED] ${notification.channel} -> ${notification.recipient}: ${notification.title}`);
    }
  }

  /**
   * Housekeeping: Purge stale idempotency keys (> 24 hours) and completed jobs (> 7 days)
   */
  async purgeStaleData(): Promise<{ purgedKeys: number; purgedJobs: number }> {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const purgedKeys = await this.database('idempotency_keys')
      .where('created_at', '<', cutoff24h)
      .del();

    const purgedJobs = await this.database('outbox_jobs')
      .where('status', 'COMPLETED')
      .where('created_at', '<', cutoff7d)
      .del();

    return { purgedKeys, purgedJobs };
  }

  start(intervalMs = 3000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run housekeeping cleanup on startup
    this.purgeStaleData().catch((err) => console.error('Initial purge error:', err));

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
