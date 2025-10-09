import express from "express";
import districtsModel from "../models/districts.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/district", authMiddleware, async (req, res) => {
  try {
    const { name, region } = req.body;

    if (!name || !region) {
      return res.status(400).json({
        status: "error",
        message: "Iltimos kerakli maydonlarni to'liq kiriting!!!",
      });
    }

    const createDistrict = await districtsModel.create({ name, region });

    res.status(200).json({ status: "success", data: createDistrict });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/district/all", async (req, res) => {
  try {
    const findAllDistricts = await districtsModel.find();
    res.status(200).json({ status: "success", data: findAllDistricts });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/district/:region", async (req, res) => {
  try {
    const { region } = req.params;

    const findByRegion = await districtsModel.find({ region });

    res.status(200).json({ status: "success", data: findByRegion });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.put("/district/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const findDistrict = await districtsModel.findById(id);
    if (!findDistrict) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday mahalla topilmadi" });
    }

    const editedDistrict = await districtsModel.findByIdAndUpdate(
      id,
      {
        $set: req.body,
      },
      { new: true }
    );
    res.status(200).json({ status: "success", data: editedDistrict });
  } catch (error) {
    res.status(500).json({ staus });
  }
});

export default router;
