export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  if (!symbol) return jsonError('Missing symbol', 400);
  if (!env.FINNHUB_KEY) return jsonError('FINNHUB_KEY not configured', 500);

  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${env.FINNHUB_KEY}`
  );
  if (!res.ok) return jsonError(`Finnhub HTTP ${res.status}`, res.status);
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
