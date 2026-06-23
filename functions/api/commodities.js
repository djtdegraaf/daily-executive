// Echte spotprijzen (geen ETF-proxies) via Alpha Vantage.
// Let op: gratis AV-tier = 25 requests/dag, gedeeld door alle bezoekers.
// De client-side cache (8 uur, zie app.js fetchCommoditiesSpot) houdt dit
// ruim binnen budget; deze functie zelf cachet niets server-side.
export async function onRequestGet({ env }) {
  if (!env.AV_KEY) return jsonError('AV_KEY not configured', 500);

  async function avFetch(params) {
    const res = await fetch(`https://www.alphavantage.co/query?${params}&apikey=${env.AV_KEY}`);
    if (!res.ok) throw new Error(`AV HTTP ${res.status}`);
    const data = await res.json();
    if (data['Note'] || data['Information']) throw new Error('AV rate limit reached');
    return data;
  }

  // Pakt de laatste twee niet-lege waarden uit een AV "data"-tijdreeks
  // (WTI / NATURAL_GAS functies retourneren { data: [{date, value}, ...] })
  function latestTwoFromAvSeries(series) {
    const clean = (series || []).filter(d => d.value && d.value !== '.');
    return [
      clean[0] ? parseFloat(clean[0].value) : null,
      clean[1] ? parseFloat(clean[1].value) : null,
    ];
  }

  // Pakt de laatste twee closes uit een FX_DAILY-tijdreeks
  function latestTwoFromFxSeries(series) {
    const dates = Object.keys(series || {}).sort().reverse();
    return [
      dates[0] ? parseFloat(series[dates[0]]['4. close']) : null,
      dates[1] ? parseFloat(series[dates[1]]['4. close']) : null,
    ];
  }

  try {
    const [goldData, wtiData, gasData] = await Promise.all([
      avFetch('function=FX_DAILY&from_symbol=XAU&to_symbol=USD&outputsize=compact'),
      avFetch('function=WTI&interval=daily'),
      avFetch('function=NATURAL_GAS&interval=daily'),
    ]);

    const [goldPrice, goldPrev] = latestTwoFromFxSeries(goldData['Time Series FX (Daily)']);
    const [wtiPrice, wtiPrev]   = latestTwoFromAvSeries(wtiData.data);
    const [gasPrice, gasPrev]   = latestTwoFromAvSeries(gasData.data);

    return json({
      gold: { price: goldPrice, prevClose: goldPrev },
      wti:  { price: wtiPrice,  prevClose: wtiPrev },
      gas:  { price: gasPrice,  prevClose: gasPrev },
    });
  } catch (e) {
    return jsonError(e.message, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function jsonError(msg, status = 500) { return json({ error: msg }, status); }
