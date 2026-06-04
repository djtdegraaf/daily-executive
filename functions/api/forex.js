// Cloudflare Pages Function — proxiet Alpha Vantage EUR/USD
// API-sleutel staat als omgevingsvariabele AV_KEY op Cloudflare

export async function onRequest(context) {
  const apiKey = context.env.AV_KEY;
  if (!apiKey) {
    return json({ error: 'API niet geconfigureerd op server' }, 503);
  }

  try {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=EUR&to_currency=USD&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return json({ error: `Alpha Vantage HTTP ${res.status}` }, 502);
    const data = await res.json();
    if (data['Note'] || data['Information']) {
      return json({ error: 'Alpha Vantage rate limit bereikt' }, 429);
    }
    return json(data, 200, 300); // 5 minuten cache
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
