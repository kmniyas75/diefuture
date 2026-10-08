import Razorpay from 'razorpay';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
let cachedClient = null;

async function getDb() {
  if (!cachedClient && MONGODB_URI) {
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient ? cachedClient.db(DB_NAME) : null;
}

// Live rate helper with resilient fallback
async function getLiveEurRate() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch('https://api.frankfurter.app/latest?from=EUR&to=INR', { signal: ctrl.signal });
    clearTimeout(t);
    if (resp.ok) {
      const d = await resp.json();
      if (d?.rates?.INR) return Number(d.rates.INR);
    }
  } catch (e) {}
  return 108.50;
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
        const db = await getDb();
        if (db) {
          const room = await db.collection('rooms').findOne({ roomId: String(targetRoomId) });
          if (room) {
            const liveRate = await getLiveEurRate();
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
                // Server-enforced amount override in Euro cents
                amountInPaise = Math.round(requiredEUR * 100);
              }
            } else {
              if (requiredINR > 0) {
                // Server-enforced amount override in INR paise
                amountInPaise = Math.round(requiredINR * 100);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Server price validation note:', err.message);
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

    return res.status(200).json({
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
}
