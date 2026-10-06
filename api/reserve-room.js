import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
const LEADS_COLLECTION = 'leads';
const ROOMS_COLLECTION = 'rooms';

let cachedClient = null;

async function getDb() {
  if (!cachedClient) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined.');
    }
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME);
}

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
      return res.status(400).json({ error: 'Seeker name, email, and phone are required.' });
    }

    const bookingRef = `DF-ROOM-${roomId || '1004'}-` + Math.floor(100 + Math.random() * 900);
    const db = await getDb();

    // Mark room as reserved if roomId provided
    if (roomId) {
      try {
        await db.collection(ROOMS_COLLECTION).updateOne(
          { roomId: String(roomId) },
          { $set: { status: 'reserved', reservedAt: new Date(), reservedBy: seekerEmail } }
        );
      } catch (e) {
        console.warn('Room status update notice:', e.message);
      }
    }

    const reservationDoc = {
      reference: bookingRef,
      roomId: roomId || '1004',
      roomTitle: roomTitle || 'Munich Thalkirchen Furnished WG Room (Room 4)',
      name: seekerName,
      email: seekerEmail,
      phone: seekerPhone,
      city: 'Germany',
      moveInDate: targetMoveIn || 'Immediate / Flexible',
      budget: '€775 / month (Warmmiete)',
      roomType: 'WG Room (Single Private)',
      package: `Direct Verified Room Lead (${amount ? '₹' + amount : 'Variable Fee'})`,
      leadStatus: 'paid_confirmed',
      paymentId: paymentId || 'manual_or_simulated',
      amountPaidINR: amount || 12999,
      notes: notes || 'Verified room lead reservation & handover fee paid via Razorpay.',
      createdAt: new Date()
    };

    const result = await db.collection(LEADS_COLLECTION).insertOne(reservationDoc);

    return res.status(201).json({
      success: true,
      reference: bookingRef,
      id: result.insertedId,
      concierge: {
        role: 'DieFuture Relocation Desk',
        whatsapp: '+919567941647',
        phone: '+91 95679 41647',
        email: 'diefutureapartments@gmail.com',
        viewingSlot: 'Viewing & contract review coordinated directly by DieFuture team within 24 hours',
        anmeldungReady: true
      },
      message: 'Room lead handover unlocked and registered successfully!'
    });
  } catch (error) {
    console.error('Serverless /api/reserve-room Error:', error);
    return res.status(500).json({ error: 'Reservation database error', details: error.message });
  }
}
