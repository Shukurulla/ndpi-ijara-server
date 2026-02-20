
import mongoose from "mongoose";
import dotenv from "dotenv";
import adsModel from "./models/ads.model.js";
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await adsModel.deleteMany({});
  console.log("Ochirildi:", result.deletedCount, "ta ads");
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
