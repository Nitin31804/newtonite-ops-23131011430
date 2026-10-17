import { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db, getDatabase } from '../config/database.js';
import { initSchema } from './schema.js';

export async function runSeed(database: Knex = db, options: { force?: boolean } = {}) {
  console.log('--- Initializing Database Schema ---');
  await initSchema(database);

  // Check if database is already populated
  const existingUsers = await database('users').count('* as count').first();
  const userCount = Number(existingUsers?.count || 0);

  if (userCount > 0 && !options.force && process.env.FORCE_RESEED !== 'true') {
    console.log(`Database already contains ${userCount} users. Skipping seed to preserve operational data.`);
    return;
  }

  console.log('--- Seeding Database ---');

  // Clear existing data in reverse order of foreign keys
  await database('comments').del();
  await database('activity_events').del();
  await database('outbox_jobs').del();
  await database('idempotency_keys').del();
  await database('work_items').del();
  await database('team_memberships').del();
  await database('teams').del();
  await database('users').del();

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Teams
  const teams = [
    { id: 'team-eng', name: 'Engineering & Platform', description: 'Core infrastructure, incident response, and software bugs.' },
    { id: 'team-pay', name: 'Finance & Payment Ops', description: 'High-risk payment investigations, chargebacks, and settlement discrepancies.' },
    { id: 'team-cmp', name: 'Legal & Compliance', description: 'Regulatory requests, AML checks, and audit investigations.' },
    { id: 'team-ops', name: 'Customer Operations', description: 'Tier-3 customer escalation and operational triage.' },
  ];
  await database('teams').insert(teams);

  // 2. Users
  const users = [
    { id: 'usr-admin', email: 'admin@newtonite.internal', name: 'Alex Vance (Global Admin)', password_hash: passwordHash },
    { id: 'usr-eng-lead', email: 'eng.lead@newtonite.internal', name: 'Sarah Connor (Eng Lead)', password_hash: passwordHash },
    { id: 'usr-eng-1', email: 'eng.member1@newtonite.internal', name: 'David Kim (Senior Eng)', password_hash: passwordHash },
    { id: 'usr-eng-2', email: 'eng.member2@newtonite.internal', name: 'Elena Rostova (DevOps)', password_hash: passwordHash },
    { id: 'usr-pay-lead', email: 'pay.lead@newtonite.internal', name: 'Marcus Sterling (Payments Lead)', password_hash: passwordHash },
    { id: 'usr-pay-1', email: 'pay.member@newtonite.internal', name: 'Chloe Dubois (Payment Analyst)', password_hash: passwordHash },
    { id: 'usr-cmp-lead', email: 'cmp.lead@newtonite.internal', name: 'Rachel Zane (Chief Compliance)', password_hash: passwordHash },
    { id: 'usr-cmp-1', email: 'cmp.member@newtonite.internal', name: 'Harvey Specter (Legal Counsel)', password_hash: passwordHash },
    { id: 'usr-ops-1', email: 'ops.member@newtonite.internal', name: 'Jordan Hayes (Ops Specialist)', password_hash: passwordHash },
    { id: 'usr-viewer', email: 'viewer@newtonite.internal', name: 'Taylor Reed (Auditor / Viewer)', password_hash: passwordHash },
  ];
  await database('users').insert(users);

  // 3. Team Memberships
  const memberships = [
    // Admin in all teams
    { id: uuidv4(), user_id: 'usr-admin', team_id: 'team-eng', role: 'ADMIN' },
    { id: uuidv4(), user_id: 'usr-admin', team_id: 'team-pay', role: 'ADMIN' },
    { id: uuidv4(), user_id: 'usr-admin', team_id: 'team-cmp', role: 'ADMIN' },
    { id: uuidv4(), user_id: 'usr-admin', team_id: 'team-ops', role: 'ADMIN' },

    // Engineering Team
    { id: uuidv4(), user_id: 'usr-eng-lead', team_id: 'team-eng', role: 'LEAD' },
    { id: uuidv4(), user_id: 'usr-eng-1', team_id: 'team-eng', role: 'MEMBER' },
    { id: uuidv4(), user_id: 'usr-eng-2', team_id: 'team-eng', role: 'MEMBER' },

    // Payments Team
    { id: uuidv4(), user_id: 'usr-pay-lead', team_id: 'team-pay', role: 'LEAD' },
    { id: uuidv4(), user_id: 'usr-pay-1', team_id: 'team-pay', role: 'MEMBER' },

    // Compliance Team
    { id: uuidv4(), user_id: 'usr-cmp-lead', team_id: 'team-cmp', role: 'LEAD' },
    { id: uuidv4(), user_id: 'usr-cmp-1', team_id: 'team-cmp', role: 'MEMBER' },

    // Operations Team
    { id: uuidv4(), user_id: 'usr-ops-1', team_id: 'team-ops', role: 'MEMBER' },

    // Auditor / Viewer
    { id: uuidv4(), user_id: 'usr-viewer', team_id: 'team-eng', role: 'VIEWER' },
    { id: uuidv4(), user_id: 'usr-viewer', team_id: 'team-pay', role: 'VIEWER' },
    { id: uuidv4(), user_id: 'usr-viewer', team_id: 'team-cmp', role: 'VIEWER' },
    { id: uuidv4(), user_id: 'usr-viewer', team_id: 'team-ops', role: 'VIEWER' },
  ];
  await database('team_memberships').insert(memberships);

  // 4. Sample Work Items across various states
  const workItems = [
    {
      id: 'wi-101',
      title: 'P0 Production Incident: Kafka consumer lag spike in payment events',
      description: 'Incoming payment events queue in Kafka is growing over 250k messages/min. Consumers encountering connection timeouts.',
      type: 'incident',
      priority: 'URGENT',
      status: 'OPEN',
      team_id: 'team-eng',
      assignee_id: null, // Unassigned urgent!
      created_by_id: 'usr-eng-lead',
      version: 1,
    },
    {
      id: 'wi-102',
      title: 'Duplicate charge detected for Enterprise client Acme Corp ($48,200)',
      description: 'Merchant reported double billing on invoice #INV-9812. Investigation required into settlement webhook re-delivery.',
      type: 'payment_investigation',
      priority: 'URGENT',
      status: 'IN_PROGRESS',
      team_id: 'team-pay',
      assignee_id: 'usr-pay-1',
      created_by_id: 'usr-pay-lead',
      version: 2,
    },
    {
      id: 'wi-103',
      title: 'GDPR Right to Be Forgotten request: EU Citizen #EU-88412',
      description: 'Customer requested complete scrubbing of personal identifiers and transaction logs across all secondary databases.',
      type: 'compliance',
      priority: 'HIGH',
      status: 'AWAITING_APPROVAL',
      team_id: 'team-cmp',
      assignee_id: 'usr-cmp-1',
      created_by_id: 'usr-cmp-1',
      version: 3,
    },
    {
      id: 'wi-104',
      title: 'Database connection pool saturation in auth-service',
      description: 'RDS PostgreSQL connections reaching 95% capacity during morning peak hours (09:00 - 11:00 UTC).',
      type: 'incident',
      priority: 'HIGH',
      status: 'OPEN',
      team_id: 'team-eng',
      assignee_id: null,
      created_by_id: 'usr-eng-1',
      version: 1,
    },
    {
      id: 'wi-105',
      title: 'Quarterly SOC2 Audit access review for production bastions',
      description: 'Verify all deactivated employee SSH keys and IAM access policies have been revoked.',
      type: 'compliance',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      team_id: 'team-cmp',
      assignee_id: 'usr-cmp-lead',
      created_by_id: 'usr-admin',
      version: 1,
    },
    {
      id: 'wi-106',
      title: 'High latency on batch payout exports to partner clearing house',
      description: 'Automated SFTP export taking > 45 minutes to upload end-of-day reconciliation CSVs.',
      type: 'payment_investigation',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      team_id: 'team-pay',
      assignee_id: 'usr-pay-1',
      created_by_id: 'usr-pay-lead',
      version: 4,
    },
    {
      id: 'wi-107',
      title: 'Customer account locked after repeated false positive MFA triggers',
      description: 'VIP client VIP-1029 cannot access portal due to rate-limit lock on authenticator app.',
      type: 'customer_issue',
      priority: 'URGENT',
      status: 'AWAITING_APPROVAL',
      team_id: 'team-ops',
      assignee_id: 'usr-ops-1',
      created_by_id: 'usr-ops-1',
      version: 2,
    },
  ];
  await database('work_items').insert(workItems);

  // 5. Activity Events (Audit trail)
  const activityEvents = [
    {
      id: uuidv4(),
      work_item_id: 'wi-101',
      actor_id: 'usr-eng-lead',
      event_type: 'CREATED',
      details: JSON.stringify({ note: 'Item created from automated alert' }),
    },
    {
      id: uuidv4(),
      work_item_id: 'wi-102',
      actor_id: 'usr-pay-lead',
      event_type: 'CREATED',
      details: JSON.stringify({ priority: 'URGENT' }),
    },
    {
      id: uuidv4(),
      work_item_id: 'wi-102',
      actor_id: 'usr-pay-1',
      event_type: 'CLAIMED',
      details: JSON.stringify({ assignee: 'usr-pay-1' }),
    },
    {
      id: uuidv4(),
      work_item_id: 'wi-103',
      actor_id: 'usr-cmp-1',
      event_type: 'STATUS_CHANGED',
      details: JSON.stringify({ from: 'IN_PROGRESS', to: 'AWAITING_APPROVAL', reason: 'Ready for Lead sign-off' }),
    },
  ];
  await database('activity_events').insert(activityEvents);

  // 6. Comments
  const comments = [
    {
      id: uuidv4(),
      work_item_id: 'wi-102',
      author_id: 'usr-pay-1',
      content: 'I have contacted the acquiring bank. The second authorization was a network retry that did not reconcile.',
    },
    {
      id: uuidv4(),
      work_item_id: 'wi-103',
      author_id: 'usr-cmp-1',
      content: 'All data deletion scripts prepared and verified against backup policies. Awaiting Lead sign-off.',
    },
  ];
  await database('comments').insert(comments);

  console.log(`Successfully seeded:
  - ${teams.length} Teams
  - ${users.length} Users with RBAC permissions
  - ${memberships.length} Team Memberships
  - ${workItems.length} Operational Work Items
  - Audit Events & Initial Comments`);
}

// Run directly if called from CLI
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const force = process.argv.includes('--force');
  runSeed(db, { force })
    .then(() => {
      console.log('Seed completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
