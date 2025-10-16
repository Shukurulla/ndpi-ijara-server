import express from "express";
import districtsModel from "../models/districts.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import { loadDistrictsFromExcel } from "../utils/loadDistricts.js";

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

// IMPORTANT: This must come BEFORE /district/:region to avoid matching "regions" as a parameter
router.get("/district/regions", async (req, res) => {
  try {
    console.log("🔍 Fetching regions from /district/regions...");
    const allDistricts = await districtsModel.find().select("region");
    console.log("📊 Total districts found:", allDistricts.length);
    const regions = [...new Set(allDistricts.map((d) => d.region))].filter(
      (r) => r
    );
    console.log("✅ Unique regions:", regions);
    res.status(200).json({ status: "success", data: regions });
  } catch (error) {
    console.error("❌ Error fetching regions:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Alternative endpoint without /district prefix
router.get("/regions", async (req, res) => {
  try {
    console.log("🔍 Fetching regions from /regions...");
    const allDistricts = await districtsModel.find().select("region");
    console.log("📊 Total districts found:", allDistricts.length);
    const regions = [...new Set(allDistricts.map((d) => d.region))].filter(
      (r) => r
    );
    console.log("✅ Unique regions:", regions);
    res.status(200).json({ status: "success", data: regions });
  } catch (error) {
    console.error("❌ Error fetching regions:", error);
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

router.put("/district/:id", authMiddleware, async (req, res) => {
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
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.delete("/district/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const findDistrict = await districtsModel.findById(id);

    if (!findDistrict) {
      return res
        .status(404)
        .json({ status: "error", message: "Bunday mahalla topilmadi" });
    }

    await districtsModel.findByIdAndDelete(id);
    res.status(200).json({
      status: "success",
      message: "Mahalla muvaffaqiyatli o'chirildi",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/district/load-from-excel", authMiddleware, async (req, res) => {
  try {
    const result = await loadDistrictsFromExcel();

    if (result.success) {
      res.status(200).json({ status: "success", data: result });
    } else {
      res.status(500).json({ status: "error", message: result.message });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});
router.get("/district/load-from-excel", async (req, res) => {
  try {
    const result = await loadDistrictsFromExcel();

    if (result.success) {
      res.status(200).json({ status: "success", data: result });
    } else {
      res.status(500).json({ status: "error", message: result.message });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
