// chat.routes.js - Socket.IO (tutor) + Firebase (student) hybrid versiya
import express from "express";
import chatModel from "../models/chat.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import tutorModel from "../models/tutor.model.js";
import firebaseHelper from "../utils/firebase.helper.js";

const router = express.Router();

// STUDENT UCHUN: Firebase dan xabarlarni olish
router.get("/messages/firebase/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit = 50 } = req.query;

    // Firebase dan xabarlarni olish
    const result = await firebaseHelper.getGroupMessages(
      groupId,
      parseInt(limit)
    );

    if (result.success) {
      res.status(200).json({
        status: "success",
        data: result.data,
        source: "firebase",
      });
    } else {
      res.status(400).json({
        status: "error",
        message: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// STUDENT UCHUN: Guruhga qo'shilish (Firebase da ro'yxatdan o'tkazish)
router.post("/messages/join-firebase", authMiddleware, async (req, res) => {
  try {
    const { studentId, groupId } = req.body;

    if (!studentId || !groupId) {
      return res.status(400).json({
        status: "error",
        message: "studentId va groupId majburiy",
      });
    }

    // Firebase da ro'yxatdan o'tkazish
    const result = await firebaseHelper.registerStudentToGroup(
      studentId,
      groupId
    );

    if (result.success) {
      res.status(200).json({
        status: "success",
        message: "Firebase da guruhga qo'shildingiz",
      });
    } else {
      res.status(400).json({
        status: "error",
        message: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// ESKI ENDPOINTLAR (backward compatibility)
router.get("/messages/all", authMiddleware, async (req, res) => {
  try {
    const findAllMessages = await chatModel.find();
    res.status(200).json({ status: "success", data: findAllMessages });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/messages/my-messages/:id", authMiddleware, async (req, res) => {
  try {
    const findTutor = await tutorModel.findById(req.params.id);
    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "bunday tutor topilmadi" });
    }

    const messages = await chatModel.find({ tutorId: req.params.id });
    res.status(200).json({ status: "success", data: messages });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/messages/by-group/:id", authMiddleware, async (req, res) => {
  try {
    const findMessages = await chatModel
      .find({
        "groups.id": parseInt(req.params.id),
      })
      .select("-groups");
    res.json({ status: "success", data: findMessages });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.delete(
  "/messages/delete-all/:tutorId",
  authMiddleware,
  async (req, res) => {
    try {
      const { tutorId } = req.params;

      // MongoDB dan o'chirish
      await chatModel.deleteMany({ tutorId: tutorId });

      // TODO: Firebase dan ham o'chirish kerak bo'lsa

      res.status(200).json({
        status: "success",
        message: "Messagelar muaffaqiyatli ochirildi",
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.put("/messages/edit-message", authMiddleware, async (req, res) => {
  try {
    const { message, messageId } = req.body;

    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "Iltimos malumotlarni toliq kiriting",
      });
    }

    const editMessage = await chatModel.findByIdAndUpdate(
      messageId,
      { message },
      { new: true }
    );

    if (!editMessage) {
      return res.status(400).json({
        status: "error",
        message: "Bunday message topilmadi",
      });
    }

    res.status(200).json({ status: "success", data: editMessage });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.delete("/messages/delete/:groupId", authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.userData;

    const findTutor = await tutorModel.findById(userId);

    if (!findTutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const findGroup = findTutor.group.find(
      (c) => String(c.code) === String(groupId)
    );

    if (!findGroup) {
      return res.status(400).json({
        status: "error",
        message: "Sizda bunday guruh malumoti topilmadi",
      });
    }

    // MongoDB dan o'chirish
    const findGroupMessages = await chatModel.find({
      "groups.id": Number(groupId),
    });

    if (!findGroupMessages.length) {
      return res.status(404).json({
        status: "error",
        message: "Bu guruh uchun xabarlar topilmadi",
      });
    }

    await chatModel.deleteMany({ "groups.id": Number(groupId) });

    // Firebase dan ham o'chirish
    await firebaseHelper.clearGroupMessages(groupId);

    return res.json({
      status: "success",
      message: "Xabarlar muvaffaqiyatli o'chirildi",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: "error", message: "Server xatosi" });
  }
});

export default router;
