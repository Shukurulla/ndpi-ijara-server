import mongoose from "mongoose";
import { config } from "dotenv";
import adminModel from "./models/admin.model.js";
import bcrypt from "bcrypt";

config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB ga muvaffaqiyatli ulandi");
    verifyAdminLogin();
  })
  .catch((err) => {
    console.error("MongoDB ga ulanishda xatolik:", err);
    process.exit(1);
  });

async function verifyAdminLogin() {
  try {
    const username = "system_admin";
    const password = "SyS123456";

    // Adminni topish
    const admin = await adminModel.findOne({ username });

    if (!admin) {
      console.log("❌ Admin topilmadi");
      process.exit(1);
    }

    console.log("✅ Admin topildi:");
    console.log(`   Username: ${admin.username}`);

    // Parolni tekshirish
    const isPasswordCorrect = await bcrypt.compare(password, admin.password);

    if (isPasswordCorrect) {
      console.log("\n✅ Login muvaffaqiyatli!");
      console.log(`   Username: ${username}`);
      console.log(`   Parol: ${password}`);
      console.log("\n🎉 Yangi login ma'lumotlari to'g'ri ishlayapti!");
    } else {
      console.log("\n❌ Parol noto'g'ri!");
    }

    process.exit(0);
  } catch (error) {
    console.error("Xatolik:", error);
    process.exit(1);
  }
}
