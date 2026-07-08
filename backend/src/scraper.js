/**
 * Taobao Shop Scraper — Infinite scroll + CAPTCHA detection + Resume
 *
 *   ✅ playwright-extra + puppeteer-extra-plugin-stealth
 *   ✅ Infinite scroll deduplication (scroll until no new shops)
 *   ✅ CAPTCHA detection → pause → wait for manual solve → resume
 *   ✅ Session persistence via launchPersistentContext
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

chromium.use(StealthPlugin());

// ── Config ─────────────────────────────────────────────────
const USER_DATA_DIR = path.join(__dirname, '..', '.browser-profile');
const PROGRESS_FILE = path.join(__dirname, '..', 'search-results.json');

// ── Helpers ─────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);

// Breakable sleep — checks stopRequested every 500ms
async function sleepBreakable(ms) {
  if (ms <= 0) return;
  const chunks = Math.ceil(ms / 500);
  for (let c = 0; c < chunks; c++) {
    const chunk = Math.min(ms - c * 500, 500);
    await new Promise(r => setTimeout(r, chunk));
    if (stopRequested) break;
  }
}

// ── Search stop control ─────────────────────────────────────
let stopRequested = false;

function requestStop() {
  stopRequested = true;
  console.log('[Stop] Stop requested — will finish current keyword then stop');
}

function resetStop() {
  stopRequested = false;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
];
function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function formatFollowers(count) {
  if (!count || count === 0) return '获取失败';
  if (count >= 10000) return (count / 10000).toFixed(1) + '万';
  return count.toLocaleString();
}

// ── Category Detection ──────────────────────────────────────
const CATEGORY_RULES = [
  { id: '女装',     kw: ['女装','连衣裙','裙子','女士','T恤','毛衣','大衣','蕾丝','雪纺','吊带','旗袍'] },
  { id: '男装',     kw: ['男装','男士','衬衫','西服','夹克','POLO','卫衣'] },
  { id: '鞋靴',     kw: ['鞋','靴','运动鞋','凉鞋','帆布鞋','高跟鞋','拖鞋','板鞋'] },
  { id: '箱包',     kw: ['包','箱','双肩包','行李箱','背包'] },
  { id: '美妆',     kw: ['化妆品','口红','面膜','粉底','眼影','防晒','香水','精华','护肤','彩妆'] },
  { id: '家居',     kw: ['家居','四件套','灯具','窗帘','地毯','沙发','家纺','家具'] },
  { id: '母婴',     kw: ['母婴','纸尿裤','奶粉','奶瓶','玩具','童装','婴儿','早教'] },
  { id: '食品',     kw: ['零食','坚果','茶叶','咖啡','巧克力','饼干','食品','特产'] },
  { id: '手机数码', kw: ['手机','平板','耳机','充电宝','音箱','数码','相机','电脑'] },
  { id: '家电',     kw: ['家电','冰箱','洗衣机','空调','电饭煲','微波炉','吸尘器','净水'] },
  { id: '运动户外', kw: ['运动','健身','瑜伽','跑步','登山','泳衣','户外','渔具'] },
  { id: '珠宝饰品', kw: ['珠宝','项链','手链','戒指','耳环','手镯','黄金','银饰','饰品'] },
  { id: '内衣',     kw: ['内衣','文胸','内裤','睡衣','袜子'] },
];
function classifyShop(shopName, productText) {
  const text = `${shopName} ${productText || ''}`.toLowerCase();
  const matches = [];
  for (const rule of CATEGORY_RULES)
    if (rule.kw.some(k => text.includes(k.toLowerCase()))) matches.push(rule.id);
  return [...new Set(matches)].slice(0, 3);
}

// ── Browser Lifecycle ──────────────────────────────────────
let browserContext = null;
let loginPage = null;

async function openForLogin() {
  if (browserContext && loginPage) {
    try {
      await loginPage.goto('https://login.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      return { success: true, message: '浏览器已就绪，请扫码登录淘宝' };
    } catch (_) {
      try { await browserContext.close(); } catch (_) {}
      browserContext = null; loginPage = null;
    }
  }
  if (browserContext) { try { await browserContext.close(); } catch (_) {} browserContext = null; loginPage = null; }
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const vpW = Math.floor(rand(1366, 1920));
  const vpH = Math.floor(rand(768, 1080));

  browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: vpW, height: vpH },
    userAgent: pickRandom(USER_AGENTS),
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas','--no-first-run','--no-default-browser-check','--disable-gpu',
    ],
  });

  const pages = browserContext.pages();
  loginPage = pages.length > 0 ? pages[0] : await browserContext.newPage();
  await loginPage.goto('https://login.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });

  console.log('[Login] Browser open.');
  return { success: true, message: '浏览器已打开。请扫码登录，登录后先手动浏览2-3分钟再搜索' };
}

// ── Safe Evaluate ──────────────────────────────────────────
async function safeEval(page, fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try { return await page.evaluate(fn); }
    catch (e) {
      if (e.message.includes('Execution context was destroyed') || e.message.includes('detached Frame')) {
        await sleep(1500);
        try { await page.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch (_) {}
        continue;
      }
      throw e;
    }
  }
  throw new Error('safeEval exhausted');
}

async function checkLoggedIn() {
  if (!browserContext || !loginPage) return { loggedIn: false };
  try {
    const status = await safeEval(loginPage, () => {
      const b = (document.body && document.body.innerText) || '';
      const url = location.href || '';
      if (url.includes('login.taobao.com')) return false;
      return !(b.includes('请登录') || b.includes('免费注册'));
    });
    return { loggedIn: status };
  } catch (_) { return { loggedIn: false }; }
}

// ── Mouse ──────────────────────────────────────────────────
async function humanMove(page, x, y, steps = 10) {
  try { await page.mouse.move(x, y, { steps }); } catch (_) {}
}
async function humanWander(page) {
  const vp = page.viewportSize() || { width: 1920, height: 1080 };
  await humanMove(page, Math.floor(rand(200, vp.width - 200)), Math.floor(rand(200, vp.height - 200)), Math.floor(rand(8, 15)));
}

// ── Auto Scroll (visually smooth scrollBy steps) ───────────
async function autoScroll(page) {
  try {
    const vp = page.viewportSize() || { width: 1920, height: 1080 };

    // 1. Position mouse in content area
    const mx = Math.floor(vp.width / 2 + rand(-100, 100));
    const my = Math.floor(vp.height * 0.6 + rand(-50, 50));
    await page.mouse.move(mx, my, { steps: Math.floor(rand(4, 7)) });

    // 2. scrollBy small increments (4-7px) × 50-70 steps = 200-490px total
    //   with stopRequested check every ~10 steps
    const steps = Math.floor(rand(50, 71));
    const dy = Math.floor(rand(6, 12));
    for (let i = 0; i < steps; i++) {
      if (stopRequested) break;
      await page.evaluate((y) => window.scrollBy(0, y), dy);
      await sleep(rand(60, 120));
      if (i > 0 && i % 10 === 0 && stopRequested) break;
    }

    // 3. Bounce up slightly to trigger lazy-load
    if (!stopRequested) {
      await page.evaluate((y) => window.scrollBy(0, -y), Math.floor(rand(30, 60)));
      await sleep(rand(200, 400));
    }

    // 4. Final small scroll-down pulse
    if (!stopRequested) {
      await page.evaluate((y) => window.scrollBy(0, y), Math.floor(rand(40, 80)));
      await sleep(rand(100, 200));
    }
  } catch (_) {}
}

// ── CAPTCHA Detection ──────────────────────────────────────
const CAPTCHA_KEYWORDS = ['滑块验证', '验证码', '网络信号走丢', '访问太频繁', '请拖动滑块', '人机验证', '请完成验证'];
const LOGIN_KEYWORDS = ['请登录', '免费注册'];

/**
 * Check if browser context is still running (not crashed/closed).
 */
async function isBrowserAlive() {
  try {
    if (!browserContext || !loginPage) return false;
    // A quick eval to test if the page is still connected
    await loginPage.evaluate(() => true);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Check page state. Returns 'normal' | 'captcha' | 'login' | 'empty'.
 */
async function checkPageState(page) {
  try {
    const result = await page.evaluate((captchaKw) => {
      const bt = (document.body && document.body.innerText) || '';
      const isCaptcha = captchaKw.some(k => bt.includes(k));
      if (isCaptcha) return 'captcha';
      if (bt.includes('请登录') || bt.includes('免费注册')) return 'login';
      if (bt.length < 50) return 'empty';
      return 'normal';
    }, CAPTCHA_KEYWORDS);
    return result;
  } catch (_) { return 'empty'; }
}

// ── Infinite Scroll Extraction ─────────────────────────────
/**
 * Extract all shops currently rendered on the page.
 * Returns deduped array of { shopId, shopName, followers, productContext }.
 */
function extractCurrentShops(page) {
  return safeEval(page, () => {
    const bodyText = (document.body && document.body.innerText) || '';
    const results = [];

    // Step 1: Find all "xx万粉丝" entries
    const allFans = [...bodyText.matchAll(/(\d+(?:\.\d+)?)万粉丝/g)];

    // Step 2: Find all "进入店铺" links with shop IDs
    const shopLinks = [...document.querySelectorAll('a')]
      .filter(a => (a.textContent || '').includes('进入店铺'))
      .map(a => {
        const m = (a.href || '').match(/shop(\d+)/);
        return m ? { id: m[1], el: a } : null;
      }).filter(item => item);

    // Step 3: For each shop link, extract prices from its card container via DOM
    const count = Math.min(allFans.length, shopLinks.length);
    for (let i = 0; i < count; i++) {
      const fm = allFans[i];
      const followers = Math.round(parseFloat(fm[1]) * 10000);

      // Get shop name from the text before the fan count
      const pos = fm.index;
      const before = bodyText.substring(Math.max(0, pos - 200), pos);
      const lines = before.split('\n').filter(l => l.trim().length > 1);
      let name = '';
      for (let k = lines.length - 1; k >= 0; k--) {
        const line = lines[k].trim();
        if (/^[\d.]+$/.test(line)) continue;
        if (line.length < 2) continue;
        if (/^(进入店铺|综合|销量|价格|好评|回头客|加载|Ctrl\+V|搜同款|所有宝贝|天猫|淘宝|店铺|企业购)/.test(line)) continue;
        name = line.substring(0, 35);
        break;
      }
      const after = bodyText.substring(pos, Math.min(bodyText.length, pos + 800));
      const productLines = after.split('\n').filter(l => l.trim().length > 1).slice(0, 10);

      // ── DOM-based price extraction per shop card ──
      const shopEl = shopLinks[i].el;
      let card = shopEl;
      for (let j = 0; j < 15 && card && card !== document.body; j++) {
        if ((card.textContent || '').length > 200) break;
        card = card.parentElement;
      }
      const container = card || document.body;

      // Extract prices: ¥ and number appear on SEPARATE innerText lines
      // e.g. line N = "上衣 ¥", line N+1 = "123"
      const prices = [];
      const text = (container && container.innerText) ? container.innerText : '';
      const textLines = text.split('\n');
      
      // Pass 1: look for lines with ¥/￥ that span two lines
      for (let li = 0; li < textLines.length - 1; li++) {
        const curr = textLines[li].trim();
        const next = textLines[li + 1].trim();
        // Current line contains ¥/￥, next line is a pure number
        if (/[¥￥]$/.test(curr) && /^\d+(?:\.\d{1,2})?$/.test(next)) {
          const n = parseFloat(next);
          if (n > 0 && n < 200000) {
            prices.push(n);
            if (prices.length >= 7) break;
          }
        }
      }
      
      // Pass 2: if nothing found, try single-line ¥123 format
      if (prices.length === 0) {
        const priceMatches = text.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/g);
        if (priceMatches) for (const p of priceMatches) {
          const n = parseFloat(p.replace(/[¥￥\s]/g, ''));
          if (n > 0 && n < 200000) { prices.push(n); if (prices.length >= 7) break; }
        }
      }

      const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a,b)=>a+b,0) / prices.length) : 0;

      results.push({
        shopId: shopLinks[i].id,
        shopName: name || ('店铺' + shopLinks[i].id),
        followers,
        productContext: productLines.join(' '),
        avgPrice,
        priceCount: prices.length,
      });
    }
    return results;
  });
}

/**
 * Full infinite-scroll search for one keyword.
 * @param {string} scrollMode - 'semi' (scrollTo bottom, needs manual scroll trigger) or 'auto' (mouse.wheel events)
 */
async function infiniteScrollSearch(page, keyword) {
  console.log(`  [1/5] Visiting taobao homepage`);
  try {
    await page.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (stopRequested) return [];
    await sleepBreakable(rand(5000, 8000));
    await humanWander(page);
    await sleepBreakable(rand(1500, 2500));
  } catch (_) {
    console.log('  [1/5] Homepage failed, going to search directly');
  }

  console.log(`  [2/5] Search: ${keyword}`);
  const url = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}&tab=shop`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Check CAPTCHA immediately after search result loads
  let state = await checkPageState(page);
  if (state === 'captcha') {
    console.log(`\n  🔴 CAPTCHA after search for "${keyword}"`);
    throw { captcha: true, message: `搜索"${keyword}"时触发人机验证，请在浏览器窗口中手动完成验证，然后点"已通过验证，继续"` };
  }
  if (state === 'login') throw new Error('登录过期，请重新连接');

  // Wait for content to settle
  await sleepBreakable(rand(5000, 8000));

  // ── Diagnostic: dump page content to see if extraction can work ──
  try {
    const diag = await page.evaluate(() => {
      const bt = (document.body && document.body.innerText) || '';
      return {
        bodyLen: bt.length,
        hasFans: bt.includes('万粉丝') || bt.includes('粉丝'),
        hasEnterShop: bt.includes('进入店铺'),
        linkCount: document.querySelectorAll('a').length,
        enterShopLinks: document.querySelectorAll('a[href*="shop"]').length,
        sample: bt.substring(0, 400),
      };
    });
    console.log(`  [Diag] len=${diag.bodyLen} fans=${diag.hasFans} enterShop=${diag.hasEnterShop} links=${diag.linkCount} shopLinks=${diag.enterShopLinks}`);
    console.log(`  [Diag] text: ${diag.sample.replace(/\n/g, '¶')}`);
  } catch (_) {}

  console.log('  [3/5] Infinite scroll — loading all shops...');
  const allShops = new Map();
  let noChangeRounds = 0;
  let totalScrolls = 0;
  let lastScrollHeight = 0;
  let bounceCount = 0;
  const maxBounces = 3;

  while (true) {
    // ⚡ Check stop request EVERY iteration
    if (stopRequested) {
      console.log(`\n  🛑 Stop requested — returning ${allShops.size} shops collected so far`);
      break;
    }
    totalScrolls++;

    // ⚡ Check CAPTCHA BEFORE EVERY scroll
    if (!(await isBrowserAlive())) {
      console.log(`\n  💀 Browser closed during scroll #${totalScrolls}`);
      throw new Error('浏览器窗口已关闭，请重新「连接淘宝」并开始搜索');
    }
    state = await checkPageState(page);
    if (state === 'captcha') {
      console.log(`\n  🔴 CAPTCHA at scroll #${totalScrolls} for "${keyword}"`);
      throw { captcha: true, message: `搜索"${keyword}"时触发人机验证（已滚动${totalScrolls}次，已搜到${allShops.size}家店铺），请手动完成验证后点继续` };
    }
    if (state === 'login') throw new Error('登录过期，请重新连接');

    // Get scrollHeight BEFORE scrolling
    try { lastScrollHeight = await page.evaluate(() => (document.body && document.body.scrollHeight) || 0); } catch (_) {}

    // Extract what's currently visible
    let currentShops;
    try {
      currentShops = await extractCurrentShops(page);
      // Diagnostic: check what raw extraction found
      if (totalScrolls === 1) {
        const raw = await page.evaluate(() => {
          const bt = (document.body && document.body.innerText) || '';
          const fans = [...bt.matchAll(/(\d+(?:\.\d+)?)万粉丝/g)].length;
          const links = [...document.querySelectorAll('a')].filter(a => (a.textContent||'').includes('进入店铺')).length;
          return { fanEntries: fans, shopLinks: links };
        });
        console.log(`    [Extract] raw fan entries=${raw.fanEntries} shop links=${raw.shopLinks}`);
      }
    } catch (e) {
      if (e.message && e.message.includes('Target closed')) {
        throw new Error('浏览器窗口已关闭，请重新「连接淘宝」并开始搜索');
      }
      console.log(`    [Scroll #${totalScrolls}] extract failed: ${e.message}. Retrying after short wait...`);
      await sleep(rand(2000, 3000));
      continue;
    }
    let newCount = 0;
    for (const s of currentShops) {
      if (!s.shopId) continue;
      if (!allShops.has(s.shopId)) { allShops.set(s.shopId, s); newCount++; }
      else { const existing = allShops.get(s.shopId); if (s.followers > existing.followers) allShops.set(s.shopId, s); }
    }

    // ── Scroll action ──
    try {
      await autoScroll(page);
      await sleep(rand(1000, 2000));
      await humanWander(page);
      await sleep(rand(530, 1000));
    } catch (e) {
      if (!(await isBrowserAlive())) {
        console.log(`\n  💀 Browser closed during scroll/wait #${totalScrolls}`);
        throw new Error('浏览器窗口已关闭，请重新「连接淘宝」并开始搜索');
      }
      console.log(`    [Scroll #${totalScrolls}] scroll failed: ${e.message}. Continuing...`);
    }

    // Get scrollHeight AFTER scrolling
    let currScrollH = 0;
    try { currScrollH = await page.evaluate(() => (document.body && document.body.scrollHeight) || 0); } catch (_) {}
    const scrollGrew = currScrollH > lastScrollHeight + 50;

    console.log(`    [Scroll #${totalScrolls}] ${allShops.size} shops (+${newCount} new) sh=${lastScrollHeight}→${currScrollH}${scrollGrew ? ' ↑' : ''}`);

    // Debug: log price samples on first scroll
    if (totalScrolls === 1 && currentShops.length > 0) {
      const withPrices = currentShops.filter(s => s.avgPrice > 0 && s.priceCount > 0);
      const sample = currentShops.slice(0, 4).map(s => `${s.shopName || '?'}(¥${s.avgPrice}=avg of ${s.priceCount}p)`).join(' · ');
      console.log(`    [Price] ${currentShops.length} shops (${withPrices.length} w/ prices). Sample: ${sample}`);
    }

    // ── "No progress" decision: scrollHeight didn't grow AND no new shops ──
    if (newCount === 0 && !scrollGrew) {
      noChangeRounds++;
      const threshold = 6;
      console.log(`    [Stale] ${noChangeRounds}/${threshold} no-change rounds`);

      if (noChangeRounds >= threshold && bounceCount < maxBounces) {
        // ── Bounce: scroll top then bottom, rescan ──
        console.log(`    [Bounce #${bounceCount + 1}/${maxBounces}] Checking top→bottom for missed content...`);
        bounceCount++;
        try {
          await page.evaluate(() => window.scrollTo(0, 0));
          await sleep(rand(1500, 2500));
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await sleep(rand(2000, 3500));
          await humanWander(page);
          await sleep(rand(1000, 1500));

          state = await checkPageState(page);
          if (state === 'captcha') throw { captcha: true, message: `搜索"${keyword}"时触发人机验证，请手动完成验证后点继续` };

          const bounceShops = await extractCurrentShops(page);
          let bounceNew = 0;
          for (const s of bounceShops) {
            if (!s.shopId) continue;
            if (!allShops.has(s.shopId)) { allShops.set(s.shopId, s); bounceNew++; }
            else { const e = allShops.get(s.shopId); if (s.followers > e.followers) allShops.set(s.shopId, s); }
          }
          console.log(`    [Bounce #${bounceCount} result] ${bounceNew} new shops, ${allShops.size} total`);

          if (bounceNew > 0) {
            // New content found! Reset all counters, keep scrolling
            noChangeRounds = 0;
            bounceCount = 0;
            continue;
          }
        } catch (e2) {
          if (e2.captcha) throw e2;
          console.log(`    [Bounce #${bounceCount}] Failed — ending with ${allShops.size} shops`);
        }
        // After bounce with no new shops → if max bounces reached, truly done
        if (bounceCount >= maxBounces) {
          console.log(`    [Done] ${maxBounces} bounces found nothing — ${allShops.size} shops`);
          break;
        }
      }
    } else if (newCount > 0) {
      noChangeRounds = 0;
      bounceCount = 0; // new shops found → reset bounce limit too
    }
    // scrollGrew alone without new shops: do NOT reduce penalty
    // This was the bug — [Loading] was trapping the loop by decrementing the counter
  }

  console.log(`  [4/5] Done — ${allShops.size} shops for "${keyword}"`);

  // Sort by followers descending
  return [...allShops.values()].sort((a, b) => b.followers - a.followers);
}

// ── Resumable Multi-Keyword Search ─────────────────────────
let searchState = null; // { keywords, currentIndex, allShops, seenIds, minFollowers }

async function searchKeywords(keywords, minFollowers, resumeFrom = 0, minAvgPrice = 0) {
  if (!searchState || resumeFrom === 0) {
    searchState = { keywords: keywords.slice(0, 10), currentIndex: 0, allShops: [], seenIds: new Set(), minFollowers, minAvgPrice };
    clearProgress();
    resetStop();
  } else {
    searchState.currentIndex = resumeFrom;
  }

  const { allShops, seenIds } = searchState;
  const priceThreshold = searchState.minAvgPrice || 0;
  const kws = searchState.keywords;
  console.log(`[SearchAll] ${kws.length} keywords (resuming from #${searchState.currentIndex + 1}): ${kws.join(', ')}`);

  for (let i = searchState.currentIndex; i < kws.length; i++) {
    // ⚡ Check stop before each keyword
    if (stopRequested) {
      console.log(`\n  🛑 Stop requested before keyword #${i + 1} — returning results now`);
      break;
    }

    const kw = kws[i];
    console.log(`\n  [${i + 1}/${kws.length}] "${kw}" — ${kws.length - i - 1} remaining`);

    let shops;
    try {
      shops = await infiniteScrollSearch(loginPage, kw);
    } catch (e) {
      if (e.captcha) {
        searchState.currentIndex = i;
        searchState.allShops = allShops;
        searchState.seenIds = seenIds;
        throw { captcha: true, message: e.message, keyword: kw, progress: `${i + 1}/${kws.length}`, shopsSoFar: allShops.length };
      }
      throw e;
    }

    let filtered = 0;
    let noPrice = 0;
    for (const s of shops) {
      if (!s.shopId) continue;
      // ⌛ Filter: exclude shops with avg price below user-selected threshold
      //   (priceThreshold === 0 means no filter; avgPrice === 0 means no prices found — let through)
      if (s.avgPrice > 0 && s.avgPrice < priceThreshold) {
        filtered++;
        continue;
      }
      if (s.avgPrice === 0) noPrice++;
      if (seenIds.has(s.shopId)) {
        const existing = allShops.find(x => x.shopId === s.shopId);
        if (existing && s.followers > existing.followers) allShops[allShops.indexOf(existing)] = s;
        continue;
      }
      seenIds.add(s.shopId);
      allShops.push(s);
    }
    const priceLabel = priceThreshold > 0 ? `filtered <¥${priceThreshold}` : 'no price filter';
    const avgTag = filtered > 0 ? ` (${filtered} ${priceLabel}, ${noPrice} no-price)` : ` (${noPrice} shops without prices)`;
    console.log(`    ${shops.length} shops from "${kw}", ${allShops.length} total unique${avgTag}`);

    // ── Real-time save ──
    const classified = classifyResults(allShops, minFollowers);
    saveProgressFile(classified, i + 1, kws.length, kw);

    searchState.currentIndex = i + 1;

    if (i < kws.length - 1 && !stopRequested) {
      const pause = rand(15000, 30000);
      console.log(`    [Pause] ${Math.round(pause / 1000)}s before next keyword...`);
      await humanWander(loginPage); await sleepBreakable(rand(3000, 5000));
      await humanWander(loginPage); await sleepBreakable(rand(3000, 5000));
      await humanWander(loginPage); await sleepBreakable(pause - 10000);
    }
  }

  // Done — return to homepage (unless stopped by user)
  if (!stopRequested) {
    console.log('[SearchAll] Complete. Returning to homepage.');
    try { await loginPage.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (_) {}
  } else {
    console.log('[SearchAll] Stopped by user. Keeping current page.');
  }

  // Clear state
  searchState = null;
  clearProgress(); // done — no more progress to show

  return filterAndClassify(allShops, minFollowers, '[SearchAll]');
}

async function resumeSearch() {
  if (!searchState) throw new Error('没有暂停中的搜索任务');
  if (!browserContext || !loginPage) throw new Error('浏览器连接已断开，请重新连接');
  return await searchKeywords(null, searchState.minFollowers, searchState.currentIndex);
}

// ── Real-time Progress Saving ──────────────────────────────
function classifyResults(shops, minFollowers) {
  const seen = new Set();
  const final = [];
  for (const s of shops.sort((a, b) => b.followers - a.followers)) {
    if (!s.shopName || s.followers < minFollowers) continue;
    if (seen.has(s.shopId)) continue;
    seen.add(s.shopId);

    const categories = classifyShop(s.shopName, s.productContext || '');
    final.push({
      shopName: s.shopName,
      followers: s.followers,
      followersFormatted: formatFollowers(s.followers),
      url: `https://shop${s.shopId}.taobao.com/`,
      shopId: s.shopId,
      categories,
      categoryLabel: categories.length > 0 ? categories.join(' · ') : '综合',
      avgPrice: s.avgPrice || 0,
    });
  }
  return final;
}

function saveProgressFile(classified, currentIndex, total, currentKeyword) {
  const data = {
    lastSaved: new Date().toISOString(),
    progress: `${currentIndex}/${total}`,
    currentKeyword,
    totalShops: classified.length,
    results: classified,
  };
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`    💾 Saved ${classified.length} shops to ${PROGRESS_FILE} (${currentIndex}/${total})`);
  } catch (e) {
    console.log(`    ⚠️ Failed to save progress: ${e.message}`);
  }
}

function getProgress() {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return null;
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function clearProgress() {
  try { fs.unlinkSync(PROGRESS_FILE); } catch (_) {}
}

// ── Core Search ─────────────────────────────────────────────
async function search(keyword, minFollowers, minAvgPrice = 0) {
  if (!browserContext || !loginPage) throw new Error('请先点击「连接淘宝」登录后再搜索');
  resetStop();

  let shops;
  try {
    shops = await infiniteScrollSearch(loginPage, keyword);
  } catch (e) {
    if (e.captcha) throw e;
    throw e;
  }

  console.log(`  Total: ${shops.length} shops`);
  const result = filterAndClassify(shops, minFollowers);
  saveProgressFile(result, 1, 1, keyword);
  try { await loginPage.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
  clearProgress();
  return result;
}

async function searchAll(keywords, minFollowers, minAvgPrice = 0) {
  if (!browserContext || !loginPage) throw new Error('请先点击「连接淘宝」登录后再搜索');
  resetStop();
  return await searchKeywords(keywords, minFollowers, 0, minAvgPrice);
}

// ── Export ──────────────────────────────────────────────────
function filterAndClassify(shops, minFollowers, prefix = '') {
  const results = [];
  for (const s of shops) {
    if (!s.shopName || s.followers < minFollowers) continue;
    const categories = classifyShop(s.shopName, s.productContext || '');
    results.push({
      shopName: s.shopName,
      followers: s.followers,
      followersFormatted: formatFollowers(s.followers),
      url: `https://shop${s.shopId}.taobao.com/`,
      shopId: s.shopId,
      categories,
      categoryLabel: categories.length > 0 ? categories.join(' · ') : '综合',
      avgPrice: s.avgPrice || 0,
    });
  }
  const seen = new Set();
  const final = [];
  for (const r of results.sort((a, b) => b.followers - a.followers))
    { if (seen.has(r.shopId)) continue; seen.add(r.shopId); final.push(r); }
  if (prefix) console.log(`${prefix}: ${final.length} shops after filtering`);
  return final;
}

async function checkShop(url) {
  const m = url.match(/shop(\d+)/);
  if (!m) return { success: false, shopName: '无法解析', followers: 0 };
  const shopId = m[1];
  if (!browserContext || !loginPage) return { success: false, shopName: '查询失败', followers: 0, error: '浏览器未连接' };
  try {
    await loginPage.goto(`https://shop${shopId}.m.taobao.com/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    const body = await safeEval(loginPage, () => (document.body && document.body.innerText) || '');
    let name = '';
    const nm = body.match(/^(.+?)\n/);
    if (nm && nm[1].length > 1 && nm[1].length < 40) name = nm[1];
    let followers = 0;
    let fm = body.match(/粉丝[：:]\s*([\d,.]+万?)/);
    if (!fm) fm = body.match(/([\d,.]+万?)\s*粉丝/);
    if (fm) { let c = fm[1].replace(/,/g, ''); if (c.includes('万')) c = parseFloat(c) * 10000; followers = Math.round(parseFloat(c)) || 0; }
    return { success: true, shopName: (name || '未知店铺').substring(0, 30), followers, followersFormatted: formatFollowers(followers), url: `https://shop${shopId}.taobao.com/`, shopId };
  } catch (e) { return { success: false, shopName: '查询失败', followers: 0, error: e.message }; }
}

module.exports = { openForLogin, checkLoggedIn, search, searchAll, resumeSearch, checkShop, getProgress, clearProgress, requestStop, resetStop };
