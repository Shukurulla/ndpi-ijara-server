import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import NotificationModel from "../models/notification.model.js";
import StudentModel from "../models/student.model.js";
import AppartmentModel from "../models/appartment.model.js";

const router = express.Router();

router.post("/notification/report", authMiddleware, async (req, res) => {
  try {
    const { userId, message, status, appartmentId, need_data } = req.body;
    const findStudent = await StudentModel.findById(userId);
    if (!findStudent) {
      return res.status(400).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }
    const findAppartment = await AppartmentModel.findById(appartmentId);
    if (!findAppartment) {
      return res.status(400).json({
        status: "error",
        message: "Bunday ijara malumotlari topilmadi",
      });
    }

    const findNotification = await NotificationModel.findOne({
      userId,
      need_data,
      status,
    });
    if (findNotification) {
      return res.status(400).json({
        status: "error",
        message: "Bu student uchun bunday notification yuborilgan",
      });
    }
    const findBlueNotification = await NotificationModel.find({
      userId,
      notification_type: "report",
      status: "blue",
    });

    const notificationIds = findBlueNotification.map((n) => n._id.toString());

    await NotificationModel.deleteMany({ _id: { $in: notificationIds } });

    const notification = await NotificationModel.create({
      message,
      status,
      userId,
      appartmentId,
      need_data,
      notification_type: "report",
    });

    res.status(200).json({ status: "success", data: notification });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});
router.post("/notification/push", authMiddleware, async (req, res) => {
  try {
    const { userId, message, status, appartmentId } = req.body;
    const findStudent = await StudentModel.findById(userId);
    if (!findStudent) {
      return res.status(400).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }
    const findAppartment = await AppartmentModel.findById(appartmentId);
    if (!findAppartment) {
      return res.status(400).json({
        status: "error",
        message: "Bunday ijara malumotlari topilmadi",
      });
    }

    const notification = await NotificationModel.create({
      message,
      status,
      userId,
      appartmentId,
      notification_type: "push",
    });

    res.status(200).json({ status: "success", data: notification });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.delete("/notification/:id", authMiddleware, async (req, res) => {
  try {
    const findNotification = await NotificationModel.findById(req.params.id);
    if (!findNotification) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday notification toplmadi" });
    }
    await NotificationModel.findByIdAndDelete(findNotification._id);
    res.json({
      status: "success",
      message: "Notification muaffaqiyatli ochirildi",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/notification/push/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const findStudent = await StudentModel.findById(userId).select("_id").lean();
    if (!findStudent) {
      return res.status(400).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }
    // Sort va lean bilan optimizatsiya
    const findNotifications = await NotificationModel.find({
      userId,
      notification_type: "push",
    })
      .sort({ createdAt: -1 })
      .lean();

    // Unread count ni DB da hisoblash
    const unreadNotifications = await NotificationModel.countDocuments({
      userId,
      notification_type: "push",
      isRead: { $ne: true },
    });

    res.json({
      status: "success",
      data: findNotifications,
      length: findNotifications.length,
      unread: unreadNotifications,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});
router.get("/notification/report/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const findStudent = await StudentModel.findById(userId).select("_id").lean();
    if (!findStudent) {
      return res.status(400).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }

    // lean() bilan optimizatsiya
    const findNotifications = await NotificationModel.find({
      userId,
      notification_type: "report",
    }).lean();

    // Unread count ni DB da hisoblash
    const unreadNotifications = await NotificationModel.countDocuments({
      userId,
      notification_type: "report",
      isRead: { $ne: true },
    });

    res.json({
      status: "success",
      data: findNotifications,
      length: findNotifications.length,
      unread: unreadNotifications,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

router.put("/notification/report/:userId/read", async (req, res) => {
  try {
    const { userId } = req.params;
    const findStudent = await StudentModel.findById(userId).select("_id").lean();
    if (!findStudent) {
      return res.status(400).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }
    // Bitta updateMany bilan barcha notificationlarni yangilash (loop o'rniga)
    await NotificationModel.updateMany(
      { userId, notification_type: "report" },
      { $set: { isRead: true } }
    );
    const findNewNotifications = await NotificationModel.find({
      userId,
      notification_type: "report",
    }).lean();
    res.json({ status: "success", data: findNewNotifications });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});
router.put("/notification/push/:userId/read", async (req, res) => {
  try {
    const { userId } = req.params;
    const findStudent = await StudentModel.findById(userId).select("_id").lean();
    if (!findStudent) {
      return res.status(400).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }
    // Bitta updateMany bilan barcha notificationlarni yangilash (loop o'rniga)
    await NotificationModel.updateMany(
      { userId, notification_type: "push" },
      { $set: { isRead: true } }
    );
    const findNewNotifications = await NotificationModel.find({
      userId,
      notification_type: "push",
    }).lean();
    res.json({ status: "success", data: findNewNotifications });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
