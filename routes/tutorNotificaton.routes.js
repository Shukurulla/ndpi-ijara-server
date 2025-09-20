import express from "express";
import tutorNotificationModel from "../models/tutorNotification.model.js";
import tutorModel from "../models/tutor.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
const router = express.Router();

router.post("/create", async (req, res) => {
  try {
    const { tutorId, message } = req.body;
    const findTutor = await tutorModel.findById(tutorId);

    if (!findTutor) {
      return res
        .status(400)
        .json({ status: "error", message: "bunday tutor topilmadi" });
    }

    const createNotification = await tutorNotificationModel.create({
      tutorId,
      message,
    });

    res.status(200).json({ status: "success", data: createNotification });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/my-messages", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const findTutor = await tutorModel.findById(userId);

    if (!findTutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const findMessages = await tutorNotificationModel.find({ tutorId: userId });

    res.status(200).json({
      status: "success",
      data: {
        messages: findMessages,
        total: findMessages.lenght,
        unreads: findMessages.filter((c) => c.isRead == false).length,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/read-all", async (req, res) => {
  try {
    const { tutorId } = req.body;
    const findTutor = await tutorModel.findById(tutorId);

    if (!findTutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    await tutorNotificationModel.updateMany(tutorId, { isRead: true });
    const notifications = await tutorNotificationModel.find({ tutorId });
    res.status(200).json({ status: "success", data: notifications });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.delete("/delete/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const findMessage = await tutorNotificationModel.findById(messageId);

    if (!findMessage) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday message topilmadi" });
    }
    await tutorNotificationModel.findByIdAndDelete(messageId);

    res
      .status(200)
      .json({ status: "success", message: "Message muaffaqiyatli ochirildi" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
