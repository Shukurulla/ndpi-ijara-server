// index.js - Socket.IO + Firebase integratsiyasi (FIREBASE FIXED)
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
import fs from "fs";
import ChatRouter from "./routes/chat.routes.js";
import tutorModel from "./models/tutor.model.js";
import chatModel from "./models/chat.model.js";
import StudentModel from "./models/student.model.js";
import axios from "axios";
import { autoRefreshStudentData } from "./utils/refreshData.js";
import PermissionRouter from "./routes/permission.routes.js";
import permissionModel from "./models/permission.model.js";
import { fixExistingStudentData } from "./utils/fixStudentData.js";
import AppartmentModel from "./models/appartment.model.js";

// Firebase Admin SDK - Dinamik import
let admin = null;
let isFirebaseInitialized = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

// Firebase'ni asinxron yuklash va initialize qilish
async function initializeFirebase() {
  try {
    // Firebase admin SDK'ni dinamik import qilish
    const adminModule = await import("firebase-admin");
    admin = adminModule.default;

    // Agar allaqachon initialized bo'lsa, qayta qilmaymiz
    if (admin.apps && admin.apps.length > 0) {
      console.log("🔥 Firebase already initialized");
      isFirebaseInitialized = true;
      return true;
    }

    const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

    // Fayl mavjudligini tekshirish
    if (!fs.existsSync(serviceAccountPath)) {
      console.warn("⚠️ serviceAccountKey.json file not found");
      console.warn("   FCM notifications will be disabled");
      console.warn("   Socket.IO messaging will continue to work");
      return false;
    }

    // JSON faylni o'qish va parse qilish
    const serviceAccountContent = fs.readFileSync(serviceAccountPath, "utf-8");
    let serviceAccount;

    try {
      serviceAccount = JSON.parse(serviceAccountContent);
    } catch (parseError) {
      console.error(
        "❌ Failed to parse serviceAccountKey.json:",
        parseError.message
      );
      return false;
    }

    // Firebase'ni initialize qilish
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Agar kerak bo'lsa, databaseURL qo'shing:
      // databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });

    console.log("🔥 Firebase Admin SDK initialized successfully");
    console.log(`   Project ID: ${serviceAccount.project_id}`);
    isFirebaseInitialized = true;
    return true;
  } catch (error) {
    console.error("⚠️ Firebase initialization error:", error.message);
    console.warn("   FCM notifications will be disabled");
    console.warn("   Socket.IO messaging will continue to work");
    isFirebaseInitialized = false;
    return false;
  }
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

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://tutorapp-student.vercel.app",
  "https://tutor-admin-eight.vercel.app",
  "https://testtutorapp.kerek.uz",
];

app.use((req, res, next) => {
  console.log("🛰️ So‘rov keldi:", req.headers.origin);
  next();
});

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("❌ Bloklangan origin:", origin);
        callback(new Error("CORS not allowed"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  })
);

// muhim! preflight so‘rovlar uchun
app.options("*", cors());

app.use(express.json({ limit: "100mb" }));
app.use(
  express.urlencoded({ extended: true, limit: "100mb", parameterLimit: 50000 })
);
app.use("/public", express.static(path.join(__dirname, "public")));

const port = 7789;
const mongo_url = process.env.MONGO_URI;

// MongoDB connection
mongoose
  .connect(mongo_url)
  .then(async () => {
    console.log("✅ Database connected successfully");

    // Firebase'ni database con nected bo'lgandan keyin initialize qilamiz
    await initializeFirebase();

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

// FCM yuborish funksiyasi - Xavfsiz versiya
async function sendFCMNotification(tokens, payload) {
  if (!isFirebaseInitialized || !admin) {
    console.log("⚠️ FCM is disabled - Firebase not initialized");
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
    // Bitta token uchun
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
      console.log(`📨 FCM sent to 1 device: ${response}`);
      return { success: true, messageId: response };
    }

    // Ko'p token uchun
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

    // Agar xatoliklar bo'lsa, ularni log qilish
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`   Token ${idx} failed:`, resp.error?.message);
        }
      });
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("❌ FCM error:", error.message);

    // Agar Firebase credential muammosi bo'lsa
    if (
      error.code === "auth/invalid-credential" ||
      error.message?.includes("invalid_grant") ||
      error.message?.includes("JWT")
    ) {
      console.error("⚠️ Firebase Service Account key problem detected!");
      console.error("   Please check your serviceAccountKey.json file");
      isFirebaseInitialized = false;
    }

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

      console.log(
        `✅ Token saved for: ${
          student.full_name || student.first_name || student._id
        }`
      );

      socket.emit("tokenSaved", {
        status: "success",
        message: "Token saqlandi",
        studentName: student.full_name || student.first_name,
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

      // FCM to group students - OPTIMIZED VERSION
      if (isFirebaseInitialized && admin) {
        try {
          console.log(
            `🔍 Looking for students in group: ${groupData.id} (${groupData.name})`
          );

          // Guruhga tegishli studentlarni olish (FCM token bilan)
          const students = await StudentModel.find({
            $and: [
              {
                $or: [
                  { "group.id": groupData.id },
                  { "group.id": String(groupData.id) },
                  { "group.id": Number(groupData.id) },
                  { "group.name": groupData.name },
                ],
              },
              {
                fcmToken: { $exists: true, $ne: null, $ne: "" },
              },
            ],
          })
            .select("_id full_name first_name fcmToken group")
            .limit(500); // Max 500 ta student

          if (students && students.length > 0) {
            console.log(
              `📱 Found ${students.length} students with FCM tokens in group ${groupData.id}`
            );

            // Log first few students for debug
            students.slice(0, 3).forEach((s) => {
              const name = s.full_name || s.first_name || s._id;
              console.log(`  - ${name} (${s.group?.name})`);
            });

            const payload = {
              notification: {
                title: `${findGroup.name}`,
                body: `${tutor.name}: ${message.substring(0, 100)}${
                  message.length > 100 ? "..." : ""
                }`,
              },
              data: {
                groupId: String(groupData.id),
                groupName: String(findGroup.name),
                tutorId: String(tutorId),
                tutorName: String(tutor.name),
                messageId: String(newMessage._id),
                type: "new_message",
                timestamp: new Date().toISOString(),
              },
            };

            const tokens = students.map((s) => s.fcmToken).filter((t) => t);

            if (tokens.length > 0) {
              const fcmResult = await sendFCMNotification(tokens, payload);

              if (fcmResult.success) {
                console.log(
                  `✅ FCM notifications sent: ${fcmResult.successCount} successful`
                );
              } else {
                console.log(
                  `⚠️ FCM sending issues:`,
                  fcmResult.error || "Some tokens failed"
                );
              }
            }
          } else {
            console.log(
              `⚠️ No students with FCM tokens found in group ${groupData.id}`
            );

            // Debug: Check total students in group
            const totalInGroup = await StudentModel.countDocuments({
              $or: [
                { "group.id": groupData.id },
                { "group.id": String(groupData.id) },
                { "group.id": Number(groupData.id) },
                { "group.name": groupData.name },
              ],
            });

            if (totalInGroup > 0) {
              console.log(
                `   (${totalInGroup} students in group, but none have FCM tokens)`
              );
            } else {
              console.log(`   (No students found in this group)`);
            }
          }
        } catch (fcmError) {
          console.error("❌ FCM processing error:", fcmError.message);
        }
      } else {
        console.log("⚠️ FCM is disabled - Firebase not initialized");
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

    const studentName = student.full_name || student.first_name || student._id;
    console.log(`✅ FCM Token saved via API for: ${studentName}`);

    return res.status(200).json({
      status: "success",
      message: "FCM token saqlandi",
      data: {
        studentId: student._id,
        studentName: studentName,
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

app.get("/groups", async (req, res) => {
  try {
    const allStudents = await StudentModel.find().select("group");
    const sortGroups = [...new Set(allStudents)];
    res.status(200).json({ status: "success", data: sortGroups });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Debug endpoint - Guruh studentlarini tekshirish
app.get("/api/debug/group/:groupId", async (req, res) => {
  try {
    const groupId = req.params.groupId;

    // Guruhga tegishli barcha studentlar
    const allGroupStudents = await StudentModel.find({
      $or: [
        { "group.id": groupId },
        { "group.id": String(groupId) },
        { "group.id": Number(groupId) },
      ],
    }).select("full_name first_name group fcmToken");

    // FCM tokenli studentlar
    const studentsWithToken = allGroupStudents.filter((s) => s.fcmToken);

    return res.json({
      status: "success",
      groupId: groupId,
      totalStudentsInGroup: allGroupStudents.length,
      studentsWithToken: studentsWithToken.length,
      studentsWithoutToken: allGroupStudents.length - studentsWithToken.length,
      students: allGroupStudents.map((s) => ({
        name: s.full_name || s.first_name || "No name",
        groupId: s.group?.id,
        groupName: s.group?.name,
        hasToken: !!s.fcmToken,
        tokenPreview: s.fcmToken ? s.fcmToken.substring(0, 20) + "..." : null,
      })),
      firebaseStatus: isFirebaseInitialized ? "active" : "disabled",
    });
  } catch (error) {
    return res.status(500).json({ status: "error", message: error.message });
  }
});

// Firebase status endpoint
app.get("/api/firebase/status", (req, res) => {
  res.json({
    status: "success",
    firebase: {
      initialized: isFirebaseInitialized,
      hasAdmin: !!admin,
      appsCount: admin?.apps?.length || 0,
      message: isFirebaseInitialized
        ? "Firebase FCM is active and ready"
        : "Firebase FCM is disabled - Socket.IO messaging is active",
    },
  });
});

// Test FCM endpoint
app.post("/api/test-fcm", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }

    if (!isFirebaseInitialized || !admin) {
      return res.status(503).json({
        status: "error",
        message: "Firebase is not initialized",
      });
    }

    const message = {
      notification: {
        title: "Test Notification",
        body: "This is a test message from TutorApp",
      },
      data: {
        type: "test",
        timestamp: new Date().toISOString(),
      },
      token: token,
    };

    const response = await admin.messaging().send(message);

    res.json({
      status: "success",
      message: "Test notification sent",
      messageId: response,
    });
  } catch (error) {
    console.error("Test FCM error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

app.get("/info", async (req, res) => {
  try {
    const permissions = await permissionModel.find({ status: "process" });

    const permissionIds = permissions.map((c) => c._id);

    const activeAppartments = await AppartmentModel.find({
      permission: { $in: permissionIds },
    });

    const studentIds = activeAppartments.map((c) => c.studentId);

    const activeStudents = await StudentModel.find({
      _id: { $in: studentIds },
    }).select("group.name department.name");

    res
      .status(200)
      .json({ status: "success", data: { activeStudents, permissions } });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
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

app.get("/students", async (req, res) => {
  try {
    const students = await StudentModel.find().select("group");
    res.status(200).json({ data: students });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      socketIO: "active",
      firebase: isFirebaseInitialized ? "active" : "disabled",
    },
  });
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
server.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔌 Socket.IO ready`);

  if (isFirebaseInitialized) {
    console.log(`🔥 Firebase FCM ready`);
  } else {
    console.log(`⚠️ Firebase FCM disabled - Socket.IO messaging active`);
    // Try to initialize Firebase again if it failed during startup
    if (!isFirebaseInitialized) {
      setTimeout(async () => {
        console.log("🔄 Retrying Firebase initialization...");
        await initializeFirebase();
      }, 5000);
    }
  }

  console.log(`📡 API endpoints:`);
  console.log(`   - http://localhost:${port}/health`);
  console.log(`   - http://localhost:${port}/api/firebase/status`);
  console.log(`   - http://localhost:${port}/api/debug/group/:groupId`);
  console.log(`   - http://localhost:${port}/api/test-fcm`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received - shutting down gracefully");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT received - shutting down gracefully");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed");
      process.exit(0);
    });
  });
});

// Unhandled rejection handler
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  // Log but don't exit
});

// Uncaught exception handler
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Critical errors only
  if (err.message && err.message.includes("EADDRINUSE")) {
    console.error("Port already in use, exiting...");
    process.exit(1);
  }
});
