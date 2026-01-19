import mongoose from "mongoose";
import { config } from "dotenv";
import districtModel from "./models/districts.model.js";
import fs from "fs";

config();

// MongoDB ga ulanish
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB ga muvaffaqiyatli ulandi");
    exportNukusDistricts();
  })
  .catch((err) => {
    console.error("MongoDB ga ulanishda xatolik:", err);
    process.exit(1);
  });

async function exportNukusDistricts() {
  try {
    // Nukus shahriga tegishli barcha mahallalarni olish
    const nukusDistricts = await districtModel.find({
      region: "Нукус шаҳар",
    });

    console.log(`Topildi: ${nukusDistricts.length} ta mahalla`);

    // JSON faylga yozish
    const jsonData = JSON.stringify(nukusDistricts, null, 2);
    fs.writeFileSync("nukus_districts.json", jsonData, "utf8");

    console.log("Nukus shahridagi mahallalar nukus_districts.json faylga yozildi");
    console.log("\nNamuna ma'lumot:");
    console.log(JSON.stringify(nukusDistricts.slice(0, 3), null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Xatolik:", error);
    process.exit(1);
  }
}
