// index.js - Socket.IO + Firebase integratsiyasi
import express from "express";
import { config } from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import StudentRouter from "./routes/student.routes.js";
import AppartmentRouter from "./routes/appartment.routes.js";
import AdminRouter from "./routes/admin.routes.js";
import TutorRouter from "./routes/tutor.routes.js";
import StatisticsRouter from "./routes/statistics.routes.js";
import FilledRouter from "./routes/detail.routes.js";
import NotificationRouter from "./routes/notification.routes.js";
import AdsRouter from "./routes/ads.routes.js";
import TutorNotificationRouter from "./routes/tutorNotificaton.routes.js";
import FacultyAdminRouter from "./routes/faculty.admin.routes.js";

import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import ChatRouter from "./routes/chat.routes.js";
import tutorModel from "./models/tutor.model.js";
import chatModel from "./models/chat.model.js";
import StudentModel from "./models/student.model.js";
import axios from "axios";
import { autoRefreshStudentData } from "./utils/refreshData.js";
import PermissionRouter from "./routes/permission.routes.js";
import permissionModel from "./models/permission.model.js";
import { fixExistingStudentData } from "./utils/fixStudentData.js";

// Firebase import
import firebaseHelper from "./utils/firebase.helper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const app = express();
const server = createServer(app);

// Socket.io sozlamalari (SAQLAB QOLINGAN)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// CORS sozlamalari
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  })
);

// Body parser limitlari
app.use(
  express.json({
    limit: "100mb",
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "100mb",
    parameterLimit: 50000,
  })
);

// Static files
app.use("/public", express.static(path.join(__dirname, "public")));

const port = 7788;
const mongo_url = process.env.MONGO_URI;

mongoose
  .connect(mongo_url)
  .then(async () => {
    console.log("✅ Database connected successfully");

    // Firebase holatini tekshirish
    if (firebaseHelper.isFirebaseActive()) {
      console.log("🔥 Firebase initialized successfully");
    } else {
      console.log(
        "⚠️ Firebase ishlamayapti, faqat Socket.IO va MongoDB ishlaydi"
      );
    }

    try {
      const indexExists = await StudentModel.collection.indexExists(
        "student_id_number_1"
      );
      if (!indexExists) {
        await StudentModel.collection.createIndex({ student_id_number: 1 });
        console.log("✅ Index created");
      } else {
        console.log("ℹ️ Index already exists");
      }
    } catch (error) {
      if (error.code !== 86) {
        console.error("Index error:", error);
      }
    }
  })
  .catch((error) => {
    console.error("❌ Database connection error:", error);
  });

// Socket.IO events (TUTOR uchun saqlab qolingan)
io.on("connection", (socket) => {
  console.log("✅ Yangi foydalanuvchi ulandi:", socket.id);

  // Socket disconnect
  socket.on("disconnect", () => {
    console.log("❌ Foydalanuvchi uzildi:", socket.id);
  });

  // Student guruhga qo'shilganda Firebase ga ham qo'shish
  socket.on("joinGroupRoom", async (data) => {
    console.log("📥 joinGroupRoom event keldi:", data);

    const { studentId, groupId } = data;
    if (!groupId || !studentId) {
      console.log("⚠️ studentId yoki groupId yo'q");
      return;
    }

    const roomName = `group_${groupId}`;
    socket.join(roomName);
    console.log(`✅ Student ${studentId} ${roomName} ga qo'shildi`);

    // Firebase ga ham ro'yxatdan o'tkazish
    await firebaseHelper.registerStudentToGroup(studentId, groupId);

    // Muvaffaqiyatli qo'shilganini tasdiqlash
    socket.emit("joinedGroup", {
      status: "success",
      groupId,
      message: "Guruhga muvaffaqiyatli qo'shildingiz",
    });
  });

  // Tutor xabar yuborganda
  socket.on("sendMessage", async (data) => {
    try {
      console.log("📨 sendMessage event keldi:", data);

      const { tutorId, message, groupId } = data;

      if (!tutorId || !message || !groupId) {
        console.log("⚠️ Ma'lumotlar to'liq emas:", {
          tutorId,
          message,
          groupId,
        });
        socket.emit("errorMessage", {
          status: "error",
          message: "Ma'lumotlar to'liq emas",
        });
        return;
      }

      console.log("🔍 Tutor qidirilmoqda:", tutorId);
      const tutor = await tutorModel.findById(tutorId);

      if (!tutor) {
        console.log("❌ Tutor topilmadi:", tutorId);
        socket.emit("errorMessage", {
          status: "error",
          message: "Tutor topilmadi",
        });
        return;
      }

      console.log("✅ Tutor topildi:", tutor.name);

      const findGroup = tutor.group.find((c) => c.code == groupId.toString());

      if (!findGroup) {
        console.log("❌ Guruh topilmadi:", groupId);
        socket.emit("errorMessage", {
          status: "error",
          message: "Sizda bunday guruh mavjud emas",
        });
        return;
      }

      console.log("✅ Guruh topildi:", findGroup.name);

      const groupData = {
        id: findGroup.code,
        name: findGroup.name,
      };

      // MongoDB ga saqlash
      console.log("💾 MongoDB ga saqlanmoqda...");
      const newMessage = await chatModel.create({
        tutorId,
        message,
        groups: [groupData],
      });
      console.log("✅ MongoDB ga saqlandi:", newMessage._id);

      // Firebase ga ham saqlash (studentlar uchun)
      console.log("🔥 Firebase ga saqlanmoqda...");
      const firebaseResult = await firebaseHelper.saveMessageToFirebase(
        tutorId,
        message,
        groupData
      );
      if (firebaseResult.success) {
        console.log("✅ Firebase ga saqlandi");
      } else {
        console.log("⚠️ Firebase ga saqlanmadi:", firebaseResult.error);
      }

      // Xabar ma'lumotlarini tayyorlash
      const messageData = {
        _id: newMessage._id,
        tutorId,
        tutorName: tutor.name,
        message,
        group: groupData,
        createdAt: newMessage.createdAt,
      };

      // Socket orqali barcha guruh a'zolariga yuborish
      const roomName = `group_${groupData.id}`;

      // O'ziga ham yuborish
      socket.emit("receiveMessage", messageData);
      console.log("✅ O'ziga yuborildi");

      // Boshqalarga yuborish
      socket.to(roomName).emit("receiveMessage", messageData);
      console.log(`✅ ${roomName} dagi boshqalarga yuborildi`);

      // Muvaffaqiyatli yuborilganini tasdiqlash
      socket.emit("messageSent", {
        status: "success",
        messageId: newMessage._id,
        message: "Xabar muvaffaqiyatli yuborildi",
      });
    } catch (error) {
      console.error("❌ Xatolik sendMessage da:", error);
      socket.emit("errorMessage", {
        status: "error",
        message: error.message || "Xabar yuborishda xatolik",
      });
    }
  });

  // Test uchun echo event
  socket.on("ping", (data) => {
    console.log("🏓 Ping keldi:", data);
    socket.emit("pong", { message: "Pong!", timestamp: Date.now() });
  });
});

app.set("io", io);

// Routes
app.use(StudentRouter);
app.use(AppartmentRouter);
app.use(AdminRouter);
app.use(TutorRouter);
app.use(StatisticsRouter);
app.use(FilledRouter);
app.use(NotificationRouter);
app.use(AdsRouter);
app.use(ChatRouter);
app.use("/tutor-notification", TutorNotificationRouter);
app.use("/permission", PermissionRouter);
app.use("/faculty-admin", FacultyAdminRouter);

app.get("/get-banners", async (req, res) => {
  const arrBanner = [
    "/public/banner/alert_banner.png",
    "/public/banner/facebook_banner.png",
    "/public/banner/insta_banner.png",
    "/public/banner/telegram_banner.png",
    "/public/banner/website_banner.png",
  ];
  res.status(200).json({ status: "success", data: arrBanner });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server Error:", error);

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      status: "error",
      message: "Fayl hajmi juda katta",
      maxSize: "100MB",
    });
  }

  if (error.code === "LIMIT_FILE_COUNT") {
    return res.status(413).json({
      status: "error",
      message: "Juda ko'p fayl yuklandi",
    });
  }

  if (error.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(413).json({
      status: "error",
      message: "Kutilmagan fayl maydoni",
      field: error.field,
    });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      status: "error",
      message: "Request hajmi juda katta",
    });
  }

  res.status(500).json({
    status: "error",
    message: error.message || "Internal server error",
  });
});

server.listen(port, () => {
  console.log(`🚀 Server has been started on port ${port}`);
  console.log(`🔌 Socket.IO is running`);
  console.log(`🔥 Firebase Realtime Database connected`);
});
