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

// Update lead status
app.patch('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
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
});

// Delete lead
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await getCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lead', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`DieFuture API server running on http://localhost:${PORT}`);
});
