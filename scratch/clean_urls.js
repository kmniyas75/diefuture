import fs from 'fs';
import path from 'path';

const files = [
  'index.html',
  'contact.html',
  'terms.html',
  'privacy.html',
  'refund.html',
  'shipping-policy.html',
  'room.html',
  'rooms.html',
  'admin.html'
];

const replacements = [
  { from: /href="index\.html#/g, to: 'href="/#' },
  { from: /href="index\.html"/g, to: 'href="/"' },
  { from: /href="contact\.html"/g, to: 'href="contact"' },
  { from: /href="terms\.html"/g, to: 'href="terms"' },
  { from: /href="privacy\.html"/g, to: 'href="privacy"' },
  { from: /href="refund\.html"/g, to: 'href="refund"' },
  { from: /href="shipping-policy\.html"/g, to: 'href="shipping-policy"' },
  { from: /href="room\.html\?/g, to: 'href="room?' },
  { from: /href="rooms\.html"/g, to: 'href="rooms"' },
  { from: /href="admin\.html"/g, to: 'href="admin"' },
  { from: /https:\/\/www\.diefuture\.com\/contact\.html/g, to: 'https://www.diefuture.com/contact' },
  { from: /https:\/\/www\.diefuture\.com\/terms\.html/g, to: 'https://www.diefuture.com/terms' },
  { from: /https:\/\/www\.diefuture\.com\/privacy\.html/g, to: 'https://www.diefuture.com/privacy' },
  { from: /https:\/\/www\.diefuture\.com\/refund\.html/g, to: 'https://www.diefuture.com/refund' },
  { from: /https:\/\/www\.diefuture\.com\/shipping-policy\.html/g, to: 'https://www.diefuture.com/shipping-policy' },
  { from: /https:\/\/www\.diefuture\.com\/room\.html/g, to: 'https://www.diefuture.com/room' },
  { from: /https:\/\/www\.diefuture\.com\/rooms\.html/g, to: 'https://www.diefuture.com/rooms' },
  { from: /https:\/\/www\.diefuture\.com\/admin\.html/g, to: 'https://www.diefuture.com/admin' }
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    replacements.forEach(r => {
      content = content.replace(r.from, r.to);
    });
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Updated clean links in: ${file}`);
    }
  }
});
