// Cloudflare Pages Function — proxiet RSS feeds server-side
// Voorkomt CORS-problemen met externe RSS feeds
// Geen API-sleutel nodig — puur een fetch-proxy

const ALLOWED_FEEDS = [
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.reuters.com/reuters/financialsNews',
  'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147',
  'https://feeds.bbci.co.uk/news/business/rss.xml',
  'https://www.theguardian.com/business/rss',
  'https://feeds.marketwatch.com/marketwatch/topstories/',
  'https://feeds.nos.nl/nosnieuwseconomie',
  'https://fd.nl/?rss',
];

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const feedUrl = searchParams.get('url');

  if (!feedUrl) {
    return response('url parameter vereist', 400, 'text/plain');
  }

  // Whitelist — voorkomt misbruik als open proxy
  if (!ALLOWED_FEEDS.includes(feedUrl)) {
    return response('Feed niet toegestaan', 403, 'text/plain');
  }

  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'DailyExecutive/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      cf: { cacheTtl: 1800, cacheEverything: true }, // 30 min Cloudflare cache
    });

    if (!res.ok) {
      return response(`Feed HTTP ${res.status}`, 502, 'text/plain');
    }

    const xml = await res.text();

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800', // 30 min browser cache
      },
    });
  } catch (e) {
    return response(`Fout: ${e.message}`, 502, 'text/plain');
  }
}

function response(body, status, contentType) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
