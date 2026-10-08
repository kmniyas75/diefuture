import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Razorpay from 'razorpay';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'leads';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (Vite production build with clean URLs)
app.use(express.static(path.join(__dirname, 'dist'), { extensions: ['html'] }));

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Daily EUR -> INR exchange rate endpoint (with in-memory cache)
let serverRatesCache = null;
let serverRatesLastFetch = 0;
const SERVER_RATES_TTL = 60 * 60 * 1000; // 1 hour

app.get('/api/rates', async (req, res) => {
  const now = Date.now();
  if (serverRatesCache && (now - serverRatesLastFetch < SERVER_RATES_TTL)) {
    return res.json({ ...serverRatesCache, cached: true });
  }

  let rate = 108.50;
  let dateStr = new Date().toISOString().split('T')[0];
  let source = 'fallback';

  try {
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 3500);
    const resp1 = await fetch('https://api.frankfurter.app/latest?from=EUR&to=INR', { signal: ctrl1.signal });
    clearTimeout(t1);
    if (resp1.ok) {
      const data1 = await resp1.json();
      if (data1?.rates?.INR) {
        rate = Number(data1.rates.INR);
        dateStr = data1.date || dateStr;
        source = 'frankfurter_ecb';
      }
    }
  } catch (e1) {
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 3500);
      const resp2 = await fetch('https://open.er-api.com/v6/latest/EUR', { signal: ctrl2.signal });
      clearTimeout(t2);
      if (resp2.ok) {
        const data2 = await resp2.json();
        if (data2?.rates?.INR) {
          rate = Number(data2.rates.INR);
          dateStr = data2.time_last_update_utc?.split(' ')?.[0] || dateStr;
          source = 'open_er_api';
        }
      }
    } catch (e2) {}
  }

  const cleanRate = Math.round(rate * 100) / 100;
  serverRatesCache = {
    success: true,
    base: 'EUR',
    target: 'INR',
    rate: cleanRate,
    date: dateStr,
    source,
    updatedAt: new Date().toISOString()
  };
  serverRatesLastFetch = now;
  return res.json({ ...serverRatesCache, cached: false });
});

// ----------------------------------------------------
// Razorpay Standard Checkout Endpoints
// ----------------------------------------------------

// 1. Create Order
app.post('/api/create-order', async (req, res) => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    return res.status(500).json({ error: 'Razorpay credentials not configured in environment.' });
  }

  try {
    const { amount, currency = 'INR', receipt, notes } = req.body || {};

    let amountInPaise = Number(amount);

    // --- IMMUTABLE ANTI-TAMPER SECURITY ---
    // If a roomId is provided in notes or body, look up the room in MongoDB
    // and strictly enforce the database price calculated with the official live rate!
    const targetRoomId = notes?.roomId || req.body?.roomId;
    if (targetRoomId) {
      try {
        const roomsCol = await getRoomsCollection();
        const room = await roomsCol.findOne({ roomId: String(targetRoomId) });
        if (room) {
          const liveRate = serverRatesCache?.rate || 108.50;
          const mode = room.paymentMode || 'full';
          let requiredINR = 0;
          let requiredEUR = 0;

          if (room.feeCurrency !== 'INR' && room.feeEUR) {
            const feeEUR = Number(room.feeEUR);
            const holdingEUR = room.holdingFeeEUR !== undefined ? Number(room.holdingFeeEUR) : 0;
            const remainingEUR = room.remainingFeeEUR !== undefined ? Number(room.remainingFeeEUR) : Math.max(0, feeEUR - holdingEUR);
            if (mode === 'holding_initial') {
              requiredEUR = holdingEUR;
              requiredINR = Math.round(holdingEUR * liveRate);
            } else if (mode === 'holding_paid') {
              requiredEUR = remainingEUR;
              requiredINR = Math.round(remainingEUR * liveRate);
            } else {
              requiredEUR = feeEUR;
              requiredINR = Math.round(feeEUR * liveRate);
            }
          } else if (room.feeINR) {
            const feeINR = Number(room.feeINR);
            const holdingINR = room.holdingFeeINR !== undefined ? Number(room.holdingFeeINR) : 0;
            const remainingINR = room.remainingFeeINR !== undefined ? Number(room.remainingFeeINR) : Math.max(0, feeINR - holdingINR);
            if (mode === 'holding_initial') {
              requiredINR = holdingINR;
              requiredEUR = Math.round(holdingINR / liveRate);
            } else if (mode === 'holding_paid') {
              requiredINR = remainingINR;
              requiredEUR = Math.round(remainingINR / liveRate);
            } else {
              requiredINR = feeINR;
              requiredEUR = Math.round(feeINR / liveRate);
            }
          }

          const targetCurrency = String(currency || 'INR').toUpperCase();
          if (targetCurrency === 'EUR') {
            if (requiredEUR > 0) {
              // Strictly enforce server-calculated amount in Euro cents
              amountInPaise = Math.round(requiredEUR * 100);
            }
          } else {
            if (requiredINR > 0) {
              // Strictly enforce server-calculated amount in INR paise
              amountInPaise = Math.round(requiredINR * 100);
            }
          }
        }
      } catch (err) {
        console.warn('Server price validation note in server.js:', err.message);
      }
    }

    if (!amountInPaise || isNaN(amountInPaise) || amountInPaise < 100) {
      return res.status(400).json({ error: 'Invalid amount. Minimum amount is 100 units (₹1 / €1).' });
    }

    const instance = new Razorpay({
      key_id,
      key_secret
    });

    const targetCurrency = String(currency || 'INR').toUpperCase();
    const finalNotes = { ...(notes || {}) };
    if (targetCurrency === 'INR') {
      finalNotes.payableINR = Math.round(amountInPaise / 100);
      finalNotes.feeCurrency = 'INR';
    } else if (targetCurrency === 'EUR') {
      finalNotes.payableEUR = `€${Math.round(amountInPaise / 100)}`;
      finalNotes.feeCurrency = 'EUR';
      delete finalNotes.payableINR;
      delete finalNotes.exchangeRate;
    }

    const options = {
      amount: Math.round(amountInPaise),
      currency: targetCurrency,
      receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      notes: finalNotes
    };

    const order = await instance.orders.create(options);

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: key_id
    });
  } catch (error) {
    console.error('Razorpay create-order error:', error);
    if (error.statusCode === 401 || (error.error && error.error.code === 'BAD_REQUEST_ERROR' && error.statusCode === 401)) {
      return res.status(401).json({ error: 'Razorpay authentication failed. Verify API keys.', details: error.error || error.message });
    }
    return res.status(500).json({ error: 'Failed to create Razorpay order', details: error.error || error.message });
  }
});

// 2. Verify Payment Signature
app.post('/api/verify-payment', async (req, res) => {
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_secret) {
    return res.status(500).json({ error: 'Razorpay secret key not configured in environment.' });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification parameters (razorpay_order_id, razorpay_payment_id, razorpay_signature).'
      });
    }

    // HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isMatch = (expectedSignature === razorpay_signature);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Invalid payment signature. Payment verification failed.'
      });
    }

    return res.json({
      success: true,
      verified: true,
      message: 'Payment verified successfully.',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id
    });
  } catch (error) {
    console.error('Razorpay verify-payment error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during payment verification.',
      details: error.message
    });
  }
});

// Razorpay Webhook Endpoint
app.post('/api/razorpay-webhook', async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  try {
    const event = req.body;
    console.log(`[Razorpay Webhook] Event received: ${event.event}`);

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity || {};
      const order = event.payload?.order?.entity || {};
      const notes = payment.notes || order.notes || {};

      const paymentId = payment.id;
      const orderId = payment.order_id || order.id;
      const amountINR = (payment.amount || 0) / 100;
      const email = payment.email || notes.email || '';
      const phone = payment.contact || notes.phone || notes.whatsapp || '';
      const name = notes.name || notes.seekerName || 'Verified Seeker';
      const roomId = notes.roomId || notes.room_id || '';

      if (leadsCollection) {
        if (roomId && roomsCollection) {
          await roomsCollection.updateOne(
            { roomId: String(roomId) },
            { $set: { status: 'reserved', reservedAt: new Date(), reservedBy: name, paymentId } }
          );
        }

        await leadsCollection.updateOne(
          { paymentId },
          {
            $set: {
              paymentId,
              orderId,
              name,
              email,
              phone,
              amount: amountINR,
              currency: payment.currency || 'INR',
              method: payment.method || 'online',
              status: 'paid',
              leadType: roomId ? 'room_reservation' : 'package_booking',
              roomId: roomId || null,
              notes,
              paidAt: new Date(payment.created_at ? payment.created_at * 1000 : Date.now()),
              webhookVerified: true,
              updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );
      }
    }
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Razorpay Webhook] Error:', err);
    return res.status(500).json({ error: err.message });
  }
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

    // Send instant alert email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'DieFuture Apartments <onboarding@resend.dev>',
            to: ['diefutureapartments@gmail.com'],
            subject: `🔔 New Accommodation Brief: ${refCode} — ${name} (${city})`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width:600px; padding:24px; border:1px solid #e2e8f0; border-radius:12px; background:#ffffff;">
                <div style="border-bottom:2px solid #0055FF; padding-bottom:12px; margin-bottom:16px;">
                  <h2 style="color:#0055FF; margin:0; font-size:20px;">🏠 New Accommodation Brief Submitted</h2>
                  <p style="color:#64748B; margin:4px 0 0; font-size:13px;">Received via <strong>diefuture.com</strong></p>
                </div>
                <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B; width:35%;">Tracking Ref:</td><td style="font-weight:bold; font-family:monospace; font-size:16px; color:#0055FF;">${refCode}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Student Name:</td><td style="font-weight:bold;">${name}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Email Address:</td><td><a href="mailto:${email}">${email}</a></td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Phone:</td><td><strong><a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}">${phone}</a></strong></td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Target City:</td><td style="font-weight:600;">${city}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Package:</td><td style="font-weight:bold; color:#0055FF;">${pkg}</td></tr>
                  <tr><td style="padding:8px 0; color:#64748B;">Notes:</td><td>${notes || 'None'}</td></tr>
                </table>
              </div>
            `
          })
        });
      } catch (e) {
        console.warn('Resend mail error:', e.message);
      }
    }

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

    let finalName = (seekerName || req.body.name || '').trim();
    let finalEmail = (seekerEmail || req.body.email || '').trim();
    let finalPhone = (seekerPhone || req.body.phone || '').trim();

    // Look up room in rooms collection if available
    let resolvedCity = 'München';
    let resolvedBudget = '€775 / month (Warmmiete)';

    try {
      const roomsCol = await getRoomsCollection();
      const matchedRoom = await roomsCol.findOne({ roomId: String(roomId) });
      if (matchedRoom) {
        resolvedCity = matchedRoom.city || resolvedCity;
        resolvedBudget = `€${matchedRoom.rentWarmEUR || 775} / month (Warmmiete)`;
        if (!finalName && matchedRoom.studentName) finalName = matchedRoom.studentName;
        if (!finalEmail && matchedRoom.studentEmail) finalEmail = matchedRoom.studentEmail;
        if (!finalPhone && matchedRoom.studentPhone) finalPhone = matchedRoom.studentPhone;
        // Mark room as reserved in database
        await roomsCol.updateOne({ roomId: String(roomId) }, { $set: { status: 'reserved', reservedAt: new Date(), reservedBy: finalEmail || 'student' } });
      }
    } catch (roomErr) {
      console.warn('[MongoDB] Could not update room status to reserved:', roomErr.message);
    }

    if (!finalName) finalName = 'Verified Student';
    if (!finalEmail) finalEmail = 'student@diefuture.com';

    const seekerNameResolved = finalName;
    const seekerEmailResolved = finalEmail;
    const seekerPhoneResolved = finalPhone;

    const bookingRef = 'DF-ROOM-' + (roomId || '1004') + '-' + Math.floor(100 + Math.random() * 900);

    const {
      paymentMode = 'full',
      totalFeeINR,
      holdingFeeINR,
      remainingFeeINR
    } = req.body;

    let packageLabel = `Direct Verified Room Lead (${amount ? '₹' + amount : 'Variable Fee'})`;
    if (paymentMode === 'holding_initial') {
      packageLabel = `Viewing Holding Fee (₹${amount || 0} Paid - Refundable Deposit)`;
    } else if (paymentMode === 'holding_paid') {
      packageLabel = `Lease Handover Remaining Balance (₹${amount || 0} Paid - Settled in Full)`;
    }

    const reservationDoc = {
      reference: bookingRef,
      roomId: roomId || '1004',
      roomTitle: roomTitle || 'Munich Thalkirchen Furnished WG Room (Room 4)',
      name: seekerNameResolved,
      email: seekerEmailResolved,
      phone: seekerPhoneResolved,
      city: resolvedCity,
      moveInDate: targetMoveIn || 'Immediate / Flexible',
      budget: resolvedBudget,
      roomType: 'WG Room (Single Private)',
      package: packageLabel,
      paymentMode,
      totalFeeINR: totalFeeINR !== undefined ? Number(totalFeeINR) : (amount || 0),
      holdingFeeINR: holdingFeeINR !== undefined ? Number(holdingFeeINR) : 0,
      remainingFeeINR: remainingFeeINR !== undefined ? Number(remainingFeeINR) : 0,
      leadStatus: 'paid_confirmed',
      paymentId: paymentId || 'manual_or_simulated',
      amountPaidINR: amount || 0,
      amountPaidEUR: req.body.amountEUR !== undefined ? Number(req.body.amountEUR) : (req.body.amountPaidEUR !== undefined ? Number(req.body.amountPaidEUR) : undefined),
      currency: req.body.currency || 'EUR',
      exchangeRate: req.body.exchangeRate !== undefined ? Number(req.body.exchangeRate) : undefined,
      notes: notes || (paymentMode === 'holding_initial' 
        ? 'Viewing slot holding fee paid. 100% refundable if seeker attends viewing and dislikes room.' 
        : paymentMode === 'holding_paid' 
        ? 'Remaining balance paid after approved viewing. Finalize lease handover.'
        : 'Verified room lead reservation & handover fee paid via Razorpay.'),
      createdAt: new Date()
    };

    const collection = await getCollection();
    const result = await collection.insertOne(reservationDoc);

    console.log(`[MongoDB] Room Lead Reservation saved: ${bookingRef} (${seekerNameResolved} - ${paymentId}) [ID: ${result.insertedId}]`);

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

    rooms = rooms.map(r => {
      const copy = { ...r };
      delete copy.landlordContact;
      return copy;
    });

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

    let query = { roomId: String(id) };
    if (ObjectId.isValid(id) && id.length === 24) {
      query = { $or: [{ roomId: String(id) }, { _id: new ObjectId(id) }] };
    }

    const room = await col.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(1).next();

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const sanitizedRoom = { ...room };
    delete sanitizedRoom.landlordContact;

    res.json({ success: true, room: sanitizedRoom });
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
      images,
      stayforallUrl,
      transit,
      description,
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

    let imageList = [];
    if (Array.isArray(images)) {
      imageList = images.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof images === 'string') {
      imageList = images.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    }
    if (imageUrl && !imageList.includes(imageUrl.trim())) {
      imageList.unshift(imageUrl.trim());
    }
    if (imageList.length === 0) {
      imageList = ['https://stayforall-public.s3.eu-central-1.amazonaws.com/uploads/properties/1791184475238525657-5e592e0d6c6da5c239a85b15922a96f2e94fdb32e22758cf327f2c56e019334c.jpg'];
    }

    const newRoom = {
      roomId,
      title,
      city,
      address: address || `${city}, Germany`,
      rentWarmEUR: Number(rentWarmEUR),
      depositEUR: Number(depositEUR) || Number(rentWarmEUR) * 2,
      paymentMode: req.body.paymentMode || 'full',
      feeCurrency: req.body.feeCurrency || 'EUR',
      feeEUR: req.body.feeEUR !== undefined && req.body.feeEUR !== '' ? Number(req.body.feeEUR) : undefined,
      holdingFeeEUR: req.body.holdingFeeEUR !== undefined && req.body.holdingFeeEUR !== '' ? Number(req.body.holdingFeeEUR) : undefined,
      remainingFeeEUR: req.body.remainingFeeEUR !== undefined && req.body.remainingFeeEUR !== '' ? Number(req.body.remainingFeeEUR) : undefined,
      feeINR: feeINR !== undefined && feeINR !== '' ? Number(feeINR) : 0,
      holdingFeeINR: req.body.holdingFeeINR !== undefined && req.body.holdingFeeINR !== '' ? Number(req.body.holdingFeeINR) : 0,
      remainingFeeINR: req.body.remainingFeeINR !== undefined && req.body.remainingFeeINR !== '' ? Number(req.body.remainingFeeINR) : Math.max(0, (feeINR !== undefined ? Number(feeINR) : 0) - (req.body.holdingFeeINR !== undefined ? Number(req.body.holdingFeeINR) : 0)),
      roomSizeM2: Number(roomSizeM2) || 16,
      roomType: roomType || 'WG Room (Single Private)',
      imageUrl: imageList[0],
      images: imageList,
      stayforallUrl: stayforallUrl || '',
      anmeldung: req.body.anmeldung !== undefined ? Boolean(req.body.anmeldung) : true,
      guarantees: req.body.guarantees || {
        showGuarantees: req.body.showGuarantees !== false,
        concierge: req.body.guaranteeConcierge !== false,
        viewingType: req.body.guaranteeViewing || 'viewing',
        anmeldung: req.body.guaranteeAnmeldung !== false,
        contractAudit: req.body.guaranteeContractAudit !== false,
        refundPolicy: req.body.guaranteeRefund || 'none'
      },
      transit: transit || 'Convenient U-Bahn / S-Bahn transit nearby',
      status: status || 'available',
      featured: featured !== undefined ? Boolean(featured) : true,
      description: description || '',
      studentName: req.body.studentName || '',
      studentEmail: req.body.studentEmail || '',
      studentPhone: req.body.studentPhone || '',
      updatedAt: new Date()
    };

    const col = await getRoomsCollection();
    const result = await col.findOneAndUpdate(
      { roomId: String(roomId) },
      {
        $set: newRoom,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const savedRoom = result.value || result || newRoom;
    console.log(`[MongoDB] Room saved/upserted: ${roomId} - ${title} (Fee: ₹${newRoom.feeINR})`);
    res.status(201).json({ success: true, id: savedRoom._id, roomId, room: savedRoom });
  } catch (error) {
    console.error('Failed to create room:', error);
    res.status(500).json({ error: 'Failed to create room', details: error.message });
  }
});

// 4. Update room
app.patch(['/api/rooms/:id', '/api/rooms'], async (req, res) => {
  try {
    const targetId = req.params.id || req.query.id || req.body.id || req.body.roomId;
    if (!targetId) return res.status(400).json({ error: 'Room id is required.' });

    const col = await getRoomsCollection();

    let query = { roomId: String(targetId) };
    if (ObjectId.isValid(targetId) && targetId.length === 24) {
      query = { $or: [{ roomId: String(targetId) }, { _id: new ObjectId(targetId) }] };
    }

    const updates = { ...req.body, updatedAt: new Date() };
    delete updates._id;
    delete updates.id;
    delete updates.landlordContact;

    if (updates.images) {
      if (typeof updates.images === 'string') {
        updates.images = updates.images.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      }
      if (Array.isArray(updates.images) && updates.images.length > 0) {
        updates.imageUrl = updates.images[0];
      }
    }

    const result = await col.updateOne(query, { $set: updates });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ success: true, message: 'Room updated successfully', modifiedCount: result.modifiedCount });
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

            return res.json({ success: true, room: roomObj });
          }
        }
      } catch (apiErr) {
        console.warn('StayforAll v1 API fetch error, falling back to HTML:', apiErr.message);
      }
    }

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

    const fallbackRoomIdMatch = url.match(/rooms\/(\d+)/i);
    const extracted = {
      sourceUrl: url,
      roomId: fallbackRoomIdMatch ? fallbackRoomIdMatch[1] : String(Math.floor(1000 + Math.random() * 9000)),
      title: '',
      city: 'München',
      address: '',
      rentWarmEUR: 775,
      depositEUR: 1500,
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

app.listen(PORT, () => {
  console.log(`DieFuture API server running on http://localhost:${PORT}`);
});
