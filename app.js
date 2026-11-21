'use strict';
(function () {
  // ---------- constants ----------
  var TOKEN = '0xece5ca8bf9220718e5727754026757512212cb3c';
  var V3 = '0x6a3bacaa6493734c1ac221ebf42cf530a96c1e02';
  var V4 = '0xb3f441e8871840ecfcb284e5cbb5b9c21a50e961e1c50109bdced25e429f00cc';
  var CREATOR = '0x7d613c6316ede9d257f3bf512777cb4ea4a6bee4';
  var LIVE_MS = 60000, SNAP_MS = 600000;
  var TZ = 'Asia/Taipei';
  var FILES = ['summary', 'daily', 'addresses', 'hft', 'cex_snapshots', 'cex_daily', 'argus_stats', 'liquidity_history', 'gt_snapshot'];
  var D = {}; var L = {}; var charts = {}; var cluster = {}; var ohlcvTf = 'hour';
  var lastSnapLoad = 0, nextAt = 0;

  // ---------- DOM helpers (textContent only) ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'cls') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function put(id, kids) { var n = clear($(id)); kids.forEach(function (k) { if (k) n.appendChild(k); }); }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
  function usd(v) { if (v == null || !isFinite(v)) return '—'; var a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + '$' + (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? s + '$' + (a / 1e3).toFixed(1) + 'k' : s + '$' + a.toFixed(a < 10 ? 2 : 0); }
  function n0(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-US'); }
  function nm(v) { if (v == null || !isFinite(v)) return '—'; var a = Math.abs(v); return a >= 1e8 ? (v / 1e8).toFixed(2) + ' 億' : a >= 1e4 ? (v / 1e4).toFixed(1) + ' 萬' : n0(v); }
  function px(v) { return v == null || !isFinite(v) ? '—' : (v < 0.01 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(2)); }
  function pct(v, d) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d == null ? 1 : d) + '%'; }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }
  function tpe(d, withSec) {
    if (!(d instanceof Date) || isNaN(d)) return '—';
    return d.toLocaleString('zh-TW', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: withSec ? '2-digit' : undefined }) + '（UTC+8）';
  }
  function tpeDay(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); }
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function tagEl(addr, tag) {
    var a = (addr || '').toLowerCase(); var t = tag || (a === CREATOR ? '項目方（合約部署／回購錢包）' : cluster[a] ? '疑似項目方關聯（推論）' : '');
    if (!t) return null; return el('span', { cls: 'tag ' + (t.indexOf('疑似') === 0 ? 'rel' : 'cre'), text: t.indexOf('疑似') === 0 ? '疑似項目方關聯（推論）' : '項目方' , title: t });
  }
  function hexOk(h) { return typeof h === 'string' && /^0x[0-9a-fA-F]{40,64}$/.test(h); }
  function txLink(h) { return hexOk(h) ? el('a', { href: 'https://explorer.arc.io/tx/' + h, target: '_blank', rel: 'noopener noreferrer', text: short(h) }) : document.createTextNode('—'); }
  function addrCell(addr, tag, full) { return el('td', { cls: 'l mono' }, [hexOk(addr) ? el('a', { href: 'https://explorer.arc.io/address/' + addr, rel: 'noopener noreferrer', target: '_blank', text: full ? addr : short(addr) }) : document.createTextNode(String(addr || '—')), tagEl(addr, tag)]); }
  function table(cols, rows, opt) {
    opt = opt || {};
    var thead = el('thead', null, [el('tr', null, cols.map(function (c, i) { return el('th', { cls: (opt.left || [0]).indexOf(i) >= 0 ? 'l' : '', text: c }); }))]);
    var tb = el('tbody', null, rows.map(function (r) { return el('tr', null, r.map(function (c, i) { if (c instanceof Node && c.tagName === 'TD') return c; return el('td', { cls: (opt.left || [0]).indexOf(i) >= 0 ? 'l' : '' }, [c instanceof Node ? c : (c == null ? '—' : String(c))]); })); }));
    return el('div', { cls: 'tablewrap' }, [el('table', null, [thead, tb])]);
  }
  function card(title, kids, note) { return el('div', { cls: 'card' }, [title ? el('h3', { text: title }) : null].concat(kids).concat(note ? [el('p', { cls: 'note', text: note })] : [])); }
  function metric(l, v, s, cls) { return el('div', { cls: 'metric' }, [el('div', { cls: 'l', text: l }), el('div', { cls: 'v ' + (cls || ''), text: v }), s ? el('div', { cls: 's', text: s }) : null]); }
  function src(live, t) { return el('span', { cls: 'src' + (live ? ' live' : ''), text: live ? '即時' : '快照 ' + (t || '') }); }
  function canvas(id, small) { return el('div', { cls: 'chartbox' + (small ? ' sm' : '') }, [el('canvas', { id: id })]); }
  function seg(opts, val, on) { return el('div', { cls: 'seg' }, opts.map(function (o) { var b = el('button', { type: 'button', cls: o[0] === val ? 'on' : '', text: o[1] }); b.addEventListener('click', function () { on(o[0]); }); return b; })); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function mkChart(id, cfg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    var c = $(id); if (!c || !window.Chart) return;
    Chart.defaults.color = css('--muted'); Chart.defaults.borderColor = css('--line');
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 12 } } } }, cfg.options || {});
    charts[id] = new Chart(c, cfg);
  }

  // ---------- fetch ----------
  function getJSON(url, ms) {
    var ctl = new AbortController(); var t = setTimeout(function () { ctl.abort(); }, ms || 20000);
    return fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function loadSnapshots() {
    return Promise.all(FILES.map(function (f) { return getJSON('data/' + f + '.json?t=' + Date.now()).then(function (j) { D[f] = j; }, function (e) { D[f] = D[f] || null; console.warn(f, e); }); }))
      .then(function () { lastSnapLoad = Date.now(); ((D.summary && D.summary.cluster && D.summary.cluster.addresses) || []).forEach(function (a) { cluster[a.toLowerCase()] = 1; }); });
  }
  var GT = 'https://api.geckoterminal.com/api/v2/networks/arc/pools/';
  function loadLive() {
    var jobs = {
      dex: getJSON('https://api.dexscreener.com/latest/dex/tokens/' + TOKEN),
      gateT: getJSON('https://api.gateio.ws/api/v4/spot/tickers?currency_pair=ARGUS_USDT'),
      gateB: getJSON('https://api.gateio.ws/api/v4/spot/order_book?currency_pair=ARGUS_USDT&limit=200'),
      gateX: getJSON('https://api.gateio.ws/api/v4/spot/trades?currency_pair=ARGUS_USDT&limit=500'),
      weexT: getJSON('https://api-spot.weex.com/api/v3/market/ticker/24hr?symbol=ARGUSUSDT'),
      weexB: getJSON('https://api-spot.weex.com/api/v3/market/depth?symbol=ARGUSUSDT&limit=200'),
      weexX: getJSON('https://api-spot.weex.com/api/v3/market/trades?symbol=ARGUSUSDT&limit=1000')
    };
    var keys = Object.keys(jobs);
    gtRefresh();
    return Promise.all(keys.map(function (k) { return jobs[k].then(function (v) { L[k] = v; L[k + '_err'] = null; }, function (e) { L[k + '_err'] = String(e.message || e); }); }));
  }

  // ---------- GeckoTerminal: cached, staggered, backed-off (public API ~30 calls/min per IP; 429 has no CORS header -> "Failed to fetch") ----------
  var GTK = { gtV3: { url: function () { return GT + V3 + '/trades'; }, ttl: 110000 }, gtV4: { url: function () { return GT + V4 + '/trades'; }, ttl: 110000 },
    ohlcv: { url: function () { return GT + V3 + '/ohlcv/' + ohlcvTf + '?aggregate=1&limit=' + (ohlcvTf === 'hour' ? 168 : 90) + '&currency=usd'; }, ttl: 900000, key: function () { return 'ohlcv_' + ohlcvTf; } } };
  var gtState = {}; // k -> {t: last good ms, fail: n, next: ms, src: 'live'|'cache'|'snapshot'}
  function lsGet(k) { try { var v = localStorage.getItem('argusdash_' + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem('argusdash_' + k, JSON.stringify(v)); } catch (e) { } }
  function gtKey(k) { return GTK[k].key ? GTK[k].key() : k; }
  function gtFetch(k) {
    var ck = gtKey(k), st = gtState[ck] = gtState[ck] || { fail: 0, next: 0 }, now = Date.now(), c = lsGet(ck);
    if (c && now - c.t < GTK[k].ttl) { L[k] = c.v; st.t = c.t; st.src = 'cache'; return Promise.resolve(); }
    var bo = lsGet('bo_' + ck); if (bo && bo.next > now) { if (c) { L[k] = c.v; st.t = c.t; } st.stale = true; return Promise.resolve(); }
    var lock = lsGet('lock_' + ck); if (lock && now - lock < 15000) { return new Promise(function (r) { setTimeout(function () { var c2 = lsGet(ck); if (c2) { L[k] = c2.v; st.t = c2.t; } r(); }, 4000); }); }
    lsSet('lock_' + ck, now);
    return getJSON(GTK[k].url(), 15000).then(function (v) {
      L[k] = v; st.t = Date.now(); st.fail = 0; st.stale = false; st.src = 'live'; lsSet(ck, { t: st.t, v: v }); lsSet('bo_' + ck, null); lsSet('lock_' + ck, 0);
    }, function (e) {
      st.fail = ((lsGet('bo_' + ck) || {}).fail || 0) + 1; var wait = Math.min(900000, 60000 * Math.pow(2, st.fail - 1));
      lsSet('bo_' + ck, { fail: st.fail, next: Date.now() + wait }); lsSet('lock_' + ck, 0); st.stale = true; st.err = String(e.message || e);
      if (c) { L[k] = c.v; st.t = c.t; } console.warn('GeckoTerminal', ck, st.err, 'retry in', wait / 1000, 's');
    });
  }
  function gtRefresh() {
    // staggered: V3 trades now, V4 trades +6s, OHLCV +12s (OHLCV TTL 15 min, so normally only on load / range switch)
    gtFetch('gtV3').then(function () { safe(renderLive); safe(renderRisk); });
    setTimeout(function () { gtFetch('gtV4').then(function () { safe(renderLive); safe(renderRisk); }); }, 6000);
    setTimeout(function () { gtFetch('ohlcv').then(function () { safe(renderLive); }); }, 12000);
  }
  function hhmm(t) { return (t && isFinite(t)) ? new Date(t).toLocaleTimeString('zh-TW', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' }) : '—'; }
  function gtNote() {
    var a = gtState.gtV3 || {}, b = gtState.gtV4 || {}, snap = D.gt_snapshot;
    var haveLive = L.gtV3 || L.gtV4;
    if (!haveLive) return snap ? '暫時無法更新，顯示伺服器快照 ' + (snap.generated_at || '').slice(11, 16) + ' 的資料' : '暫時無法更新，稍後自動重試';
    if (a.stale || b.stale) return '暫時無法更新，顯示 ' + hhmm(Math.min(a.t || Infinity, b.t || Infinity)) + ' 的資料（稍後自動重試）';
    return '成交資料時間 ' + hhmm(Math.min(a.t || Infinity, b.t || Infinity)) + '（約每 2 分鐘更新）';
  }

  // ---------- live derived ----------
  function dexPairs() { return ((L.dex && L.dex.pairs) || []).filter(function (p) { return p.chainId === 'arc'; }); }
  function mainPair() { return dexPairs().find(function (p) { return p.pairAddress.toLowerCase() === V3; }); }
  function v4Pair() { return dexPairs().find(function (p) { return p.pairAddress.toLowerCase() === V4; }); }
  function usdcLiq() { return dexPairs().filter(function (p) { return p.quoteToken && p.quoteToken.symbol === 'USDC'; }).reduce(function (a, p) { return a + ((p.liquidity && p.liquidity.usd) || 0); }, 0); }
  function vol24() { return dexPairs().reduce(function (a, p) { return a + ((p.volume && p.volume.h24) || 0); }, 0); }
  function livePrice() { var m = mainPair(); return m ? num(m.priceUsd) : null; }
  function liveTrades() {
    var out = [];
    var snap = D.gt_snapshot || {};
    [['gtV3', 'V3 主池'], ['gtV4', 'V4 USDC']].forEach(function (k) {
      ((L[k[0]] && L[k[0]].data) || (snap[k[0]] && snap[k[0]].data) || []).forEach(function (t) { var a = t.attributes; out.push({ t: new Date(a.block_timestamp), pool: k[1], kind: a.kind, usd: num(a.volume_in_usd), from: a.tx_from_address, tx: a.tx_hash, argus: a.kind === 'buy' ? num(a.to_token_amount) : num(a.from_token_amount), price: a.kind === 'buy' ? num(a.price_to_in_usd) : num(a.price_from_in_usd) }); });
    });
    return out.sort(function (a, b) { return b.t - a.t; });
  }
  function bookDepth(bids, asks) {
    if (!bids || !asks || !bids.length || !asks.length) return null;
    var bb = num(bids[0][0]), ba = num(asks[0][0]), mid = (bb + ba) / 2, b2 = 0, a2 = 0;
    bids.forEach(function (x) { var p = num(x[0]); if (p >= mid * 0.98) b2 += p * num(x[1]); });
    asks.forEach(function (x) { var p = num(x[0]); if (p <= mid * 1.02) a2 += p * num(x[1]); });
    return { mid: mid, bid2: b2, ask2: a2, spread: (ba - bb) / mid * 100 };
  }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function liveCex() {
    var rows = [];
    if (L.gateT && L.gateT[0]) {
      var g = L.gateT[0], d = L.gateB ? bookDepth(L.gateB.bids, L.gateB.asks) : null, tr = (L.gateX || []).map(function (x) { return num(x.amount) * num(x.price); });
      var ts = (L.gateX || []).map(function (x) { return num(x.create_time_ms); });
      rows.push({ name: 'Gate ARGUS/USDT', live: true, price: num(g.last), vol24: num(g.quote_volume), chg: num(g.change_percentage), d: d, n: tr.length, med: median(tr), span: ts.length ? (Math.max.apply(null, ts) - Math.min.apply(null, ts)) / 60000 : null });
    }
    if (L.weexT) {
      var w = L.weexT, dw = L.weexB ? bookDepth(L.weexB.bids, L.weexB.asks) : null, trw = (L.weexX || []).map(function (x) { return num(x.quoteQty); });
      var tw = (L.weexX || []).map(function (x) { return x.time; });
      rows.push({ name: 'WEEX ARGUS/USDT', live: true, price: num(w.lastPrice), vol24: num(w.quoteVolume), chg: num(w.priceChangePercent) * 100, d: dw, n: trw.length, med: median(trw), span: tw.length ? (Math.max.apply(null, tw) - Math.min.apply(null, tw)) / 60000 : null });
    }
    return rows;
  }
  function latestSnapRows() {
    var s = (D.cex_snapshots && D.cex_snapshots.snapshots) || []; var last = {};
    s.forEach(function (r) { if (r.status === 'ok' && (!last[r.exchange] || r.snap_ts > last[r.exchange].snap_ts)) last[r.exchange] = r; });
    return last;
  }
  var EXN = { lbank: 'LBank ARGUS/USDT', mexc_usdt: 'MEXC ARGUS/USDT', mexc_usd1: 'MEXC ARGUS/USD1', gate: 'Gate ARGUS/USDT', weex: 'WEEX ARGUS/USDT' };

  // ---------- risk rubric ----------
  // Each factor: points by threshold; total normalised to 0-100. Levels: <20 正常, 20-39 低風險, 40-59 中等風險, >=60 高危險.
  function band(v, steps) { for (var i = 0; i < steps.length; i++) if (steps[i][0](v)) return steps[i][1]; return 0; }
  function computeRisk() {
    var F = [], S = D.summary || {}, rows = ((D.daily && D.daily.rows) || []), today = tpeDay(new Date());
    var m = mainPair(), p = livePrice();
    function add(name, value, pts, max, rule, live, note) { F.push({ name: name, value: value, pts: pts, max: max, rule: rule, live: live, note: note }); }
    // 1 price change 24h
    var ch = m && m.priceChange ? num(m.priceChange.h24) : null;
    add('24 小時價格變化', pct(ch), ch == null ? 0 : band(ch, [[function (v) { return v > -5; }, 0], [function (v) { return v > -15; }, 4], [function (v) { return v > -25; }, 8], [function () { return true; }, 12]]), 12, '> -5%：0｜-5～-15%：4｜-15～-25%：8｜≤ -25%：12', true, ch == null ? '資料暫缺' : null);
    // 2 drawdown from ATH close
    var ath = S.ath_close, dd = (ath && p) ? (1 - p / ath) * 100 : null;
    add('距歷史最高收盤跌幅', dd == null ? '—' : dd.toFixed(1) + '%（高點 ' + px(ath) + '，' + (S.ath_day || '') + '）', dd == null ? 0 : band(dd, [[function (v) { return v < 30; }, 0], [function (v) { return v < 60; }, 3], [function (v) { return v < 85; }, 6], [function () { return true; }, 8]]), 8, '< 30%：0｜30–60%：3｜60–85%：6｜≥ 85%：8', true);
    // 3 liquidity level
    var lq = usdcLiq();
    add('USDC 池流動性', usd(lq), !lq ? 0 : band(lq, [[function (v) { return v >= 500000; }, 0], [function (v) { return v >= 200000; }, 4], [function (v) { return v >= 100000; }, 7], [function () { return true; }, 10]]), 10, '≥ $500k：0｜$200k–500k：4｜$100k–200k：7｜< $100k：10', true, !lq ? '資料暫缺' : null);
    // 4 liquidity change vs ~24h ago (history recorded each publish)
    var H = ((D.liquidity_history && D.liquidity_history.points) || []), now = Date.now() / 1000, ref = null;
    H.forEach(function (h) { if (now - h.ts >= 12 * 3600 && h.liq_main) { if (!ref || Math.abs(now - h.ts - 86400) < Math.abs(now - ref.ts - 86400)) ref = h; } });
    var lm = m && m.liquidity ? m.liquidity.usd : null, lc = (ref && lm) ? (lm / ref.liq_main - 1) * 100 : null;
    add('主池流動性變化（對比約 24 小時前）', lc == null ? '歷史不足' : pct(lc) + '（' + usd(ref.liq_main) + ' → ' + usd(lm) + '）', lc == null ? 0 : band(lc, [[function (v) { return v >= -5; }, 0], [function (v) { return v >= -20; }, 5], [function (v) { return v >= -50; }, 10], [function () { return true; }, 15]]), 15, '≥ -5%：0｜-5～-20%：5｜-20～-50%：10｜< -50%：15', true, lc == null ? '需累積 12 小時以上的發布紀錄，暫計 0 分' : null);
    // 5 volume trend
    var full = rows.filter(function (r) { return !r.partial; }).slice(-7), avg7 = full.length ? full.reduce(function (a, r) { return a + r.dex; }, 0) / full.length : null, v24 = vol24(), vr = (avg7 && v24) ? v24 / avg7 : null;
    add('鏈上成交量趨勢（24h ÷ 前 7 日均）', vr == null ? '—' : vr.toFixed(2) + ' 倍（' + usd(v24) + ' ／ ' + usd(avg7) + '）', vr == null ? 0 : band(vr, [[function (v) { return v >= 0.8; }, 0], [function (v) { return v >= 0.5; }, 3], [function (v) { return v >= 0.25; }, 6], [function () { return true; }, 8]]), 8, '≥ 0.8：0｜0.5–0.8：3｜0.25–0.5：6｜< 0.25：8', true);
    // 6 creator net outflow 7d (+ live sells in latest trades)
    var lt = liveTrades(), creSellLive = lt.filter(function (t) { return t.kind === 'sell' && (t.from || '').toLowerCase() === CREATOR; }).reduce(function (a, t) { return a + (t.usd || 0); }, 0);
    var fc = S.flows7_creator, cn = fc ? Math.max(0, fc.net_out_usd) + creSellLive : creSellLive;
    add('項目方錢包淨轉出（7 天）', usd(fc ? fc.net_out_usd : null) + (creSellLive ? '；最新成交中賣出 ' + usd(creSellLive) : '') + (fc && fc.net_out_usd < 0 ? '（淨流入，含回購）' : ''), band(cn, [[function (v) { return v <= 0; }, 0], [function (v) { return v <= 1000; }, 5], [function (v) { return v <= 10000; }, 10], [function () { return true; }, 15]]), 15, '≤ $0：0｜≤ $1k：5｜≤ $10k：10｜> $10k：15', false, '7 天數字為每日鏈上分析；另即時檢查最新成交');
    // 7 suspected related cluster net outflow 7d (+ live)
    var clSellLive = lt.filter(function (t) { return t.kind === 'sell' && cluster[(t.from || '').toLowerCase()]; }).reduce(function (a, t) { return a + (t.usd || 0); }, 0);
    var fr = S.flows7_cluster, rn = (fr ? Math.max(0, fr.net_out_usd) : 0) + clSellLive;
    add('疑似項目方關聯地址淨轉出（7 天）', usd(fr ? fr.net_out_usd : null) + (clSellLive ? '；最新成交中賣出 ' + usd(clSellLive) : ''), band(rn, [[function (v) { return v < 1000; }, 0], [function (v) { return v < 10000; }, 4], [function (v) { return v < 50000; }, 8], [function () { return true; }, 12]]), 12, '< $1k：0｜$1k–10k：4｜$10k–50k：8｜≥ $50k：12', false, '轉出含賣到池子、轉入交易所或轉給其他地址');
    // 8 buyback / burn continuity
    var bbDay = S.last_buyback_day, bbApi = D.argus_stats && D.argus_stats.buybacks && D.argus_stats.buybacks.days;
    if (bbApi) bbApi.forEach(function (x) { if (x.amounts && Number(x.amounts.buys) > 0 && (!bbDay || x.date > bbDay)) bbDay = x.date; });
    var cbDay = S.last_creator_burn_day, dB = bbDay ? dayDiff(bbDay, today) : 99, dC = cbDay ? dayDiff(cbDay, today) : 99;
    var pB = dB <= 2 ? 0 : dB <= 7 ? 3 : 6, pC = dC <= 7 ? 0 : dC <= 14 ? 2 : 4;
    add('回購與銷毀是否持續', '最近回購 ' + (bbDay || '—') + '（' + dB + ' 天前）；項目方錢包最近一次自行銷毀 ' + (cbDay || '—') + '（' + dC + ' 天前）', pB + pC, 10, '回購 ≤2 天：0｜3–7 天：3｜>7 天：6；自行銷毀 ≤7 天：0｜8–14 天：2｜>14 天：4', false, '回購日期取 argus.world 回購 API 與鏈上分析較新者');
    // 9 CEX volume vs depth / wash-trading signs (largest reported-volume exchange, latest daily stats)
    var cr = (D.cex_daily && D.cex_daily.rows) || [], lastDay = cr.reduce(function (a, r) { return r.day > a ? r.day : a; }, ''), top = cr.filter(function (r) { return r.day === lastDay; }).sort(function (a, b) { return (b.vol24 || 0) - (a.vol24 || 0); })[0];
    var p9 = 0, v9 = '—';
    if (top) {
      var vd = top.vol_to_depth2 || 0, sig = 0, sigs = [];
      p9 = vd < 50 ? 0 : vd < 500 ? 2 : vd < 5000 ? 4 : 6;
      if (top.small20 > 0.8) { sig++; sigs.push('<$20 成交占 ' + (top.small20 * 100).toFixed(0) + '%'); }
      if (top.repeat_quote_share > 0.2) { sig++; sigs.push('同金額重複占 ' + (top.repeat_quote_share * 100).toFixed(0) + '%'); }
      if (top.gap_median_s != null && top.gap_median_s < 2) { sig++; sigs.push('成交間隔中位 ' + top.gap_median_s.toFixed(1) + ' 秒'); }
      p9 += sig; v9 = top.exchange + '：24h 量是 ±2% 深度的 ' + n0(vd) + ' 倍' + (sigs.length ? '；' + sigs.join('、') : '') + '（' + lastDay + '）';
    }
    add('交易所量深比與刷量跡象', v9, p9, 9, '量／±2% 深度 < 50：0｜50–500：2｜500–5,000：4｜≥ 5,000：6；另各加 1 分：<$20 成交 > 80%、同金額重複 > 20%、成交間隔中位 < 2 秒', false, '刷量跡象是行為特徵，不代表能認定是誰下單');
    // 10 potential sell pressure (cluster holdings + one-sided sell wall, % of supply)
    var c = S.cluster || {}, sup = S.supply || 1e9, sp = ((c.balance || 0) + (c.sell_wall_argus || 0)) / sup * 100;
    add('潛在賣壓（疑似關聯地址持有＋單邊賣牆）', sp.toFixed(1) + '% 總量（持有 ' + nm(c.balance) + ' 顆＋賣牆 ' + nm(c.sell_wall_argus) + ' 顆）', band(sp, [[function (v) { return v < 2; }, 0], [function (v) { return v < 5; }, 3], [function (v) { return v < 10; }, 5], [function (v) { return v < 15; }, 7], [function () { return true; }, 9]]), 9, '< 2%：0｜2–5%：3｜5–10%：5｜10–15%：7｜≥ 15%：9', false, c.sell_wall_note);
    var tot = F.reduce(function (a, f) { return a + f.pts; }, 0), max = F.reduce(function (a, f) { return a + f.max; }, 0), score = Math.round(tot / max * 100);
    var lv = score < 20 ? 0 : score < 40 ? 1 : score < 60 ? 2 : 3, why = [];
    // hard escalation
    if (lm != null && lm < 50000) { lv = 3; why.push('主池流動性低於 $50k'); }
    if (ch != null && ch <= -50) { lv = 3; why.push('24 小時跌幅超過 50%'); }
    if (lc != null && lc <= -50) { lv = 3; why.push('主池流動性 24 小時內減少超過一半'); }
    if (cn > 10000) { lv = 3; why.push('項目方錢包 7 天淨轉出超過 $10k'); }
    return { F: F, tot: tot, max: max, score: score, lv: lv, why: why };
  }
  var LV = ['正常', '低風險', '中等風險', '高危險'];
  function renderRisk() {
    var r = computeRisk(), bar = el('div', { cls: 'scorebar' }, [el('i')]); bar.firstChild.style.left = 'calc(' + Math.min(100, r.score) + '% - 2px)';
    var head = el('div', { cls: 'riskhead' }, [el('div', { cls: 'riskbadge lv' + r.lv, text: LV[r.lv] }), el('div', null, [el('div', { text: '風險分數 ' + r.score + ' ／ 100（原始 ' + r.tot + ' ／ ' + r.max + ' 分）' }), bar, el('div', { cls: 'muted', text: '0–19 正常｜20–39 低風險｜40–59 中等風險｜60–100 高危險' })])]);
    var rows = r.F.map(function (f) { return [el('td', { cls: 'l' }, [f.name, ' ', src(f.live)]), el('td', { cls: 'wrap', text: f.value + (f.note ? '（' + f.note + '）' : '') }), f.pts + ' ／ ' + f.max, el('td', { cls: 'wrap muted', text: f.rule })]; });
    put('riskBody', [head, r.why.length ? el('p', { cls: 'err', text: '直接列為高危險：' + r.why.join('；') }) : null, table(['指標', '目前數值', '得分', '計分門檻'], rows, { left: [0, 1, 3] }),
      el('p', { cls: 'note', text: '評級由網頁依目前資料自動計算，每次重新整理都會重算；標「即時」的指標來自瀏覽器直接讀取的 API，其他來自最近一次發布的快照。直接升級條件：主池流動性 < $50k、24h 跌幅 ≥ 50%、主池流動性 24h 減少 ≥ 50%、項目方錢包 7 天淨轉出 > $10k。這是依交易數據的量化參考，不是投資建議，也不是對任何人的指控。' })]);
  }

  // ---------- renderers ----------
  function renderLive() {
    var m = mainPair(), v4 = v4Pair(), p = livePrice();
    var ks = [];
    if (m) {
      var ch = m.priceChange || {}, tx = (m.txns && m.txns.h24) || {};
      ks.push(metric('價格（V3 主池）', '$' + px(p), '1h ' + pct(ch.h1) + '｜6h ' + pct(ch.h6), ''));
      ks.push(metric('24 小時漲跌', pct(ch.h24), 'DexScreener', ch.h24 >= 0 ? 'up' : 'down'));
      ks.push(metric('主池流動性', usd(m.liquidity && m.liquidity.usd), nm(m.liquidity && m.liquidity.base) + ' ARGUS＋' + usd(m.liquidity && m.liquidity.quote) + ' USDC'));
      ks.push(metric('V4 USDC 池流動性', usd(v4 && v4.liquidity && v4.liquidity.usd), v4 ? '24h 量 ' + usd(v4.volume && v4.volume.h24) : ''));
      ks.push(metric('全部 Arc 池 24h 量', usd(vol24()), dexPairs().length + ' 個池'));
      ks.push(metric('主池 24h 筆數', n0((tx.buys || 0) + (tx.sells || 0)), '買 ' + n0(tx.buys) + '｜賣 ' + n0(tx.sells)));
      ks.push(metric('市值（FDV）', usd(m.fdv), '總量 10 億顆'));
    } else ks.push(metric('DexScreener', '讀取失敗', L.dex_err || ''));
    var bs = D.argus_stats && D.argus_stats.burn; if (bs) ks.push(metric('累計銷毀', nm(bs.amount) + ' 顆', (bs.supplyPercent || 0).toFixed(2) + '% 總量（快照）'));
    put('liveMetrics', ks);
    var tr = liveTrades().slice(0, 60);
    $('liveTrades').replaceChildren(tr.length ? table(['時間', '池', '方向', '金額', 'ARGUS', '價格', '地址', '交易'], tr.map(function (t) {
      return [tpe(t.t, true).replace('（UTC+8）', ''), t.pool, el('span', { cls: t.kind === 'buy' ? 'up' : 'down', text: t.kind === 'buy' ? '買' : '賣' }), usd(t.usd), nm(t.argus), px(t.price), addrCell(t.from), txLink(t.tx)];
    }), { left: [0, 1, 6] }) : el('p', { cls: 'note', text: '成交資料載入中…' }));
    $('liveTrades').insertBefore(el('p', { cls: 'note', text: gtNote() }), $('liveTrades').firstChild);
    var oh = L.ohlcv || (ohlcvTf === 'hour' && D.gt_snapshot && D.gt_snapshot.ohlcv);
    var o = oh && oh.data && oh.data.attributes && oh.data.attributes.ohlcv_list;
    if (o) {
      o = o.slice().reverse();
      var lab = o.map(function (x) { var d = new Date(x[0] * 1000); return ohlcvTf === 'hour' ? d.toLocaleString('zh-TW', { timeZone: TZ, month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }) : tpeDay(d).slice(5); });
      mkChart('ohlcvChart', { data: { labels: lab, datasets: [
        { type: 'line', label: '收盤價 USD', data: o.map(function (x) { return x[4]; }), borderColor: css('--acc'), pointRadius: 0, borderWidth: 1.6, yAxisID: 'y' },
        { type: 'bar', label: '成交量 USD', data: o.map(function (x) { return x[5]; }), backgroundColor: css('--muted') + '55', yAxisID: 'y1' }] },
        options: { scales: { y: { position: 'left', ticks: { callback: function (v) { return px(v); } } }, y1: { position: 'right', grid: { display: false }, ticks: { callback: function (v) { return usd(v); } } }, x: { ticks: { maxTicksLimit: 10 } } } } });
    }
  }
  function renderCex() {
    var live = liveCex(), snap = latestSnapRows(), p = livePrice(), rows = [];
    live.forEach(function (r) { rows.push([el('td', { cls: 'l' }, [r.name, ' ', src(true)]), px(r.price), pct(r.chg), usd(r.vol24), usd(r.d && r.d.bid2), usd(r.d && r.d.ask2), r.d ? n0(r.vol24 / Math.max(1, r.d.bid2 + r.d.ask2)) + ' 倍' : '—', r.d ? r.d.spread.toFixed(2) + '%' : '—', n0(r.n) + (r.span ? '（' + r.span.toFixed(0) + ' 分）' : ''), usd(r.med), p && r.price ? pct((r.price / p - 1) * 100, 2) : '—']); });
    ['lbank', 'mexc_usdt', 'mexc_usd1'].concat(live.length ? [] : ['gate', 'weex']).forEach(function (k) {
      var s = snap[k]; if (!s) return;
      rows.push([el('td', { cls: 'l' }, [EXN[k], ' ', src(false, s.snap_local.slice(5))]), px(s.last), pct(s.chg24), usd(s.vol24_quote), usd(s.bid2), usd(s.ask2), n0(s.vol24_quote / Math.max(1, s.bid2 + s.ask2)) + ' 倍', s.spread_pct.toFixed(2) + '%', n0(s.n_trades) + (s.trades_span_s ? '（' + (s.trades_span_s / 60).toFixed(0) + ' 分）' : ''), usd(s.trade_med), pct(s.cex_dex_pct, 2)]);
    });
    var lv = ((D.cex_snapshots && D.cex_snapshots.big_levels_latest) || []).filter(function (x) { return Math.abs(x.dist_pct) < 1000; }).slice().sort(function (a, b) { return b.usd - a.usd; }).slice(0, 30);
    var ps = ((D.cex_snapshots && D.cex_snapshots.big_levels_persistent) || []).slice(0, 30);
    put('cexLive', [card('各交易所行情、深度與成交', [table(['交易所', '價格', '24h 漲跌', '回報 24h 量', '±2% 買深度', '±2% 賣深度', '量／深度', '價差', '最近成交筆數（涵蓋）', '成交中位數', '與鏈上價差'], rows)],
      'Gate、WEEX 的 API 允許瀏覽器直接讀取，每 60 秒即時更新；LBank、MEXC 的 API 不允許網頁讀取（CORS），改用每 4 小時的伺服器快照。量／深度＝回報 24h 量 ÷ ±2% 內掛單金額，倍數越高代表回報的量越難以由實際掛單承接。'),
      card('大額掛單（最新快照，單一價位 ≥ $250）', [table(['交易所', '方向', '價格', '數量', '金額', '距中間價'], lv.map(function (x) { return [EXN[x.exchange] || x.exchange, x.side === 'bid' ? '買' : '賣', px(x.price), nm(x.qty), usd(x.usd), pct(x.dist_pct)]; }))], '距中間價 ≥ 20% 的掛單幾乎不會成交，可視為佔位單。'),
      card('跨快照持續存在的大額掛單', [table(['交易所', '方向', '價格', '出現次數', '最大金額', '數量（最小～最大）', '首次', '最近'], ps.map(function (x) { return [EXN[x.exchange] || x.exchange, x.side === 'bid' ? '買' : '賣', px(x.price), x.seen, usd(x.usd_max), nm(x.qty_min) + '～' + nm(x.qty_max), tpe(new Date(x.first * 1000)).replace('（UTC+8）', ''), tpe(new Date(x.last * 1000)).replace('（UTC+8）', '')]; }))], '同一價位在多次快照都出現、數量又不變，通常是長期掛著不動的單。')]);
  }
  function renderPlatform() {
    var a = D.argus_stats; if (!a) { put('platformBody', [el('p', { cls: 'err', text: '平台快照讀取失敗' })]); return; }
    var o = a.overview || {}, rv = a.revenue || {}, dd = (a.daily || []).slice(-14);
    var ks = [metric('平台 24h 成交量', usd(o.volume24h), n0(o.swaps24h) + ' 筆'), metric('平台累計成交量', usd(o.volumeAllTime), n0(o.swapsAllTime) + ' 筆'), metric('發射代幣數', n0(o.launches), '畢業 ' + n0(o.graduated)), metric('平台總市值', usd(o.totalMarketCap)), metric('平台收入（近 30 天）', usd(rv.periodUsd), '累計 ' + usd(rv.allTimeUsd)), metric('最近完整一日收入', usd(rv.latestCompleteDay && rv.latestCompleteDay.usd), rv.latestCompleteDay ? rv.latestCompleteDay.date : '')];
    var mk = el('div', { cls: 'metrics' }, ks);
    var c1 = card('平台每日成交量（UTC 日）', [canvas('platChart', true)]);
    put('platformBody', [mk, c1, el('p', { cls: 'note', text: '來源 argus.world/api/stats/*。此 API 不允許瀏覽器直接讀取（CORS），由伺服器每 4 小時抓取一次，快照時間 ' + (a.generated_at || '—') + '。' })]);
    mkChart('platChart', { type: 'bar', data: { labels: dd.map(function (x) { return x.date.slice(5); }), datasets: [{ label: '成交量 USD', data: dd.map(function (x) { return x.volume; }), backgroundColor: css('--acc') }] }, options: { scales: { y: { ticks: { callback: function (v) { return usd(v); } } } } } });
  }
  var revRange = '30', revView = 'inc';
  function renderRevenue() {
    var R = (D.daily && D.daily.rows) || []; if (!R.length) return;
    var last = R.slice(-30), rows = revRange === 'all' ? R : R.slice(-Number(revRange));
    var tb = revView === 'inc'
      ? table(['日期', '回購 USD', '回購顆數', '總銷毀顆數', '項目方自行銷毀', '稅收收入', 'LP 手續費', '金庫撥款', '其他流入', '平台收入'], rows.slice().reverse().map(function (r) { return [r.d.slice(5) + (r.partial ? '＊' : ''), usd(r.bb_usd), nm(r.bb_argus), nm(r.burn), nm(r.burn_creator), usd(r.inc_tax), usd(r.inc_lp), usd(r.inc_treasury), usd(r.inc_other), usd(r.platform_rev)]; }))
      : table(['日期', '收盤價', 'DEX 量', 'CEX 量', 'Swap 數', '交易地址', '買入', '賣出', '機器人量'], rows.slice().reverse().map(function (r) { return [r.d.slice(5) + (r.partial ? '＊' : ''), px(r.close), usd(r.dex), usd(r.lbank + r.mexc + r.gate), n0(r.swaps), n0(r.traders), usd(r.buy), usd(r.sell), usd(r.bot)]; }));
    var tot = function (k) { return R.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };
    put('revenueBody', [el('div', { cls: 'metrics' }, [metric('累計回購', usd(tot('bb_usd')), nm(tot('bb_argus')) + ' 顆'), metric('累計銷毀', nm(tot('burn')) + ' 顆', '項目方自行銷毀 ' + nm(tot('burn_creator'))), metric('累計稅收收入', usd(tot('inc_tax'))), metric('累計 LP 手續費', usd(tot('inc_lp'))), metric('累計金庫撥款', usd(tot('inc_treasury'))), metric('其他流入', usd(tot('inc_other')))]),
      el('div', { cls: 'grid2' }, [card('近 30 天回購與收入', [canvas('revChart', true)]), card('近 30 天銷毀（顆）', [canvas('burnChart', true)])]),
      card(null, [el('div', { cls: 'row-between' }, [seg([['14', '近 14 天'], ['30', '近 30 天'], ['all', '全部']], revRange, function (v) { revRange = v; renderRevenue(); }), seg([['inc', '收入與回購'], ['trade', '交易']], revView, function (v) { revView = v; renderRevenue(); })]), tb],
        '回購與收入是項目方錢包 0x7d61…bee4 的鏈上數字（台北日期）；平台收入取自 argus.world API（UTC 日）。＊＝當日未滿。資料產生：' + (D.daily.generated_at || '—'))]);
    var L30 = last.map(function (r) { return r.d.slice(5); });
    mkChart('revChart', { type: 'bar', data: { labels: L30, datasets: [{ label: '回購 USD', data: last.map(function (r) { return r.bb_usd; }), backgroundColor: css('--acc') }, { label: '稅＋LP 手續費收入', data: last.map(function (r) { return r.inc_tax + r.inc_lp; }), backgroundColor: css('--mid') }] }, options: { scales: { y: { ticks: { callback: function (v) { return usd(v); } } } } } });
    mkChart('burnChart', { type: 'bar', data: { labels: L30, datasets: [{ label: '項目方自行銷毀', data: last.map(function (r) { return r.burn_creator; }), backgroundColor: css('--high') }, { label: '鎖倉合約銷毀', data: last.map(function (r) { return r.burn - r.burn_creator; }), backgroundColor: css('--low') }] }, options: { scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: function (v) { return nm(v); } } } } } });
  }
  function renderHistory() {
    var R = (D.daily && D.daily.rows) || []; if (!R.length) return;
    var W = []; for (var i = 0; i < R.length; i += 7) { var w = R.slice(i, i + 7); W.push({ l: w[0].d.slice(5), dex: w.reduce(function (a, r) { return a + r.dex; }, 0), cex: w.reduce(function (a, r) { return a + r.lbank + r.mexc + r.gate; }, 0) }); }
    put('historyBody', [card('每日收盤價（發幣至今）', [canvas('priceChart')]), card('每週成交量：鏈上 DEX 與交易所', [canvas('volChart', true)], '交易所量為 LBank＋MEXC＋Gate 日 K 回報值。')]);
    mkChart('priceChart', { type: 'line', data: { labels: R.map(function (r) { return r.d.slice(5); }), datasets: [{ label: '收盤價 USD', data: R.map(function (r) { return r.close; }), borderColor: css('--acc'), pointRadius: 0, borderWidth: 1.6 }] }, options: { scales: { y: { ticks: { callback: function (v) { return px(v); } } } } } });
    mkChart('volChart', { type: 'bar', data: { labels: W.map(function (w) { return w.l; }), datasets: [{ label: '鏈上 DEX', data: W.map(function (w) { return w.dex; }), backgroundColor: css('--acc') }, { label: '交易所', data: W.map(function (w) { return w.cex; }), backgroundColor: css('--mid') }] }, options: { scales: { y: { ticks: { callback: function (v) { return usd(v); } } } } } });
  }
  function renderTeam() {
    var S = D.summary; if (!S) return; var c = S.creator || {}, k = S.cluster || {}, fc = S.flows7_creator || {}, fr = S.flows7_cluster || {};
    var hs = {}; ((D.addresses && D.addresses.top_traders) || []).forEach(function (t) { hs[t.addr] = t; });
    put('teamBody', [
      card('項目方（合約部署／回購錢包）', [el('p', { cls: 'mono' }, [c.addr]), el('div', { cls: 'metrics' }, [metric('累計回購', usd(c.buy_usd), nm(c.buy_argus) + ' 顆，均價 ' + px(c.avg_buy)), metric('累計賣出', usd(c.sell_usd)), metric('目前持有', nm(c.balance) + ' 顆', ((c.balance || 0) / (S.supply || 1e9) * 100).toFixed(2) + '% 總量'), metric('近 7 天淨轉出', usd(fc.net_out_usd), '負數＝淨流入'), metric('鏈上交易筆數', n0(c.n), (c.first || '') + ' ～ ' + (c.last || ''))])],
        '依據：代幣發射交易的送出者、合約 owner()，以及 argus.world 回購 API 的錢包欄位，皆為鏈上可查事實。'),
      card('疑似項目方關聯（資金往來推論，中等信心）', [el('p', { text: k.note || '' }), el('div', { cls: 'metrics' }, [metric('地址數', n0(k.n)), metric('發射首小時買入', nm(k.launch_argus) + ' 顆', '花費 ' + usd(k.launch_usd)), metric('鏈上累計賣出', usd(k.sell_usd), '買入 ' + usd(k.buy_usd)), metric('目前持有', nm(k.balance) + ' 顆'), metric('單邊賣牆', nm(k.sell_wall_argus) + ' 顆'), metric('近 7 天淨轉出', usd(fr.net_out_usd), nm(fr.net_out_argus) + ' 顆')]),
        table(['地址', '筆數', '買入', '賣出', '目前持有'], (k.addresses || []).map(function (a) { var t = hs[a]; return [addrCell(a, '疑似項目方關聯（資金往來推論，中等信心）', true), t ? n0(t.n) : '—', t ? usd(t.buy_usd) : '—', t ? usd(t.sell_usd) : '—', t ? nm(t.balance) : '—']; }), { left: [0] })],
        '這群地址在發射後 41 分鐘內買入、彼此有 USDC 與 ARGUS 互轉並共用匯集地址；歸為同一群與項目方關聯皆屬推論，不是身分認定。' + (k.sell_wall_note ? k.sell_wall_note + '。' : '') + ' 不在前 60 大交易者名單內的地址，筆數與金額顯示為「—」。')]);
  }
  function renderBig() {
    var A = D.addresses; if (!A) return;
    put('bigBody', [
      card('前 60 大交易地址（依成交額）', [table(['地址', '筆數', '買入', '賣出', '買均價', '賣均價', '期間', '現持有', '行為'], A.top_traders.map(function (t) { return [addrCell(t.addr, t.tag), n0(t.n), usd(t.buy_usd), usd(t.sell_usd), px(t.avg_buy), px(t.avg_sell), (t.first || '').slice(5, 10) + '～' + (t.last || '').slice(5, 10), nm(t.balance), t.behavior + (t.bot ? '・高頻' : '')]; }))], '「行為」依買賣金額與餘額自動分類；資料產生：' + A.generated_at),
      card('單筆最大成交（前 40）', [table(['時間', '方向', '金額', 'ARGUS', '價格', '地址', '交易'], A.big_trades.map(function (x) { return [x.time, el('span', { cls: x.dir === 'buy' ? 'up' : 'down', text: x.dir === 'buy' ? '買' : x.dir === 'sell' ? '賣' : '稅自動賣' }), usd(x.usd), nm(x.argus), px(x.price), addrCell(x.trader, x.tag), txLink(x.tx)]; }), { left: [0, 5] })]),
      card('前 25 大持有者', [table(['地址', '持有', '占總量'], A.holders.map(function (h) { return [addrCell(h.addr, h.tag, true), nm(h.bal), h.pct.toFixed(2) + '%']; }))], A.holders_note + '；鏈上餘額截至 ' + ((D.summary && D.summary.head_time) || '—'))]);
  }
  function renderHft() {
    var H = D.hft; if (!H) return;
    var tn = H.dist.reduce(function (a, d) { return a + d.n; }, 0), tu = H.dist.reduce(function (a, d) { return a + d.usd; }, 0);
    put('hftBody', [el('div', { cls: 'metrics' }, [metric('高頻／機器人地址', n0(H.n_bots)), metric('高頻地址成交額', usd(H.bot_vol), (H.bot_vol / H.tot_usd * 100).toFixed(1) + '% 總成交'), metric('稅自動賣出', n0(H.trade_kinds.taxsell) + ' 次', usd(H.vol_by_kind.taxsell)), metric('跨池套利', n0(H.trade_kinds.arb) + ' 筆', usd(H.vol_by_kind.arb)), metric('路由', n0(H.trade_kinds.route) + ' 筆', usd(H.vol_by_kind.route))]),
      el('div', { cls: 'grid2' }, [card('單筆金額分布', [table(['區間', '筆數', '筆數占比', '金額', '金額占比'], H.dist.map(function (d) { return ['$' + n0(d.lo) + (d.hi ? '–' + n0(d.hi) : '+'), n0(d.n), (d.n / tn * 100).toFixed(1) + '%', usd(d.usd), (d.usd / tu * 100).toFixed(2) + '%']; }))]), card('單筆金額分布（筆數）', [canvas('distChart', true)])]),
      card('高頻地址（前 40，依成交額）', [table(['地址', '筆數', '成交額', '買入', '賣出', '路由', '套利', '中位數', '活躍天數', '期間', '類型'], H.bots.map(function (b) { return [addrCell(b.addr, b.tag), n0(b.n), usd(b.vol), usd(b.buy_usd), usd(b.sell_usd), usd(b.route_usd), usd(b.arb_usd), usd(b.med), n0(b.days), (b.first || '').slice(5, 10) + '～' + (b.last || '').slice(5, 10), (b.kinds || []).join('、')]; }))], H.method),
      H.sandwich && H.sandwich.length ? card('疑似夾子交易（同區塊前後包夾）', [table(['地址', '次數', '金額'], H.sandwich.map(function (s) { return [addrCell(s.addr), n0(s.n), usd(s.usd)]; }))]) : null]);
    mkChart('distChart', { type: 'bar', data: { labels: H.dist.map(function (d) { return '$' + n0(d.lo) + (d.hi ? '–' + n0(d.hi) : '+'); }), datasets: [{ label: '筆數', data: H.dist.map(function (d) { return d.n; }), backgroundColor: css('--acc') }] } });
  }
  function renderCexStats() {
    var C = D.cex_daily, S = D.cex_snapshots; if (!C || !S) return;
    var rows = C.rows.slice().sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : (b.vol24 || 0) - (a.vol24 || 0); });
    var snaps = S.snapshots.slice().reverse().slice(0, 300);
    var keys = Object.keys(EXN), byTs = {}; S.snapshots.forEach(function (s) { if (s.status === 'ok') { (byTs[s.snap_ts] = byTs[s.snap_ts] || {})[s.exchange] = s; } });
    var ts = Object.keys(byTs).sort();
    put('cexStatsBody', [
      card('每日統計', [table(['日期', '交易所', '成功快照', '±2% 買深', '±2% 賣深', '平均價差', '回報 24h 量', '量／深度', '觀察成交', '時窗(分)', '成交中位數', '<$5 占比', '<$20 占比', '同金額重複', '間隔中位(秒)', '間隔 CV', '逐筆外推／回報', '大額掛單數', '持續掛單數'], rows.map(function (r) { return [r.day.slice(5), r.exchange, r.n_ok + '/' + r.n_snap, usd(r.bid2), usd(r.ask2), r.spread_pct == null ? '—' : r.spread_pct.toFixed(2) + '%', usd(r.vol24), n0(r.vol_to_depth2), n0(r.trades_obs), r.window_min.toFixed(0), usd(r.trade_med), r.small5 == null ? '—' : (r.small5 * 100).toFixed(1) + '%', r.small20 == null ? '—' : (r.small20 * 100).toFixed(1) + '%', r.repeat_quote_share == null ? '—' : (r.repeat_quote_share * 100).toFixed(1) + '%', r.gap_median_s == null ? '—' : r.gap_median_s.toFixed(1), r.gap_cv == null ? '—' : r.gap_cv.toFixed(2), r.extrap_vs_reported == null ? '—' : r.extrap_vs_reported.toFixed(2), n0(r.big_n), n0(r.big_persistent_n)]; }), { left: [0, 1] })], C.note + ' 當天未滿的統計會在隔天補成全日。'),
      card('回報 24h 量的快照走勢', [canvas('cexVolChart', true)]),
      card('每次快照明細（最新 300 列）', [table(['快照時間', '交易所', '狀態', '中間價', '價差', '±2% 買深', '±2% 賣深', '回報 24h 量', '成交筆數', '成交中位數', '與鏈上價差'], snaps.map(function (s) { return [s.snap_local.slice(5), EXN[s.exchange] || s.exchange, s.status === 'ok' ? '成功' : '失敗', px(s.mid), s.spread_pct == null ? '—' : s.spread_pct.toFixed(2) + '%', usd(s.bid2), usd(s.ask2), usd(s.vol24_quote), n0(s.n_trades), usd(s.trade_med), pct(s.cex_dex_pct, 2)]; }), { left: [0, 1] })], S.note + ' 快照共 ' + S.n_snapshots + ' 次；最近一次 ' + (S.generated_at || '—'))]);
    var colors = [css('--acc'), css('--mid'), css('--low'), css('--high'), css('--muted')];
    mkChart('cexVolChart', { type: 'line', data: { labels: ts.map(function (t) { return tpe(new Date(t * 1000)).slice(5, 17); }), datasets: keys.map(function (k, i) { return { label: EXN[k], data: ts.map(function (t) { return byTs[t][k] ? byTs[t][k].vol24_quote : null; }), borderColor: colors[i], pointRadius: 2, spanGaps: true }; }) }, options: { scales: { y: { type: 'logarithmic', ticks: { callback: function (v) { return usd(v); } } } } } });
  }
  function renderFiles() {
    var names = { summary: '總覽與 7 天資金流', daily: '每日收入／回購／銷毀／成交', addresses: '大額地址、大額成交、持有者', hft: '小額高頻交易', cex_snapshots: '交易所每 4 小時快照', cex_daily: '交易所每日統計', argus_stats: 'argus.world 平台數據', liquidity_history: '流動性歷史（風險評級用）', gt_snapshot: 'GeckoTerminal 成交與 K 線備援快照' };
    var live = [['DexScreener（價格、流動性、24h 量）', !L.dex_err], ['GeckoTerminal（最新成交、K 線）', (gtState.gtV3 || {}).stale ? null : true], ['Gate（行情、深度、成交）', !L.gateT_err], ['WEEX（行情、深度、成交）', !L.weexT_err]];
    put('filesBody', [card('快照資料檔（由伺服器每 4 小時與每天 09:00 重新產生）', [table(['檔案', '內容', '資料產生時間'], FILES.map(function (f) { return ['data/' + f + '.json', names[f], D[f] ? (D[f].generated_at || '—') : '讀取失敗']; }), { left: [0, 1, 2] })]),
      card('即時來源（瀏覽器直接讀取，每 60 秒）', [table(['來源', '狀態'], live.map(function (x) { return [x[0], x[1] === null ? '暫時無法更新（改用快取或伺服器快照）' : x[1] ? '正常' : '讀取失敗']; }), { left: [0, 1] })], 'LBank、MEXC、argus.world 不允許瀏覽器跨網域讀取（CORS），所以只能用伺服器快照。')]);
  }
  function renderMethod() {
    put('methodBody', [card(null, [el('ul', null, [
      '交易者判定：同一筆交易內 ARGUS 淨流入最多（買）或淨流出最多（賣）的非合約基礎設施地址；跨池淨額為零的交易歸類為套利或路由。',
      '美元金額：USDC 池直接用 USDC 數量；其他池用同一小時 USDC 池成交均價換算，屬估算。',
      '高頻判定是行為推論，不是身分證明。除項目方錢包與疑似項目方關聯地址外，其餘地址一律不做身分標示。',
      '交易所成交為每 4 小時快照抽樣，不是全量；刷量相關指標（小額占比、同金額重複、成交間隔、量深比）只描述行為特徵。',
      '風險評級為依公開交易數據的量化參考，每個指標的門檻都列在評級表中。',
      '鏈上歷史資料每天 09:00（台北）更新；交易所與平台快照每 4 小時更新；價格、流動性、最新成交、Gate／WEEX 在網頁上每 60 秒即時更新。'
    ].map(function (t) { return el('li', { text: t }); }))])]);
  }

  // ---------- orchestration ----------
  function safe(fn) { try { fn(); } catch (e) { console.error(fn.name, e); } }
  function renderAll() { [renderRisk, renderLive, renderCex, renderPlatform, renderRevenue, renderHistory, renderTeam, renderBig, renderHft, renderCexStats, renderFiles, renderMethod].forEach(safe); }
  function refresh() {
    $('lastUpdate').textContent = '更新中…';
    var snap = (Date.now() - lastSnapLoad > SNAP_MS) ? loadSnapshots() : Promise.resolve();
    return Promise.all([snap, loadLive()]).then(function () { renderAll(); $('lastUpdate').textContent = tpe(new Date(), true); nextAt = Date.now() + LIVE_MS; });
  }
  function tick() { var s = Math.max(0, Math.round((nextAt - Date.now()) / 1000)); $('nextUpdate').textContent = nextAt ? s + ' 秒後自動更新' : ''; if (nextAt && Date.now() >= nextAt) { nextAt = 0; refresh(); } }
  function buildToc() { var n = $('toc'); document.querySelectorAll('main section').forEach(function (s) { var h = s.querySelector('h2'); n.appendChild(el('a', { href: '#' + s.id, text: h.textContent })); }); }
  function initSeg() { var host = $('ohlcvSeg'); function draw() { host.replaceChildren(seg([['hour', '7 天（小時）'], ['day', '90 天（日）']], ohlcvTf, function (v) { ohlcvTf = v; draw(); L.ohlcv = null; var c = lsGet(gtKey('ohlcv')); if (c) L.ohlcv = c.v; safe(renderLive); gtFetch('ohlcv').then(function () { safe(renderLive); }); })); } draw(); }
  document.addEventListener('DOMContentLoaded', function () {
    buildToc(); initSeg();
    $('refreshBtn').addEventListener('click', function () { lastSnapLoad = 0; refresh(); });
    setInterval(tick, 1000);
    refresh();
  });
})();
