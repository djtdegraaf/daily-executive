// Cloudflare Pages Function — Finnhub Insider Transactions
// Gratis endpoint: toont recente insider-aan/verkopen van executives & board members

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return json({ error: 'symbol parameter vereist' }, 400);
  }

  const apiKey = context.env.FINNHUB_KEY;
  if (!apiKey) {
    return json({ error: 'API niet geconfigureerd op server' }, 503);
  }

  try {
    const url = `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'DailyExecutive/1.0' } });
    if (!res.ok) return json({ error: `Finnhub HTTP ${res.status}` }, 502);
    const data = await res.json();
    return json(data, 200, 3600); // 1 uur cache
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

function json(data, status = 200, cacheSecs = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(cacheSecs ? { 'Cache-Control': `public, max-age=${cacheSecs}` } : {}),
    },
  });
}
