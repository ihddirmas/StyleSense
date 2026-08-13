import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const outDir = path.join(tmpdir(), 'stylesense-visual-sweep');
mkdirSync(outDir, { recursive: true });

const base = 'http://localhost:3000/';
const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '768', width: 768, height: 900 },
  { name: '1024', width: 1024, height: 800 },
  { name: '1440', width: 1440, height: 900 },
];

const browser = await chromium.launch();
const results = [];

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));

  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const scrollH = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: path.join(outDir, `landing-${vp.name}.png`), fullPage: true });

  results.push({
    vp: vp.name,
    overflowX: overflow,
    scrollHeight: scrollH,
    consoleErrors: [...new Set(consoleErrors)],
    failedRequests: failedRequests.slice(0, 8),
  });
  await context.close();
}

await browser.close();
console.log('OUTDIR', outDir);
console.log(JSON.stringify(results, null, 2));
