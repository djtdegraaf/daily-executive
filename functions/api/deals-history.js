// Reads persisted deal snapshots from Workers KV (written daily by the
// deals-worker Cron Trigger). Requires DEALS_KV to be bound to this Pages
// project via the same KV namespace the worker writes to.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const month = url.searchParams.get('month'); // format: YYYY-MM

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing month parameter (expected YYYY-MM)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DEALS_KV) {
    return new Response(JSON.stringify({ error: 'DEALS_KV not bound' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = await env.DEALS_KV.get(`deals:${month}`);
  const deals = raw ? JSON.parse(raw) : [];

  return new Response(JSON.stringify({ month, deals }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
