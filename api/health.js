export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ status: 'ok', platform: 'vercel', timestamp: new Date().toISOString() });
}
