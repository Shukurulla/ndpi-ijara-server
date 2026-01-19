import mongoose from "mongoose";
import { config } from "dotenv";
import districtModel from "./models/districts.model.js";

config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB ga muvaffaqiyatli ulandi");
    checkDistricts();
  })
  .catch((err) => {
    console.error("MongoDB ga ulanishda xatolik:", err);
    process.exit(1);
  });

async function checkDistricts() {
  try {
    // Barcha mahallalarni olish
    const allDistricts = await districtModel.find({}).limit(10);

    console.log("Ma'lumotlar bazasidagi birinchi 10 ta mahalla:");
    console.log(JSON.stringify(allDistricts, null, 2));

    // Nechta mahalla borligi
    const count = await districtModel.countDocuments({});
    console.log(`\nJami mahallalar soni: ${count}`);

    // Barcha unique regionlarni ko'rish
    const regions = await districtModel.distinct("region");
    console.log("\nBarcha regionlar:");
    console.log(regions);

    process.exit(0);
  } catch (error) {
    console.error("Xatolik:", error);
    process.exit(1);
  }
}
