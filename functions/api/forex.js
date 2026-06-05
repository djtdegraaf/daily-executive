export async function onRequestGet({ env }) {
  if (!env.AV_KEY) return jsonError('AV_KEY not configured', 500);

  const res = await fetch(
    `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=EUR&to_currency=USD&apikey=${env.AV_KEY}`
  );
  if (!res.ok) return jsonError(`Alpha Vantage HTTP ${res.status}`, res.status);
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
