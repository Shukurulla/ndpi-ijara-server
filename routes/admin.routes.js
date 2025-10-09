// routes/admin.routes.js (yangilangan qism)
import express from "express";
import adminModel from "../models/admin.model.js";
import facultyAdminModel from "../models/faculty.admin.model.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/token.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import tutorModel from "../models/tutor.model.js";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.get("/admin/faculty-admins/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query; // search query

    let query = {};
    if (q) {
      query = {
        $or: [
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
          { login: { $regex: q, $options: "i" } },
          { "faculties.name": { $regex: q, $options: "i" } },
        ],
      };
    }

    const facultyAdmins = await facultyAdminModel
      .find(query)
      .select("-password");

    const formattedFacultyAdmins = facultyAdmins.map((admin) => ({
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`,
      login: admin.login,
      faculties: admin.faculties,
      role: admin.role,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }));

    res.status(200).json({ status: "success", data: formattedFacultyAdmins });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/admin/sign", async (req, res) => {
  try {
    await adminModel.deleteMany();
    const hashPassword = await bcrypt.hash(req.body.password, 10);
    const admin = await adminModel.create({
      ...req.body,
      password: hashPassword,
    });

    res.status(200).json({ status: "success", data: admin });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Faculty admin uchun tutorlarni search qilish
router.get("/faculty-admin/tutors/search", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const { q } = req.query;

    const findFacultyAdmin = await facultyAdminModel.findById(userId);
    if (!findFacultyAdmin) {
      return res.status(401).json({
        status: "error",
        message: "Bunday fakultet admin topilmadi",
      });
    }

    let query = { facultyAdmin: userId };
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { login: { $regex: q, $options: "i" } },
        { "group.name": { $regex: q, $options: "i" } },
      ];
    }

    const findTutors = await tutorModel.find(query);
    res.status(200).json({ status: "success", data: findTutors });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Yangilangan login tizimi
router.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: "error",
        message: "Login va parol majburiy",
      });
    }

    // Avval main adminni tekshirish
    const findMainAdmin = await adminModel.findOne({ username });

    if (findMainAdmin) {
      const comparePassword = await bcrypt.compare(
        password,
        findMainAdmin.password
      );
      if (!comparePassword) {
        return res.status(400).json({
          status: "error",
          message: "Parol noto'g'ri",
        });
      }

      const token = generateToken(findMainAdmin._id);
      return res.status(200).json({
        status: "success",
        data: {
          ...findMainAdmin.toObject(),
          role: "mainAdmin",
        },
        token,
      });
    }

    // Agar main admin topilmasa, fakultet adminni tekshirish
    const findFacultyAdmin = await facultyAdminModel.findOne({
      login: username,
    });

    if (findFacultyAdmin) {
      // Faculty admin uchun parol hash qilinmagan
      if (password !== findFacultyAdmin.password) {
        return res.status(400).json({
          status: "error",
          message: "Parol noto'g'ri",
        });
      }

      const token = generateToken(findFacultyAdmin._id);
      return res.status(200).json({
        status: "success",
        data: {
          ...findFacultyAdmin.toObject(),
          role: "facultyAdmin",
        },
        token,
      });
    }

    // Hech kim topilmasa
    return res.status(401).json({
      status: "error",
      message: "Login yoki parol noto'g'ri",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/admin/faculty-admins", authMiddleware, async (req, res) => {
  try {
    // Password ham qaytariladi (hash qilinmagan)
    const facultyAdmins = await facultyAdminModel.find();

    const formattedFacultyAdmins = facultyAdmins.map((admin) => ({
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`,
      login: admin.login,
      password: admin.password, // Plain text password qaytariladi
      faculties: admin.faculties,
      role: admin.role,
      image: admin.image,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }));

    res.status(200).json({ status: "success", data: formattedFacultyAdmins });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/admin/add-faculties", authMiddleware, async (req, res) => {
  try {
    console.log("📡 /admin/add-faculties endpoint called");
    console.log("Request body:", req.body);
    console.log("User data:", req.userData);

    const { facultyAdminId, faculties } = req.body;

    if (
      !facultyAdminId ||
      !Array.isArray(faculties) ||
      faculties.length === 0
    ) {
      console.log("❌ Validation failed");
      return res.status(400).json({
        status: "error",
        message: "Fakultet admin ID va fakultetlar majburiy",
      });
    }

    const facultyAdmin = await facultyAdminModel.findById(facultyAdminId);
    if (!facultyAdmin) {
      console.log("❌ Faculty admin not found");
      return res.status(404).json({
        status: "error",
        message: "Fakultet admin topilmadi",
      });
    }

    console.log(
      "✅ Faculty admin found:",
      facultyAdmin.firstName,
      facultyAdmin.lastName
    );

    // Yangi fakultetlarni qo'shish
    const existingFacultyNames = facultyAdmin.faculties.map((f) => f.name);
    const newFaculties = faculties.filter(
      (f) => !existingFacultyNames.includes(f.name)
    );

    console.log("Existing faculties:", existingFacultyNames);
    console.log("New faculties to add:", newFaculties);

    if (newFaculties.length === 0) {
      console.log("⚠️ No new faculties to add");
      return res.status(400).json({
        status: "error",
        message: "Barcha fakultetlar allaqachon qo'shilgan",
      });
    }

    const updatedFacultyAdmin = await facultyAdminModel.findByIdAndUpdate(
      facultyAdminId,
      { $push: { faculties: { $each: newFaculties } } },
      { new: true }
    );

    console.log("✅ Faculties added successfully");

    res.status(200).json({
      status: "success",
      message: `${newFaculties.length} ta fakultet qo'shildi`,
      data: updatedFacultyAdmin,
    });
  } catch (error) {
    console.error("❌ Error in add-faculties:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Fakultet admin yaratish (main admin uchun) - JSON va FormData uchun
router.post("/admin/create-faculty-admin", authMiddleware, async (req, res) => {
  try {
    console.log("📡 Create faculty admin request received");
    console.log("Content-Type:", req.headers["content-type"]);
    console.log("Body:", req.body);

    // Agar FormData bo'lsa, multer middleware ishlatamiz
    if (
      req.headers["content-type"] &&
      req.headers["content-type"].includes("multipart/form-data")
    ) {
      // FormData handler
      return uploadSingleImage(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({
            status: "error",
            message: "Fayl yuklashda xatolik",
          });
        }

        const { firstName, lastName, login, password, faculties } = req.body;

        // Login unique ekanligini tekshirish
        const [existingAdmin, existingFacultyAdmin] = await Promise.all([
          adminModel.findOne({ username: login }),
          facultyAdminModel.findOne({ login }),
        ]);

        if (existingAdmin || existingFacultyAdmin) {
          return res.status(400).json({
            status: "error",
            message: "Bu login allaqachon ishlatilgan",
          });
        }

        // Rasm yo'lini sozlash
        let imagePath = null;
        if (req.file) {
          imagePath = `/public/images/${req.file.filename}`;
        }

        // Password hash qilinmaydi - plain text sifatida saqlanadi
        const facultyAdmin = await facultyAdminModel.create({
          firstName,
          lastName,
          login,
          password, // Plain text
          faculties:
            typeof faculties === "string" ? JSON.parse(faculties) : faculties,
          image: imagePath,
        });

        res.status(200).json({
          status: "success",
          message: "Fakultet admin muvaffaqiyatli yaratildi",
          data: facultyAdmin,
        });
      });
    } else {
      // JSON handler
      const { firstName, lastName, login, password, faculties } = req.body;

      // Login unique ekanligini tekshirish
      const [existingAdmin, existingFacultyAdmin] = await Promise.all([
        adminModel.findOne({ username: login }),
        facultyAdminModel.findOne({ login }),
      ]);

      if (existingAdmin || existingFacultyAdmin) {
        return res.status(400).json({
          status: "error",
          message: "Bu login allaqachon ishlatilgan",
        });
      }

      // Password hash qilinmaydi - plain text sifatida saqlanadi
      const facultyAdmin = await facultyAdminModel.create({
        firstName,
        lastName,
        login,
        password, // Plain text
        faculties,
      });

      res.status(200).json({
        status: "success",
        message: "Fakultet admin muvaffaqiyatli yaratildi",
        data: facultyAdmin,
      });
    }
  } catch (error) {
    console.error("Create faculty admin error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// User info endpoint (role asosida)
router.get("/admin/me", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    // Avval main adminni tekshirish
    const mainAdmin = await adminModel.findById(userId);
    if (mainAdmin) {
      return res.status(200).json({
        status: "success",
        data: {
          ...mainAdmin.toObject(),
          role: "mainAdmin",
        },
      });
    }

    // Fakultet adminni tekshirish
    const facultyAdmin = await facultyAdminModel.findById(userId);
    if (facultyAdmin) {
      return res.status(200).json({
        status: "success",
        data: {
          ...facultyAdmin.toObject(),
          role: "facultyAdmin",
        },
      });
    }

    return res.status(404).json({
      status: "error",
      message: "Foydalanuvchi topilmadi",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Fakultet admin yangilash - rasm bilan
router.put(
  "/admin/faculty-admin/:id",
  authMiddleware,
  uploadSingleImage,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { firstName, lastName, login, password } = req.body;

      if (!firstName || !lastName || !login) {
        return res.status(400).json({
          status: "error",
          message: "Iltimos, barcha majburiy maydonlarni to'liq kiriting",
        });
      }

      // Login unique ekanligini tekshirish
      const existingFacultyAdmin = await facultyAdminModel.findOne({
        login,
        _id: { $ne: id },
      });

      if (existingFacultyAdmin) {
        return res.status(400).json({
          status: "error",
          message: "Bu login allaqachon ishlatilgan",
        });
      }

      const findFacultyAdmin = await facultyAdminModel.findById(id);
      if (!findFacultyAdmin) {
        return res.status(404).json({
          status: "error",
          message: "Fakultet admin topilmadi",
        });
      }

      const updateData = {
        firstName,
        lastName,
        login,
      };

      // Password berilgan bo'lsa, plain text sifatida saqlash
      if (password && password.trim()) {
        updateData.password = password.trim();
      }

      // Image yangilash
      if (req.file) {
        // Eski rasmni o'chirish (default bo'lmasa)
        if (
          findFacultyAdmin.image &&
          !findFacultyAdmin.image.includes("default-icon") &&
          !findFacultyAdmin.image.includes("vecteezy")
        ) {
          try {
            const oldPath = path.join(__dirname, "..", findFacultyAdmin.image);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          } catch (err) {
            console.log("Eski rasmni o'chirishda xatolik:", err.message);
          }
        }
        updateData.image = `/public/images/${req.file.filename}`;
      }

      const updatedFacultyAdmin = await facultyAdminModel.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      );

      res.status(200).json({
        status: "success",
        message: "Fakultet admin muvaffaqiyatli yangilandi",
        data: updatedFacultyAdmin,
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

// Fakultetni fakultet admindan o'chirish
router.delete("/admin/remove-faculty", authMiddleware, async (req, res) => {
  try {
    const { facultyAdminId, facultyName } = req.body;

    if (!facultyAdminId || !facultyName) {
      return res.status(400).json({
        status: "error",
        message: "Fakultet admin ID va fakultet nomi majburiy",
      });
    }

    const facultyAdmin = await facultyAdminModel.findById(facultyAdminId);
    if (!facultyAdmin) {
      return res.status(404).json({
        status: "error",
        message: "Fakultet admin topilmadi",
      });
    }

    // Fakultetni ro'yxatdan o'chirish
    const updatedFaculties = facultyAdmin.faculties.filter(
      (faculty) => faculty.name !== facultyName
    );

    await facultyAdminModel.findByIdAndUpdate(
      facultyAdminId,
      { $set: { faculties: updatedFaculties } },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      message: "Fakultet muvaffaqiyatli o'chirildi",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/admin/tutors", async (req, res) => {
  try {
    const tutors = await tutorModel.find();
    res.status(200).json({ status: "success", data: tutors });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
