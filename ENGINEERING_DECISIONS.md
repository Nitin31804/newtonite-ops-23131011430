# Engineering Decisions & Architectural Trade-offs

This document details five fundamental architectural decisions made in designing and implementing the **Newtonite Operations Platform** ("Operations Under Pressure"). For each decision, we provide the business and operational context, the alternative options considered, the chosen solution, and the explicit trade-offs accepted.

---

## 1. Concurrency Control: Optimistic Locking with Atomic Conditional Claims

### Context
In high-throughput operational environments, multiple agents or engineers often view and interact with the same critical work items simultaneously. Two specific failure modes emerge:
1. **Double Claiming Race Condition:** Two engineers simultaneously click "Claim" on an unassigned urgent incident.
2. **Stale Overwrite / Lost Update:** Engineer A begins modifying an item based on outdated information while Engineer B has already resolved or escalated it.

### Options Considered
1. **Pessimistic Row Locking (`SELECT ... FOR UPDATE`):**
   * *Pros:* Holds an exclusive database lock across the duration of user reading and drafting edits.
   * *Cons:* Causes dangerous connection pool exhaustion, latency spikes, and deadlocks if a user takes minutes to complete a form or disconnects unexpectedly.
2. **Last-Write-Wins (Uncontrolled CRUD):**
   * *Pros:* Easiest to implement.
   * *Cons:* Silent data loss and complete operational chaos—explicitly rejected by the brief.
3. **Optimistic Locking with Version Number + Atomic Conditional SQL Updates:**
   * *Pros:* Non-blocking, highly performant, scalable across thousands of concurrent users, zero risk of lock starvation.
   * *Cons:* Requires clients to handle retry/reload loops when a conflict (HTTP 409) occurs.

### Chosen Solution
* **Atomic Claiming:** Executed via a single atomic conditional SQL statement:
  ```sql
  UPDATE work_items 
  SET assignee_id = :userId, status = 'IN_PROGRESS', version = version + 1, updated_at = NOW() 
  WHERE id = :itemId AND assignee_id IS NULL;
  ```
  If zero rows are updated, the database transaction detects the race condition and returns HTTP `409 Conflict` with the current owner's details.
* **Optimistic Versioning on Mutations:** All mutable updates supply the item's expected `version`. The update is conditioned on `WHERE id = :id AND version = :expectedVersion`. If mismatched, it rejects the mutation with HTTP `409 Conflict` and returns the latest server state, prompting the frontend to reload without overwriting changes.

### Trade-offs
* **Accepted Cost:** Increased frontend responsibility to gracefully handle 409 errors (via conflict banners and automatic state rollback). Under extreme write contention on a single item, some users will experience retries.
* **Gained Benefit:** Completely deadlock-free database operation, maximum query throughput, and guaranteed data consistency under heavy concurrency.

---

## 2. Audit Trail: Transactional Append-Only Event Log

### Context
Operational incidents, payment disputes, and compliance inquiries require an unalterable history of who changed what, why an approval was given, and when status transitions occurred. In legacy systems, activity history often drifts out of sync with actual database records due to partial network failures.

### Options Considered
1. **Asynchronous Audit Logging via Message Queue:**
   * *Pros:* Zero latency overhead on the primary write path.
   * *Cons:* Dual-write problem: if the queue publish fails after the DB commit, or if the queue is delayed, the audit trail falls out of sync or permanently drops critical regulatory actions.
2. **Database Change-Data-Capture (CDC / Debezium):**
   * *Pros:* Decoupled from application logic.
   * *Cons:* Operational complexity overhead, infrastructure bloat, difficult to capture user intention/reasons.
3. **In-Transaction Append-Only `activity_events` Table:**
   * *Pros:* Atomically guaranteed via ACID transaction boundaries. The item update and the audit log record either succeed together or fail together.
   * *Cons:* Slight additional latency per write operation due to the secondary insert.

### Chosen Solution
All state transitions, claims, edits, and comments are persisted into an append-only `activity_events` table inside the **exact same database transaction** as the primary `work_items` mutation. If any error occurs, the entire transaction rolls back.

### Trade-offs
* **Accepted Cost:** Write latency increases by a few milliseconds to write to two indexed tables instead of one. The `activity_events` table will grow rapidly over time.
* **Gained Benefit:** Absolute audit integrity. The audit log can never disagree with the current state of a work item, satisfying SOC2/GDPR compliance standards. At scale, table partitioning on `created_at` or archiving strategies can easily manage storage.

---

## 3. Network Resilience: Request Idempotency via `Idempotency-Key`

### Context
Network jitter, client timeouts, or users double-clicking submit buttons during urgent operations can trigger duplicate POST requests, risking duplicate investigations, double payouts, or duplicate escalation tickets.

### Options Considered
1. **Frontend Button Debouncing / Disabling:**
   * *Pros:* Easy to implement.
   * *Cons:* Only defends against happy-path client browser clicks; completely ineffective against network packet retries, proxy retransmissions, or multi-tab usage.
2. **Distributed Redis Deduplication Cache:**
   * *Pros:* High throughput.
   * *Cons:* Adds an external infrastructure dependency; cache eviction could allow duplicate requests if retried after Redis TTL.
3. **Database-Backed Idempotency Middleware (`idempotency_keys` Table):**
   * *Pros:* Durable, persistent across restarts, transactional, zero extra infrastructure.
   * *Cons:* Storage overhead for request/response bodies.

### Chosen Solution
Mutating endpoints (`POST /api/items`, state transitions) accept an `Idempotency-Key` HTTP header (automatically generated by clients per action). The server checks the `idempotency_keys` table:
* If the key exists for the user, the server intercepts execution and immediately returns the cached status code and response payload with header `X-Idempotency-Hit: true`.
* If new, the request is executed, and the resulting response is persisted atomically for future replays.

### Trade-offs
* **Accepted Cost:** Minor DB storage overhead for cached payloads.
* **Gained Benefit:** Safe retries across unreliable networks without risking phantom ticket creation or duplicate operations.

---

## 4. Authorization & Workflow Governance: Server-Side Enforced RBAC with Lead Approval Gate

### Context
Newtonite consists of multiple teams (Engineering, Finance & Payments, Legal & Compliance, Customer Operations) where members possess distinct responsibilities (Viewer, Member, Lead, Admin). Critical compliance and financial investigations must not be closed or resolved by unverified members without team lead review.

### Options Considered
1. **Client-Side Permission Gating:**
   * *Pros:* Fast UI rendering.
   * *Cons:* Fatal security flaw—anyone with Postman or `curl` can bypass client UI checks and approve tickets.
2. **Centralized Attribute-Based Access Control (ABAC) Engine:**
   * *Pros:* Maximum enterprise flexibility.
   * *Cons:* Extreme complexity and unnecessary latency for a focused operational workflow.
3. **Role-Based Access Control (RBAC) Scoped per Team at API Boundary with State Machine Guards:**
   * *Pros:* Enforced strictly on every API endpoint, isolated per team, explicit state machine transitions.
   * *Cons:* Requires verifying user team memberships on every incoming request.

### Chosen Solution
* Authorization is evaluated exclusively on the server in `src/middleware/auth.ts`.
* Team membership is verified on every resource access: users outside the team receive `403 Forbidden` (unless they hold the global `ADMIN` role).
* **Strict State Machine:** Transitions are governed by `validateTransition()`. While `MEMBER` can move items from `OPEN` to `IN_PROGRESS` and `AWAITING_APPROVAL`, only a `LEAD` of that specific team (or an `ADMIN`) can transition an item from `AWAITING_APPROVAL` to `RESOLVED`. Direct status skips (e.g. `OPEN` $\rightarrow$ `CLOSED`) are rejected with `400 Bad Request`.

### Trade-offs
* **Accepted Cost:** Strict transition rules prevent informal ad-hoc workflow shortcuts.
* **Gained Benefit:** Guaranteed organizational compliance and audit accountability. Malicious or accidental unauthorized status jumps are physically impossible.

---

## 5. Secondary Side-Effects: Transactional Outbox Pattern for Async Jobs

### Context
When work items are assigned, escalated, or require approval, secondary actions must take place (such as notifying team leads, alerting on-call engineers, or triggering webhooks). Executing external network calls synchronously during the HTTP request degrades latency and risks partial failures (e.g., database succeeds, but email server is down).

### Options Considered
1. **Synchronous In-Request Notifications:**
   * *Pros:* Simple to code.
   * *Cons:* Severely degrades API response times. If the third-party notification service times out or is down, the user's primary database save fails or hangs.
2. **Fire-and-Forget In-Memory Async Callbacks:**
   * *Pros:* Non-blocking for the user.
   * *Cons:* If the application server crashes or restarts mid-flight, notifications are permanently lost with no retry mechanism.
3. **Transactional Outbox Table with Idempotent Background Worker:**
   * *Pros:* Guarantees "at-least-once" delivery. Outbox events are written in the same DB transaction as the item update. If the worker encounters a failure, it retries with exponential backoff up to a maximum attempt limit.
   * *Cons:* Slight delay (polling interval of 1–3s) before the secondary job executes.

### Chosen Solution
The system employs the **Transactional Outbox Pattern**:
* When an item is created, claimed, or transitioned, an `outbox_jobs` row is inserted inside the same database transaction.
* An `OutboxWorker` polls for `PENDING` jobs, optimistically claims them by setting `PROCESSING`, and dispatches the notification.
* If a failure occurs, the worker increments `attempts`, sets an exponential backoff timestamp (`2^attempts * 5s`), and caps at `max_attempts` (marking `FAILED` for dead-letter triage).

### Trade-offs
* **Accepted Cost:** Eventual consistency for notifications (seconds of latency) rather than instantaneous delivery.
* **Gained Benefit:** Complete decoupling of write throughput from external notification reliability; 100% resilience against server restarts and temporary network outages.

---

## Summary of Deliberate Non-Goals (What We Chose NOT to Build)
1. **Public User Registration / Password Reset:** Seeded accounts cover all enterprise roles. Self-signup is irrelevant for internal operations tooling.
2. **WebSocket Real-Time Subscriptions:** WebSocket connection management introduces significant memory overhead and complex reconnection handling. Server-side cursor pagination with client refetch/polling is far more resilient and scalable.
3. **Complex Multi-Tenancy Organizations:** A single-organization multi-team model perfectly matches Newtonite's requirements without over-engineering cross-org billing boundaries.
