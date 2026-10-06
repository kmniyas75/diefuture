export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { url } = req.body;
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ error: 'Valid URL is required.' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `StayforAll returned HTTP ${response.status}` });
    }

    const html = await response.text();

    const extracted = {
      title: '',
      rentWarmEUR: 750,
      depositEUR: 1500,
      city: 'München',
      address: '',
      imageUrl: '',
      roomType: 'WG Room (Single Private)',
      roomSizeM2: 16
    };

    // Parse JSON-LD
    const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of jsonLdMatches) {
      try {
        const parsed = JSON.parse(m[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item['@type'] === 'SingleFamilyResidence' || item['@type'] === 'Apartment' || item['@type'] === 'Accommodation') {
            if (item.name) extracted.title = item.name.replace(/ - Zimmer \d+/i, '').replace(/ - Room \d+/i, '').trim();
            if (item.offers?.price) extracted.rentWarmEUR = Number(item.offers.price);
            if (item.address?.addressLocality) extracted.city = item.address.addressLocality;
            if (item.image) {
              extracted.imageUrl = typeof item.image === 'string' ? item.image : (item.image.url || '');
            }
          }
        }
      } catch (e) {}
    }

    // OpenGraph fallback
    if (!extracted.title) {
      const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/i)?.[1];
      if (ogTitle) extracted.title = ogTitle.split(' in ')[0].split(' | ')[0].trim();
    }
    if (!extracted.imageUrl) {
      const ogImg = html.match(/<meta property="og:image" content="([^"]*)"/i)?.[1];
      if (ogImg) extracted.imageUrl = ogImg;
    }

    // Address
    const addrRegex = /([A-ZÄÖÜa-zäöüß\-]+(?:straße|strasse|str\.|weg|platz|allee|ring)\s+\d+[^<,\n"']*)/i;
    const addrMatch = html.match(addrRegex);
    if (addrMatch) {
      extracted.address = addrMatch[1].trim() + (extracted.city ? `, ${extracted.city}` : '');
    } else {
      extracted.address = `${extracted.city}, Germany`;
    }

    if (extracted.rentWarmEUR) {
      extracted.depositEUR = Math.round(extracted.rentWarmEUR * 2);
    }

    return res.status(200).json({ success: true, room: extracted });
  } catch (error) {
    console.error('StayforAll extraction error:', error);
    return res.status(500).json({ error: 'Failed to parse StayforAll room', details: error.message });
  }
}
