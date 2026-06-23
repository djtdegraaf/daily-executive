export async function onRequestGet() {
  const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,JPY');
  if (!res.ok) return jsonError(`Frankfurter HTTP ${res.status}`, res.status);
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
