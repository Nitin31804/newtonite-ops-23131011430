import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\a6a8c530-d069-4e07-b7ed-7f5979b976d6';

async function capture() {
  console.log('Connecting to Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1050'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050, deviceScaleFactor: 2 });

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1200));

  // 1. Capture Main Dashboard
  const dashboardPath = path.join(ARTIFACT_DIR, 'live_bento_dashboard.png');
  await page.screenshot({ path: dashboardPath, fullPage: false });
  console.log(`Captured main dashboard: ${dashboardPath}`);

  // 2. Open Race Simulator Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const raceBtn = btns.find((b) => b.textContent && b.textContent.includes('Race Condition Simulator'));
    if (raceBtn) raceBtn.click();
  });
  await new Promise((r) => setTimeout(r, 800));

  // 3. Trigger Race in the Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const testRaceBtn = btns.find((b) => b.textContent && b.textContent.includes('1. Test Atomic Claim Race'));
    if (testRaceBtn) testRaceBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const modalPath = path.join(ARTIFACT_DIR, 'live_race_simulator_modal.png');
  await page.screenshot({ path: modalPath, fullPage: false });
  console.log(`Captured Race Simulator modal with results: ${modalPath}`);

  await browser.close();
  console.log('Capture finished successfully!');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
