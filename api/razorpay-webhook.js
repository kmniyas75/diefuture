import crypto from 'crypto';
import { MongoClient } from 'mongodb';
import { Resend } from 'resend';

export const config = {
  api: {
    bodyParser: false
  }
};

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

let cachedClient = null;
async function getDb() {
  if (!cachedClient) {
    if (!MONGODB_URI) throw new Error('MONGODB_URI is not set');
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME);
}

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

  try {
    const rawBodyBuffer = await getRawBody(req);
    const rawBody = rawBodyBuffer.toString('utf8');
    const signature = req.headers['x-razorpay-signature'];

    // Verify Webhook Signature if secret exists
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.error('[Razorpay Webhook] Invalid signature mismatch');
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = JSON.parse(rawBody);
    console.log(`[Razorpay Webhook] Event received: ${event.event} [ID: ${event.payload?.payment?.entity?.id || 'N/A'}]`);

    // Handle payment.captured or order.paid
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

      // 1. Record / Update in MongoDB
      try {
        const db = await getDb();

        // Mark room as reserved if room ID present
        if (roomId) {
          await db.collection('rooms').updateOne(
            { roomId: String(roomId) },
            { $set: { status: 'reserved', reservedAt: new Date(), reservedBy: name, paymentId } }
          );
        }

        // Upsert into leads collection
        await db.collection('leads').updateOne(
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
            $setOnInsert: {
              createdAt: new Date()
            }
          },
          { upsert: true }
        );
        console.log(`[Razorpay Webhook] Recorded payment in MongoDB for ${paymentId}`);
      } catch (dbErr) {
        console.error('[Razorpay Webhook] DB write error:', dbErr.message);
      }

      // 2. Send Email Alert via Resend
      if (RESEND_API_KEY && RESEND_API_KEY !== 'placeholder_resend_api_key') {
        try {
          const resend = new Resend(RESEND_API_KEY);
          await resend.emails.send({
            from: 'DieFuture Relocations <onboarding@resend.dev>',
            to: ['diefutureapartments@gmail.com'],
            subject: `🎉 Payment Confirmed: ₹${amountINR.toLocaleString('en-IN')} - ${name}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #0b1528;">Payment Confirmed via Razorpay</h2>
                <p>A new payment has been successfully captured:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Amount:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #16a34a; font-weight: bold;">₹${amountINR.toLocaleString('en-IN')}</td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Payer Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone / WhatsApp:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${phone}</td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Payment ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${paymentId}</code></td></tr>
                  <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Order ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${orderId}</code></td></tr>
                  ${roomId ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Room Lead ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">DF-ROOM-${roomId}</td></tr>` : ''}
                </table>
                <p style="margin-top: 20px; font-size: 13px; color: #666;">This webhook was processed securely by DieFuture Automation.</p>
              </div>
            `
          });
        } catch (mailErr) {
          console.error('[Razorpay Webhook] Email error:', mailErr.message);
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Razorpay Webhook] Handler error:', err);
    return res.status(500).json({ error: 'Internal webhook error', message: err.message });
  }
}
