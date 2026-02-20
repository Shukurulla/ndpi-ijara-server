
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import adminModel from "./models/admin.model.js";

dotenv.config();

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("DB connected");
    
    const admin = await adminModel.findOne({ username: "admin" });
    console.log("Admin found:", !!admin);
    
    if (admin) {
      const match = await bcrypt.compare("admin123", admin.password);
      console.log("Password match:", match);
      
      console.log("JWT_SECRET exists:", !!process.env.JWT_SECRET);
      console.log("JWT_SECRET length:", process.env.JWT_SECRET?.length);
      
      const token = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
      console.log("Token generated:", !!token);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error.message);
    console.error("STACK:", error.stack);
    process.exit(1);
  }
}
test();
