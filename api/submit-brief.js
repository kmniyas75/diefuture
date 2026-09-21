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
