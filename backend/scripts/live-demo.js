import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showBanner(page, stepNum, title, description) {
  await page.evaluate((step, t, d) => {
    let banner = document.getElementById('newtonite-demo-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'newtonite-demo-banner';
      banner.style.position = 'fixed';
      banner.style.bottom = '28px';
      banner.style.left = '50%';
      banner.style.transform = 'translateX(-50%)';
      banner.style.zIndex = '99999';
      banner.style.background = 'rgba(15, 23, 42, 0.95)';
      banner.style.backdropFilter = 'blur(16px)';
      banner.style.border = '1px solid rgba(6, 182, 212, 0.6)';
      banner.style.borderRadius = '16px';
      banner.style.padding = '14px 24px';
      banner.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(6, 182, 212, 0.3)';
      banner.style.color = '#fff';
      banner.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      banner.style.textAlign = 'center';
      banner.style.maxWidth = '680px';
      banner.style.width = '90%';
      banner.style.transition = 'all 0.4s ease';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px;">
        <span style="background: rgba(6, 182, 212, 0.2); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.4); padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Step ${step} of 8</span>
        <span style="font-weight: 700; font-size: 15px; color: #f8fafc;">${t}</span>
      </div>
      <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">${d}</div>
    `;
  }, stepNum, title, description);
}

async function runLiveDemo() {
  console.log('Launching Visible Chrome for Live Interactive Walkthrough...');
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // STEP 1: Introduction to Bento Command Center
  console.log('Step 1: Bento Command Center Overview');
  await showBanner(
    page,
    1,
    'Apple/Stripe-Inspired Bento Grid Command Center',
    'Welcome! This high-stress operational dashboard features glowing glassmorphic cards, illuminated curved SVG pipelines, and real-time concurrency telemetry.'
  );
  await sleep(4000);

  // STEP 2: Work Streams Tag Filtering
  console.log('Step 2: Work Streams Filtering');
  await showBanner(
    page,
    2,
    'Work Streams Dynamic Filtering',
    'Clicking the "Urgent" priority pill instantly filters the operational stream down to P0 critical incidents.'
  );
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const urgentBtn = buttons.find((b) => b.innerText.trim() === 'Urgent');
    if (urgentBtn) urgentBtn.click();
  });
  await sleep(3000);

  // Reset filter
  await page.evaluate(() => {
    const reset = Array.from(document.querySelectorAll('button')).find((b) =>
      b.innerText.includes('Reset Stream Filters')
    );
    if (reset) reset.click();
  });
  await sleep(1500);

  // STEP 3: Selecting an Unassigned Ticket
  console.log('Step 3: Selecting an Incident');
  await showBanner(
    page,
    3,
    'Selecting Incident & Live Synchronization',
    'Selecting an operational incident loads its details directly into the Hero Bento Card and recalculates the SLA ring gauge.'
  );
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.innerText.includes('UNCLAIMED') || b.innerText.includes('Unassigned') || b.innerText.includes('Kafka')
    );
    if (rows[0]) rows[0].click();
  });
  await sleep(3500);

  // STEP 4: Demonstrating Atomic Task Claim
  console.log('Step 4: Atomic Claim');
  await showBanner(
    page,
    4,
    'Atomic Claim Task (Conditional SQL Write)',
    'Clicking "Claim Task" executes an atomic WHERE assignee_id IS NULL update, locking the ticket to Sarah Connor and bumping the version.'
  );
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const claimBtn = buttons.find((b) => b.innerText.includes('Claim Task'));
    if (claimBtn) claimBtn.click();
  });
  await sleep(3500);

  // STEP 5: Submitting for Lead Review
  console.log('Step 5: Workflow State Transition');
  await showBanner(
    page,
    5,
    'Workflow Pipeline: Submitting for Lead Review',
    'The operator deployed a fix and submits the ticket to the "Awaiting Approval" Lead Gate. Notice the neon curved pipeline update!'
  );
  // Auto-respond to prompt if prompt appears
  page.on('dialog', async (dialog) => {
    await dialog.accept('Hotfix deployed and verified in staging.');
  });
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const submitBtn = buttons.find((b) => b.innerText.includes('Submit for Lead Review'));
    if (submitBtn) submitBtn.click();
  });
  await sleep(4000);

  // STEP 6: 1-Click Lead Verification
  console.log('Step 6: 1-Click Lead Verification');
  await showBanner(
    page,
    6,
    'Approval Queue: 1-Click Lead Sign-Off',
    'Team Leads in the Approval Queue card can click "1-click Verify" to resolve pending tickets. The node turns glowing green [Resolved]!'
  );
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const verifyBtn = buttons.find((b) => b.innerText.includes('1-click Verify'));
    if (verifyBtn) verifyBtn.click();
  });
  await sleep(4000);

  // STEP 7: Open Race Condition Simulator
  console.log('Step 7: Race Condition Simulator Modal');
  await showBanner(
    page,
    7,
    'Race Condition Simulator Modal',
    'Opening the Concurrency Simulator to demonstrate sub-millisecond atomic claim races and optimistic locking conflict handling.'
  );
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const raceBtn = buttons.find((b) => b.innerText.includes('Race Condition Simulator'));
    if (raceBtn) raceBtn.click();
  });
  await sleep(2500);

  // Fire the atomic claim race
  console.log('Fired atomic claim race');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const fireBtn = buttons.find((b) => b.innerText.includes('1. Test Atomic Claim Race'));
    if (fireBtn) fireBtn.click();
  });
  await sleep(4000);

  // Fire optimistic locking conflict
  console.log('Fired optimistic lock conflict');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const optBtn = buttons.find((b) => b.innerText.includes('2. Test Optimistic Lock Conflict'));
    if (optBtn) optBtn.click();
  });
  await sleep(4000);

  // Close Simulator Modal
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const closeBtn = buttons.find((b) => b.innerText.includes('Close Simulator'));
    if (closeBtn) closeBtn.click();
  });
  await sleep(1500);

  // STEP 8: Demo Finished
  console.log('Step 8: Demo Completed');
  await showBanner(
    page,
    8,
    '🎉 Live Demo Complete! Chrome is Ready for You',
    'The application is fully operational. Feel free to click around, switch personas, edit tickets, and explore!'
  );

  console.log('Live demo finished! Leaving browser open for the user.');
  // Do NOT close browser, leave it open so user can use it!
}

runLiveDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
