
import mongoose from "mongoose";
import dotenv from "dotenv";
import adsModel from "./models/ads.model.js";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const result1 = await adsModel.updateMany(
    { image: { $regex: "public/ads/" } },
    [{ $set: { image: { $replaceAll: { input: "$image", find: "public/ads/", replacement: "public/banners/" } } } }]
  );

  const result2 = await adsModel.updateMany(
    { icon: { $regex: "public/ads/" } },
    [{ $set: { icon: { $replaceAll: { input: "$icon", find: "public/ads/", replacement: "public/banners/" } } } }]
  );

  console.log("Image updated:", result1.modifiedCount);
  console.log("Icon updated:", result2.modifiedCount);

  const all = await adsModel.find().lean();
  all.forEach(a => console.log(a.title, "->", a.image));

  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
