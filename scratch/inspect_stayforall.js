async function test() {
  const url = process.argv[2] || "https://stayforall.com/rooms/1004";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  const html = await res.text();
  
  // Look for self.__next_f.push
  const rscMatches = [...html.matchAll(/self\.__next_f\.push\(\[[\s\S]*?\]\)/gi)];
  console.log("RSC flight payloads:", rscMatches.length);

  // Search entire HTML text for any image URLs (S3, cloudfront, stayforall, etc)
  const allImages = [...html.matchAll(/https:\/\/[^"'\s\\<>&]+?\.(?:jpg|jpeg|png|webp|avif)/gi)].map(m => m[0]);
  const cleanImages = [...new Set(allImages)].filter(u => !u.includes('logo') && !u.includes('icon') && !u.includes('avatar'));
  console.log("Clean images found in raw HTML:", cleanImages.length);
  cleanImages.forEach((img, i) => console.log(`[${i+1}]`, img));

  // Also check if StayforAll has an internal API like /api/rooms/1004 or /api/properties/1004
  const apiRes1 = await fetch("https://stayforall.com/api/rooms/1004", { headers: { "User-Agent": "Mozilla/5.0" } });
  console.log("stayforall.com/api/rooms/1004 status:", apiRes1.status);
  if (apiRes1.ok) {
    const json = await apiRes1.json();
    console.log("API JSON keys:", Object.keys(json));
  }
}
test();
