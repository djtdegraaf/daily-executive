(function () {
  'use strict';

  // ═══════════════════════════════════════════════
  // PAGE CONFIG — elke pagina definieert dit object
  // vóór app.js wordt geladen; defaults = Vandaag
  // ═══════════════════════════════════════════════
  const PAGE = Object.assign({
    page:           'vandaag',
    title:          'Daily Executive — Uw dagelijkse marktbriefing',
    activeNav:      'Vandaag',
    // null = alle feeds; array = subset
    feeds: null,
    // null = geen filter; array van lowercase keywords
    filterKeywords: null,
    // Sectielabels
    leadLabel:      'Hoofdverhaal',
    gridLabel:      'Meer nieuws',
  }, window.PAGE_CONFIG || {});

  // Pas <title> aan
  document.title = PAGE.title;

  // Markeer actieve nav-link
  document.querySelectorAll('.primary-nav a').forEach(a => {
    a.classList.toggle('active', a.textContent.trim() === PAGE.activeNav);
  });

  // ═══════════════════════════════════════════════
  // CONFIGURATION & STORAGE
  // ═══════════════════════════════════════════════

  const LS_FINNHUB = 'de_finnhub_key';
  const LS_AV      = 'de_av_key';
  const LS_TWELVE  = 'de_twelve_key';
  const CACHE_PFX  = 'de_cache_';

  function getCfg() {
    return {
      finnhub: localStorage.getItem(LS_FINNHUB) || '',
      av:      localStorage.getItem(LS_AV)      || '',
      twelve:  localStorage.getItem(LS_TWELVE)  || '',
    };
  }

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(CACHE_PFX + key);
      if (!raw) return null;
      const { v, exp } = JSON.parse(raw);
      if (Date.now() > exp) { sessionStorage.removeItem(CACHE_PFX + key); return null; }
      return v;
    } catch { return null; }
  }

  function cacheSet(key, value, ttlMs) {
    try {
      sessionStorage.setItem(CACHE_PFX + key, JSON.stringify({ v: value, exp: Date.now() + ttlMs }));
    } catch {}
  }

  // ═══════════════════════════════════════════════
  // DATE / TIME UTILITIES
  // ═══════════════════════════════════════════════

  const NL_DAYS   = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

  function fmtDate(d) {
    const day = NL_DAYS[d.getDay()];
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function fmtTime(d) {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Zojuist';
    if (mins < 60) return `${mins} min geleden`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} uur geleden`;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  function fmtNum(n, dec = 2) {
    if (n == null || isNaN(n)) return '–';
    return n.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '–';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  // Scoort hoe zakelijk/financieel een artikel is (0–10).
  // Hogere score = meer relevant voor een executive-lezer.
  function businessScore(article) {
    const text = (article.title + ' ' + article.desc).toLowerCase();
    const terms = [
      // Bedrijfsresultaten & financiën
      'earnings','profit','revenue','quarterly','results','annual','outlook','forecast',
      'loss','margin','ebitda','ipo','valuation','dividend','buyback','writedown',
      // Fusies, overnames, strategie
      'acquisition','merger','takeover','deal','buyout','spinoff','partnership',
      'joint venture','contract','restructuring','expansion','strategy','growth',
      // Leiderschap & aandeelhouders
      'ceo','cfo','coo','executive','board','shareholder','investor','stake',
      // Markten & instrumenten
      'shares','stock','market','rally','decline','index','fund','bond','yield',
      'billion','million','trillion','trade','trading','portfolio','asset',
      // Macro & sectoren
      'interest rate','inflation','gdp','central bank','fed','ecb','supply chain',
      'production','manufacturing','energy','oil','semiconductor','cloud','ai',
      // Sectornamen
      'bank','finance','insurance','tech','retail','pharma','automotive','aerospace',
    ];
    let score = 0;
    for (const t of terms) { if (text.includes(t)) score++; }
    return Math.min(score, 12);
  }

  function stripHTML(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
  }

  // ═══════════════════════════════════════════════
  // API FETCHERS
  // ═══════════════════════════════════════════════

  // Detecteer of we op de live site draaien (server-side proxy beschikbaar)
  // of lokaal (directe API-aanroep met localStorage-sleutels als fallback)
  const IS_LIVE = window.location.hostname !== 'localhost' &&
                  window.location.hostname !== '127.0.0.1' &&
                  !window.location.hostname.includes('192.168.');

  async function fetchFinnhub(symbol, apiKey) {
    const ck = 'fh_' + symbol.replace(/[^a-zA-Z0-9]/g, '_');
    const hit = cacheGet(ck);
    if (hit) return hit;

    // Op de live site: gebruik server-side proxy (sleutel verborgen voor bezoekers)
    // Lokaal: gebruik directe API-aanroep met localStorage-sleutel
    const url = IS_LIVE
      ? `/api/quote?symbol=${encodeURIComponent(symbol)}`
      : `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
    const data = await res.json();

    if (data.error) throw new Error(`Finnhub: ${data.error}`);
    if (!data.c || (data.c === 0 && data.pc === 0)) throw new Error(`Geen data voor ${symbol}`);

    const result = {
      price: data.c,
      change: data.d,
      changePct: data.dp,
      high: data.h,
      low: data.l,
      prevClose: data.pc,
    };
    cacheSet(ck, result, 60_000);
    return result;
  }

  async function fetchAVForex(apiKey) {
    const ck = 'av_eurusd';
    const hit = cacheGet(ck);
    if (hit) return hit;

    const url = IS_LIVE
      ? `/api/forex`
      : `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=EUR&to_currency=USD&apikey=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
    const data = await res.json();

    if (data['Note'] || data['Information']) throw new Error('Alpha Vantage rate limit bereikt — probeer later opnieuw');
    const rate = data['Realtime Currency Exchange Rate'];
    if (!rate) throw new Error('Geen forex data van Alpha Vantage');

    const result = { price: parseFloat(rate['5. Exchange Rate']), symbol: 'EUR/USD' };
    cacheSet(ck, result, 300_000);
    return result;
  }

  async function fetchBitcoin() {
    const ck = 'cg_btc';
    const hit = cacheGet(ck);
    if (hit) return hit;

    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&precision=0';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    if (!data.bitcoin) throw new Error('Geen Bitcoin data van CoinGecko');

    const result = { price: data.bitcoin.usd, changePct: data.bitcoin.usd_24h_change };
    cacheSet(ck, result, 120_000);
    return result;
  }

  async function fetchTwelveTimeSeries(symbol, apiKey, exchange = '') {
    const ck = 'twelve_ts_' + symbol.replace(/[^a-zA-Z0-9]/g, '_') + (exchange ? '_' + exchange : '');
    const hit = cacheGet(ck);
    if (hit) return hit;

    const url = IS_LIVE
      ? `/api/timeseries?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=31`
      : `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=31&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === 'error') throw new Error(`Twelve Data: ${data.message}`);
    if (!data.values || data.values.length < 2) throw new Error('Onvoldoende historische data');

    // values[0] = meest recent, values[n] = oudst — omkeren voor chronologisch
    const series = data.values.reverse().map(v => ({
      date:  v.datetime,
      close: parseFloat(v.close),
      high:  parseFloat(v.high),
      low:   parseFloat(v.low),
      open:  parseFloat(v.open),
    }));

    const result = {
      symbol,
      name: data.meta?.symbol || symbol,
      currency: data.meta?.currency || 'USD',
      exchange: data.meta?.exchange || '',
      series,
    };
    // Cache tot middernacht — dagelijkse grafiek hoeft niet vaker te verversen
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    cacheSet(ck, result, midnight - now);
    return result;
  }

  async function fetchWithTimeout(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('Verbinding time-out na 8 seconden');
      throw e;
    }
  }

  async function fetchRSSViaProxy(proxyUrl) {
    const res = await fetchWithTimeout(proxyUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const contents = json.contents || json.data || json.body || '';
    if (!contents) throw new Error('Lege proxy response');
    return contents;
  }

  async function fetchRSS(feedUrl) {
    let xml = null;
    let lastErr = null;

    if (IS_LIVE) {
      // Op de live site: gebruik onze eigen Cloudflare Function proxy
      // Betrouwbaar, snel, geen rate limits van derden
      try {
        const res = await fetchWithTimeout(`/api/rss?url=${encodeURIComponent(feedUrl)}`);
        if (!res.ok) throw new Error(`RSS proxy HTTP ${res.status}`);
        xml = await res.text();
      } catch (e) {
        lastErr = e;
      }
    } else {
      // Lokaal: val terug op externe CORS-proxies
      const encoded = encodeURIComponent(feedUrl);
      const proxies = [
        `https://corsproxy.io/?url=${encoded}`,
        `https://api.allorigins.win/get?url=${encoded}`,
      ];
      for (const proxyUrl of proxies) {
        try {
          if (proxyUrl.includes('allorigins')) {
            xml = await fetchRSSViaProxy(proxyUrl);
          } else {
            const res = await fetchWithTimeout(proxyUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            xml = await res.text();
          }
          if (xml) break;
        } catch (e) {
          lastErr = e;
        }
      }
    }

    if (!xml) throw new Error(`RSS niet beschikbaar: ${lastErr?.message || 'onbekende fout'}`);

    let doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) {
      doc = new DOMParser().parseFromString(xml, 'text/xml');
    }

    const items = Array.from(doc.querySelectorAll('item'));
    const hostname = (() => { try { return new URL(feedUrl).hostname.replace(/^(feeds\.|www\.)/, ''); } catch { return feedUrl; } })();

    return items.map(item => {
      const title   = (item.querySelector('title')?.textContent || '').trim();
      const rawDesc = item.querySelector('description')?.textContent || item.querySelector('summary')?.textContent || '';
      const desc    = stripHTML(rawDesc);
      let link = '';
      const linkEl = item.querySelector('link');
      if (linkEl) { link = linkEl.textContent?.trim() || linkEl.getAttribute('href') || ''; }
      const pubDate  = (item.querySelector('pubDate')?.textContent || item.querySelector('published')?.textContent || '').trim();
      const category = (item.querySelector('category')?.textContent || '').trim();

      return { title, desc, link: link || '#', pubDate, category, source: hostname };
    }).filter(i => i.title.length > 5);
  }

  // ═══════════════════════════════════════════════
  // MARKET DATA INSTRUMENTS
  // ═══════════════════════════════════════════════

  // Sidebar marktkaart + ticker
  // Finnhub gratis tier ondersteunt GEEN index-symbolen (^AEX, ^GSPC etc.)
  // → vervangen door ETFs die dezelfde markt volgen en wél gratis zijn
  const MARKET_INSTRUMENTS = [
    { label: 'AEX (EWN)',   sub: 'NL ETF · USD',    finnhub: 'EWN',  decimals: 2, prefix: '$' },
    { label: 'DAX (EWG)',   sub: 'DE ETF · USD',    finnhub: 'EWG',  decimals: 2, prefix: '$' },
    { label: 'S&P 500',     sub: 'SPY ETF · USD',   finnhub: 'SPY',  decimals: 2, prefix: '$' },
    { label: 'Nasdaq 100',  sub: 'QQQ ETF · USD',   finnhub: 'QQQ',  decimals: 2, prefix: '$' },
    { label: 'ASML',        sub: 'Nasdaq · USD',    finnhub: 'ASML', decimals: 2, prefix: '$' },
    { label: 'Apple',       sub: 'Nasdaq · USD',    finnhub: 'AAPL', decimals: 2, prefix: '$' },
    { label: 'Microsoft',   sub: 'Nasdaq · USD',    finnhub: 'MSFT', decimals: 2, prefix: '$' },
    { label: 'Nvidia',      sub: 'Nasdaq · USD',    finnhub: 'NVDA', decimals: 2, prefix: '$' },
  ];

  // Extra aandelen uitsluitend voor de ticker
  const TICKER_EXTRA = [
    { label: 'Amazon',    finnhub: 'AMZN',  decimals: 2, prefix: '$' },
    { label: 'Alphabet',  finnhub: 'GOOGL', decimals: 2, prefix: '$' },
    { label: 'Meta',      finnhub: 'META',  decimals: 2, prefix: '$' },
    { label: 'Shell',     finnhub: 'SHEL',  decimals: 2, prefix: '$' },
    { label: 'Unilever',  finnhub: 'UL',    decimals: 2, prefix: '$' },
    { label: 'Philips',   finnhub: 'PHG',   decimals: 2, prefix: '$' },
  ];

  // ═══════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════

  function renderMarketRow(label, sub, price, changePct, decimals, prefix, error) {
    if (error) {
      return `<tr class="market-error-row">
        <td class="market-name">${label}<span class="market-sub">${sub}</span></td>
        <td class="market-val" colspan="2" style="text-align:right;font-size:0.68rem;color:#5a4a3a;font-style:italic;">Niet beschikbaar</td>
      </tr>`;
    }
    const up = changePct >= 0;
    const cls = up ? 'up' : 'down';
    const arrow = up ? '▲' : '▼';
    return `<tr>
      <td class="market-name">${label}<span class="market-sub">${sub}</span></td>
      <td class="market-val">${prefix}${fmtNum(price, decimals)}</td>
      <td class="market-chg ${cls}">${arrow} ${fmtPct(changePct)}</td>
    </tr>`;
  }

  function renderTickerItem(label, price, changePct, prefix) {
    const up = changePct >= 0;
    const cls = up ? 'up' : 'down';
    const arrow = up ? '▲' : '▼';
    return `<span class="ticker-item">
      <span class="ticker-name">${label}</span>
      <span class="ticker-val">${prefix}${price}</span>
      <span class="ticker-chg ${cls}"><span style="font-size:0.55rem">${arrow}</span> ${fmtPct(changePct)}</span>
    </span>`;
  }

  function renderLeadArticle(article) {
    const ago = timeAgo(article.pubDate);
    const excerpt = article.desc.length > 300 ? article.desc.slice(0, 300) + '…' : article.desc;
    // Use first ~180 chars as deck, rest as body (if available)
    const deck = article.desc.length > 180 ? article.desc.slice(0, 180) + '…' : article.desc;

    return `<article class="lead-article fade-in">
      <div class="article-meta">
        <span class="category-tag">${article.category || 'Nieuws'}</span>
        <span class="source-tag">${article.source}</span>
        <span class="article-time">${ago}</span>
      </div>
      <h1 class="lead-headline"><a href="${esc(article.link)}" target="_blank" rel="noopener">${esc(article.title)}</a></h1>
      <p class="lead-deck">${esc(deck)}</p>
      <a href="${esc(article.link)}" target="_blank" rel="noopener" class="read-more">Volledig artikel lezen →</a>
    </article>`;
  }

  function renderArticleCard(article, idx) {
    const ago = timeAgo(article.pubDate);
    const excerpt = article.desc.length > 160 ? article.desc.slice(0, 160) + '…' : article.desc;
    return `<article class="article-card fade-in" style="animation-delay:${idx * 0.08}s">
      <div class="article-meta">
        <span class="source-badge">${esc(article.source)}</span>
        <span class="article-time">${ago}</span>
      </div>
      <h2 class="card-headline"><a href="${esc(article.link)}" target="_blank" rel="noopener">${esc(article.title)}</a></h2>
      <p class="card-excerpt">${esc(excerpt)}</p>
    </article>`;
  }

  // Bouwt een SVG-lijnpad van de tijdreeks; retourneert de <svg> als string
  function buildChartSVG(series, isUp) {
    const W = 280, H = 90;
    const closes = series.map(p => p.close);
    const minV = Math.min(...closes);
    const maxV = Math.max(...closes);
    const range = maxV - minV || 1;

    const pts = closes.map((v, i) => {
      const x = (i / (closes.length - 1)) * W;
      const y = H - ((v - minV) / range) * (H - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const polyline = pts.join(' ');
    // Sluit het vlak af langs de onderkant voor de gradient-fill
    const fillPath = `M${pts[0]} L${polyline.split(' ').join(' L')} L${W},${H} L0,${H} Z`;
    const strokeColor = isUp ? '#5cb87a' : '#e05555';
    const fillId = 'chartGrad_' + (isUp ? 'up' : 'dn');

    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${fillPath}" fill="url(#${fillId})" stroke="none"/>
      <polyline points="${polyline}" fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  function renderFeaturedStock(stockData, quote, reason, note = '') {
    const series  = stockData.series;
    const first   = series[0].close;
    const last    = series[series.length - 1].close;
    const chgPct  = ((last - first) / first) * 100;
    const isUp    = chgPct >= 0;
    const hi30    = Math.max(...series.map(p => p.high));
    const lo30    = Math.min(...series.map(p => p.low));
    const curr    = quote ? quote.price : last;
    const todayPct = quote ? quote.changePct : chgPct;
    const todayCls = todayPct >= 0 ? 'up' : 'down';
    const todayArrow = todayPct >= 0 ? '▲' : '▼';
    const cur = stockData.currency === 'USD' ? '$' : (stockData.currency === 'EUR' ? '€' : stockData.currency + ' ');

    return `<div class="featured-stock">
      <div class="featured-stock-header">
        <div>
          <div class="featured-stock-label">Aandeel van de dag</div>
          <div class="featured-stock-name">${esc(stockData.name)}</div>
          <div class="featured-stock-exchange">${esc(stockData.exchange)}${note ? ` · ${note}` : ''}</div>
        </div>
        <div class="featured-stock-price-block">
          <div class="featured-stock-price">${cur}${fmtNum(curr, 2)}</div>
          <div class="featured-stock-chg ${todayCls}">${todayArrow} ${fmtPct(todayPct)} vandaag</div>
          <div class="featured-stock-period ${isUp ? 'up' : 'down'}">${fmtPct(chgPct)} afgelopen 30 dgn</div>
        </div>
      </div>
      <div class="chart-area">${buildChartSVG(series, isUp)}</div>
      <div class="featured-stock-stats">
        <div class="stat-item">
          <span class="stat-label">30d High</span>
          <span class="stat-value">${cur}${fmtNum(hi30, 2)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">30d Low</span>
          <span class="stat-value">${cur}${fmtNum(lo30, 2)}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Beurs</span>
          <span class="stat-value">${esc(stockData.exchange.split(' ')[0] || '–')}</span>
        </div>
      </div>
      ${reason ? `<div class="featured-mover-reason">Grootste beweger vandaag · ${esc(reason)}</div>` : ''}
    </div>`;
  }

  // ── INSIDER TRANSACTIONS ────────────────────────────
  async function fetchInsiderTransactions(symbol) {
    const ck = 'insider_' + symbol.replace(/[^a-zA-Z0-9]/g, '_');
    const hit = cacheGet(ck);
    if (hit) return hit;

    const url = IS_LIVE
      ? `/api/insider?symbol=${encodeURIComponent(symbol)}`
      : `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${getCfg().finnhub}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Insider HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    cacheSet(ck, data, 3_600_000); // 1 uur
    return data;
  }

  function renderInsiderTable(data) {
    const transactions = (data.data || [])
      .filter(t => t.transactionType === 'P-Purchase' || t.transactionType === 'S-Sale')
      .slice(0, 8);

    if (!transactions.length) {
      return `<div class="insider-empty">Geen recente insider-transacties beschikbaar</div>`;
    }

    return `<table class="insider-table"><tbody>` +
      transactions.map(t => {
        const isBuy = t.transactionType === 'P-Purchase';
        const label = isBuy ? '▲ Koop' : '▼ Verkoop';
        const cls   = isBuy ? 'insider-buy' : 'insider-sell';
        const shares = t.share ? Math.abs(t.share).toLocaleString('nl-NL') : '–';
        const value  = t.share && t.price
          ? '$' + (Math.abs(t.share) * t.price / 1_000_000).toFixed(1) + 'M'
          : '–';
        const date = t.transactionDate || '';
        const name = (t.name || 'Onbekend').split(' ').slice(-1)[0]; // achternaam
        const role = (t.officerTitle || '').slice(0, 22);
        return `<tr>
          <td class="insider-name">${esc(name)}<span class="insider-role">${esc(role)}</span></td>
          <td class="${cls}">${label}</td>
          <td class="insider-shares">${shares}<br><span style="font-size:0.6rem;color:#4a4030">${value}</span></td>
          <td class="insider-date">${date.slice(0, 10)}</td>
        </tr>`;
      }).join('') +
      `</tbody></table>`;
  }

  async function loadInsiderWidget(symbol) {
    const el = document.getElementById('insider-container');
    if (!el) return;

    try {
      const data = await fetchInsiderTransactions(symbol);
      el.querySelector('.insider-table-body').innerHTML = renderInsiderTable(data);
    } catch (e) {
      el.querySelector('.insider-table-body').innerHTML =
        `<div class="insider-empty">${esc(e.message)}</div>`;
    }
  }

  function renderBriefingItem(article) {
    return `<li>
      <span class="bullet-icon">▸</span>
      <span><a href="${esc(article.link)}" target="_blank" rel="noopener">${esc(article.title)}</a>
        <span class="source-badge" style="margin-left:0.3rem">${esc(article.source)}</span>
      </span>
    </li>`;
  }

  function renderQuote(article) {
    // Extract the first sentence that looks like a substantial quote or leading sentence
    const sentences = article.desc.split(/[.!?]\s+/);
    const best = sentences.find(s => s.length > 60) || sentences[0] || article.title;
    const trimmed = best.trim().replace(/^["']|["']$/g, '');
    const displayStr = trimmed.length > 200 ? trimmed.slice(0, 200) + '…' : trimmed;
    const ago = timeAgo(article.pubDate);

    return `<div class="quote-block fade-in">
      <div class="quote-label">Uitgelicht nieuws</div>
      <blockquote class="quote-text">"${esc(displayStr)}"</blockquote>
      <p class="quote-attr">— <a href="${esc(article.link)}" target="_blank" rel="noopener" style="color:var(--gold)">${esc(article.title.slice(0, 60))}…</a>
        &nbsp;·&nbsp; ${esc(article.source)} &nbsp;·&nbsp; ${ago}</p>
    </div>`;
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════════════
  // MAIN APPLICATION
  // ═══════════════════════════════════════════════

  const App = window.App = {

    // ── SETUP / MODAL ──────────────────────────────
    openModal() {
      const cfg = getCfg();
      document.getElementById('input-finnhub').value = cfg.finnhub;
      document.getElementById('input-av').value      = cfg.av;
      document.getElementById('input-twelve').value  = cfg.twelve;
      document.getElementById('modal-save-msg').style.display = 'none';
      document.getElementById('api-modal').classList.remove('hidden');
    },

    closeModal() {
      document.getElementById('api-modal').classList.add('hidden');
    },

    saveKeys() {
      const fh     = document.getElementById('input-finnhub').value.trim();
      const av     = document.getElementById('input-av').value.trim();
      const twelve = document.getElementById('input-twelve').value.trim();
      if (fh)     localStorage.setItem(LS_FINNHUB, fh);
      if (av)     localStorage.setItem(LS_AV, av);
      if (twelve) localStorage.setItem(LS_TWELVE, twelve);
      const msg = document.getElementById('modal-save-msg');
      msg.style.display = 'inline';
      setTimeout(() => { msg.style.display = 'none'; this.closeModal(); this.loadAll(); }, 1200);
    },

    dismissBanner() {
      document.getElementById('setup-banner').classList.add('hidden');
    },

    // ── CLOCK ───────────────────────────────────────
    // ── DAGELIJKSE RESET ────────────────────────────
    todayStr() {
      return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    },

    clearDailyCaches() {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(CACHE_PFX)) keys.push(k);
      }
      keys.forEach(k => sessionStorage.removeItem(k));
    },

    checkDailyReset() {
      const stored = localStorage.getItem('de_edition_date');
      const today  = this.todayStr();
      if (stored !== today) {
        this.clearDailyCaches();
        localStorage.setItem('de_edition_date', today);
      }
    },

    scheduleMidnightRefresh() {
      const now      = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 1, 0); // 00:00:01 next day
      const ms = midnight - now;

      setTimeout(() => {
        this.clearDailyCaches();
        localStorage.setItem('de_edition_date', this.todayStr());
        this.updateEditionUI();
        this.loadAll();
        this.scheduleMidnightRefresh(); // arm for the day after
      }, ms);
    },

    scheduleNewsRefresh() {
      // Refresh news every hour on the hour
      const now      = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      const ms = nextHour - now;

      setTimeout(() => {
        this.loadNews();
        this.updateEditionUI();
        this.scheduleNewsRefresh(); // reschedule for next hour
      }, ms);
    },

    updateEditionUI() {
      const now = new Date();

      // Edition line under the logo
      const el = document.getElementById('edition-line');
      if (el) {
        el.innerHTML =
          `Editie <span class="edition-sep"></span> ${fmtDate(now)}` +
          `<span class="edition-sep"></span> Laatste verversing: ${fmtTime(now)}`;
      }

      // Next-update bar
      const bar = document.getElementById('next-update-bar');
      if (bar) {
        const tomorrow = new Date(now);
        tomorrow.setHours(24, 0, 0, 0);
        const nextHour = new Date(now);
        nextHour.setHours(now.getHours() + 1, 0, 0, 0);

        document.getElementById('next-edition-date').textContent = fmtDate(tomorrow);
        document.getElementById('next-news-time').textContent    = fmtTime(nextHour);
        bar.style.display = 'block';
      }
    },

    // ── CLOCK ───────────────────────────────────────
    startClock() {
      document.getElementById('topbar-date').textContent = fmtDate(new Date());
      setInterval(() => {
        document.getElementById('market-time').textContent = fmtTime(new Date()) + ' CET';
      }, 1000);
    },

    setStatus(state) {
      const dot   = document.getElementById('live-status-dot');
      const label = document.getElementById('live-status-label');
      dot.className = 'live-dot ' + state;
      if (state === 'loading') label.textContent = 'Laden…';
      else if (state === 'error') label.textContent = 'Fout';
      else label.textContent = 'Live';
    },

    // ── MARKET DATA ─────────────────────────────────
    async loadMarketData() {
      const cfg = getCfg();
      const tbody = document.getElementById('market-tbody');
      const tickerEl = document.getElementById('ticker-track');
      // Map keyed by label — garandeert dat elk instrument precies 1x in de ticker staat
      const tickerMap = new Map();
      let rows = '';
      let anySuccess = false;

      // Op live site: server-side proxy beschikbaar — geen localStorage sleutel nodig
      // Lokaal: sleutel vereist in localStorage
      if (!IS_LIVE && !cfg.finnhub) {
        tbody.innerHTML = `<tr><td colspan="3">
          <div class="no-key-notice" style="padding:1rem;text-align:center;">
            <p style="font-family:'DM Sans',sans-serif;font-size:0.75rem;color:#6a6050;margin-bottom:0.5rem;">
              Geen Finnhub API-sleutel ingesteld.<br>Indices en aandelen zijn niet beschikbaar.
            </p>
            <button class="btn-setup" onclick="App.openModal()" style="font-size:0.7rem;padding:0.3rem 0.8rem;">Sleutel toevoegen</button>
          </div>
        </td></tr>`;
      } else {
        // Sidebar-instrumenten + ticker-extra aandelen parallel ophalen
        const allInst = MARKET_INSTRUMENTS.map(i => ({ ...i, tableOnly: false }));
        const extraInst = TICKER_EXTRA.map(i => ({ ...i, tableOnly: true }));

        const [tableResults, extraResults] = await Promise.all([
          Promise.allSettled(allInst.map(inst => fetchFinnhub(inst.finnhub, cfg.finnhub).then(d => ({ ...d, inst })))),
          Promise.allSettled(extraInst.map(inst => fetchFinnhub(inst.finnhub, cfg.finnhub).then(d => ({ ...d, inst })))),
        ]);

        // Sidebar tabel
        tableResults.forEach((res, i) => {
          const inst = allInst[i];
          if (res.status === 'fulfilled') {
            const d = res.value;
            rows += renderMarketRow(inst.label, inst.sub, d.price, d.changePct, inst.decimals, inst.prefix, false);
            tickerMap.set(inst.label, renderTickerItem(inst.label, fmtNum(d.price, inst.decimals), d.changePct, inst.prefix));
            anySuccess = true;
          } else {
            rows += renderMarketRow(inst.label, inst.sub, null, null, inst.decimals, inst.prefix, true);
          }
        });
        tbody.innerHTML = rows;

        // Extra ticker-aandelen (niet in tabel)
        extraResults.forEach((res, i) => {
          const inst = extraInst[i];
          if (res.status === 'fulfilled') {
            const d = res.value;
            tickerMap.set(inst.label, renderTickerItem(inst.label, fmtNum(d.price, inst.decimals), d.changePct, inst.prefix));
          }
        });
      }

      // EUR/USD via Alpha Vantage
      let forexRow = '';
      if (!IS_LIVE && !cfg.av) {
        forexRow = `<tr class="market-error-row"><td class="market-name">EUR/USD<span class="market-sub">Valuta</span></td>
          <td class="market-val" colspan="2" style="text-align:right;font-size:0.68rem;color:#5a4a3a;font-style:italic;">Geen AV-sleutel</td></tr>`;
      } else {
        try {
          const fx = await fetchAVForex(cfg.av);
          forexRow = renderMarketRow('EUR/USD', 'Valuta', fx.price, null, 4, '', false);
          tickerMap.set('EUR/USD', renderTickerItem('EUR/USD', fmtNum(fx.price, 4), null, ''));
          anySuccess = true;
        } catch (e) {
          forexRow = `<tr class="market-error-row"><td class="market-name">EUR/USD<span class="market-sub">Valuta</span></td>
            <td class="market-val" colspan="2" style="text-align:right;font-size:0.68rem;color:#5a4a3a;font-style:italic;">${e.message.slice(0, 40)}</td></tr>`;
        }
      }
      if (forexRow) tbody.innerHTML += forexRow;

      // Bitcoin via CoinGecko (geen sleutel nodig)
      try {
        const btc = await fetchBitcoin();
        document.getElementById('market-tbody').innerHTML +=
          renderMarketRow('Bitcoin', 'CoinGecko', btc.price, btc.changePct, 0, '$', false);
        tickerMap.set('Bitcoin', renderTickerItem('Bitcoin', '$' + fmtNum(btc.price, 0), btc.changePct, ''));
        anySuccess = true;
      } catch (e) {
        document.getElementById('market-tbody').innerHTML +=
          `<tr class="market-error-row"><td class="market-name">Bitcoin<span class="market-sub">CoinGecko</span></td>
           <td class="market-val" colspan="2" style="text-align:right;font-size:0.68rem;color:#5a4a3a;font-style:italic;">Niet beschikbaar</td></tr>`;
      }

      // Ticker opbouwen — elk instrument precies 1x; html+html voor naadloze CSS-animatie
      if (tickerMap.size > 0) {
        const html = Array.from(tickerMap.values()).join('');
        tickerEl.innerHTML = html + html;
        tickerEl.classList.remove('paused');
      } else {
        tickerEl.innerHTML = `<span class="ticker-loading">Koersen niet beschikbaar — voeg API-sleutels toe via ⚙</span>`;
      }

      document.getElementById('market-time').textContent = fmtTime(new Date()) + ' CET';
    },

    // ── NEWS (RSS) ───────────────────────────────────
    async loadNews() {
      // ── Alle beschikbare feeds ──────────────────────
      const ALL_FEEDS = [
        { url: 'https://feeds.reuters.com/reuters/businessNews',         label: 'Reuters',     lang: 'en' },
        { url: 'https://feeds.reuters.com/reuters/financialsNews',       label: 'Reuters',     lang: 'en' },
        { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147', label: 'CNBC', lang: 'en' },
        { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',         label: 'BBC Business',lang: 'en' },
        { url: 'https://www.theguardian.com/business/rss',               label: 'Guardian',    lang: 'en' },
        { url: 'https://feeds.marketwatch.com/marketwatch/topstories/',  label: 'MarketWatch', lang: 'en' },
        { url: 'https://feeds.nos.nl/nosnieuwseconomie',                 label: 'NOS',         lang: 'nl' },
        { url: 'https://fd.nl/?rss',                                     label: 'FD',          lang: 'nl' },
      ];

      // Pagina kan een subset kiezen via PAGE.feeds (array van URL-strings)
      const FEEDS = PAGE.feeds
        ? ALL_FEEDS.filter(f => PAGE.feeds.includes(f.url))
        : ALL_FEEDS;

      // Alle feeds parallel ophalen; sla mislukte feeds stil over
      const results = await Promise.allSettled(
        FEEDS.map(f => fetchRSS(f.url).then(items =>
          items.map(a => ({ ...a, source: f.label, lang: f.lang }))
        ))
      );

      const feedErrors = results
        .map((r, i) => r.status === 'rejected' ? `${FEEDS[i].label}: ${r.reason?.message}` : null)
        .filter(Boolean);

      let articles = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

      // Optionele keyword-filter per pagina (bijv. AEX-pagina toont alleen NL/EU nieuws)
      if (PAGE.filterKeywords && PAGE.filterKeywords.length > 0) {
        const kws = PAGE.filterKeywords;
        articles = articles.filter(a => {
          const text = (a.title + ' ' + a.desc).toLowerCase();
          return kws.some(k => text.includes(k));
        });
      }

      // Score elk artikel op zakelijke relevantie
      articles.forEach(a => { a._biz = businessScore(a); });

      // Primaire sort: zakelijkheid DESC; secundair: datum DESC
      // → ~60% business-content bovenaan, rest vult aan
      articles.sort((a, b) => {
        if (b._biz !== a._biz) return b._biz - a._biz;
        const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return db - da;
      });

      // Dedupliceren op de eerste 55 tekens van de title (case-insensitive)
      const seen = new Set();
      articles = articles.filter(a => {
        const key = a.title.slice(0, 55).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // ── Renderen ──────────────────────────────────
      const leadEl = document.getElementById('lead-article-container');

      if (articles.length === 0) {
        const errMsg = feedErrors.length
          ? feedErrors.slice(0, 3).join(' · ')
          : 'Onbekende fout — controleer uw verbinding.';
        leadEl.innerHTML = `<div class="error-card">
          <div class="error-card-title">Nieuws niet beschikbaar</div>
          <div class="error-card-msg">${esc(errMsg)}</div>
          <button class="error-card-action" onclick="App.loadNews()">Opnieuw proberen</button>
        </div>`;
        document.getElementById('article-grid-container').innerHTML =
          `<div class="error-card" style="grid-column:1/-1">
            <div class="error-card-title">Artikelen niet beschikbaar</div>
            <div class="error-card-msg">Geen van de ${FEEDS.length} bronnen kon worden geladen.</div>
          </div>`;
        document.getElementById('briefing-list').innerHTML =
          `<li><span class="bullet-icon">▸</span><span style="color:var(--muted);font-style:italic">Geen nieuws beschikbaar</span></li>`;
        document.getElementById('quote-container').innerHTML =
          `<div class="quote-block">
            <div class="quote-label">Uitgelicht nieuws</div>
            <p class="quote-text" style="font-size:0.9rem;font-family:'DM Sans',sans-serif;font-style:normal;color:var(--muted)">
              Nieuws tijdelijk niet beschikbaar.
            </p>
          </div>`;

        return;
      }

      leadEl.innerHTML = renderLeadArticle(articles[0]);

      const gridEl = document.getElementById('article-grid-container');
      gridEl.innerHTML = articles.slice(1, 5).map((a, i) => renderArticleCard(a, i)).join('');

      document.getElementById('quote-container').innerHTML = renderQuote(articles[0]);

      // Dagbriefing: max 10 items, mix van bronnen
      const briefingItems = articles.slice(0, 10);
      document.getElementById('briefing-list').innerHTML =
        briefingItems.map(a => renderBriefingItem(a)).join('');

    },

    // ── FEATURED STOCK ───────────────────────────────
    async loadFeaturedStock() {
      const cfg = getCfg();
      const el  = document.getElementById('featured-stock-container');
      if (!el) return;

      if (!IS_LIVE && !cfg.twelve) {
        el.innerHTML = `<div class="featured-stock">
          <div class="featured-stock-label">Aandeel van de dag</div>
          <div class="no-key-notice" style="margin-top:0.8rem;padding:0.8rem;text-align:center;border:1px dashed #3a3020;border-radius:3px;">
            <p style="font-family:'DM Sans',sans-serif;font-size:0.73rem;color:#6a6050;margin-bottom:0.5rem;line-height:1.5;">
              Twelve Data API-sleutel vereist<br>voor koersgrafieken.
            </p>
            <button class="btn-setup" onclick="App.openModal()" style="font-size:0.68rem;padding:0.3rem 0.8rem;">Sleutel toevoegen</button>
          </div>
        </div>`;
        return;
      }

      // Bepaal de grootste beweger van de dag uit bekende instrumenten
      // We hergebruiken de Finnhub-data die al in de ticker staat (tickerMap is lokaal in loadMarketData)
      // Als alternatief: gebruik de gecachede koersen om de best mover te kiezen
      // Twelve Data gratis tier: uitsluitend US-genoteerde symbolen
      // Europese aandelen via hun Nasdaq/NYSE ADR-notering (USD, zelfde % beweging)
      const candidates = [
        { fh: 'ASML',    label: 'ASML Holding', twelve: 'ASML',  note: 'Nasdaq ADR' },
        { fh: 'SHEL',    label: 'Shell',         twelve: 'SHEL',  note: 'NYSE ADR'   },
        { fh: 'INGA.AS', label: 'ING Groep',     twelve: 'ING',   note: 'NYSE ADR'   },
        { fh: 'AAPL',    label: 'Apple',         twelve: 'AAPL',  note: ''           },
        { fh: 'MSFT',    label: 'Microsoft',     twelve: 'MSFT',  note: ''           },
        { fh: 'NVDA',    label: 'Nvidia',        twelve: 'NVDA',  note: ''           },
        { fh: 'AMZN',    label: 'Amazon',        twelve: 'AMZN',  note: ''           },
        { fh: 'GOOGL',   label: 'Alphabet',      twelve: 'GOOGL', note: ''           },
      ];

      // Haal dagkoersen op uit cache (gevuld door loadMarketData via Finnhub)
      let bestSymbol   = null;
      let bestExchange = '';
      let bestFhKey    = '';
      let bestNote     = '';
      let bestPct      = -Infinity;
      let bestLabel    = '';

      if (cfg.finnhub) {
        for (const c of candidates) {
          const ck   = 'fh_' + c.fh.replace(/[^a-zA-Z0-9]/g, '_');
          const data = cacheGet(ck);
          if (data && Math.abs(data.changePct) > Math.abs(bestPct)) {
            bestPct      = data.changePct;
            bestSymbol   = c.twelve;
            bestExchange = '';
            bestFhKey    = c.fh;
            bestLabel    = c.label;
            bestNote     = c.note;
          }
        }
      }

      // Geen Finnhub data? Fallback naar ASML Amsterdam als standaard
      if (!bestSymbol) { bestSymbol = 'ASML'; bestExchange = ''; bestFhKey = 'ASML'; bestLabel = 'ASML Holding'; bestNote = 'Nasdaq ADR'; }

      try {
        // Haal 30-daagse tijdreeks op via Twelve Data (met optionele exchange-parameter)
        const tsData = await fetchTwelveTimeSeries(bestSymbol, cfg.twelve, bestExchange);

        // Haal huidige dagkoers uit Finnhub cache voor nauwkeurige today% change
        const fhCk    = 'fh_' + bestFhKey.replace(/[^a-zA-Z0-9]/g, '_');
        const fhQuote = cacheGet(fhCk);

        const reason = bestPct !== -Infinity
          ? `${fmtPct(bestPct)} koersbeweging vandaag`
          : null;

        el.innerHTML = renderFeaturedStock(tsData, fhQuote, reason, bestNote);
      } catch (e) {
        el.innerHTML = `<div class="featured-stock">
          <div class="featured-stock-label">Aandeel van de dag</div>
          <div class="error-card" style="margin-top:0.8rem;border-left-color:#5a4a3a;">
            <div class="error-card-title" style="color:#7a6050;">Grafiek niet beschikbaar</div>
            <div class="error-card-msg">${esc(e.message)}</div>
            <button class="error-card-action" onclick="App.loadFeaturedStock()">Opnieuw proberen</button>
          </div>
        </div>`;
      }
    },

    // ── INIT ─────────────────────────────────────────
    async loadAll() {
      this.setStatus('loading');
      try {
        await this.loadMarketData();
        const extras = [this.loadNews(), this.loadFeaturedStock()];
        // Insider widget alleen op bedrijven-pagina
        if (PAGE.page === 'bedrijven') {
          const sym = document.getElementById('insider-symbol')?.value || 'AAPL';
          extras.push(loadInsiderWidget(sym));
        }
        await Promise.allSettled(extras);
        this.setStatus('live');
        this.updateEditionUI();
      } catch {
        this.setStatus('error');
      }
    },

    init() {
      this.startClock();
      this.checkDailyReset();   // reset caches if new day
      this.scheduleMidnightRefresh(); // fire at 00:00:01 elke dag
      this.scheduleNewsRefresh();     // nieuws elk uur op het hele uur

      const cfg = getCfg();
      // Setup banner alleen tonen op lokale ontwikkelomgeving zonder sleutels
      if (!IS_LIVE && !cfg.finnhub) {
        document.getElementById('setup-banner').classList.remove('hidden');
      }

      this.loadAll();

      // Marktkoersen elke 60 seconden verversen (alleen marktdata, niet nieuws)
      setInterval(() => this.loadMarketData(), 60_000);

      // Close modal on overlay click
      document.getElementById('api-modal').addEventListener('click', function (e) {
        if (e.target === this) App.closeModal();
      });
    },
  };

  App.init();

  // Globaal beschikbaar voor onchange handlers in HTML
  window.loadInsiderWidget = loadInsiderWidget;

})();
