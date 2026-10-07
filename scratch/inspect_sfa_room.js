async function testRoom() {
  const res = await fetch("https://api.stayforall.com/api/v1/rooms/1004");
  const json = await res.json();
  const d = json.data;
  console.log("Title:", d.title);
  console.log("Photos/Images keys:");
  console.log("images:", d.images);
  console.log("photos:", d.photos);
  console.log("property images:", d.property?.images);
  console.log("media:", d.media);
  console.log("rent:", d.rent_amount, "warm rent:", d.warm_rent, "total rent:", d.total_rent);
  console.log("Full data keys:", Object.keys(d));
}
testRoom();
