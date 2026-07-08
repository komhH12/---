import { useState, useCallback, useEffect } from 'react';
import { getStatus, startLogin, search, searchMulti, resumeSearch, getProgress, stopSearch } from './api';
import { exportWord, exportPDF, exportExcel } from './export';

const CATS = [
  { id: 'all', label: '全部品类 (14品类)', kw: ['女装','男装','手机','化妆品','零食','家居','运动','母婴','家电','鞋靴','珠宝','内衣','食品','箱包'] },
  { id: 'womens', label: '女装', kw: ['女装','连衣裙','T恤','牛仔裤','衬衫','半身裙','外套','毛衣'] },
  { id: 'mens', label: '男装', kw: ['男装','T恤','休闲裤','衬衫','牛仔裤','夹克','卫衣'] },
  { id: 'cosmetics', label: '美妆护肤', kw: ['化妆品','口红','面膜','粉底液','防晒霜','香水','精华液'] },
  { id: 'phone', label: '手机数码', kw: ['手机','平板','耳机','充电宝','智能手表','蓝牙音箱','相机'] },
  { id: 'home', label: '家居家装', kw: ['家居','四件套','收纳','灯具','窗帘','地毯','墙纸'] },
  { id: 'food', label: '食品零食', kw: ['零食','坚果','茶叶','咖啡','巧克力','饼干'] },
  { id: 'baby', label: '母婴玩具', kw: ['母婴','纸尿裤','奶粉','玩具','童装','婴儿车'] },
  { id: 'sports', label: '运动户外', kw: ['运动','跑步鞋','瑜伽服','健身','帐篷','泳衣'] },
  { id: 'shoes', label: '鞋靴箱包', kw: ['运动鞋','女鞋','男鞋','凉鞋','靴子','双肩包'] },
  { id: 'appliance', label: '家电电器', kw: ['家电','冰箱','洗衣机','空调','电饭煲'] },
  { id: 'jewelry', label: '珠宝饰品', kw: ['珠宝','项链','手链','戒指','耳环','手镯'] },
  { id: 'underwear', label: '内衣家居', kw: ['内衣','文胸','内裤','睡衣','家居服'] },
];

const fmt = n => n >= 1e4 ? (n/1e4).toFixed(n>=1e5?0:1) + '万' : n.toLocaleString();
const SPIN = <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50" opacity="0.3"/><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50" strokeDashoffset="36"/></svg>;
const SearchIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>;
const CopyIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;

export default function App() {
  const [catId, setCatId] = useState('all');
  const [kw, setKw] = useState('');
  const [minFans, setMinFans] = useState(300000);
  const [minAvgPrice, setMinAvgPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState([]);
  const [loggedIn, setLoggedIn] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [searchedKw, setSearchedKw] = useState('');
  const [page, setPage] = useState(1);
  const PAGE = 30;

  // Scroll mode: 'semi' = scrollTo (needs manual trigger), 'auto' = mouse.wheel events
  const [scrollMode, setScrollMode] = useState('semi');

  // Stop button
  const [stopBusy, setStopBusy] = useState(false);

  // CAPTCHA state
  const [captcha, setCaptcha] = useState(null); // { message, keyword, progress, shopsSoFar }
  const [captchaBusy, setCaptchaBusy] = useState(false);

  // Real-time progress
  const [live, setLive] = useState(null); // { progress, totalShops, currentKeyword, results }
  const [showLive, setShowLive] = useState(false);

  // Poll progress every 3s while searching
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(async () => {
      try {
        const p = await getProgress();
        if (p && p.hasProgress !== false) {
          setLive(p);
          setShowLive(true);
          // If results are coming in, also update results for instant feedback
          if (p.results && p.results.length > 0) setResults(p.results);
        }
      } catch (_) {}
    }, 3000);
    return () => clearInterval(t);
  }, [loading]);

  // Refs — use the dynamic results from live polling
  const currentResults = (live && live.results && live.results.length > 0) ? live.results : results;

  const cat = CATS.find(c => c.id === catId) || CATS[0];
  const totalPages = Math.max(1, Math.ceil(currentResults.length / PAGE));
  const pageData = currentResults.slice((page-1)*PAGE, page*PAGE);

  useEffect(() => {
    const t = setInterval(async () => {
      try { const s = await getStatus(); setLoggedIn(s.loggedIn); } catch(_){}
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const doLogin = useCallback(async () => {
    setLoginBusy(true); setErr(''); setCaptcha(null);
    try { await startLogin(); } catch(e) { setErr(e.message); }
    finally { setLoginBusy(false); }
  }, []);

  const handleCaptcha = (caught) => {
    setCaptcha(caught);
    setLoading(false);
    setErr('');
  };

  const doResume = useCallback(async () => {
    setCaptchaBusy(true);
    try {
      const d = await resumeSearch();
      if (d.captcha) {
        // Still on CAPTCHA — show again
        handleCaptcha({ message: d.error, keyword: d.keyword, progress: d.progress, shopsSoFar: d.shopsSoFar });
      } else {
        setCaptcha(null);
        setResults(d.results || []);
        if (!d.results?.length) setErr(d.diagnostic || '没有找到符合条件的店铺');
      }
    } catch(e) {
      setErr(e.message);
      setCaptcha(null);
    }
    finally { setCaptchaBusy(false); }
  }, []);

  const doStop = useCallback(async () => {
    setStopBusy(true);
    try { await stopSearch(); }
    catch (_) {}
    finally { setStopBusy(false); }
  }, []);

  const runSearch = useCallback(async (e) => {
    e?.preventDefault();
    setErr(''); setCaptcha(null); setLoading(true); setResults([]); setPage(1);

    if (!kw.trim() && catId === 'all') {
      setSearchedKw('全部品类');
      try {
        const s = await getStatus();
        setLoggedIn(s.loggedIn);
        if (!s.loggedIn) { setErr('请先登录 — 点击导航栏的「连接淘宝」'); setLoading(false); return; }
        const d = await searchMulti(cat.kw.slice(0, 10), minFans, scrollMode, minAvgPrice);
        if (d.captcha) { handleCaptcha({ message: d.error, keyword: d.keyword, progress: d.progress, shopsSoFar: d.shopsSoFar }); return; }
        if (d.browserClosed) {
          setErr(d.error);
          if (d.saved && d.saved.results && d.saved.results.length > 0) {
            setResults(d.saved.results);
            setShowLive(true);
            setLive(d.saved);
          }
          setLoading(false);
          return;
        }
        setResults(d.results || []);
        if (!d.results?.length) setErr(d.diagnostic || '没有找到符合条件的店铺');
      } catch(e2) { setErr(e2.message); }
      finally { setLoading(false); }
      return;
    }

    const finalKw = kw.trim() || cat.kw[0];
    if (!finalKw) { setErr('请输入关键词'); setLoading(false); return; }

    const s = await getStatus();
    setLoggedIn(s.loggedIn);
    if (!s.loggedIn) { setErr('请先登录 — 点击导航栏的「连接淘宝」'); setLoading(false); return; }

    const searchKws = kw.trim() ? [finalKw] : cat.kw.slice(0, 3);
    setSearchedKw(finalKw);
    try {
      let d;
      if (searchKws.length > 1) d = await searchMulti(searchKws, minFans, scrollMode, minAvgPrice);
      else d = await search(finalKw, minFans, scrollMode, minAvgPrice);
      if (d.captcha) { handleCaptcha({ message: d.error, keyword: d.keyword, progress: d.progress, shopsSoFar: d.shopsSoFar }); return; }
      if (d.browserClosed) {
        setErr(d.error);
        if (d.saved && d.saved.results) { setResults(d.saved.results); setShowLive(true); setLive(d.saved); }
        setLoading(false);
        return;
      }
      setResults(d.results || []);
      if (!d.results?.length) setErr(d.diagnostic || '没有找到符合条件的店铺');
    } catch(e2) { setErr(e2.message); }
    finally { setLoading(false); }
  }, [kw, cat, minFans]);

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-ink)] antialiased flex flex-col">
      {/* ──────────── Top Bar ──────────── */}
      <div className="bg-white border-b border-[var(--color-line)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-brand)] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
              </svg>
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-[15px] tracking-tight">淘宝店铺查询</span>
              <span className="text-[11px] text-[var(--color-ink-muted)] ml-2">高粉店铺发现工具</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loggedIn === true && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent-green)] bg-[var(--color-green-wash)] px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-green)]"/> 已连接
              </span>
            )}
            {loggedIn === false && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent-red)] bg-[var(--color-red-wash)] px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent-red)]"/> 未连接
              </span>
            )}
            <button onClick={doLogin} disabled={loginBusy}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-brand)] hover:bg-[var(--color-brand-strong)] text-white text-sm font-semibold rounded-xl transition-all active:scale-[0.96] disabled:opacity-50 cursor-pointer shadow-sm">
              {loginBusy ? <>{SPIN} 打开中...</> : '连接淘宝'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-8 py-10">
        {/* ── CAPTCHA Notice (highest priority) ── */}
        {captcha && (
          <div className="mb-10 bg-red-50 border-2 border-red-400 rounded-2xl px-8 py-6 animate-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-7 h-7 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800 mb-1">人机验证已触发</h3>
                <p className="text-sm text-red-700 leading-relaxed">
                  淘宝弹出了验证码/滑块验证。请在浏览器窗口中<b>手动完成验证</b>，完成后点击下方按钮继续搜索。
                </p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-red-600">
                  {captcha.keyword && <span className="px-2 py-0.5 bg-red-100 rounded-md">关键词: {captcha.keyword}</span>}
                  {captcha.progress && <span className="px-2 py-0.5 bg-red-100 rounded-md">进度: {captcha.progress}</span>}
                  {captcha.shopsSoFar > 0 && <span className="px-2 py-0.5 bg-red-100 rounded-md">已搜到 {captcha.shopsSoFar} 家店铺</span>}
                </div>
                <button onClick={doResume} disabled={captchaBusy}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all active:scale-[0.96] disabled:opacity-50 cursor-pointer shadow-md">
                  {captchaBusy ? <>{SPIN} 继续中...</> : '✔ 已通过验证，继续搜索'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        {loggedIn === false && !captcha && (
          <div className="mb-10 bg-[var(--color-amber-wash)] border border-amber-200 rounded-2xl px-6 py-4 flex items-start gap-3 animate-in">
            <svg className="w-5 h-5 text-[var(--color-accent-amber)] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <p className="text-sm font-semibold text-amber-900">请先连接淘宝</p>
              <p className="text-xs text-amber-700 mt-0.5">点击右上角「连接淘宝」按钮，在弹出的浏览器中扫码登录。登录后手动浏览淘宝 2-3 分钟再搜索。</p>
            </div>
          </div>
        )}

        {/* ── Category Pills ── */}
        <div className="mb-8">
          <div className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.15em] mb-3">品类筛选</div>
          <div className="flex flex-wrap gap-1.5">
            {CATS.map(c => (
              <button key={c.id}
                onClick={() => { setCatId(c.id); setKw(''); setResults([]); setPage(1); setErr(''); setCaptcha(null); }}
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 cursor-pointer border
                  ${catId === c.id
                    ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]'
                    : 'bg-white text-[var(--color-ink-muted)] border-[var(--color-line)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Search Card ── */}
        <div className="bg-white border border-[var(--color-line)] rounded-2xl p-6 mb-8">
          <form onSubmit={runSearch} className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-[11px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.1em] mb-2">搜索关键词</label>
              <input type="text" value={kw} onChange={e => setKw(e.target.value)}
                placeholder={catId === 'all' ? '留空则搜索全部热门品类...' : `例：${cat.kw.slice(0,4).join('、')}`}
                className="w-full h-12 px-4 bg-[var(--color-page)] border border-[var(--color-line)] rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]
                  placeholder:text-[var(--color-line)] transition-colors" />
            </div>
            <div className="w-[140px]">
              <label className="block text-[11px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.1em] mb-2">最低粉丝</label>
              <select value={minFans} onChange={e => setMinFans(Number(e.target.value))}
                className="w-full h-12 px-4 bg-[var(--color-page)] border border-[var(--color-line)] rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]
                  appearance-none cursor-pointer"
                style={{backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 12px center'}}>
                <option value="100000">10 万</option>
                <option value="300000">30 万</option>
                <option value="500000">50 万</option>
                <option value="1000000">100 万</option>
                <option value="5000000">500 万</option>
              </select>
            </div>

            <div className="w-[140px]">
              <label className="block text-[11px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.1em] mb-2">最低均价</label>
              <select value={minAvgPrice} onChange={e => setMinAvgPrice(Number(e.target.value))}
                className="w-full h-12 px-4 bg-[var(--color-page)] border border-[var(--color-line)] rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]
                  appearance-none cursor-pointer"
                style={{backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 12px center'}}>
                <option value="0">不限制</option>
                <option value="50">¥50 以上</option>
                <option value="100">¥100 以上</option>
                <option value="200">¥200 以上</option>
                <option value="500">¥500 以上</option>
                <option value="1000">¥1000 以上</option>
              </select>
            </div>

            <div className="w-[140px]">
              <label className="block text-[11px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.1em] mb-2">滚动方式</label>
              <select value={scrollMode} onChange={e => setScrollMode(e.target.value)}
                className="w-full h-12 px-4 bg-[var(--color-page)] border border-[var(--color-line)] rounded-xl text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]
                  appearance-none cursor-pointer"
                style={{backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 12px center'}}>
                <option value="semi">半人工 (反爬最低)</option>
                <option value="auto">全自动 (无需操作)</option>
              </select>
            </div>

            <button type="submit" disabled={loading}
              className={`h-12 px-6 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-[0.96] cursor-pointer shadow-sm
                ${loading ? 'bg-[var(--color-line-subtle)] text-[var(--color-ink-muted)] cursor-wait' : 'bg-[var(--color-brand)] hover:bg-[var(--color-brand-strong)] text-white'}`}>
              {loading ? <>{SPIN} 搜索中...</> : <>{SearchIcon} 搜索</>}
            </button>

            {loading && (
              <button type="button" onClick={doStop} disabled={stopBusy}
                className="h-12 px-5 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-[0.96] cursor-pointer shadow-sm
                  bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
                {stopBusy ? <>{SPIN} 终止中...</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> 终止</>}
              </button>
            )}
          </form>
        </div>

        {/* ── Error ── */}
        {err && !captcha && (
          <div className="mb-8 bg-[var(--color-red-wash)] border border-red-200 rounded-2xl px-6 py-4 flex items-start gap-3 animate-in">
            <svg className="w-5 h-5 text-[var(--color-accent-red)] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-sm font-medium text-red-800">{err}</p>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && !captcha && (
          <div className="mb-8 bg-white border border-[var(--color-line)] rounded-2xl p-20 flex flex-col items-center gap-6 animate-in">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-[var(--color-brand)] animate-bounce" style={{animationDelay:'0ms'}}/>
              <div className="w-3 h-3 rounded-full bg-[var(--color-brand)] animate-bounce" style={{animationDelay:'150ms'}}/>
              <div className="w-3 h-3 rounded-full bg-[var(--color-brand)] animate-bounce" style={{animationDelay:'300ms'}}/>
            </div>
            <p className="text-sm text-[var(--color-ink-muted)]">正在淘宝无限滚动搜索全部店铺，请稍候...</p>
            {live && (
              <div className="mt-4 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
                💾 <b>实时已保存:</b> {live.progress} 完成 · {live.totalShops} 家店铺 · 当前: {live.currentKeyword}
              </div>
            )}
            {showLive && live && live.results && live.results.length > 0 && (
              <div className="mt-4 w-full max-w-lg">
                <div className="text-xs text-zinc-400 mb-2">最近搜到的店铺:</div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {live.results.slice(-5).map(s => (
                    <div key={s.shopId} className="text-xs text-zinc-500 flex justify-between px-2">
                      <span className="truncate mr-4">{s.shopName}</span>
                      <span className="tabular-nums text-[var(--color-brand)] font-medium flex-shrink-0">{fmt(s.followers)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Results ── */}
        {!loading && currentResults.length > 0 && !captcha && (
          <div className="animate-in">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">共 {currentResults.length} 家店铺</h2>
                <p className="text-xs text-[var(--color-ink-muted)] mt-1">&ldquo;{searchedKw}&rdquo; · 最低 {fmt(minFans)} 粉丝 · 共 {totalPages} 页</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportWord(currentResults, searchedKw, minFans)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                  title="导出为 Word 文档">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  Word
                </button>
                <button onClick={() => exportExcel(currentResults, searchedKw, minFans)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors cursor-pointer"
                  title="导出为 Excel (CSV)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                  Excel
                </button>
                <button onClick={() => exportPDF(currentResults, searchedKw, minFans)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                  title="导出为 PDF 文件">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  PDF
                </button>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--color-amber-wash)] text-amber-800 border border-amber-200">
                  {minFans>=1e4 ? `${(minFans/1e4).toFixed(0)} 万粉以上` : `${minFans} 粉以上`}
                </span>
              </div>
            </div>
            <div className="bg-white border border-[var(--color-line)] rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-line-subtle)] bg-[var(--color-page)]">
                    <th className="text-left pl-8 pr-4 py-3 text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.12em] w-16">排名</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.12em]">店铺名称</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.12em] w-32">粉丝数</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.12em] w-24">商品均价</th>
                    <th className="text-left pl-4 pr-2 py-3 text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.12em]">店铺链接</th>
                    <th className="text-center pr-8 pl-2 py-3 text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-[0.12em] w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((shop, idx) => {
                    const rank = (page - 1) * PAGE + idx + 1;
                    return (
                      <tr key={shop.shopId||idx} className="border-b border-[var(--color-line-subtle)] hover:bg-orange-50/40 transition-colors group"
                        style={{ animationDelay: `${idx * 40}ms`, animation: 'fade-in-up 0.4s cubic-bezier(0.2,0,0,1) both' }}>
                        <td className="pl-8 pr-4 py-5">
                          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold
                            ${rank === 1 ? 'bg-[var(--color-brand)] text-white' : rank === 2 ? 'bg-amber-400 text-white' : rank === 3 ? 'bg-zinc-500 text-white' : 'bg-zinc-100 text-zinc-500'}`}>{rank}</span>
                        </td>
                        <td className="px-4 py-5">
                          <div>
                            <span className="text-sm font-semibold">{shop.shopName}</span>
                            {shop.categoryLabel && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(shop.categories||[]).slice(0,3).map(c => (
                                  <span key={c} className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-zinc-100 text-zinc-500 border border-zinc-200">{c}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-5 text-right">
                          <span className="text-sm font-bold tabular-nums text-[var(--color-brand)]">{fmt(shop.followers)}</span>
                          <span className="text-[11px] text-zinc-400 ml-1">粉丝</span>
                        </td>
                        <td className="px-4 py-5 text-right">
                          <span className="text-sm font-semibold tabular-nums text-zinc-600">{shop.avgPrice > 0 ? '¥' + shop.avgPrice.toLocaleString() : '—'}</span>
                        </td>
                        <td className="pl-4 pr-2 py-5">
                          <a href={shop.url} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-zinc-500 hover:text-[var(--color-brand)] hover:underline font-mono transition-colors break-all">
                            {shop.url ? shop.url.replace('https://','') : ''}
                          </a>
                        </td>
                        <td className="pl-2 pr-8 py-5 text-center">
                          <button onClick={() => navigator.clipboard.writeText(shop.url)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-[var(--color-brand)] hover:bg-orange-50 cursor-pointer">
                            {CopyIcon} 复制链接
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page<=1}
                className="h-9 px-4 text-xs font-semibold rounded-lg border border-[var(--color-line)] bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">上一页</button>
              {[...Array(totalPages)].map((_, i) => {
                const pn = i+1;
                const show = totalPages <= 7 || pn === 1 || pn === totalPages || Math.abs(pn-page) <= 1;
                if (!show && (pn === page-2 || pn === page+2)) return <span key={pn} className="w-9 text-center text-zinc-300 text-xs">···</span>;
                if (!show) return null;
                return (
                  <button key={pn} onClick={() => setPage(pn)}
                    className={`w-9 h-9 text-xs font-semibold rounded-lg transition-all cursor-pointer
                      ${pn === page ? 'bg-[var(--color-ink)] text-white' : 'border border-[var(--color-line)] bg-white text-zinc-500 hover:bg-zinc-50'}`}>{pn}</button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page>=totalPages}
                className="h-9 px-4 text-xs font-semibold rounded-lg border border-[var(--color-line)] bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">下一页</button>
              <span className="text-xs text-zinc-300 mx-1">跳至</span>
              <input type="number" min={1} max={totalPages} key={totalPages}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(e.target.value); if (v>=1 && v<=totalPages) setPage(v); }}}
                className="w-13 h-9 text-xs text-center font-semibold bg-white border border-[var(--color-line)] rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]
                  [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="页" />
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-[var(--color-line)] bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between text-[11px] text-zinc-300">
          <span>数据来源：淘宝网 · 仅供内部使用</span>
          <span>v7.0 — Dual Scroll Mode</span>
        </div>
      </div>
    </div>
  );
}
