import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import adminModel from "./models/admin.model.js";

dotenv.config();

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB ga ulandi");

    const existingAdmin = await adminModel.findOne({ username: ADMIN_USERNAME });

    if (existingAdmin) {
      console.log(`"${ADMIN_USERNAME}" admin allaqachon mavjud. Seed toxtatildi.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = await adminModel.create({
      username: ADMIN_USERNAME,
      password: hashedPassword,
      role: "mainAdmin",
    });

    console.log("Admin muvaffaqiyatli yaratildi:");
    console.log("  Username: " + ADMIN_USERNAME);
    console.log("  Password: " + ADMIN_PASSWORD);
    console.log("  Role: " + admin.role);
    console.log("  ID: " + admin._id);

    process.exit(0);
  } catch (error) {
    console.error("Seed xatolik:", error.message);
    process.exit(1);
  }
}

seed();
