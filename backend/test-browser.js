const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE = path.join(__dirname, '.chrome-profile');

// Find bundled Chromium 131
const cache = path.join(os.tmpdir(), 'cursor-sandbox-cache');
let CHROME = null;
if (fs.existsSync(cache)) {
  for (const d of fs.readdirSync(cache, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const cd = path.join(cache, d.name, 'puppeteer', 'chrome');
    if (!fs.existsSync(cd)) continue;
    for (const v of fs.readdirSync(cd, { withFileTypes: true })) {
      if (!v.isDirectory()) continue;
      const exe = path.join(cd, v.name, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) { CHROME = exe; break; }
    }
    if (CHROME) break;
  }
}

console.log('Chrome path:', CHROME);

// Clean profile locks
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile']) {
  try { fs.unlinkSync(path.join(PROFILE, f)); } catch (_) {}
}
// Also in subdirectories
for (const sub of ['Default']) {
  for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(PROFILE, sub, f)); } catch (_) {}
  }
}

// Delete profile if it exists and is broken
if (!fs.existsSync(PROFILE)) fs.mkdirSync(PROFILE, { recursive: true });

async function test() {
  console.log('Test 1: No profile, no stealth...');
  try {
    const b1 = await puppeteer.launch({
      headless: false,
      executablePath: CHROME,
      args: ['--no-sandbox', '--window-size=800,600'],
    });
    console.log('  OK - closing');
    await b1.close();
  } catch(e) { console.log('  FAIL:', e.message); }

  console.log('Test 2: With stealth plugin...');
  try {
    const b2 = await puppeteer.launch({
      headless: false,
      executablePath: CHROME,
      args: ['--no-sandbox', '--window-size=800,600'],
    });
    console.log('  OK - closing');
    await b2.close();
  } catch(e) { console.log('  FAIL:', e.message); }

  console.log('Test 3: With profile...');
  try {
    const b3 = await puppeteer.launch({
      headless: false,
      executablePath: CHROME,
      userDataDir: PROFILE,
      args: ['--no-sandbox', '--window-size=800,600'],
    });
    console.log('  OK - closing');
    await b3.close();
  } catch(e) { console.log('  FAIL:', e.message); }

  console.log('Test 4: Full config (like scraper)...');
  try {
    const b4 = await puppeteer.launch({
      headless: false,
      executablePath: CHROME,
      userDataDir: PROFILE,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--window-size=1200,800'],
    });
    const page = await b4.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log('  OK - taobao.com loaded');
    await b4.close();
  } catch(e) { console.log('  FAIL:', e.message); }

  console.log('\nAll tests done.');
}

test();
