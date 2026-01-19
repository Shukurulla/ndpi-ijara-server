import mongoose from "mongoose";
import { config } from "dotenv";
import adminModel from "./models/admin.model.js";
import bcrypt from "bcrypt";

config();

// MongoDB ga ulanish
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB ga muvaffaqiyatli ulandi");
    updateAdminCredentials();
  })
  .catch((err) => {
    console.error("MongoDB ga ulanishda xatolik:", err);
    process.exit(1);
  });

async function updateAdminCredentials() {
  try {
    // Hozirgi adminni topish
    const currentAdmin = await adminModel.findOne({ username: "admin" });

    if (!currentAdmin) {
      console.log("❌ Username 'admin' bilan admin topilmadi");
      console.log("\nBarcha adminlarni ko'rish:");
      const allAdmins = await adminModel.find({});
      console.log(allAdmins);
      process.exit(1);
    }

    console.log("✅ Hozirgi admin topildi:");
    console.log(`   Username: ${currentAdmin.username}`);
    console.log(`   ID: ${currentAdmin._id}`);

    // Yangi parolni hash qilish
    const newHashedPassword = await bcrypt.hash("SyS123456", 10);

    // Adminni yangilash
    const updatedAdmin = await adminModel.findByIdAndUpdate(
      currentAdmin._id,
      {
        username: "system_admin",
        password: newHashedPassword,
      },
      { new: true }
    );

    console.log("\n✅ Admin ma'lumotlari muvaffaqiyatli yangilandi!");
    console.log(`   Yangi username: ${updatedAdmin.username}`);
    console.log(`   Yangi parol: SyS123456 (hash qilingan)`);
    console.log(`\n📋 Yangilangan admin:`);
    console.log(updatedAdmin);

    process.exit(0);
  } catch (error) {
    console.error("❌ Xatolik:", error);
    process.exit(1);
  }
}
