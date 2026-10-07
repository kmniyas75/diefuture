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
    let { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Valid URL is required.' });
    }

    url = String(url).trim();
    const roomIdMatch = url.match(/rooms\/(\d+)/i) || url.match(/^(\d+)$/);

    if (roomIdMatch) {
      const sfaRoomId = roomIdMatch[1];
      try {
        const sfaRes = await fetch(`https://api.stayforall.com/api/v1/rooms/${sfaRoomId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        });

        if (sfaRes.ok) {
          const sfaJson = await sfaRes.json();
          const d = sfaJson.data || sfaJson;
          if (d) {
            let imageList = [];
            if (Array.isArray(d.images)) {
              imageList = d.images.map(img => img.image_url || img.media_url || (typeof img === 'string' ? img : '')).filter(Boolean);
            }
            if (Array.isArray(d.media)) {
              const mediaImgs = d.media.map(m => m.media_url || m.url).filter(Boolean);
              imageList = [...imageList, ...mediaImgs];
            }
            if (d.primaryImage || d.primary_image) {
              imageList.unshift(d.primaryImage || d.primary_image);
            }
            imageList = [...new Set(imageList)].filter(u => typeof u === 'string' && u.startsWith('http'));

            const rent = Number(d.monthly_rent || d.price || d.warm_rent || 775);
            const deposit = Number(d.deposit || rent * 2);

            const roomObj = {
              sourceUrl: `https://stayforall.com/rooms/${sfaRoomId}`,
              roomId: String(d.id || sfaRoomId),
              title: d.title ? d.title.replace(/ - Zimmer \d+/i, '').replace(/ - Room \d+/i, '').trim() : `Room in ${d.city || 'Germany'}`,
              city: d.city || 'München',
              address: d.address || `${d.city || 'München'}, Germany`,
              rentWarmEUR: rent,
              depositEUR: deposit,
              roomSizeM2: Number(d.size_sqm || 16),
              roomType: d.room_type ? (d.room_type.toLowerCase().includes('wg') || d.room_type.toLowerCase().includes('single') ? 'WG Room (Single Private)' : d.room_type) : 'WG Room (Single Private)',
              imageUrl: imageList[0] || '',
              images: imageList,
              anmeldung: d.registration_support === true || (Array.isArray(d.amenities) && d.amenities.some(a => String(a).toLowerCase().includes('anmeldung'))),
              transit: d.transit || 'Walking distance to public transit & metro station',
              description: d.description || ''
            };

            return res.status(200).json({ success: true, room: roomObj });
          }
        }
      } catch (apiErr) {
        console.warn('StayforAll API direct fetch warning:', apiErr.message);
      }
    }

    // HTML scraping fallback
    if (/^\d+$/.test(url)) {
      url = `https://stayforall.com/rooms/${url}`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
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
      images: [],
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

    if (extracted.imageUrl) {
      extracted.images = [extracted.imageUrl];
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
