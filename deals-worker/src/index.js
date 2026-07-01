// Daily Executive — Deals Snapshot Worker
//
// Runs on a Cron Trigger (see wrangler.toml). Each run fetches the same RSS
// feeds the site uses, detects M&A articles with a disclosed deal value,
// and merges them into Workers KV keyed by month ("deals:2026-07"). This is
// the only place deal data is permanently persisted — the site's live pages
// only ever see the last ~30-60 days a feed exposes, so without this worker
// a month's data disappears once feeds roll past it.

const ALL_FEEDS = [
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147', label: 'CNBC' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', label: 'BBC Business' },
  { url: 'https://www.theguardian.com/business/rss', label: 'Guardian' },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', label: 'MarketWatch' },
  { url: 'https://feeds.nos.nl/nosnieuwseconomie', label: 'NOS' },
  { url: 'https://fd.nl/?rss', label: 'FD' },
];

const DEAL_KEYWORDS = [
  'acquisition', 'acquires', 'acquired', 'acquire', 'merger', 'merges', 'takeover',
  'buyout', 'leveraged buyout', 'private equity', 'divestiture', 'divest', 'spinoff',
  'spin-off', 'joint venture', 'hostile bid', 'tender offer', 'm&a',
  'to acquire', 'agrees to buy', 'deal to buy', 'all-cash deal', 'stake sale',
  'majority stake', 'strategic stake', 'definitive agreement', 'letter of intent',
  'regulatory approval', 'antitrust', 'ipo', 'listing', 'delisting',
  'overname', 'overnamebod', 'fusie', 'fuseert', 'vijandig bod', 'meerderheidsbelang',
  'strategisch belang', 'beursgang', 'beursintroductie', 'afsplitsing',
  'mededingingsautoriteit', 'acm', 'toezichthouder', 'intentieverklaring',
  'overeenkomst tot overname', 'bod op',
];

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHTML(str) {
  return decodeEntities(str).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractLink(block) {
  const text = extractTag(block, 'link');
  if (text) return decodeEntities(text).trim();
  const m = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return m ? m[1].trim() : '';
}

function parseRSSItems(xml) {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return items.map(block => {
    const title = stripHTML(extractTag(block, 'title'));
    const rawDesc = extractTag(block, 'description') || extractTag(block, 'summary');
    const desc = stripHTML(rawDesc);
    const link = extractLink(block) || '#';
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published');
    return { title, desc, link, pubDate };
  }).filter(i => i.title.length > 5);
}

function extractDealValue(title, desc) {
  const text = `${title} ${desc}`;
  const m = text.match(/(\$|€|£)\s?(\d+(?:\.\d+)?)\s?(billion|bn|million|mln)\b/i);
  if (!m) return null;
  const unit = /^b/i.test(m[3]) ? 'B' : 'M';
  return `${m[1]}${m[2]}${unit}`;
}

function isDealArticle(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  return DEAL_KEYWORDS.some(k => text.includes(k));
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: { 'User-Agent': 'Daily Executive Deals Worker/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRSSItems(xml).map(item => ({ ...item, source: feed.label }));
}

function monthKey(date) {
  return `deals:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default {
  async fetch() {
    return new Response('Daily Executive deals snapshot worker is running.', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSnapshot(env));
  },
};

async function runSnapshot(env) {
  const now = new Date();

  const results = await Promise.allSettled(ALL_FEEDS.map(fetchFeed));
  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  const newDeals = articles
    .filter(a => isDealArticle(a.title, a.desc))
    .map(a => {
      const dealVal = extractDealValue(a.title, a.desc);
      const date = a.pubDate ? new Date(a.pubDate) : null;
      return { ...a, dealVal, date };
    })
    .filter(d => d.dealVal && d.date && !isNaN(d.date));

  // Group by month, merge into KV, dedupe by link
  const byMonth = new Map();
  for (const d of newDeals) {
    const key = monthKey(d.date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push({
      date: d.date.toISOString(),
      title: d.title,
      link: d.link,
      source: d.source,
      value: d.dealVal,
    });
  }

  for (const [key, deals] of byMonth) {
    const existingRaw = await env.DEALS_KV.get(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];

    const merged = [...existing];
    const existingLinks = new Set(existing.map(d => d.link));
    for (const d of deals) {
      if (!existingLinks.has(d.link)) {
        merged.push(d);
        existingLinks.add(d.link);
      }
    }

    merged.sort((a, b) => new Date(b.date) - new Date(a.date));
    await env.DEALS_KV.put(key, JSON.stringify(merged));
  }

  console.log(`[deals-worker] Snapshot complete at ${now.toISOString()} — ${newDeals.length} deal(s) detected across ${byMonth.size} month(s).`);
}
