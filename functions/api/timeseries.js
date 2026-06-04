// Cloudflare Pages Function — proxiet Twelve Data tijdreeks
// API-sleutel staat als omgevingsvariabele TWELVE_KEY op Cloudflare

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const symbol   = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '1day';
  const outputsize = searchParams.get('outputsize') || '31';

  if (!symbol) {
    return json({ error: 'symbol parameter vereist' }, 400);
  }

  const apiKey = context.env.TWELVE_KEY;
  if (!apiKey) {
    return json({ error: 'API niet geconfigureerd op server' }, 503);
  }

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return json({ error: `Twelve Data HTTP ${res.status}` }, 502);
    const data = await res.json();
    return json(data, 200, 3600); // 1 uur cache (dagelijkse data)
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
