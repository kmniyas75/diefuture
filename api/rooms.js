import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'diefuture';
const ROOMS_COLLECTION = 'rooms';

let cachedClient = null;

async function getRoomsCollection() {
  if (!cachedClient) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined.');
    }
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db(DB_NAME).collection(ROOMS_COLLECTION);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const col = await getRoomsCollection();
    const { id, city, status } = req.query;

    // 1. GET Request
    if (req.method === 'GET') {
      if (id) {
        let query = { roomId: String(id) };
        if (ObjectId.isValid(id) && id.length === 24) {
          query = { $or: [{ roomId: String(id) }, { _id: new ObjectId(id) }] };
        }
        const room = await col.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(1).next();
        if (!room) {
          return res.status(404).json({ success: false, error: 'Room not found' });
        }
        const sanitized = { ...room };
        delete sanitized.landlordContact;
        return res.status(200).json({ success: true, room: sanitized });
      }

      const filter = {};
      if (city && city !== 'all') {
        filter.city = { $regex: new RegExp(city, 'i') };
      }
      if (status) {
        filter.status = status;
      }

      let rooms = await col.find(filter).sort({ createdAt: -1 }).toArray();

      rooms = rooms.map(r => {
        const copy = { ...r };
        delete copy.landlordContact;
        return copy;
      });

      return res.status(200).json({ count: rooms.length, rooms });
    }

    // 2. POST (Create Room)
    if (req.method === 'POST') {
      const {
        title, city: roomCity, address, rentWarmEUR, depositEUR, feeINR,
        roomSizeM2, roomType, imageUrl, images, stayforallUrl, transit,
        description, status: roomStatus, featured, roomId: customRoomId
      } = req.body;

      if (!title || !roomCity || !rentWarmEUR) {
        return res.status(400).json({ error: 'Title, city, and warm rent are required.' });
      }

      let roomId = customRoomId;
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
        city: roomCity,
        address: address || `${roomCity}, Germany`,
        rentWarmEUR: Number(rentWarmEUR),
        depositEUR: Number(depositEUR) || Number(rentWarmEUR) * 2,
        feeINR: Number(feeINR) || 12999,
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
        transit: transit || 'Convenient transit nearby',
        status: roomStatus || 'available',
        featured: featured !== undefined ? Boolean(featured) : true,
        description: description || '',
        updatedAt: new Date()
      };

      const result = await col.findOneAndUpdate(
        { roomId: String(roomId) },
        {
          $set: newRoom,
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, returnDocument: 'after' }
      );

      const savedRoom = result.value || result || newRoom;
      return res.status(200).json({ success: true, id: savedRoom._id, roomId, room: savedRoom });
    }

    // 3. PATCH (Update Room)
    if (req.method === 'PATCH') {
      const targetId = id || req.body.id || req.body.roomId;
      if (!targetId) return res.status(400).json({ error: 'Room id is required.' });

      let query = { roomId: String(targetId) };
      if (ObjectId.isValid(targetId) && targetId.length === 24) {
        query = { $or: [{ roomId: String(targetId) }, { _id: new ObjectId(targetId) }] };
      }

      const updateData = { ...req.body, updatedAt: new Date() };
      delete updateData._id;
      delete updateData.id;
      delete updateData.landlordContact;

      if (updateData.images && Array.isArray(updateData.images) && updateData.images.length > 0) {
        updateData.imageUrl = updateData.images[0];
      }

      const result = await col.updateOne(query, { $set: updateData, $unset: { landlordContact: "" } });
      return res.status(200).json({ success: true, updated: result.modifiedCount });
    }

    // 4. DELETE (Remove Room)
    if (req.method === 'DELETE') {
      const targetId = id || req.body.id || req.body.roomId;
      if (!targetId) return res.status(400).json({ error: 'Room id is required.' });

      let query = { roomId: String(targetId) };
      if (ObjectId.isValid(targetId) && targetId.length === 24) {
        query = { $or: [{ roomId: String(targetId) }, { _id: new ObjectId(targetId) }] };
      }

      const result = await col.deleteOne(query);
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Serverless /api/rooms Error:', error);
    return res.status(500).json({ error: 'Rooms database error', details: error.message });
  }
}
