const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const os = require('os');
const fs = require('fs');

const PROFILE = path.join(__dirname, '.chrome-profile');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function findChrome() {
  for (const p of [path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const chrome = findChrome();
  for (const f of ['SingletonLock','SingletonSocket','SingletonCookie','lockfile']) {
    try { fs.unlinkSync(path.join(PROFILE, f)); } catch (_) {}
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chrome,
    userDataDir: PROFILE,
    args: ['--no-sandbox', '--window-size=1200,800'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(UA);

  console.log('Opening taobao.com. Please login if needed, then press Enter in this terminal...');
  await page.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  
  // Wait for user to press Enter
  await new Promise(r => process.stdin.once('data', () => r()));

  console.log('Navigating to search...');
  await page.goto('https://s.taobao.com/search?q=%E5%A5%B3%E8%A3%85&tab=shop', {
    waitUntil: 'networkidle2', timeout: 30000,
  });
  await new Promise(r => setTimeout(r, 3000));

  const body = await page.evaluate(() => document.body.innerText);
  console.log('Login check:', !body.includes('请登录'));

  // Try extraction from flat text
  const html = await page.evaluate(() => document.body.innerHTML);

  // Find all shop IDs from links
  const linkIds = [...html.matchAll(/href="[^"]*shop(\d+)[^"]*"[^>]*>[^<]*进入店铺/g)].map(m => ({ id: m[1], pos: m.index }));
  console.log(`\nShop links found: ${linkIds.length}`);

  // Find all shop names + follower counts from the text
  const shops = [...body.matchAll(/(\S+(?:官方旗舰店|旗舰店|专营店|专卖店))/g)].map(m => ({ name: m[1], pos: m.index }));
  const fans = [...body.matchAll(/((?:\d+\.?\d*)万粉丝)/g)].map(m => ({ count: parseFloat(m[1]), pos: m.index }));
  
  console.log(`Shop names found: ${shops.length}`);
  shops.forEach((s,i) => console.log(`  ${i}: "${s.name}" at pos ${s.pos}`));
  console.log(`\nFollower counts found: ${fans.length}`);
  fans.forEach((f,i) => console.log(`  ${i}: ${f.count}万 at pos ${f.pos}`));

  // Match shops to follower counts (closest follower after shop name)
  for (const shop of shops) {
    let bestFans = null;
    for (const f of fans) {
      if (f.pos > shop.pos && (!bestFans || f.pos < bestFans.pos)) bestFans = f;
    }
    if (bestFans) {
      const followers = Math.round(bestFans.count * 10000);
      // Find closest link after the shop
      let bestLink = null;
      for (const l of linkIds) {
        if (l.pos > shop.pos && (!bestLink || l.pos < bestLink.pos)) bestLink = l;
      }
      console.log(`  -> "${shop.name}" ${followers} fans, shopId=${bestLink?.id || 'N/A'}`);
    }
  }

  await browser.close();
}

main();
