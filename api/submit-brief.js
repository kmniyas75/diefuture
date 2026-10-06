import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'leads';

let cachedClient = null;

async function getCollection() {
  if (!cachedClient) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined.');
    }
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME).collection(COLLECTION_NAME);
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { name, email, phone, city, moveIn, budget, roomType, pkg, german, notes, status } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required.' });
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
            subject: `🔔 New Accommodation Brief: ${refCode} — ${name} (${city})`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width:600px; padding:24px; border:1px solid #e2e8f0; border-radius:12px; background:#ffffff;">
                <div style="border-bottom:2px solid #0055FF; padding-bottom:12px; margin-bottom:16px;">
                  <h2 style="color:#0055FF; margin:0; font-size:20px;">🏠 New Accommodation Brief Submitted</h2>
                  <p style="color:#64748B; margin:4px 0 0; font-size:13px;">Received via <strong>diefuture.com</strong></p>
                </div>

                <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:14px;">
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B; width:35%;">Tracking Ref:</td><td style="font-weight:bold; font-family:monospace; font-size:16px; color:#0055FF;">${refCode}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Student Name:</td><td style="font-weight:bold; color:#1e293b;">${name}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Email Address:</td><td><a href="mailto:${email}" style="color:#0055FF;">${email}</a></td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">WhatsApp / Phone:</td><td><strong><a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}" style="color:#16a34a;">${phone}</a></strong></td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Target City:</td><td style="font-weight:600;">${city}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Target Move-in:</td><td>${moveIn || 'Immediate / Flexible'}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Room Type:</td><td>${roomType}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Warmmiete Budget:</td><td>${budget}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Selected Package:</td><td style="font-weight:bold; color:#0055FF; text-transform:uppercase;">${pkg}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">German Level:</td><td>${german || 'Intermediate'}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0; color:#64748B;">Current Status:</td><td>${status}</td></tr>
                  <tr><td style="padding:8px 0; color:#64748B;">Special Notes:</td><td style="color:#334155; font-style:italic;">${notes || 'No extra notes provided.'}</td></tr>
                </table>

                <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0; display:flex; gap:10px;">
                  <a href="https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi ' + name + ', this is DieFuture Apartments regarding your accommodation brief ' + refCode + ' for ' + city + ', Germany.')}" style="background:#25D366; color:#ffffff; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:13px; display:inline-block;">💬 Open WhatsApp Chat →</a>
                  <a href="https://www.diefuture.com/admin.html" style="background:#0055FF; color:#ffffff; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:13px; display:inline-block; margin-left:8px;">Open Admin Dashboard →</a>
                </div>
              </div>
            `
          })
        });
      } catch (mailErr) {
        console.warn('Resend email dispatch error:', mailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      reference: refCode,
      id: result.insertedId,
      message: 'Brief successfully saved to MongoDB!'
    });
  } catch (error) {
    console.error('MongoDB Serverless Error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
