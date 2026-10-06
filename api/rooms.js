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

const DEFAULT_ROOMS = [
  {
    roomId: '1004',
    title: 'Stylish and high-quality furnished WG room in Munich Thalkirchen (Room 4)',
    city: 'München',
    address: 'Gabriele-Münter-Straße 11, 81477 München-Thalkirchen, Bavaria',
    rentWarmEUR: 775,
    depositEUR: 1500,
    feeINR: 12999,
    roomSizeM2: 16,
    roomType: 'WG Room (Single Private)',
    imageUrl: 'https://stayforall-public.s3.eu-central-1.amazonaws.com/uploads/properties/1791184475238525657-5e592e0d6c6da5c239a85b15922a96f2e94fdb32e22758cf327f2c56e019334c.jpg',
    images: [
      'https://stayforall-public.s3.eu-central-1.amazonaws.com/uploads/properties/1791184475238525657-5e592e0d6c6da5c239a85b15922a96f2e94fdb32e22758cf327f2c56e019334c.jpg',
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80'
    ],
    stayforallUrl: 'https://stayforall.com/rooms/1004',
    anmeldung: true,
    transit: '6 min walk to U3 Thalkirchen (12 min to TUM / LMU / Hbf)',
    status: 'available',
    featured: true,
    description: 'Fully furnished private bedroom with double bed, study desk, ergonomic chair, sunny garden-view balcony, modern kitchen with washing machine, and 250 Mbps fiber WiFi.',
    createdAt: new Date()
  },
  {
    roomId: '1008',
    title: 'Bright Studio Apartment in Berlin Prenzlauer Berg',
    city: 'Berlin',
    address: 'Kollwitzstraße 42, 10405 Berlin-Prenzlauer Berg',
    rentWarmEUR: 820,
    depositEUR: 1640,
    feeINR: 14999,
    roomSizeM2: 24,
    roomType: 'Private Studio Apartment',
    imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
    images: [
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80'
    ],
    stayforallUrl: '',
    anmeldung: true,
    transit: '4 min walk to U2 Senefelderplatz (8 min to Alexanderplatz)',
    status: 'available',
    featured: true,
    description: 'Self-contained 1-room apartment with private kitchenette, modern walk-in shower, high ceilings, large windows, and official city registration assistance.',
    createdAt: new Date()
  },
  {
    roomId: '1012',
    title: 'Modern Furnished WG Room in Frankfurt Bockenheim',
    city: 'Frankfurt',
    address: 'Leipziger Straße 78, 60487 Frankfurt am Main',
    rentWarmEUR: 695,
    depositEUR: 1400,
    feeINR: 11999,
    roomSizeM2: 15,
    roomType: 'WG Room (Single Private)',
    imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80'
    ],
    stayforallUrl: '',
    anmeldung: true,
    transit: '3 min walk to U6/U7 Leipziger Straße (10 min to Goethe Uni)',
    status: 'available',
    featured: true,
    description: 'Charming WG flat in the heart of student-friendly Bockenheim. Modern furnishings, quiet courtyard view, dishwasher, washer-dryer, and easy tram access.',
    createdAt: new Date()
  }
];

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
        let room = await col.findOne(query);
        if (!room) {
          room = DEFAULT_ROOMS.find(r => r.roomId === String(id));
        }
        if (!room) {
          return res.status(404).json({ error: 'Room not found' });
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
      if (rooms.length === 0 && (!city || city === 'all') && !status) {
        await col.insertMany(DEFAULT_ROOMS);
        rooms = await col.find(filter).sort({ createdAt: -1 }).toArray();
      }

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
        anmeldung: true,
        transit: transit || 'Convenient transit nearby',
        status: roomStatus || 'available',
        featured: featured !== undefined ? Boolean(featured) : true,
        description: description || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await col.insertOne(newRoom);
      return res.status(201).json({ success: true, id: result.insertedId, room: newRoom });
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
