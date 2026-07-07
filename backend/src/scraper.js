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
    const fanPattern = /(\d+(?:\.\d+)?)万粉丝/g;
    let fm;
    const entries = [];
    while ((fm = fanPattern.exec(bodyText)) !== null) {
      const pos = fm.index;
      const followers = Math.round(parseFloat(fm[1]) * 10000);
      const before = bodyText.substring(Math.max(0, pos - 300), pos);
      const lines = before.split('\n').filter(l => l.trim().length > 1);
      let name = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (/^[\d.]+$/.test(line)) continue;
        if (line.length < 2) continue;
        if (/^(进入店铺|综合|销量|价格|好评|回头客|加载|Ctrl\+V|搜同款|所有宝贝|天猫|淘宝|店铺|企业购)/.test(line)) continue;
        name = line.substring(0, 35);
        break;
      }
      const after = bodyText.substring(pos, Math.min(bodyText.length, pos + 800));
      const productLines = after.split('\n').filter(l => l.trim().length > 1).slice(0, 10);
      if (name) entries.push({ name, followers, pos, productContext: productLines.join(' ') });
    }

    // Match shops via "进入店铺" links
    const linkSeen = new Set();
    const uniqueLinks = [];
    for (const link of document.querySelectorAll('a')) {
      if (!(link.textContent || '').includes('进入店铺')) continue;
      const href = link.href || '';
      const idMatch = href.match(/shop(\d+)/);
      if (!idMatch || linkSeen.has(idMatch[1])) continue;
      linkSeen.add(idMatch[1]);
      let card = link.parentElement;
      for (let j = 0; j < 12 && card; j++) {
        if ((card.textContent || '').length > 300) break;
        card = card.parentElement;
      }
      uniqueLinks.push({ id: idMatch[1], context: card ? card.textContent.substring(0, 600) : '' });
    }

    const matchedEntries = new Set();
    const matchedLinks = new Set();
    for (const link of uniqueLinks) {
      if (matchedLinks.has(link.id)) continue;
      for (const entry of entries) {
        if (matchedEntries.has(entry.name + entry.pos)) continue;
        if (link.context.includes(entry.name)) {
          results.push({ shopId: link.id, shopName: entry.name, followers: entry.followers, productContext: entry.productContext });
          matchedEntries.add(entry.name + entry.pos);
          matchedLinks.add(link.id);
          break;
        }
      }
    }
    // Unmatched fallback
    const umE = entries.filter(e => !matchedEntries.has(e.name + e.pos));
    const umL = uniqueLinks.filter(l => !matchedLinks.has(l.id));
    for (let i = 0; i < Math.min(umE.length, umL.length); i++)
      results.push({ shopId: umL[i].id, shopName: umE[i].name, followers: umE[i].followers, productContext: umE[i].productContext });
    return results;
  });
}

/**
 * Full infinite-scroll search for one keyword.
 * Scrolls to bottom repeatedly until no new shops appear for 3 consecutive scrolls.
 */
async function infiniteScrollSearch(page, keyword) {
  console.log(`  [1/5] Visiting taobao homepage`);
  try {
    await page.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(rand(5000, 8000));
    await humanWander(page);
    await sleep(rand(1500, 2500));
  } catch (_) {
    console.log('  [1/5] Homepage failed, going to search directly');
  }

  console.log(`  [2/5] Search: ${keyword}`);
  const url = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}&tab=shop`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Check CAPTCHA immediately after search result loads
  let state = await checkPageState(page);
  if (state === 'captcha') {
    console.log(`\n  🔴🔴🔴 CAPTCHA DETECTED after search for "${keyword}" 🔴🔴🔴`);
    throw { captcha: true, message: `搜索"${keyword}"时触发人机验证，请在浏览器窗口中手动完成验证，然后点"已通过验证，继续"` };
  }
  if (state === 'login') throw new Error('登录过期，请重新连接');

  // Wait for content to settle
  await sleep(rand(5000, 8000));

  console.log(`  [3/5] Infinite scroll — loading all shops...`);
  const allShops = new Map(); // shopId → { ... }
  let noChangeRounds = 0;
  let totalScrolls = 0;
  const maxScrolls = 50;

  while (totalScrolls < maxScrolls) {
    totalScrolls++;

    // ⚡ Check CAPTCHA BEFORE EVERY scroll (not every 3rd)
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

    // Extract what's currently visible
    let currentShops;
    try {
      currentShops = await extractCurrentShops(page);
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

    console.log(`    [Scroll #${totalScrolls}] ${allShops.size} unique shops (+${newCount} new)`);

    if (newCount === 0) {
      noChangeRounds++;
      if (noChangeRounds >= 3) {
        console.log(`    [Done] 3 rounds with 0 new shops — end of results`);
        break;
      }
    } else {
      noChangeRounds = 0;
    }

    // Scroll to bottom — use scrollTo for full viewport jump
    try {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(rand(2500, 4500));
      await humanWander(page);
      await sleep(rand(1000, 2000));
    } catch (e) {
      if (!(await isBrowserAlive())) {
        console.log(`\n  💀 Browser closed during scroll/wait #${totalScrolls}`);
        throw new Error('浏览器窗口已关闭，请重新「连接淘宝」并开始搜索');
      }
      console.log(`    [Scroll #${totalScrolls}] scroll failed: ${e.message}. Continuing...`);
    }
  }

  console.log(`  [4/5] Final scroll — bounce to top then bottom to trigger any remaining lazy-load`);
  // Bounce: scroll to top, wait, then scroll all the way down again
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(rand(2000, 3000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(rand(3000, 5000));

    // Check CAPTCHA one more time
    state = await checkPageState(page);
    if (state === 'captcha') {
      console.log(`\n  🔴🔴🔴 CAPTCHA DETECTED during final scan for "${keyword}" 🔴🔴🔴`);
      throw { captcha: true, message: `搜索"${keyword}"时触发人机验证（最终阶段），请在浏览器窗口中手动完成验证后点继续` };
    }

    // Final extraction
    const finalShops = await extractCurrentShops(page);
    for (const s of finalShops) {
      if (!s.shopId) continue;
      if (!allShops.has(s.shopId)) allShops.set(s.shopId, s);
      else { const e = allShops.get(s.shopId); if (s.followers > e.followers) allShops.set(s.shopId, s); }
    }
    console.log(`    [Final bounce] ${allShops.size} total unique shops`);
  } catch (e) {
    if (e.captcha) throw e;
    console.log(`    [Final bounce] Skipped — ${allShops.size} shops collected`);
  }

  console.log(`  [5/5] Done — ${allShops.size} shops for "${keyword}"`);

  // Sort by followers descending
  return [...allShops.values()].sort((a, b) => b.followers - a.followers);
}

// ── Resumable Multi-Keyword Search ─────────────────────────
let searchState = null; // { keywords, currentIndex, allShops, seenIds, minFollowers }

async function searchKeywords(keywords, minFollowers, resumeFrom = 0) {
  if (!searchState || resumeFrom === 0) {
    searchState = { keywords: keywords.slice(0, 10), currentIndex: 0, allShops: [], seenIds: new Set(), minFollowers };
    clearProgress(); // fresh start — clear old save
  } else {
    searchState.currentIndex = resumeFrom;
  }

  const { allShops, seenIds } = searchState;
  const kws = searchState.keywords;
  console.log(`[SearchAll] ${kws.length} keywords (resuming from #${searchState.currentIndex + 1}): ${kws.join(', ')}`);

  const remaining = kws.length - searchState.currentIndex;

  for (let i = searchState.currentIndex; i < kws.length; i++) {
    const kw = kws[i];
    console.log(`\n  [${i + 1}/${kws.length}] "${kw}" — ${kws.length - i - 1} remaining`);

    let shops;
    try {
      shops = await infiniteScrollSearch(loginPage, kw);
    } catch (e) {
      if (e.captcha) {
        // Save checkpoint and throw to API layer
        searchState.currentIndex = i;
        searchState.allShops = allShops;
        searchState.seenIds = seenIds;
        throw { captcha: true, message: e.message, keyword: kw, progress: `${i + 1}/${kws.length}`, shopsSoFar: allShops.length };
      }
      throw e;
    }

    for (const s of shops) {
      if (!s.shopId) continue;
      if (seenIds.has(s.shopId)) {
        const existing = allShops.find(x => x.shopId === s.shopId);
        if (existing && s.followers > existing.followers) allShops[allShops.indexOf(existing)] = s;
        continue;
      }
      seenIds.add(s.shopId);
      allShops.push(s);
    }
    console.log(`    ${shops.length} shops from "${kw}", ${allShops.length} total unique`);

    // ── Real-time save to disk (anti-crash protection) ──
    const classified = classifyResults(allShops, minFollowers);
    saveProgressFile(classified, i + 1, kws.length, kw);

    searchState.currentIndex = i + 1;

    if (i < kws.length - 1) {
      const pause = rand(15000, 30000);
      console.log(`    [Pause] ${Math.round(pause / 1000)}s before next keyword...`);
      await humanWander(loginPage); await sleep(rand(3000, 5000));
      await humanWander(loginPage); await sleep(rand(3000, 5000));
      await humanWander(loginPage); await sleep(pause - 10000);
    }
  }

  // Done — return to homepage
  console.log('[SearchAll] Complete. Returning to homepage.');
  try { await loginPage.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (_) {}

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
async function search(keyword, minFollowers) {
  if (!browserContext || !loginPage) throw new Error('请先点击「连接淘宝」登录后再搜索');

  let shops;
  try {
    shops = await infiniteScrollSearch(loginPage, keyword);
  } catch (e) {
    if (e.captcha) throw e;
    throw e;
  }

  console.log(`  Total: ${shops.length} shops`);
  const result = filterAndClassify(shops, minFollowers);
  // Save progress for single-keyword search too
  saveProgressFile(result, 1, 1, keyword);
  try { await loginPage.goto('https://www.taobao.com/', { waitUntil: 'domcontentloaded', timeout: 10000 }); } catch (_) {}
  clearProgress(); // single search done — clear save
  return result;
}

async function searchAll(keywords, minFollowers) {
  if (!browserContext || !loginPage) throw new Error('请先点击「连接淘宝」登录后再搜索');
  return await searchKeywords(keywords, minFollowers, 0);
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

module.exports = { openForLogin, checkLoggedIn, search, searchAll, resumeSearch, checkShop, getProgress, clearProgress };
