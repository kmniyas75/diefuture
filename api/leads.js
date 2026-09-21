import { MongoClient, ObjectId } from 'mongodb';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const collection = await getCollection();

    if (req.method === 'GET') {
      const leads = await collection.find({}).sort({ createdAt: -1 }).limit(200).toArray();
      return res.status(200).json({ count: leads.length, leads });
    }

    if (req.method === 'PATCH') {
      const { id, leadStatus, adminNotes } = req.body;
      if (!id) return res.status(400).json({ error: 'Lead id is required.' });

      const updateFields = {};
      if (leadStatus) updateFields.leadStatus = leadStatus;
      if (adminNotes !== undefined) updateFields.adminNotes = adminNotes;
      updateFields.updatedAt = new Date();

      const result = await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      return res.status(200).json({ success: true, updated: result.modifiedCount });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Lead id is required.' });

      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('API Leads Error:', error);
    return res.status(500).json({ error: 'Database error', details: error.message });
  }
}
