import express from "express";
import StatusServer from "../models/statusServer.model.js";

const router = express.Router();

router.get("/status", async (req, res) => {
  try {
    let statusRecord = await StatusServer.findOne();

    res.status(200).json({
      success: true,
      data: statusRecord,
    });
  } catch (error) {
    console.error("❌ Server statusini olishda xato:", error.message);
    res.status(500).json({
      success: false,
      message: "Server statusini olishda xato yuz berdi",
    });
  }
});

export default router;
