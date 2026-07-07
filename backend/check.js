const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROFILE = path.join(__dirname, '.chrome-profile');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

function findChrome() {
  for (const p of [
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]) { if (fs.existsSync(p)) return p; }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const chrome = findChrome();
  console.log('Chrome:', chrome);
  console.log('Profile exists:', fs.existsSync(PROFILE));

  // Check profile files
  const cookiesFile = path.join(PROFILE, 'Default', 'Cookies');
  console.log('Cookies file:', fs.existsSync(cookiesFile));

  if (!fs.existsSync(PROFILE)) {
    console.log('Profile not found. Please complete the login flow first.');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chrome,
    userDataDir: PROFILE,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(UA);

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','font','media','stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Step 1: Check login
  console.log('\n=== Step 1: Login check ===');
  await page.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await sleep(2000);

  const body = await page.evaluate(() => document.body.innerText);
  const loggedIn = !body.includes('请登录') && !body.includes('免费注册');
  console.log('Logged in:', loggedIn);
  console.log('Page top:', body.substring(0, 200));

  if (!loggedIn) {
    console.log('\nNOT LOGGED IN. Please run the login flow from the website first.');
    await browser.close();
    process.exit(1);
  }

  // Step 2: Search
  console.log('\n=== Step 2: Search ===');
  await page.goto('https://s.taobao.com/search?q=%E5%A5%B3%E8%A3%85&tab=shop', {
    waitUntil: 'networkidle2', timeout: 25000,
  });
  await sleep(3000);

  const searchBody = await page.evaluate(() => document.body.innerText);
  console.log('Search page top:', searchBody.substring(0, 300));
  console.log('Has "进入店铺":', searchBody.includes('进入店铺'));
  console.log('Has "请登录":', searchBody.includes('请登录'));

  // Extract shops
  const shops = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const allLinks = document.querySelectorAll('a');
    
    for (const link of allLinks) {
      const text = (link.textContent || '').trim();
      if (!text.includes('进入店铺')) continue;
      
      const href = link.href || link.getAttribute('href') || '';
      const idMatch = href.match(/shop(\d+)/);
      if (!idMatch || seen.has(idMatch[1])) continue;
      seen.add(idMatch[1]);

      let card = link.closest('[class*="shop"], [class*="card"], [class*="item"], [class*="result"]');
      const cardText = card ? card.textContent : '';

      let name = '';
      const nm = cardText.match(/([\u4e00-\u9fa5a-zA-Z0-9]+(?:官方旗舰店|旗舰店|专营店|专卖店))/);
      if (nm) name = nm[1];

      let followers = 0;
      const fm = cardText.match(/([\d,.]+)万粉丝/);
      if (fm) followers = Math.round(parseFloat(fm[1].replace(/,/g, '')) * 10000);

      if (name) results.push({ id: idMatch[1], name, followers });
    }
    return results;
  });

  console.log(`\nExtracted ${shops.length} shops:`);
  shops.forEach((s, i) => console.log(`  ${i+1}. ${s.name} - ${s.followers >= 10000 ? (s.followers/10000).toFixed(1)+'万' : s.followers} 粉丝`));

  const ss = path.join(__dirname, 'debug_result.png');
  await page.screenshot({ path: ss });
  console.log(`\nScreenshot: ${ss}`);

  await browser.close();
}

main();
