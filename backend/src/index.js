const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { openForLogin, checkLoggedIn, search, searchAll, resumeSearch, getProgress, clearProgress, requestStop } = require('./scraper');

console.log(`[Startup] v9.0 — Robust price + auto/manual scroll`);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DIST_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');
const staticDir = fs.existsSync(PUBLIC_DIR) ? PUBLIC_DIR : (fs.existsSync(DIST_DIR) ? DIST_DIR : null);

app.get('/api/status', async (_req, res) => {
  try { res.json(await checkLoggedIn()); }
  catch (e) { res.json({ loggedIn: false, error: e.message }); }
});

app.post('/api/login', async (_req, res) => {
  try {
    const result = await openForLogin();
    if (!result.success) return res.status(400).json({ error: result.message });
    res.json(result);
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/search', async (req, res) => {
  const { keyword, keywords, minFollowers, minAvgPrice, scrollMode } = req.body;
  const min = parseInt(minFollowers) || 300000;
  const priceMin = parseInt(minAvgPrice) || 0;
  const mode = scrollMode === 'manual' ? 'manual' : 'auto';

  try {
    let results;
    if (keywords && Array.isArray(keywords) && keywords.length > 0) {
      console.log(`[Search] Multi-keyword: ${keywords.length} words, min: ${min}, price>=${priceMin}, mode=${mode}`);
      results = await searchAll(keywords, min, priceMin, mode);
    } else if (keyword) {
      console.log(`[Search] "${keyword}", min: ${min}, price>=${priceMin}, mode=${mode}`);
      results = await search(keyword, min, priceMin, mode);
    } else {
      return res.status(400).json({ error: '请提供搜索关键词' });
    }

    console.log(`[Search] Done: ${results.length} shops`);
    if (results.length === 0) {
      res.json({ success: true, results, total: 0, diagnostic: '未找到符合条件的店铺。请确认已登录，或尝试其他关键词/品类。' });
    } else {
      res.json({ success: true, results, total: results.length });
    }
  } catch (e) {
    console.error(`[Search] Error:`, e.message);
    // Browser closed — friendly message
    if (e.message && (e.message.includes('浏览器窗口已关闭') || e.message.includes('Target closed') || e.message.includes('Browser closed'))) {
      const saved = getProgress();
      return res.json({
        success: false,
        error: '浏览器窗口意外关闭。之前搜索的数据已保存，点击「连接淘宝」重新打开浏览器后可继续。',
        browserClosed: true,
        saved: saved || null,
      });
    }
    // Check if this is a CAPTCHA pause (with captcha flag)
    if (e.captcha) {
      return res.json({
        success: false,
        captcha: true,
        error: e.message,
        keyword: e.keyword || '',
        progress: e.progress || '',
        shopsSoFar: e.shopsSoFar || 0,
        action: '请在浏览器窗口中手动完成人机验证，然后点击「已通过验证，继续搜索」',
      });
    }
    res.status(500).json({ error: `搜索失败: ${e.message}` });
  }
});

// ── Crash-proofing ──
// Prevent unhandled Playwright disconnects from killing the Node process.
// When the browser is killed (by Taobao or user), catch it and keep serving.
process.on('uncaughtException', (err) => {
  if (err.message && (err.message.includes('Target closed') || err.message.includes('Browser closed') || err.message.includes('Connection closed'))) {
    console.error('[CrashGuard] Browser disconnect caught — keeping server alive:', err.message);
  } else {
    console.error('[CrashGuard] Uncaught error:', err.message);
    // Don't re-throw — let the process continue
  }
});
process.on('unhandledRejection', (reason) => {
  const msg = reason && (reason.message || String(reason));
  if (msg && (msg.includes('Target closed') || msg.includes('Browser closed') || msg.includes('Connection closed'))) {
    console.error('[CrashGuard] Unhandled browser disconnect:', msg);
  } else {
    console.error('[CrashGuard] Unhandled rejection:', msg);
  }
});

// Resume endpoint — called after user manually solves CAPTCHA
app.post('/api/search/resume', async (_req, res) => {
  try {
    console.log('[Resume] User confirmed CAPTCHA solved — continuing search...');
    const results = await resumeSearch();
    console.log(`[Resume] Done: ${results.length} shops`);
    if (results.length === 0) {
      res.json({ success: true, results, total: 0, diagnostic: '未找到符合条件的店铺。' });
    } else {
      res.json({ success: true, results, total: results.length });
    }
  } catch (e) {
    console.error(`[Resume] Error:`, e.message);
    if (e.captcha) {
      return res.json({
        success: false,
        captcha: true,
        error: e.message,
        keyword: e.keyword || '',
        progress: e.progress || '',
        shopsSoFar: e.shopsSoFar || 0,
        action: '请在浏览器窗口中手动完成人机验证，然后点击「已通过验证，继续搜索」',
      });
    }
    res.status(500).json({ error: `恢复搜索失败: ${e.message}` });
  }
});

app.get('/api/search/progress', (_req, res) => {
  const data = getProgress();
  if (!data) return res.json({ hasProgress: false });
  res.json({ hasProgress: true, ...data });
});

// Stop endpoint — sets the global stop flag
app.post('/api/search/stop', (_req, res) => {
  console.log('[Stop] Stop signal received');
  requestStop();
  res.json({ success: true, message: '停止信号已发送，将在当前关键词完成后停止' });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

if (staticDir) {
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(staticDir, 'index.html'));
  });
  console.log(`[Static] Serving UI from ${staticDir}`);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (staticDir) console.log(`打开浏览器访问: http://localhost:${PORT}`);
});
