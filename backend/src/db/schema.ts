import { Knex } from 'knex';

export async function initSchema(db: Knex): Promise<void> {
  // 1. Teams table
  if (!(await db.schema.hasTable('teams'))) {
    await db.schema.createTable('teams', (table) => {
      table.string('id').primary();
      table.string('name').notNullable().unique();
      table.text('description').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  // 2. Users table
  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', (table) => {
      table.string('id').primary();
      table.string('email').notNullable().unique();
      table.string('name').notNullable();
      table.string('password_hash').notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('token_version').notNullable().defaultTo(1);
      table.timestamp('deactivated_at').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
  } else {
    if (!(await db.schema.hasColumn('users', 'is_active'))) {
      await db.schema.alterTable('users', (table) => {
        table.boolean('is_active').notNullable().defaultTo(true);
      });
    }
    if (!(await db.schema.hasColumn('users', 'token_version'))) {
      await db.schema.alterTable('users', (table) => {
        table.integer('token_version').notNullable().defaultTo(1);
      });
    }
    if (!(await db.schema.hasColumn('users', 'deactivated_at'))) {
      await db.schema.alterTable('users', (table) => {
        table.timestamp('deactivated_at').nullable();
      });
    }
  }

  // 3. Team Memberships table
  if (!(await db.schema.hasTable('team_memberships'))) {
    await db.schema.createTable('team_memberships', (table) => {
      table.string('id').primary();
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('team_id').notNullable().references('id').inTable('teams').onDelete('CASCADE');
      table.string('role').notNullable(); // 'ADMIN', 'LEAD', 'MEMBER', 'VIEWER'
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.unique(['user_id', 'team_id']);
      table.index(['user_id']);
      table.index(['team_id']);
    });
  }

  // 4. Work Items table
  if (!(await db.schema.hasTable('work_items'))) {
    await db.schema.createTable('work_items', (table) => {
      table.string('id').primary();
      table.string('title').notNullable();
      table.text('description').notNullable();
      table.string('type').notNullable(); // 'incident', 'customer_issue', 'payment_investigation', 'compliance', 'operational_task'
      table.string('priority').notNullable(); // 'LOW', 'MEDIUM', 'HIGH', 'URGENT'
      table.string('status').notNullable(); // 'OPEN', 'IN_PROGRESS', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED'
      table.string('team_id').notNullable().references('id').inTable('teams').onDelete('RESTRICT');
      table.string('assignee_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('created_by_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
      table.integer('version').notNullable().defaultTo(1); // Optimistic locking version
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());

      // Performance indexes for scale
      table.index(['team_id', 'status']);
      table.index(['assignee_id']);
      table.index(['status']);
      table.index(['priority']);
      table.index(['created_at']);
    });
  }

  // 5. Activity Events table (Append-only immutable audit trail)
  if (!(await db.schema.hasTable('activity_events'))) {
    await db.schema.createTable('activity_events', (table) => {
      table.string('id').primary();
      table.string('work_item_id').notNullable().references('id').inTable('work_items').onDelete('CASCADE');
      table.string('actor_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
      table.string('event_type').notNullable(); // 'CREATED', 'CLAIMED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'COMMENT_ADDED', 'UPDATED'
      table.text('details').notNullable(); // JSON string
      table.timestamp('created_at').defaultTo(db.fn.now());

      table.index(['work_item_id', 'created_at']);
    });
  }

  // 6. Comments table
  if (!(await db.schema.hasTable('comments'))) {
    await db.schema.createTable('comments', (table) => {
      table.string('id').primary();
      table.string('work_item_id').notNullable().references('id').inTable('work_items').onDelete('CASCADE');
      table.string('author_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
      table.text('content').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());

      table.index(['work_item_id']);
    });
  }

  // 7. Idempotency Keys table (Prevents duplicate requests from double-clicks/network retries)
  if (!(await db.schema.hasTable('idempotency_keys'))) {
    await db.schema.createTable('idempotency_keys', (table) => {
      table.string('key').primary();
      table.string('user_id').notNullable();
      table.string('endpoint').notNullable();
      table.text('request_payload').nullable();
      table.integer('status_code').notNullable();
      table.text('response_body').notNullable(); // JSON string
      table.timestamp('locked_until').nullable(); // Distributed heartbeat lease expiration
      table.timestamp('created_at').defaultTo(db.fn.now());

      table.index(['created_at']);
      table.index(['status_code', 'locked_until']);
    });
  } else {
    if (!(await db.schema.hasColumn('idempotency_keys', 'request_payload'))) {
      await db.schema.alterTable('idempotency_keys', (table) => {
        table.text('request_payload').nullable();
      });
    }
    if (!(await db.schema.hasColumn('idempotency_keys', 'locked_until'))) {
      await db.schema.alterTable('idempotency_keys', (table) => {
        table.timestamp('locked_until').nullable();
      });
    }
  }

  // 8. Outbox Jobs table (Transactional Outbox for reliable background processing)
  if (!(await db.schema.hasTable('outbox_jobs'))) {
    await db.schema.createTable('outbox_jobs', (table) => {
      table.string('id').primary();
      table.string('event_type').notNullable(); // e.g. 'WORK_ITEM_ASSIGNED', 'APPROVAL_REQUIRED'
      table.text('payload').notNullable(); // JSON string
      table.string('status').notNullable().defaultTo('PENDING'); // 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
      table.integer('attempts').notNullable().defaultTo(0);
      table.integer('max_attempts').notNullable().defaultTo(5);
      table.text('last_error').nullable();
      table.timestamp('next_run_at').defaultTo(db.fn.now());
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());

      table.index(['status', 'next_run_at']);
    });
  }

  // 9. Outbox Deliveries table (Persistent operational log of dispatched notifications)
  if (!(await db.schema.hasTable('outbox_deliveries'))) {
    await db.schema.createTable('outbox_deliveries', (table) => {
      table.string('id').primary();
      table.string('job_id').notNullable();
      table.string('event_type').notNullable();
      table.string('channel').notNullable();
      table.string('recipient').notNullable();
      table.text('payload').notNullable();
      table.string('status').notNullable().defaultTo('DELIVERED');
      table.timestamp('delivered_at').defaultTo(db.fn.now());

      table.index(['job_id', 'event_type']);
      table.index(['delivered_at']);
    });
  }

  // 10. System Metadata table (Tracks system initialization, migrations, and atomic seed completion)
  if (!(await db.schema.hasTable('system_metadata'))) {
    await db.schema.createTable('system_metadata', (table) => {
      table.string('key').primary();
      table.text('value').notNullable();
      table.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }
}
