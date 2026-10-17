# Engineering Decisions & Architectural Trade-offs

When designing this system for Newtonite, my main priority was **predictable behavior under pressure**. In operational environments, when things go wrong, they tend to go wrong concurrently. 

Below are the five key decisions I made, the alternatives I considered, and the trade-offs I knowingly accepted.

---

## 1. Concurrency Control: Optimistic Locking + Conditional SQL Claims

### The Problem
During an incident, two engineers often view the same ticket. If both try to claim it, or both try to edit it at the same time, naive CRUD apps either double-assign the work or allow the slower user to blindly overwrite the faster user's changes.

### Options I Considered
1. **Pessimistic Row Locking (`SELECT ... FOR UPDATE`):**
   - *Why I avoided it:* Holding an exclusive database lock while a human is typing an edit in their browser is dangerous. If their laptop sleeps, the network drops, or they step away for coffee, the database connection pool exhausts and everyone else gets blocked.
2. **Distributed Redis Locks (Redlock):**
   - *Why I avoided it:* Adds unnecessary operational complexity, another infrastructure piece to monitor, and tricky lock-expiry corner cases during GC pauses or network partitions.
3. **Optimistic Versioning + Conditional Atomic Writes:**
   - *My choice:* Keep locking strictly inside the relational database engine using standard SQL.

### What I Implemented
- **Atomic Claiming:** 
  ```sql
  UPDATE work_items 
  SET assignee_id = :userId, status = 'IN_PROGRESS', version = version + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = :itemId AND assignee_id IS NULL;
  ```
  If zero rows are updated, someone else got there first. The backend immediately returns `409 Conflict: "Item already claimed by another team member"`.
- **Optimistic Versioning on Edits:** Every update requires `WHERE id = :id AND version = :expectedVersion`. If the version doesn't match, the update is rejected with `409 Conflict`, and the server returns the fresh record so the frontend can reload without data loss.

### Trade-off
- **The cost:** The frontend has to be smart enough to handle 409 responses and prompt the user to refresh.
- **The gain:** Deadlock-free, zero lock starvation, and high database throughput under heavy load.

---

## 2. Audit Trail: In-Transaction Append-Only Event Log

### The Problem
In financial investigations and compliance audits, management needs an unalterable history of who changed what, why an approval was given, and when an incident was resolved. If the audit log can ever disagree with the current ticket state, the platform cannot be trusted.

### Options I Considered
1. **Asynchronous Audit Logging via Message Queue (Kafka/RabbitMQ):**
   - *Why I avoided it:* Introduces the classic dual-write failure mode. If the queue publish fails after the database commits, the audit record is lost permanently.
2. **Change-Data-Capture (CDC / Debezium):**
   - *Why I avoided it:* Powerful, but way too heavy for an assessment project; adds infrastructure overhead and doesn't capture user intent/rationale easily.
3. **In-Transaction `activity_events` Table:**
   - *My choice:* Write the audit record inside the exact same database transaction as the update.

### What I Implemented
Every state change, claim, edit, or comment writes to `activity_events` inside a single ACID transaction:
```typescript
await db.transaction(async (trx) => {
  await trx('work_items').where({ id }).update(...);
  await trx('activity_events').insert({
    work_item_id: id,
    actor_id: userId,
    event_type: 'STATUS_CHANGED',
    details: JSON.stringify({ from: oldStatus, to: newStatus, reason })
  });
});
```

### Trade-off
- **The cost:** Slightly higher write latency because each action requires two database writes instead of one.
- **The gain:** Absolute audit integrity. A ticket status cannot change without an audit record, and an audit record cannot exist without the status change.

---

## 3. Network Resilience: 2-Phase Idempotency

### The Problem
When operators work under stress or with poor connectivity, they frequently double-click buttons or retry requests after a timeout. Naive APIs end up inserting two duplicate production incident tickets or double-processing disputes.

### Options I Considered
1. **Frontend Button Disabling / Debouncing:**
   - *Why it's insufficient:* It only stops polite browser double-clicks. It does nothing against network retries, browser tab reloads, or proxy retries.
2. **Database-Backed Idempotency Middleware (`idempotency_keys` Table):**
   - *My choice:* Two-phase reservation directly in SQL.

### What I Implemented
1. **Phase 1 (Reservation):** On request arrival, the server inserts the key with `status_code = 0` (in-flight marker). If two requests hit the API within 2 milliseconds, the database unique constraint blocks the second one immediately.
2. **Phase 2 (Cache):** When the handler finishes, the status code and JSON response are saved against the key. Retried requests return the cached response without running business logic again.

### Trade-off
- **The cost:** Minimal storage overhead to store recent request keys and responses (which can be TTL-purged after 24 hours).
- **The gain:** Total safety against network retries and duplicate operations.

---

## 4. Authorization: Scoped RBAC per Team and Resource

### The Problem
A user might be an Engineering Lead with approval rights, but they should not be approving Legal GDPR deletions or viewing confidential Payment dispute records.

### Options I Considered
1. **Global Role (Admin / User / Viewer):**
   - *Why I rejected it:* Too coarse-grained. Real companies have multiple teams where a user has different responsibilities in different contexts.
2. **Per-Team Scoped Roles (`team_memberships`):**
   - *My choice:* A user belongs to one or more teams with a specific role in each (`VIEWER`, `MEMBER`, `LEAD`), plus a global `ADMIN` role.

### What I Implemented
- Authorization is evaluated on the server inside route middleware, never relying on hidden frontend buttons.
- Any mutation checks:
  1. Does the user belong to the item's team?
  2. Does their role in that team allow this action (e.g., only `LEAD` can approve `AWAITING_APPROVAL ➔ RESOLVED`)?
  3. If assigned, is the caller the assignee (or a Lead)?

### Trade-off
- **The cost:** Slightly more complex middleware and extra join queries on authentication.
- **The gain:** Clean separation of concerns and zero risk of cross-team privilege escalation.

---

## 5. Async Processing: Transactional Outbox Pattern

### The Problem
When a high-priority incident is created or resolved, secondary actions need to happen: notifying team channels, dispatching webhooks, or logging to monitoring tools.
- Calling external webhooks inside the database transaction slows down the DB and fails the whole transaction if Slack is slow.
- Calling external webhooks after the transaction risks losing the notification if the Node.js server restarts right after committing.

### Options I Considered
1. **Synchronous Inline Calls:**
   - *Why I avoided it:* Fragile and tightly couples our API latency to third-party availability.
2. **Transactional Outbox Table + Background Poller:**
   - *My choice:* Write the job row into `outbox_jobs` in the same transaction as the ticket update, and process it asynchronously.

### What I Implemented
- The status update and the notification job are committed together atomically.
- A lightweight background worker polls `outbox_jobs` every 3 seconds, dispatches the event, and uses exponential backoff (1s, 2s, 4s, 8s) with a 5-attempt cap.
- The worker claims jobs using atomic status updates to prevent duplicate execution across multiple backend replicas.

### Trade-off
- **The cost:** Notifications are eventually consistent (delayed by up to ~1-3 seconds).
- **The gain:** The core API responds in milliseconds, database transactions are short, and no notification is ever lost if an external service is temporarily down.

---

## Summary of Known Limitations & What I'd Build Next
- **Search:** Currently uses SQL `LIKE`. For millions of items, I'd migrate to PostgreSQL `tsvector` with GIN indexing.
- **Table Partitioning:** The append-only `activity_events` table will grow indefinitely; range-partitioning by month (`created_at`) would keep query latency constant.
- **Real-Time Collaboration:** Adding Server-Sent Events (SSE) would alert users in real time when someone else opens or claims an item they are looking at.
