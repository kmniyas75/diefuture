async function checkScripts() {
  const res = await fetch("https://stayforall.com/rooms/1004", {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const html = await res.text();
  const scriptSrcs = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/gi)].map(m => m[1]);
  console.log("Found chunk scripts:", scriptSrcs.length);
  
  for (const src of scriptSrcs) {
    const sRes = await fetch("https://stayforall.com" + src);
    const js = await sRes.text();
    if (js.includes("api.") || js.includes("/api/") || js.includes("stayforall")) {
      const urls = [...js.matchAll(/https:\/\/[a-zA-Z0-9_\-\.]+\.(?:com|org|io|net)[^"'\s`]+/gi)].map(m => m[0]);
      const backendUrls = urls.filter(u => u.includes('api') || u.includes('backend') || u.includes('graphql') || u.includes('amazonaws'));
      if (backendUrls.length) {
        console.log("Chunk:", src);
        console.log("Backend URLs:", [...new Set(backendUrls)]);
      }
    }
  }
}
checkScripts();
