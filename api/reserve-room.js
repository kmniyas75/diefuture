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

    let finalName = (seekerName || req.body.name || '').trim();
    let finalEmail = (seekerEmail || req.body.email || '').trim();
    let finalPhone = (seekerPhone || req.body.phone || '').trim();

    const db = await getDb();
    let resolvedCity = 'Germany';
    let resolvedBudget = '€775 / month (Warmmiete)';

    // Look up room in rooms collection if available
    if (roomId) {
      try {
        const matchedRoom = await db.collection(ROOMS_COLLECTION).findOne({ roomId: String(roomId) });
        if (matchedRoom) {
          resolvedCity = matchedRoom.city || resolvedCity;
          resolvedBudget = `€${matchedRoom.rentWarmEUR || 775} / month (Warmmiete)`;
          if (!finalName && matchedRoom.studentName) finalName = matchedRoom.studentName;
          if (!finalEmail && matchedRoom.studentEmail) finalEmail = matchedRoom.studentEmail;
          if (!finalPhone && matchedRoom.studentPhone) finalPhone = matchedRoom.studentPhone;
          // Mark room as reserved in database
          await db.collection(ROOMS_COLLECTION).updateOne(
            { roomId: String(roomId) },
            { $set: { status: 'reserved', reservedAt: new Date(), reservedBy: finalEmail || 'student' } }
          );
        }
      } catch (e) {
        console.warn('Room status update notice:', e.message);
      }
    }

    if (!finalName) finalName = 'Verified Student';
    if (!finalEmail) finalEmail = 'student@diefuture.com';

    const seekerNameResolved = finalName;
    const seekerEmailResolved = finalEmail;
    const seekerPhoneResolved = finalPhone;

    const bookingRef = `DF-ROOM-${roomId || '1004'}-` + Math.floor(100 + Math.random() * 900);

    const {
      paymentMode = 'full',
      totalFeeINR,
      holdingFeeINR,
      remainingFeeINR
    } = req.body;

    let packageLabel = `Direct Verified Room Lead (${amount ? '₹' + amount : 'Variable Fee'})`;
    let emailSubject = `💰 Room Lead Reserved: ${bookingRef} — ${seekerNameResolved}${amount ? ' (₹' + amount + ')' : ''}`;

    if (paymentMode === 'holding_initial') {
      packageLabel = `Viewing Holding Fee (₹${amount || 0} Paid - Refundable Deposit)`;
      emailSubject = `🛡️ Viewing Holding Fee Paid: ${bookingRef} — ${seekerNameResolved}${amount ? ' (₹' + amount + ')' : ''}`;
    } else if (paymentMode === 'holding_paid') {
      packageLabel = `Lease Handover Remaining Balance (₹${amount || 0} Paid - Settled in Full)`;
      emailSubject = `🎉 Remaining Balance Paid: ${bookingRef} — ${seekerNameResolved}${amount ? ' (₹' + amount + ')' : ''}`;
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
      notes: notes || (paymentMode === 'holding_initial' 
        ? 'Viewing slot holding fee paid. 100% refundable if seeker attends viewing and dislikes room.' 
        : paymentMode === 'holding_paid' 
        ? 'Remaining balance paid after approved viewing. Finalize lease handover.'
        : 'Verified room lead reservation & handover fee paid via Razorpay.'),
      createdAt: new Date()
    };

    const result = await db.collection(LEADS_COLLECTION).insertOne(reservationDoc);

    // Send instant alert email to DieFuture via Resend
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
            subject: emailSubject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width:600px; padding:24px; border:1px solid #10b981; border-radius:12px; background:#ffffff;">
                <div style="border-bottom:2px solid #10b981; padding-bottom:12px; margin-bottom:16px;">
                  <h2 style="color:#059669; margin:0; font-size:20px;">${paymentMode === 'holding_initial' ? '🛡️ Viewing Holding Fee Paid' : paymentMode === 'holding_paid' ? '🎉 Remaining Balance Paid' : '💰 Room Lead Reservation Paid'}</h2>
                  <p style="color:#64748B; margin:4px 0 0; font-size:13px;">Razorpay Payment ID: <strong>${paymentId || 'N/A'}</strong> · Mode: <strong>${paymentMode}</strong></p>
                </div>

                <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B; width:35%;">Booking Reference:</td><td style="font-weight:bold; font-family:monospace; font-size:16px; color:#059669;">${bookingRef}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Room ID:</td><td style="font-weight:bold;">${roomId || '1004'}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Property Title:</td><td style="font-weight:600;">${roomTitle}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Payment Type:</td><td style="font-weight:600; color:#0F766E;">${packageLabel}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Amount Collected:</td><td style="font-weight:bold; font-size:16px; color:#0055FF;">₹${amount ? Number(amount).toLocaleString('en-IN') : '12,999'}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Seeker Name:</td><td style="font-weight:bold; color:#1e293b;">${seekerNameResolved}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Email Address:</td><td><a href="mailto:${seekerEmailResolved}" style="color:#0055FF;">${seekerEmailResolved}</a></td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Phone / WhatsApp:</td><td><strong><a href="https://wa.me/${seekerPhoneResolved.replace(/[^0-9]/g, '')}" style="color:#16a34a;">${seekerPhoneResolved || 'N/A'}</a></strong></td></tr>
                  <tr><td style="padding:8px 0; color:#64748B;">Target Move-in:</td><td>${targetMoveIn || 'Immediate / Flexible'}</td></tr>
                </table>

                <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; display:flex; gap:10px;">
                  <a href="https://wa.me/${seekerPhoneResolved.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi ' + seekerNameResolved + ', this is DieFuture Concierge Desk confirming your reservation ' + bookingRef + ' for ' + roomTitle + '.')}" style="background:#25D366; color:#ffffff; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:13px; display:inline-block;">💬 Chat on WhatsApp →</a>
                  <a href="https://www.diefuture.com/admin.html" style="background:#0055FF; color:#ffffff; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:13px; display:inline-block; margin-left:8px;">Open Admin Dashboard →</a>
                </div>
              </div>
            `
          })
        });
      } catch (mailErr) {
        console.warn('Resend reservation email error:', mailErr.message);
      }
    }

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
