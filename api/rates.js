// In-memory cache for serverless invocation reuse
let cachedRateData = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = Date.now();
  if (cachedRateData && (now - lastFetchTime < CACHE_TTL_MS)) {
    return res.status(200).json({
      ...cachedRateData,
      cached: true
    });
  }

  let rate = 108.50; // Resilient fallback
  let dateStr = new Date().toISOString().split('T')[0];
  let source = 'fallback';

  try {
    // 1. Try Frankfurter (European Central Bank official data)
    const ctrl1 = new AbortController();
    const timeout1 = setTimeout(() => ctrl1.abort(), 3500);
    const resp1 = await fetch('https://api.frankfurter.app/latest?from=EUR&to=INR', { signal: ctrl1.signal });
    clearTimeout(timeout1);

    if (resp1.ok) {
      const data1 = await resp1.json();
      if (data1?.rates?.INR) {
        rate = Number(data1.rates.INR);
        dateStr = data1.date || dateStr;
        source = 'frankfurter_ecb';
      }
    }
  } catch (err1) {
    console.warn('[Rates] Frankfurter fetch failed, trying secondary API:', err1.message);
    try {
      // 2. Secondary fallback API
      const ctrl2 = new AbortController();
      const timeout2 = setTimeout(() => ctrl2.abort(), 3500);
      const resp2 = await fetch('https://open.er-api.com/v6/latest/EUR', { signal: ctrl2.signal });
      clearTimeout(timeout2);

      if (resp2.ok) {
        const data2 = await resp2.json();
        if (data2?.rates?.INR) {
          rate = Number(data2.rates.INR);
          dateStr = data2.time_last_update_utc?.split(' ')?.[0] || dateStr;
          source = 'open_er_api';
        }
      }
    } catch (err2) {
      console.warn('[Rates] Secondary rate fetch failed, using fallback:', err2.message);
    }
  }

  // Round rate to 2 decimal places e.g. 108.46
  const cleanRate = Math.round(rate * 100) / 100;

  cachedRateData = {
    success: true,
    base: 'EUR',
    target: 'INR',
    rate: cleanRate,
    date: dateStr,
    source,
    updatedAt: new Date().toISOString()
  };
  lastFetchTime = now;

  return res.status(200).json({
    ...cachedRateData,
    cached: false
  });
}
