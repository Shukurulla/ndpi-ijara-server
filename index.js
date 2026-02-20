import express from "express";
import { config } from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
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
import PermissionRouter from "./routes/permission.routes.js";
import permissionModel from "./models/permission.model.js";
import AppartmentModel from "./models/appartment.model.js";
import DistrictsRoutes from "./routes/districts.routes.js";
import StatusServer from "./routes/statusServer.routes.js";
import { checkRefreshStatus } from "./middlewares/refreshCheck.middleware.js";
import { syncFaculties } from "./utils/syncFaculties.js";
import GroupModel from "./models/group.model.js";
import authMiddleware from "./middlewares/auth.middleware.js";

let admin = null;
let isFirebaseInitialized = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = function (...args) {
  const message = args.join(" ");
  if (
    message.includes("@firebase/database") ||
    message.includes("FIREBASE WARNING") ||
    message.includes("invalid_grant") ||
    message.includes("Invalid JWT Signature") ||
    message.includes("app/invalid-credential")
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

console.error = function (...args) {
  const message = args.join(" ");
  if (
    message.includes("@firebase/database") ||
    message.includes("FIREBASE WARNING") ||
    message.includes("invalid_grant") ||
    message.includes("Invalid JWT Signature") ||
    message.includes("app/invalid-credential")
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

async function initializeFirebase() {
  try {
    const adminModule = await import("firebase-admin");
    admin = adminModule.default;

    if (admin.apps && admin.apps.length > 0) {
      console.log("🔥 Firebase already initialized");
      isFirebaseInitialized = true;
      return true;
    }

    const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

    if (!fs.existsSync(serviceAccountPath)) {
      console.warn("⚠️ serviceAccountKey.json file not found");
      console.warn("   FCM notifications will be disabled");
      console.warn("   Socket.IO messaging will continue to work");
      return false;
    }

    const serviceAccountContent = fs.readFileSync(serviceAccountPath, "utf-8");
    let serviceAccount;

    try {
      serviceAccount = JSON.parse(serviceAccountContent);
    } catch (parseError) {
      console.error(
        "❌ Failed to parse serviceAccountKey.json:",
        parseError.message,
      );
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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

const allowedOrigins = [
  "https://tutorapp.asadbek-durdana.uz",
  "https://admin.tutorapp.kerek.uz",
  "https://student.tutorapp.kerek.uz",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
  "https://ndpi-ijara.netlify.app",
  process.env.NODE_ENV !== "production" ? "http://localhost:5173" : null,
  process.env.NODE_ENV !== "production" ? "http://localhost:5175" : null,
  process.env.NODE_ENV !== "production" ? "http://localhost:5176" : null,
  process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null,
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy tomonidan rad etildi"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  }),
);

app.use(mongoSanitize());

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    status: "error",
    message: "Juda ko'p so'rov. Keyinroq urinib ko'ring",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    status: "error",
    message: "Juda ko'p login urinish. 15 daqiqadan keyin urinib ko'ring",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/admin/login", loginLimiter);
app.use("/student/sign", loginLimiter);
app.use("/tutor/login", loginLimiter);

app.use(express.json({ limit: "5mb" }));
app.use(
  express.urlencoded({ extended: true, limit: "5mb", parameterLimit: 1000 }),
);
app.use("/public", express.static(path.join(__dirname, "public")));

const port = 7788;
const mongo_url = process.env.MONGO_URI;

mongoose
  .connect(mongo_url)
  .then(async () => {
    console.log("✅ Database connected successfully");

    await initializeFirebase();

    // Fakultetlarni HEMIS API dan sinxronlash
    try {
      const result = await syncFaculties();
      console.log(
        `✅ Fakultetlar sinxronlandi: ${result.total} ta fakultet (${result.created} yangi, ${result.updated} yangilandi)`,
      );
    } catch (err) {
      console.warn("⚠️ Fakultetlarni sinxronlashda xatolik:", err.message);
    }
  })
  .catch((error) => {
    console.error("❌ Database connection error:", error);
  });

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
      `📨 FCM sent: ${response.successCount}/${validTokens.length} successful`,
    );

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
        { upsert: false, new: true },
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
        }`,
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

      if (isFirebaseInitialized && admin) {
        try {
          console.log(
            `🔍 Looking for students in group: ${groupData.id} (${groupData.name})`,
          );

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
            .limit(500);

          if (students && students.length > 0) {
            console.log(
              `📱 Found ${students.length} students with FCM tokens in group ${groupData.id}`,
            );

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
                  `✅ FCM notifications sent: ${fcmResult.successCount} successful`,
                );
              } else {
                console.log(
                  `⚠️ FCM sending issues:`,
                  fcmResult.error || "Some tokens failed",
                );
              }
            }
          } else {
            console.log(
              `⚠️ No students with FCM tokens found in group ${groupData.id}`,
            );

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
                `   (${totalInGroup} students in group, but none have FCM tokens)`,
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

app.use(AdminRouter);
app.use("/faculty-admin", FacultyAdminRouter);

app.use(checkRefreshStatus);

app.use(StudentRouter);
app.use(AppartmentRouter);
app.use(TutorRouter);
app.use(StatisticsRouter);
app.use(FilledRouter);
app.use(NotificationRouter);
app.use(AdsRouter);
app.use(ChatRouter);
app.use("/tutor-notification", TutorNotificationRouter);
app.use("/permission", PermissionRouter);
app.use("/api", DistrictsRoutes);
app.use("/api", StatusServer);

app.post("/api/save-fcm-token", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token majburiy",
      });
    }

    const student = await StudentModel.findByIdAndUpdate(
      userId,
      {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date(),
      },
      { new: true, upsert: false },
    );

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student topilmadi",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "FCM token saqlandi",
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Server xatolik",
    });
  }
});

app.get("/groups", async (req, res) => {
  try {
    const groups = await GroupModel.find()
      .select("id name educationLang facultyName facultyCode")
      .sort({ name: 1 })
      .lean();
    res.status(200).json({ status: "success", data: groups });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
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

app.use((error, req, res, _next) => {
  console.error("Server Error:", error.message);

  if (error.message === "CORS policy tomonidan rad etildi") {
    return res.status(403).json({
      status: "error",
      message: "Ruxsat berilmagan manba",
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      status: "error",
      message: "Fayl hajmi juda katta (max 10MB)",
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
    message: "Serverda xatolik yuz berdi",
  });
});

server.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🔌 Socket.IO ready`);

  if (isFirebaseInitialized) {
    console.log(`🔥 Firebase FCM ready`);
  } else {
    console.log(`⚠️ Firebase FCM disabled - Socket.IO messaging active`);
    if (!isFirebaseInitialized) {
      setTimeout(async () => {
        console.log("🔄 Retrying Firebase initialization...");
        await initializeFirebase();
      }, 5000);
    }
  }

  console.log(`📡 Server ready on port ${port}`);
});

app.get("/studetnsss", async (req, res) => {
  try {
    const students = await GroupModel.find();

    res.status(200).json({ status: "success", data: students });
  } catch (error) {
    res.status(500).json({ error: error });
  }
});

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

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  if (err.message && err.message.includes("EADDRINUSE")) {
    console.error("Port already in use, exiting...");
    process.exit(1);
  }
});
