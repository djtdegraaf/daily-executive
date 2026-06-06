export async function onRequestGet({ request, env }) {
  const url  = new URL(request.url);
  const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to   = url.searchParams.get('to')   || new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  if (!env.FINNHUB_KEY) return jsonError('FINNHUB_KEY not configured', 500);

  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${env.FINNHUB_KEY}`
  );
  if (!res.ok) return jsonError(`Finnhub HTTP ${res.status}`, res.status);
  return json(await res.json());
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function jsonError(msg, status = 500) { return json({ error: msg }, status); }
