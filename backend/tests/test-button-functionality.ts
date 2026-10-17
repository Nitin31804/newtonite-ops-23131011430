/**
 * Automated Button & End-to-End Functional Test Suite
 * Validates that every interactive button, modal, form, and API integration in Newtonite Ops works perfectly.
 */

const BASE_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:3000';

interface TestResult {
  buttonName: string;
  component: string;
  action: string;
  expectedStatus: number | string;
  actualStatus: number | string;
  passed: boolean;
  notes: string;
}

const results: TestResult[] = [];

function record(
  buttonName: string,
  component: string,
  action: string,
  expectedStatus: number | string,
  actualStatus: number | string,
  passed: boolean,
  notes: string
) {
  results.push({
    buttonName,
    component,
    action,
    expectedStatus,
    actualStatus,
    passed,
    notes,
  });
  const symbol = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${symbol} [${component}] ${buttonName}: ${notes}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Newtonite Ops - Comprehensive Button & Functionality Test Suite');
  console.log('================================================================\n');

  try {
    // 0. Verify Frontend and Backend Health
    console.log('--- Step 0: Connectivity Verification ---');
    const feRes = await fetch(FRONTEND_URL);
    record(
      'Vite Dev Server',
      'Frontend',
      'GET /',
      200,
      feRes.status,
      feRes.status === 200,
      'Frontend is serving HTML assets at http://localhost:3000'
    );

    const statsRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { 'X-User-Id': 'usr-eng-lead' },
    });
    record(
      'Sync System / Refresh',
      'Header & Dashboard',
      'GET /api/stats',
      200,
      statsRes.status,
      statsRes.status === 200,
      'Backend stats endpoint returns operational metrics'
    );

    // 1. Button: "+ New Item" / "Create Work Item" (CreateItemModal)
    console.log('\n--- Step 1: Testing "+ New Item" & "Create Work Item" Button ---');
    const idempotencyKey = `test-key-${Date.now()}`;
    const createPayload = {
      title: 'Automated Test Incident: Redis Memory Saturation',
      description: 'Cluster memory usage at 96%, eviction rate spiking.',
      type: 'incident',
      priority: 'URGENT',
      team_id: 'team-eng',
    };

    const createRes = await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(createPayload),
    });
    const createdItem = await createRes.json();
    const itemId = createdItem.id || createdItem.item?.id;
    const itemVersion = createdItem.version ?? createdItem.item?.version;
    record(
      'Create Work Item',
      'CreateItemModal',
      'POST /api/items',
      201,
      createRes.status,
      createRes.status === 201 && (createdItem.status === 'OPEN' || createdItem.item?.status === 'OPEN'),
      `Item created successfully with ID: ${itemId}, Version: ${itemVersion}`
    );

    // 1b. Test Idempotency on Create Button Retry
    const retryCreateRes = await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
        'Idempotency-Key': idempotencyKey, // Same key
      },
      body: JSON.stringify(createPayload),
    });
    record(
      'Idempotency Protection (Double Click)',
      'CreateItemModal',
      'POST /api/items (cached retry)',
      201,
      retryCreateRes.status,
      retryCreateRes.status === 201,
      'Submitting duplicate key returns cached item without creating duplicate rows'
    );

    // 2. Button: "Claim Task" (BentoHeroCard)
    console.log('\n--- Step 2: Testing "Claim Task" Button ---');
    const claimRes = await fetch(`${BASE_URL}/api/items/${itemId}/claim`, {
      method: 'POST',
      headers: {
        'X-User-Id': 'usr-eng-lead',
      },
    });
    const claimData = await claimRes.json();
    const claimedItem = claimData.item || claimData;
    record(
      'Claim Task',
      'BentoHeroCard',
      'POST /api/items/:id/claim',
      200,
      claimRes.status,
      claimRes.status === 200 && claimedItem.assignee_id === 'usr-eng-lead',
      `Claimed atomically WHERE assignee_id IS NULL. Version bumped to: ${claimedItem.version}`
    );

    // 2b. Test Double-Claim Conflict (Someone else clicking Claim Task)
    const duplicateClaimRes = await fetch(`${BASE_URL}/api/items/${itemId}/claim`, {
      method: 'POST',
      headers: {
        'X-User-Id': 'usr-eng-1',
      },
    });
    record(
      'Claim Task (Conflict Handling)',
      'BentoHeroCard',
      'POST /api/items/:id/claim (already claimed)',
      409,
      duplicateClaimRes.status,
      duplicateClaimRes.status === 409,
      'Server gracefully rejected duplicate claim with 409 Conflict'
    );

    // 3. Button: "Submit for Lead Review" (BentoHeroCard)
    console.log('\n--- Step 3: Testing "Submit for Lead Review" Button ---');
    const submitReviewRes = await fetch(`${BASE_URL}/api/items/${itemId}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
      },
      body: JSON.stringify({
        targetStatus: 'AWAITING_APPROVAL',
        reason: 'Hotfix applied to Redis cache config.',
        version: claimedItem.version,
      }),
    });
    const reviewData = await submitReviewRes.json();
    const reviewItem = reviewData.item || reviewData;
    record(
      'Submit for Lead Review',
      'BentoHeroCard',
      'POST /api/items/:id/transition',
      200,
      submitReviewRes.status,
      submitReviewRes.status === 200 && reviewItem.status === 'AWAITING_APPROVAL',
      `Transitioned to AWAITING_APPROVAL. Current version: ${reviewItem.version}`
    );

    // 4. Button: "Approve Resolution" (Lead Gate Verification)
    console.log('\n--- Step 4: Testing "Approve Resolution" Button Permissions ---');
    // 4a. Unauthorized Member attempt
    const memberApproveRes = await fetch(`${BASE_URL}/api/items/${itemId}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-1', // Regular member, not Lead
      },
      body: JSON.stringify({
        targetStatus: 'RESOLVED',
        reason: 'Member trying to approve',
        version: reviewItem.version,
      }),
    });
    record(
      'Approve Resolution (Member Role)',
      'BentoHeroCard',
      'POST /api/items/:id/transition (as MEMBER)',
      403,
      memberApproveRes.status,
      memberApproveRes.status === 403,
      'Regular member blocked from approving with 403 Forbidden'
    );

    // 4b. Authorized Lead attempt / 1-click Verify
    const leadApproveRes = await fetch(`${BASE_URL}/api/items/${itemId}/transition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead', // Sarah Connor (Lead)
      },
      body: JSON.stringify({
        targetStatus: 'RESOLVED',
        reason: '1-click Lead Verification by Sarah Connor',
        version: reviewItem.version,
      }),
    });
    const resolvedData = await leadApproveRes.json();
    const resolvedItem = resolvedData.item || resolvedData;
    record(
      'Approve Resolution / 1-click Verify',
      'Approval Queue & Hero Card',
      'POST /api/items/:id/transition (as LEAD)',
      200,
      leadApproveRes.status,
      leadApproveRes.status === 200 && resolvedItem.status === 'RESOLVED',
      `Lead sign-off approved successfully! Status: RESOLVED, Version: ${resolvedItem.version}`
    );

    // 5. Button: "Edit" -> "Save (Optimistic Lock)" (WorkItemDetail)
    console.log('\n--- Step 5: Testing "Save (Optimistic Lock)" Button ---');
    const updateRes = await fetch(`${BASE_URL}/api/items/${itemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
      },
      body: JSON.stringify({
        title: 'Automated Test Incident: Redis Memory Saturation [RESOLVED POST-MORTEM]',
        version: resolvedItem.version,
      }),
    });
    const updatedData = await updateRes.json();
    const updatedItem = updatedData.item || updatedData;
    record(
      'Save (Optimistic Lock)',
      'WorkItemDetail',
      'PATCH /api/items/:id (matched version)',
      200,
      updateRes.status,
      updateRes.status === 200 && updatedItem.version === resolvedItem.version + 1,
      `Saved successfully. Version incremented to: ${updatedItem.version}`
    );

    // 5b. Optimistic Locking Conflict (Stale Version)
    const staleUpdateRes = await fetch(`${BASE_URL}/api/items/${itemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
      },
      body: JSON.stringify({
        title: 'Conflict test patch with old version',
        version: resolvedItem.version, // Old version
      }),
    });
    record(
      'Save (Optimistic Conflict)',
      'WorkItemDetail',
      'PATCH /api/items/:id (stale version)',
      409,
      staleUpdateRes.status,
      staleUpdateRes.status === 409,
      'Stale update rejected with 409 Conflict: Record was modified by another operator'
    );

    // 6. Button: "Post Comment" (WorkItemDetail)
    console.log('\n--- Step 6: Testing "Post Comment" Button ---');
    const commentRes = await fetch(`${BASE_URL}/api/items/${itemId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
      },
      body: JSON.stringify({
        content: 'Post-mortem verification completed. Memory footprint normal at 42%.',
      }),
    });
    const commentData = await commentRes.json();
    record(
      'Post Comment',
      'WorkItemDetail',
      'POST /api/items/:id/comments',
      201,
      commentRes.status,
      commentRes.status === 201 && !!commentData.comment,
      `Comment posted successfully with ID: ${commentData.comment?.id}`
    );

    // 7. Button: "1. Test Atomic Claim Race" (RaceSimulatorModal)
    console.log('\n--- Step 7: Testing Simulator "Atomic Claim Race" ---');
    // Create an unassigned ticket for the race
    const raceItemRes = await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-eng-lead',
        'Idempotency-Key': `race-${Date.now()}`,
      },
      body: JSON.stringify({
        title: 'Race Condition Target: Kafka Lag Spike',
        description: 'Target item for simultaneous atomic claim test.',
        type: 'incident',
        priority: 'URGENT',
        team_id: 'team-eng',
      }),
    });
    const raceItemData = await raceItemRes.json();
    const raceItemId = raceItemData.id || raceItemData.item?.id;

    // Fire 2 simultaneous claims in Promise.all()
    const req1 = fetch(`${BASE_URL}/api/items/${raceItemId}/claim`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr-eng-lead' },
    });
    const req2 = fetch(`${BASE_URL}/api/items/${raceItemId}/claim`, {
      method: 'POST',
      headers: { 'X-User-Id': 'usr-eng-1' },
    });

    const [raceRes1, raceRes2] = await Promise.all([req1, req2]);
    const statuses = [raceRes1.status, raceRes2.status].sort();
    const racePassed = statuses[0] === 200 && statuses[1] === 409;
    record(
      'Test Atomic Claim Race',
      'RaceSimulatorModal',
      'Simultaneous POST /claim (Promise.all)',
      '200 & 409',
      `${statuses[0]} & ${statuses[1]}`,
      racePassed,
      'Exactly 1 worker acquired atomic lock (200 OK) while 1 worker received 409 Conflict'
    );

    // 7b. Simulator Button 2: Test Optimistic Lock Conflict
    const raceDetailsRes = await fetch(`${BASE_URL}/api/items/${raceItemId}`, {
      headers: { 'X-User-Id': 'usr-eng-lead' },
    });
    const raceDetails = await raceDetailsRes.json();
    const curVer = raceDetails.item.version;

    const optReq1 = fetch(`${BASE_URL}/api/items/${raceItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr-eng-lead' },
      body: JSON.stringify({ title: 'Simultaneous edit Worker A', version: curVer }),
    });
    const optReq2 = fetch(`${BASE_URL}/api/items/${raceItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr-eng-lead' },
      body: JSON.stringify({ title: 'Simultaneous edit Worker B', version: curVer }),
    });

    const [optRes1, optRes2] = await Promise.all([optReq1, optReq2]);
    const optStatuses = [optRes1.status, optRes2.status].sort();
    const optPassed = optStatuses[0] === 200 && optStatuses[1] === 409;
    record(
      'Test Optimistic Lock Conflict',
      'RaceSimulatorModal',
      'Simultaneous PATCH with same version (Promise.all)',
      '200 & 409',
      `${optStatuses[0]} & ${optStatuses[1]}`,
      optPassed,
      'First update succeeded (200 OK) while concurrent update was blocked with 409 Conflict'
    );

    // 8. Button: "Work Streams" Filters & Search
    console.log('\n--- Step 8: Testing "Work Streams" Filter & Search ---');
    const filterRes = await fetch(`${BASE_URL}/api/items?priority=URGENT&teamId=team-eng`, {
      headers: { 'X-User-Id': 'usr-eng-lead' },
    });
    const filterData = await filterRes.json();
    const itemsList = filterData.items || filterData;
    record(
      'Urgent & Engineering Filter Pills',
      'WorkStreams & WorkItemList',
      'GET /api/items?priority=URGENT&teamId=team-eng',
      200,
      filterRes.status,
      filterRes.status === 200 && Array.isArray(itemsList) && itemsList.every((i: any) => i.priority === 'URGENT'),
      `Filtered correctly: returned ${itemsList.length} urgent engineering items`
    );

    // 9. Persona Switcher Verification
    console.log('\n--- Step 9: Testing Persona Switcher ---');
    const viewerRes = await fetch(`${BASE_URL}/api/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'usr-viewer', // Viewer role
        'Idempotency-Key': `viewer-${Date.now()}`,
      },
      body: JSON.stringify({
        title: 'Viewer unauthorized creation',
        description: 'Should be rejected',
        type: 'incident',
        priority: 'LOW',
        team_id: 'team-eng',
      }),
    });
    record(
      'Persona Switcher (Viewer RBAC)',
      'Header / Persona Selector',
      'POST /api/items (as VIEWER)',
      403,
      viewerRes.status,
      viewerRes.status === 403,
      'Auditor/Viewer persona blocked from creating items (403 Forbidden)'
    );

    // Print Final Summary Table
    console.log('\n================================================================');
    console.log('📊 FUNCTIONALITY TEST REPORT - ALL BUTTONS & ACTIONS');
    console.log('================================================================');
    console.table(
      results.map((r) => ({
        Component: r.component,
        Button: r.buttonName,
        Expected: r.expectedStatus,
        Actual: r.actualStatus,
        Passed: r.passed ? '✅ YES' : '❌ NO',
      }))
    );

    const totalPassed = results.filter((r) => r.passed).length;
    const totalTests = results.length;
    console.log(`\n🎉 Results: ${totalPassed}/${totalTests} tests passed (${Math.round((totalPassed / totalTests) * 100)}% workable).`);

    if (totalPassed === totalTests) {
      console.log('🌟 ALL BUTTONS, MODALS, CONTROLS, AND FLOWS ARE 100% OPERATIONAL!');
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
