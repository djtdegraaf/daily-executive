export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const symbol     = url.searchParams.get('symbol');
  const interval   = url.searchParams.get('interval')   || '1day';
  const outputsize = url.searchParams.get('outputsize') || '31';

  if (!symbol) return jsonError('Missing symbol', 400);
  if (!env.TWELVE_KEY) return jsonError('TWELVE_KEY not configured', 500);

  const res = await fetch(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${env.TWELVE_KEY}`
  );
  if (!res.ok) return jsonError(`Twelve Data HTTP ${res.status}`, res.status);
  const data = await res.json();
  return json(data);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function jsonError(msg, status = 500) { return json({ error: msg }, status); }
