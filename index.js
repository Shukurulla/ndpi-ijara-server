// index.js - Socket.IO + Firebase integratsiyasi (FINAL FIX)
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
import admin from "firebase-admin";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import ChatRouter from "./routes/chat.routes.js";
import tutorModel from "./models/tutor.model.js";
import chatModel from "./models/chat.model.js";
import StudentModel from "./models/student.model.js";
import axios from "axios";
import { autoRefreshStudentData } from "./utils/refreshData.js";
import PermissionRouter from "./routes/permission.routes.js";
import permissionModel from "./models/permission.model.js";
import { fixExistingStudentData } from "./utils/fixStudentData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

// Firebase Admin SDK
let isFirebaseInitialized = false;

try {
  if (admin.apps.length === 0) {
    const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
    const serviceAccount = JSON.parse(
      readFileSync(serviceAccountPath, "utf-8")
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("🔥 Firebase Admin SDK initialized");
  }
  isFirebaseInitialized = true;
} catch (error) {
  console.error("❌ Firebase initialization error:", error.message);
  isFirebaseInitialized = false;
}

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  })
);

app.use(express.json({ limit: "100mb" }));
app.use(
  express.urlencoded({ extended: true, limit: "100mb", parameterLimit: 50000 })
);
app.use("/public", express.static(path.join(__dirname, "public")));

const port = 7788;
const mongo_url = process.env.MONGO_URI;

mongoose
  .connect(mongo_url)
  .then(async () => {
    console.log("✅ Database connected successfully");
    try {
      const indexExists = await StudentModel.collection.indexExists(
        "student_id_number_1"
      );
      if (!indexExists) {
        await StudentModel.collection.createIndex({ student_id_number: 1 });
        console.log("✅ Index created");
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

// FCM yuborish funksiyasi
async function sendFCMNotification(tokens, payload) {
  if (!isFirebaseInitialized) {
    return { success: false, message: "Firebase not initialized" };
  }

  if (!tokens || tokens.length === 0) {
    return { success: false, message: "No tokens found" };
  }

  const validTokens = tokens.filter((token) => token && token.trim() !== "");

  if (validTokens.length === 0) {
    return { success: false, message: "No valid tokens found" };
  }

  try {
    if (validTokens.length === 1) {
      const message = {
        notification: payload.notification,
        data: payload.data || {},
        token: validTokens[0],
        android: {
          priority: "high",
          notification: {
            ...payload.notification,
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log(`📨 FCM sent to 1 device`);
      return { success: true, messageId: response };
    }

    const messages = validTokens.map((token) => ({
      notification: payload.notification,
      data: payload.data || {},
      token: token,
      android: {
        priority: "high",
        notification: {
          ...payload.notification,
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    }));

    const response = await admin.messaging().sendEach(messages);
    console.log(
      `📨 FCM sent: ${response.successCount}/${validTokens.length} successful`
    );

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("❌ FCM error:", error.message);
    return { success: false, error: error.message };
  }
}

// Socket.IO events
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });

  socket.on("saveToken", async (data) => {
    try {
      const { studentId, token } = data;
      if (!studentId || !token) {
        return socket.emit("errorMessage", {
          status: "error",
          message: "studentId yoki token yo'q",
        });
      }

      const student = await StudentModel.findOneAndUpdate(
        { _id: studentId },
        {
          fcmToken: token,
          fcmTokenUpdatedAt: new Date(),
        },
        { upsert: false, new: true }
      );

      if (!student) {
        return socket.emit("errorMessage", {
          status: "error",
          message: "Student topilmadi",
        });
      }

      console.log(`✅ Token saved for: ${student.name}`);

      socket.emit("tokenSaved", {
        status: "success",
        message: "Token saqlandi",
        studentName: student.name,
      });
    } catch (error) {
      console.error("❌ Token save error:", error);
      socket.emit("errorMessage", {
        status: "error",
        message: "Token saqlashda xatolik",
      });
    }
  });

  socket.on("joinGroupRoom", async (data) => {
    const { studentId, groupId } = data;
    if (!groupId || !studentId) {
      return socket.emit("errorMessage", {
        status: "error",
        message: "Ma'lumotlar to'liq emas",
      });
    }

    const roomName = `group_${groupId}`;
    socket.join(roomName);
    console.log(`✅ Student ${studentId} joined ${roomName}`);

    socket.emit("joinedGroup", {
      status: "success",
      groupId,
      message: "Guruhga qo'shildingiz",
    });
  });

  socket.on("sendMessage", async (data) => {
    try {
      const { tutorId, message, groupId } = data;

      if (!tutorId || !message || !groupId) {
        return socket.emit("errorMessage", {
          status: "error",
          message: "Ma'lumotlar to'liq emas",
        });
      }

      const tutor = await tutorModel.findById(tutorId);
      if (!tutor) {
        return socket.emit("errorMessage", {
          status: "error",
          message: "Tutor topilmadi",
        });
      }

      const findGroup = tutor.group.find((c) => c.code == groupId.toString());
      if (!findGroup) {
        return socket.emit("errorMessage", {
          status: "error",
          message: "Sizda bunday guruh mavjud emas",
        });
      }

      const groupData = {
        id: findGroup.code,
        name: findGroup.name,
      };

      const newMessage = await chatModel.create({
        tutorId,
        message,
        groups: [groupData],
      });

      const messageData = {
        _id: newMessage._id,
        tutorId,
        tutorName: tutor.name,
        message,
        group: groupData,
        createdAt: newMessage.createdAt,
      };

      const roomName = `group_${groupData.id}`;
      socket.emit("receiveMessage", messageData);
      socket.to(roomName).emit("receiveMessage", messageData);

      console.log(`✅ Message sent to ${roomName}`);

      // FCM to group students
      try {
        // MUHIM: Student modelida group_id yoki boshqa field bo'lishi mumkin
        // Avval barcha studentlarni olib ko'ramiz
        const allStudents = await StudentModel.find({
          fcmToken: { $exists: true, $ne: null, $ne: "" },
        }).select("_id name fcmToken group group_id groups");

        // Guruhga tegishli studentlarni filtrlash
        const students = allStudents.filter((student) => {
          // 1. group array ichida tekshirish
          if (student.group && Array.isArray(student.group)) {
            return student.group.some(
              (g) =>
                g.code == groupData.id ||
                g.code == groupData.id.toString() ||
                g.code == parseInt(groupData.id)
            );
          }

          // 2. group_id field tekshirish
          if (student.group_id) {
            return (
              student.group_id == groupData.id ||
              student.group_id == groupData.id.toString() ||
              student.group_id == parseInt(groupData.id)
            );
          }

          // 3. groups array tekshirish (agar boshqa nom bilan saqlangan bo'lsa)
          if (student.groups && Array.isArray(student.groups)) {
            return student.groups.some(
              (g) =>
                g.code == groupData.id ||
                g.code == groupData.id.toString() ||
                g.code == parseInt(groupData.id) ||
                g.id == groupData.id ||
                g.id == groupData.id.toString() ||
                g.id == parseInt(groupData.id)
            );
          }

          // 4. To'g'ridan-to'g'ri group field string yoki number bo'lsa
          if (student.group && !Array.isArray(student.group)) {
            return (
              student.group == groupData.id ||
              student.group == groupData.id.toString() ||
              student.group == parseInt(groupData.id)
            );
          }

          return false;
        });

        if (students && students.length > 0) {
          console.log(
            `📱 Found ${students.length} students with FCM tokens in group ${groupData.id}`
          );

          const payload = {
            notification: {
              title: `${findGroup.name} - ${tutor.name}`,
              body:
                message.length > 100
                  ? message.substring(0, 100) + "..."
                  : message,
            },
            data: {
              groupId: groupData.id.toString(),
              groupName: findGroup.name,
              tutorId: tutorId.toString(),
              tutorName: tutor.name,
              messageId: newMessage._id.toString(),
              type: "new_message",
              timestamp: new Date().toISOString(),
            },
          };

          const tokens = students.map((s) => s.fcmToken);
          const fcmResult = await sendFCMNotification(tokens, payload);

          if (fcmResult.success) {
            console.log(`✅ FCM notifications sent successfully`);
          }
        } else {
          console.log(
            `⚠️ No students with FCM tokens found in group ${groupData.id}`
          );

          // Debug uchun: umumiy FCM tokenli studentlar soni
          const totalWithToken = await StudentModel.countDocuments({
            fcmToken: { $exists: true, $ne: null, $ne: "" },
          });
          console.log(
            `   Total students with FCM tokens in DB: ${totalWithToken}`
          );
        }
      } catch (fcmError) {
        console.error("❌ FCM error:", fcmError);
      }

      socket.emit("messageSent", {
        status: "success",
        messageId: newMessage._id,
        message: "Xabar yuborildi",
      });
    } catch (error) {
      console.error("❌ sendMessage error:", error);
      socket.emit("errorMessage", {
        status: "error",
        message: error.message || "Xabar yuborishda xatolik",
      });
    }
  });

  socket.on("ping", (data) => {
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

// FCM token save API
app.post("/api/save-fcm-token", async (req, res) => {
  try {
    const { studentId, token } = req.body;

    if (!studentId || !token) {
      return res.status(400).json({
        status: "error",
        message: "studentId va token majburiy",
      });
    }

    const student = await StudentModel.findByIdAndUpdate(
      studentId,
      {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date(),
      },
      { new: true, upsert: false }
    );

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student topilmadi",
      });
    }

    console.log(`✅ FCM Token saved via API for: ${student.name}`);

    return res.status(200).json({
      status: "success",
      message: "FCM token saqlandi",
      data: {
        studentId: student._id,
        studentName: student.name,
      },
    });
  } catch (error) {
    console.error("❌ FCM token save error:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Server xatolik",
    });
  }
});

// Debug endpoint - Guruh studentlarini tekshirish
app.get("/api/debug/group/:groupId", async (req, res) => {
  try {
    const groupId = req.params.groupId;

    // Barcha FCM tokenli studentlarni olish
    const allStudents = await StudentModel.find({
      fcmToken: { $exists: true, $ne: null, $ne: "" },
    }).select("name group group_id groups fcmToken");

    // Guruhga tegishlilarni filtrlash
    const groupStudents = allStudents.filter((student) => {
      if (student.group && Array.isArray(student.group)) {
        return student.group.some(
          (g) =>
            g.code == groupId ||
            g.code == parseInt(groupId) ||
            g.code == groupId.toString()
        );
      }
      if (student.group_id) {
        return (
          student.group_id == groupId ||
          student.group_id == parseInt(groupId) ||
          student.group_id == groupId.toString()
        );
      }
      if (student.groups && Array.isArray(student.groups)) {
        return student.groups.some(
          (g) =>
            g.code == groupId ||
            g.id == groupId ||
            g.code == parseInt(groupId) ||
            g.id == parseInt(groupId)
        );
      }
      if (student.group && !Array.isArray(student.group)) {
        return (
          student.group == groupId ||
          student.group == parseInt(groupId) ||
          student.group == groupId.toString()
        );
      }
      return false;
    });

    return res.json({
      status: "success",
      groupId: groupId,
      totalStudentsWithToken: allStudents.length,
      studentsInGroup: groupStudents.length,
      students: groupStudents.map((s) => ({
        name: s.name,
        hasToken: !!s.fcmToken,
        groupData: s.group || s.group_id || s.groups,
      })),
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
});

// Banners
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

// Server start
server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔌 Socket.IO ready`);
  if (isFirebaseInitialized) {
    console.log(`🔥 Firebase FCM ready`);
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received");
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received");
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});
