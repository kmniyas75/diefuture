async function testApi() {
  const endpoints = [
    "https://api.stayforall.com/api/v1/rooms/1004",
    "https://api.stayforall.com/api/v1/properties/1004",
    "https://api.stayforall.com/api/v1/room/1004",
    "https://api.stayforall.com/api/v1/property/1004",
    "https://api.stayforall.com/api/v1/listings/1004"
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });
      console.log(ep, "-> Status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("SUCCESS DATA KEYS:", Object.keys(data));
        console.log(JSON.stringify(data, null, 2).slice(0, 500));
      }
    } catch(e) {
      console.log(ep, "-> Error:", e.message);
    }
  }
}
testApi();
