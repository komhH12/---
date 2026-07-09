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
 * Returns deduped array of { shopId, shopName, followers, productContext, avgPrice }.
 */
function extractCurrentShops(page) {
  return safeEval(page, () => {
    function robustAvg(prices) {
      if (!prices || prices.length === 0) return 0;
      const uniq = [...new Set(prices.map(p => Math.round(p * 100) / 100))];
      if (uniq.length === 1) return Math.round(uniq[0]);
      const sorted = uniq.slice().sort((a, b) => a - b);
      // Drop extremes when enough samples (likely 划线原价 / 异常值)
      let pool = sorted;
      if (sorted.length >= 5) pool = sorted.slice(1, -1);
      else if (sorted.length >= 4) {
        const med = sorted[Math.floor(sorted.length / 2)];
        pool = sorted.filter(p => p >= med * 0.35 && p <= med * 2.8);
        if (pool.length < 2) pool = sorted;
      }
      const mid = Math.floor(pool.length / 2);
      const median = pool.length % 2 ? pool[mid] : (pool[mid - 1] + pool[mid]) / 2;
      // Prefer median; blend slightly with trimmed mean for stability
      const mean = pool.reduce((a, b) => a + b, 0) / pool.length;
      return Math.round(median * 0.7 + mean * 0.3);
    }

    function findCard(shopEl) {
      let best = null;
      let el = shopEl;
      for (let j = 0; j < 18 && el && el !== document.body; j++) {
        const t = el.innerText || '';
        const hasFans = /\d+(?:\.\d+)?万粉丝/.test(t) || /\d+\s*粉丝/.test(t);
        const yenCount = (t.match(/[¥￥]/g) || []).length;
        if (hasFans && yenCount >= 1 && t.length > 80 && t.length < 8000) {
          best = el;
          // Prefer smallest card that still has fans + prices
          break;
        }
        el = el.parentElement;
      }
      if (best) return best;
      // Fallback: first ancestor with enough text
      el = shopEl;
      for (let j = 0; j < 12 && el && el !== document.body; j++) {
        if ((el.textContent || '').length > 200) return el;
        el = el.parentElement;
      }
      return shopEl.parentElement || document.body;
    }

    function extractPrices(container) {
      const prices = [];
      const seen = new Set();
      const push = (n) => {
        if (!(n > 0 && n < 100000)) return;
        const key = Math.round(n * 100);
        if (seen.has(key)) return;
        seen.add(key);
        prices.push(n);
      };

      // Pass 1: leaf-ish nodes that look like price displays
      const nodes = container.querySelectorAll('span, em, strong, b, i, div, p');
      for (const node of nodes) {
        if (prices.length >= 12) break;
        if (node.children && node.children.length > 3) continue;
        const raw = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!raw || raw.length > 40) continue;
        if (/粉丝|销量|人付款|评价|好评|回头客|进入店铺/.test(raw)) continue;

        // "¥123" / "￥123.45" / "¥ 123"
        let m = raw.match(/^[¥￥]\s*(\d+(?:\.\d{1,2})?)$/);
        if (m) { push(parseFloat(m[1])); continue; }

        // "123" next to a sibling/parent that is just ¥
        if (/^\d+(?:\.\d{1,2})?$/.test(raw)) {
          const prev = (node.previousElementSibling && (node.previousElementSibling.innerText || '').trim()) || '';
          const parent = (node.parentElement && (node.parentElement.innerText || '').replace(/\s+/g, ' ').trim()) || '';
          if (/[¥￥]$/.test(prev) || /^[¥￥]\s*\d/.test(parent) || parent.includes('¥') || parent.includes('￥')) {
            push(parseFloat(raw));
          }
        }
      }

      // Pass 2: cross-line innerText (¥ on one line, number on next)
      if (prices.length < 2) {
        const textLines = ((container.innerText || '')).split('\n');
        for (let li = 0; li < textLines.length - 1; li++) {
          const curr = textLines[li].trim();
          const next = textLines[li + 1].trim();
          if (/[¥￥]\s*$/.test(curr) && /^\d+(?:\.\d{1,2})?$/.test(next)) {
            push(parseFloat(next));
            if (prices.length >= 12) break;
          }
          // Same line: "xxx ¥123"
          const same = curr.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/g);
          if (same) for (const p of same) push(parseFloat(p.replace(/[¥￥\s]/g, '')));
        }
      }

      // Pass 3: regex fallback on card text, skip fan-count region
      if (prices.length === 0) {
        const text = container.innerText || '';
        const cut = text.replace(/\d+(?:\.\d+)?万粉丝[\s\S]{0,40}/, ' ');
        const priceMatches = cut.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/g);
        if (priceMatches) for (const p of priceMatches) {
          push(parseFloat(p.replace(/[¥￥\s]/g, '')));
          if (prices.length >= 12) break;
        }
      }

      return prices;
    }

    const results = [];
    const seenIds = new Set();

    const shopLinks = [...document.querySelectorAll('a')]
      .filter(a => (a.textContent || '').includes('进入店铺'))
      .map(a => {
        const m = (a.href || '').match(/shop(\d+)/);
        return m ? { id: m[1], el: a } : null;
      }).filter(Boolean);

    for (const link of shopLinks) {
      if (seenIds.has(link.id)) continue;
      seenIds.add(link.id);

      const container = findCard(link.el);
      const text = (container && container.innerText) ? container.innerText : '';

      let followers = 0;
      const fanM = text.match(/(\d+(?:\.\d+)?)万粉丝/);
      if (fanM) followers = Math.round(parseFloat(fanM[1]) * 10000);
      else {
        const fanM2 = text.match(/(\d[\d,]*)\s*粉丝/);
        if (fanM2) followers = parseInt(fanM2[1].replace(/,/g, ''), 10) || 0;
      }

      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
      let name = '';
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k];
        if (/万粉丝|粉丝/.test(line)) {
          for (let b = k - 1; b >= Math.max(0, k - 6); b--) {
            const cand = lines[b];
            if (/^[\d.¥￥]+$/.test(cand)) continue;
            if (cand.length < 2 || cand.length > 40) continue;
            if (/^(进入店铺|综合|销量|价格|好评|回头客|加载|Ctrl\+V|搜同款|所有宝贝|天猫|淘宝|店铺|企业购|包邮)/.test(cand)) continue;
            name = cand.substring(0, 35);
            break;
          }
          break;
        }
      }

      const productLines = [];
      let afterFans = false;
      for (const line of lines) {
        if (/万粉丝|粉丝/.test(line)) { afterFans = true; continue; }
        if (!afterFans) continue;
        if (/进入店铺/.test(line)) break;
        if (line.length > 1) productLines.push(line);
        if (productLines.length >= 10) break;
      }

      const prices = extractPrices(container);
      const avgPrice = robustAvg(prices);

      results.push({
        shopId: link.id,
        shopName: name || ('店铺' + link.id),
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
 * @param {string} scrollMode - 'auto' | 'manual' (user scrolls; we only poll & record)
 */
async function infiniteScrollSearch(page, keyword, scrollMode = 'auto') {
  const isManual = scrollMode === 'manual';
  console.log(`  [1/5] Visiting taobao homepage (mode=${scrollMode})`);
  try {
    await page.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (stopRequested) return [];
    await sleepBreakable(rand(5000, 8000));
    if (!isManual) await humanWander(page);
    await sleepBreakable(rand(1500, 2500));
  } catch (_) {
    console.log('  [1/5] Homepage failed, going to search directly');
  }

  console.log(`  [2/5] Search: ${keyword}`);
  const url = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}&tab=shop`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  let state = await checkPageState(page);
  if (state === 'captcha') {
    console.log(`\n  🔴 CAPTCHA after search for "${keyword}"`);
    throw { captcha: true, message: `搜索"${keyword}"时触发人机验证，请在浏览器窗口中手动完成验证，然后点"已通过验证，继续"` };
  }
  if (state === 'login') throw new Error('登录过期，请重新连接');

  await sleepBreakable(rand(5000, 8000));

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

  console.log(isManual
    ? '  [3/5] 全人工模式 — 请在浏览器中手动滚动，程序仅记录店铺；点「终止」结束本词'
    : '  [3/5] Infinite scroll — loading all shops...');
  const allShops = new Map();
  let noChangeRounds = 0;
  let totalScrolls = 0;
  let lastScrollHeight = 0;
  let bounceCount = 0;
  const maxBounces = 3;
  let manualIdleRounds = 0;
  const manualIdleLimit = 90; // ~3 min of no new shops @ 2s poll → soft hint only, still wait for stop

  while (true) {
    if (stopRequested) {
      console.log(`\n  🛑 Stop requested — returning ${allShops.size} shops collected so far`);
      break;
    }
    totalScrolls++;

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

    try { lastScrollHeight = await page.evaluate(() => (document.body && document.body.scrollHeight) || 0); } catch (_) {}

    let currentShops;
    try {
      currentShops = await extractCurrentShops(page);
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
      else {
        const existing = allShops.get(s.shopId);
        // Prefer richer price data / higher followers on re-scan
        if (s.followers > existing.followers || (s.priceCount || 0) > (existing.priceCount || 0)) {
          allShops.set(s.shopId, s);
        }
      }
    }

    if (isManual) {
      // User scrolls; we only poll
      await sleepBreakable(rand(1800, 2500));
      let currScrollH = 0;
      try { currScrollH = await page.evaluate(() => (document.body && document.body.scrollHeight) || 0); } catch (_) {}
      console.log(`    [Manual #${totalScrolls}] ${allShops.size} shops (+${newCount} new) sh=${lastScrollHeight}→${currScrollH}`);
      if (totalScrolls === 1 && currentShops.length > 0) {
        const withPrices = currentShops.filter(s => s.avgPrice > 0 && s.priceCount > 0);
        const sample = currentShops.slice(0, 4).map(s => `${s.shopName || '?'}(¥${s.avgPrice}/${s.priceCount}p)`).join(' · ');
        console.log(`    [Price] ${currentShops.length} shops (${withPrices.length} w/ prices). Sample: ${sample}`);
      }
      if (newCount === 0) {
        manualIdleRounds++;
        if (manualIdleRounds === manualIdleLimit) {
          console.log(`    [Manual] ~3min no new shops — keep scrolling or click 终止`);
        }
      } else {
        manualIdleRounds = 0;
      }
      continue;
    }

    // ── Auto scroll ──
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

    let currScrollH = 0;
    try { currScrollH = await page.evaluate(() => (document.body && document.body.scrollHeight) || 0); } catch (_) {}
    const scrollGrew = currScrollH > lastScrollHeight + 50;

    console.log(`    [Scroll #${totalScrolls}] ${allShops.size} shops (+${newCount} new) sh=${lastScrollHeight}→${currScrollH}${scrollGrew ? ' ↑' : ''}`);

    if (totalScrolls === 1 && currentShops.length > 0) {
      const withPrices = currentShops.filter(s => s.avgPrice > 0 && s.priceCount > 0);
      const sample = currentShops.slice(0, 4).map(s => `${s.shopName || '?'}(¥${s.avgPrice}/${s.priceCount}p)`).join(' · ');
      console.log(`    [Price] ${currentShops.length} shops (${withPrices.length} w/ prices). Sample: ${sample}`);
    }

    if (newCount === 0 && !scrollGrew) {
      noChangeRounds++;
      const threshold = 6;
      console.log(`    [Stale] ${noChangeRounds}/${threshold} no-change rounds`);

      if (noChangeRounds >= threshold && bounceCount < maxBounces) {
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
            else { const e = allShops.get(s.shopId); if (s.followers > e.followers || (s.priceCount || 0) > (e.priceCount || 0)) allShops.set(s.shopId, s); }
          }
          console.log(`    [Bounce #${bounceCount} result] ${bounceNew} new shops, ${allShops.size} total`);

          if (bounceNew > 0) {
            noChangeRounds = 0;
            bounceCount = 0;
            continue;
          }
        } catch (e2) {
          if (e2.captcha) throw e2;
          console.log(`    [Bounce #${bounceCount}] Failed — ending with ${allShops.size} shops`);
        }
        if (bounceCount >= maxBounces) {
          console.log(`    [Done] ${maxBounces} bounces found nothing — ${allShops.size} shops`);
          break;
        }
      }
    } else if (newCount > 0) {
      noChangeRounds = 0;
      bounceCount = 0;
    }
  }

  console.log(`  [4/5] Done — ${allShops.size} shops for "${keyword}"`);
  return [...allShops.values()].sort((a, b) => b.followers - a.followers);
}

// ── Resumable Multi-Keyword Search ─────────────────────────
let searchState = null; // { keywords, currentIndex, allShops, seenIds, minFollowers }

async function searchKeywords(keywords, minFollowers, resumeFrom = 0, minAvgPrice = 0, scrollMode = 'auto') {
  if (!searchState || resumeFrom === 0) {
    searchState = { keywords: keywords.slice(0, 10), currentIndex: 0, allShops: [], seenIds: new Set(), minFollowers, minAvgPrice, scrollMode };
    clearProgress();
    resetStop();
  } else {
    searchState.currentIndex = resumeFrom;
  }

  const { allShops, seenIds } = searchState;
  const priceThreshold = searchState.minAvgPrice || 0;
  const mode = searchState.scrollMode || 'auto';
  const kws = searchState.keywords;
  console.log(`[SearchAll] ${kws.length} keywords mode=${mode} (resuming from #${searchState.currentIndex + 1}): ${kws.join(', ')}`);

  for (let i = searchState.currentIndex; i < kws.length; i++) {
    if (stopRequested) {
      console.log(`\n  🛑 Stop requested before keyword #${i + 1} — returning results now`);
      break;
    }

    const kw = kws[i];
    console.log(`\n  [${i + 1}/${kws.length}] "${kw}" — ${kws.length - i - 1} remaining`);

    let shops;
    try {
      shops = await infiniteScrollSearch(loginPage, kw, mode);
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
async function search(keyword, minFollowers, minAvgPrice = 0, scrollMode = 'auto') {
  if (!browserContext || !loginPage) throw new Error('请先点击「连接淘宝」登录后再搜索');
  resetStop();

  let shops;
  try {
    shops = await infiniteScrollSearch(loginPage, keyword, scrollMode);
  } catch (e) {
    if (e.captcha) throw e;
    throw e;
  }

  console.log(`  Total: ${shops.length} shops`);
  let filtered = shops;
  if (minAvgPrice > 0) {
    filtered = shops.filter(s => !(s.avgPrice > 0 && s.avgPrice < minAvgPrice));
  }
  const result = filterAndClassify(filtered, minFollowers);
  saveProgressFile(result, 1, 1, keyword);
  if (scrollMode !== 'manual') {
    try { await loginPage.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
  }
  clearProgress();
  return result;
}

async function searchAll(keywords, minFollowers, minAvgPrice = 0, scrollMode = 'auto') {
  if (!browserContext || !loginPage) throw new Error('请先点击「连接淘宝」登录后再搜索');
  resetStop();
  return await searchKeywords(keywords, minFollowers, 0, minAvgPrice, scrollMode);
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
