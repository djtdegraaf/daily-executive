export async function onRequestGet({ request }) {
  const url     = new URL(request.url);
  const feedUrl = url.searchParams.get('url');
  if (!feedUrl) return new Response('Missing url', { status: 400 });

  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Daily Executive RSS Reader/1.0' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return new Response(`Feed error ${res.status}`, { status: res.status });

  const xml = await res.text();
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
