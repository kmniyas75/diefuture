import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'leads';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Client
let cachedClient = null;

async function getCollection() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME).collection(COLLECTION_NAME);
}

const ROOMS_COLLECTION = 'rooms';

async function getRoomsCollection() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME).collection(ROOMS_COLLECTION);
}

// Initial seed rooms data if database has 0 rooms
const DEFAULT_ROOMS = [
  {
    roomId: '1004',
    title: 'Stylish and high-quality furnished WG room in Munich Thalkirchen (Room 4)',
    city: 'München',
    address: 'Gabriele-Münter-Straße 11, 81477 München-Thalkirchen, Bavaria',
    rentWarmEUR: 775,
    depositEUR: 1500,
    feeINR: 12999,
    roomSizeM2: 16,
    roomType: 'WG Room (Single Private)',
    imageUrl: 'https://stayforall-public.s3.eu-central-1.amazonaws.com/uploads/properties/1791184475238525657-5e592e0d6c6da5c239a85b15922a96f2e94fdb32e22758cf327f2c56e019334c.jpg',
    stayforallUrl: 'https://stayforall.com/rooms/1004',
    anmeldung: true,
    transit: '6 min walk to U3 Thalkirchen (12 min to TUM / LMU / Hbf)',
    status: 'available',
    featured: true,
    description: 'Fully furnished private bedroom with double bed, study desk, ergonomic chair, sunny garden-view balcony, modern kitchen with washing machine, and 250 Mbps fiber WiFi.',
    landlordContact: {
      name: 'Herr M. Weber',
      role: 'Verified Property Manager / Landlord',
      phone: '+49 176 8921 4055',
      whatsapp: '+4917689214055',
      email: 'vermietung.muenchen@stayforall.com',
      viewingSlot: 'Daily 10:00–18:00 CET (In-Person or Live Video Tour)'
    },
    createdAt: new Date()
  },
  {
    roomId: '1008',
    title: 'Bright Studio Apartment in Berlin Prenzlauer Berg',
    city: 'Berlin',
    address: 'Kollwitzstraße 42, 10405 Berlin-Prenzlauer Berg',
    rentWarmEUR: 820,
    depositEUR: 1640,
    feeINR: 14999,
    roomSizeM2: 24,
    roomType: 'Private Studio Apartment',
    imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
    stayforallUrl: '',
    anmeldung: true,
    transit: '4 min walk to U2 Senefelderplatz (8 min to Alexanderplatz)',
    status: 'available',
    featured: true,
    description: 'Self-contained 1-room apartment with private kitchenette, modern walk-in shower, high ceilings, large windows, and official city registration assistance.',
    landlordContact: {
      name: 'Frau K. Schneider',
      role: 'Private Landlord Representative',
      phone: '+49 172 4589 1120',
      whatsapp: '+4917245891120',
      email: 'schneider.wohnen.berlin@gmail.com',
      viewingSlot: 'Mon–Fri 14:00–19:00 CET (Virtual or In-Person)'
    },
    createdAt: new Date()
  },
  {
    roomId: '1012',
    title: 'Modern Furnished WG Room in Frankfurt Bockenheim',
    city: 'Frankfurt',
    address: 'Leipziger Straße 78, 60487 Frankfurt am Main',
    rentWarmEUR: 695,
    depositEUR: 1400,
    feeINR: 11999,
    roomSizeM2: 15,
    roomType: 'WG Room (Single Private)',
    imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    stayforallUrl: '',
    anmeldung: true,
    transit: '3 min walk to U6/U7 Leipziger Straße (10 min to Goethe Uni)',
    status: 'available',
    featured: true,
    description: 'Charming WG flat in the heart of student-friendly Bockenheim. Modern furnishings, quiet courtyard view, dishwasher, washer-dryer, and easy tram access.',
    landlordContact: {
      name: 'Herr T. Fischer',
      role: 'Verified Property Landlord',
      phone: '+49 151 7890 2341',
      whatsapp: '+4915178902341',
      email: 'fischer.immo.ffm@gmail.com',
      viewingSlot: 'Daily 11:00–17:00 CET'
    },
    createdAt: new Date()
  }
];

async function ensureSeedRooms() {
  try {
    const col = await getRoomsCollection();
    const count = await col.countDocuments();
    if (count === 0) {
      await col.insertMany(DEFAULT_ROOMS);
      console.log(`[MongoDB] Initialized default rooms collection with ${DEFAULT_ROOMS.length} verified rooms.`);
    }
  } catch (err) {
    console.warn('[MongoDB] Room seed notice:', err.message);
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Submit brief endpoint
app.post('/api/submit-brief', async (req, res) => {
  try {
    const { name, email, phone, city, moveIn, budget, roomType, pkg, german, notes, status } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone number are required.' });
    }

    const refCode = 'DF-' + Math.floor(1000 + Math.random() * 9000);

    const leadDocument = {
      reference: refCode,
      name,
      email,
      phone,
      city: city || 'Not specified',
      moveInDate: moveIn || 'Not specified',
      budget: budget || 'Not specified',
      roomType: roomType || 'WG Room',
      package: pkg || 'guaranteed',
      germanLevel: german || 'Not specified',
      status: status || 'International Student',
      notes: notes || '',
      createdAt: new Date(),
      leadStatus: 'new'
    };

    const collection = await getCollection();
    const result = await collection.insertOne(leadDocument);

    console.log(`[MongoDB] New lead saved: ${refCode} (${name} - ${city}) [ID: ${result.insertedId}]`);

    return res.status(201).json({
      success: true,
      reference: refCode,
      id: result.insertedId,
      message: 'Brief successfully saved to MongoDB!'
    });
  } catch (error) {
    console.error('[MongoDB Error]', error);
    return res.status(500).json({ error: 'Failed to save lead to database', details: error.message });
  }
});

// Reserve room lead & unlock landlord dossier endpoint
app.post('/api/reserve-room', async (req, res) => {
  try {
    const {
      roomId,
      roomTitle,
      seekerName,
      seekerEmail,
      seekerPhone,
      targetMoveIn,
      paymentId,
      amount,
      notes
    } = req.body;

    if (!seekerName || !seekerEmail || !seekerPhone) {
      return res.status(400).json({ error: 'Name, email, and phone number are required.' });
    }

    const bookingRef = 'DF-ROOM-' + (roomId || '1004') + '-' + Math.floor(100 + Math.random() * 900);

    const reservationDoc = {
      reference: bookingRef,
      roomId: roomId || '1004',
      roomTitle: roomTitle || 'Munich Thalkirchen Furnished WG Room (Room 4)',
      name: seekerName,
      email: seekerEmail,
      phone: seekerPhone,
      city: 'München',
      moveInDate: targetMoveIn || 'Immediate / Flexible',
      budget: '€775 / month (Warmmiete)',
      roomType: 'WG Room (Single Private)',
      package: 'Direct Verified Room Lead (₹12,999)',
      leadStatus: 'paid_confirmed',
      paymentId: paymentId || 'manual_or_simulated',
      amountPaidINR: amount || 12999,
      notes: notes || 'Verified room lead reservation & landlord handover fee paid via Razorpay.',
      createdAt: new Date()
    };

    const collection = await getCollection();
    const result = await collection.insertOne(reservationDoc);

    console.log(`[MongoDB] Room Lead Reservation saved: ${bookingRef} (${seekerName} - ${paymentId}) [ID: ${result.insertedId}]`);

    return res.status(201).json({
      success: true,
      reference: bookingRef,
      id: result.insertedId,
      landlordContact: {
        name: 'Herr M. Weber',
        role: 'Verified Property Manager / Landlord Representative',
        phone: '+49 176 8921 4055',
        whatsapp: '+4917689214055',
        email: 'vermietung.muenchen@stayforall.com',
        address: 'Gabriele-Münter-Straße 11, 81477 München',
        viewingSlot: 'Daily 10:00–18:00 CET (In-Person or Video Call)',
        anmeldungReady: true
      },
      message: 'Room lead handover unlocked and registered successfully!'
    });
  } catch (error) {
    console.error('[MongoDB Error in /api/reserve-room]', error);
    return res.status(500).json({ error: 'Failed to record reservation', details: error.message });
  }
});

import { ObjectId } from 'mongodb';

// View all leads endpoint
app.get('/api/leads', async (req, res) => {
  try {
    const collection = await getCollection();
    const leads = await collection.find({}).sort({ createdAt: -1 }).limit(200).toArray();
    res.json({ count: leads.length, leads });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leads', details: error.message });
  }
});

// Update lead status (supports /api/leads/:id or /api/leads)
const handlePatchLead = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.query.id;
    if (!id) return res.status(400).json({ error: 'Lead id is required.' });

    const { leadStatus, adminNotes } = req.body;
    const collection = await getCollection();
    
    const updateFields = {};
    if (leadStatus) updateFields.leadStatus = leadStatus;
    if (adminNotes !== undefined) updateFields.adminNotes = adminNotes;
    updateFields.updatedAt = new Date();

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ success: true, message: 'Lead updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update lead', details: error.message });
  }
};
app.patch('/api/leads/:id', handlePatchLead);
app.patch('/api/leads', handlePatchLead);

// Delete lead (supports /api/leads/:id or /api/leads?id=...)
const handleDeleteLead = async (req, res) => {
  try {
    const id = req.params.id || req.query.id;
    if (!id) return res.status(400).json({ error: 'Lead id is required.' });

    const collection = await getCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lead', details: error.message });
  }
};
app.delete('/api/leads/:id', handleDeleteLead);
app.delete('/api/leads', handleDeleteLead);

// ─────────────────────────────────────────────────────────────
// ROOMS MANAGEMENT & STAYFORALL IMPORTER API
// ─────────────────────────────────────────────────────────────

// 1. Get all rooms (supports filter ?city=... or ?status=...)
app.get('/api/rooms', async (req, res) => {
  try {
    const { city, status } = req.query;
    const filter = {};
    if (city && city !== 'all') filter.city = new RegExp(city, 'i');
    if (status && status !== 'all') filter.status = status;

    const col = await getRoomsCollection();
    let rooms = await col.find(filter).sort({ createdAt: -1 }).toArray();

    // If empty, seed default rooms
    if (rooms.length === 0) {
      await ensureSeedRooms();
      rooms = await col.find(filter).sort({ createdAt: -1 }).toArray();
    }

    res.json({ count: rooms.length, rooms });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms', details: error.message });
  }
});

// 2. Get single room by roomId or _id
app.get('/api/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const col = await getRoomsCollection();

    let query = { roomId: id };
    if (ObjectId.isValid(id) && id.length === 24) {
      query = { $or: [{ roomId: id }, { _id: new ObjectId(id) }] };
    }

    let room = await col.findOne(query);

    // Fallback search in default rooms
    if (!room) {
      room = DEFAULT_ROOMS.find(r => r.roomId === id);
    }

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ success: true, room });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch room', details: error.message });
  }
});

// 3. Create new room
app.post('/api/rooms', async (req, res) => {
  try {
    const {
      title,
      city,
      address,
      rentWarmEUR,
      depositEUR,
      feeINR,
      roomSizeM2,
      roomType,
      imageUrl,
      stayforallUrl,
      transit,
      description,
      landlordContact,
      status,
      featured
    } = req.body;

    if (!title || !city || !rentWarmEUR) {
      return res.status(400).json({ error: 'Title, city, and warm rent are required.' });
    }

    // Auto-generate room ID if not present
    let roomId = req.body.roomId;
    if (!roomId) {
      if (stayforallUrl && stayforallUrl.match(/rooms\/(\d+)/i)) {
        roomId = stayforallUrl.match(/rooms\/(\d+)/i)[1];
      } else {
        roomId = String(Math.floor(1000 + Math.random() * 9000));
      }
    }

    const newRoom = {
      roomId,
      title,
      city,
      address: address || `${city}, Germany`,
      rentWarmEUR: Number(rentWarmEUR),
      depositEUR: Number(depositEUR) || Number(rentWarmEUR) * 2,
      feeINR: Number(feeINR) || 12999,
      roomSizeM2: Number(roomSizeM2) || 16,
      roomType: roomType || 'WG Room (Single Private)',
      imageUrl: imageUrl || 'https://stayforall-public.s3.eu-central-1.amazonaws.com/uploads/properties/1791184475238525657-5e592e0d6c6da5c239a85b15922a96f2e94fdb32e22758cf327f2c56e019334c.jpg',
      stayforallUrl: stayforallUrl || '',
      anmeldung: true,
      transit: transit || 'Convenient U-Bahn / S-Bahn transit nearby',
      status: status || 'available',
      featured: featured !== undefined ? Boolean(featured) : true,
      description: description || '',
      landlordContact: landlordContact || {
        name: 'Verified German Landlord',
        role: 'Property Representative',
        phone: '+49 176 8921 4055',
        whatsapp: '+4917689214055',
        email: 'diefutureapartments@gmail.com',
        viewingSlot: 'Daily 10:00–18:00 CET'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const col = await getRoomsCollection();
    const result = await col.insertOne(newRoom);

    console.log(`[MongoDB] New Room created: ${roomId} - ${title} [ID: ${result.insertedId}]`);
    res.status(201).json({ success: true, id: result.insertedId, roomId, room: newRoom });
  } catch (error) {
    console.error('Failed to create room:', error);
    res.status(500).json({ error: 'Failed to create room', details: error.message });
  }
});

// 4. Update room
app.patch('/api/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const col = await getRoomsCollection();

    let query = { roomId: id };
    if (ObjectId.isValid(id) && id.length === 24) {
      query = { $or: [{ roomId: id }, { _id: new ObjectId(id) }] };
    }

    const updates = { ...req.body, updatedAt: new Date() };
    delete updates._id;

    const result = await col.updateOne(query, { $set: updates });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ success: true, message: 'Room updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update room', details: error.message });
  }
});

// 5. Delete room
app.delete('/api/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const col = await getRoomsCollection();

    let query = { roomId: id };
    if (ObjectId.isValid(id) && id.length === 24) {
      query = { $or: [{ roomId: id }, { _id: new ObjectId(id) }] };
    }

    const result = await col.deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ success: true, message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete room', details: error.message });
  }
});

// 6. StayforAll Room Auto-Fetcher / Scraper
app.post('/api/rooms/fetch-stayforall', async (req, res) => {
  try {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'StayforAll URL or Room ID is required.' });

    url = url.trim();
    if (/^\d+$/.test(url)) {
      url = `https://stayforall.com/rooms/${url}`;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Unable to fetch StayforAll room page (HTTP ${response.status})` });
    }

    const html = await response.text();

    const roomIdMatch = url.match(/rooms\/(\d+)/i);
    const extracted = {
      sourceUrl: url,
      roomId: roomIdMatch ? roomIdMatch[1] : String(Math.floor(1000 + Math.random() * 9000)),
      title: '',
      city: 'München',
      address: '',
      rentWarmEUR: 775,
      depositEUR: 1500,
      feeINR: 12999, // default DieFuture service fee
      roomSizeM2: 16,
      roomType: 'WG Room (Single Private)',
      imageUrl: '',
      anmeldung: true,
      transit: 'Walking distance to public transit & metro station'
    };

    // Parse JSON-LD script tags
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
      if (ogTitle) {
        extracted.title = ogTitle.split(' in ')[0].split(' | ')[0].trim();
      }
    }
    if (!extracted.imageUrl) {
      const ogImg = html.match(/<meta property="og:image" content="([^"]*)"/i)?.[1];
      if (ogImg) extracted.imageUrl = ogImg;
    }

    // Address extraction
    const addrRegex = /([A-ZÄÖÜa-zäöüß\-]+(?:straße|strasse|str\.|weg|platz|allee|ring)\s+\d+[^<,\n"']*)/i;
    const addrMatch = html.match(addrRegex);
    if (addrMatch) {
      extracted.address = addrMatch[1].trim() + (extracted.city ? `, ${extracted.city}` : '');
    } else {
      extracted.address = `${extracted.city}, Germany`;
    }

    // Sensible deposit fallback (approx 2 months warm rent)
    if (extracted.rentWarmEUR) {
      extracted.depositEUR = Math.round(extracted.rentWarmEUR * 2);
    }

    res.json({ success: true, room: extracted });
  } catch (error) {
    console.error('StayforAll extraction error:', error);
    res.status(500).json({ error: 'Failed to parse StayforAll room', details: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`DieFuture API server running on http://localhost:${PORT}`);
  await ensureSeedRooms();
});
