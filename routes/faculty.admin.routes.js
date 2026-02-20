// routes/faculty.admin.routes.js - Tuzatilgan versiya
import express from "express";
import facultyAdminModel from "../models/faculty.admin.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import tutorModel from "../models/tutor.model.js";
import StudentModel from "../models/student.model.js";
import FacultyModel from "../models/faculty.model.js";
import GroupModel from "../models/group.model.js";
import bcrypt from "bcrypt";
import AppartmentModel from "../models/appartment.model.js";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.get("/faculties-with-assignment", async (req, res) => {
  try {
    const faculties = await FacultyModel.find({ active: true })
      .select("name code")
      .sort({ name: 1 })
      .lean();

    const facultiesWithStatus = await Promise.all(
      faculties.map(async (faculty) => {
        const existingAdmin = await facultyAdminModel
          .findOne({ "faculties.name": faculty.name })
          .select("firstName lastName");

        return {
          name: faculty.name,
          code: faculty.code,
          isAssigned: !!existingAdmin,
          assignedToAdmin: existingAdmin
            ? {
                id: existingAdmin._id,
                name: `${existingAdmin.firstName} ${existingAdmin.lastName}`,
              }
            : null,
        };
      })
    );

    res.json({
      status: "success",
      data: facultiesWithStatus,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Fakultetlar ro'yxatini olish (name va code bilan)
router.get("/faculties-with-codes", async (req, res) => {
  try {
    const faculties = await FacultyModel.find({ active: true })
      .select("name code")
      .sort({ name: 1 })
      .lean();

    const facultiesWithAdmins = await Promise.all(
      faculties.map(async (faculty) => {
        const existingAdmin = await facultyAdminModel.findOne({
          "faculties.name": faculty.name,
        });

        return {
          name: faculty.name,
          code: faculty.code,
          isAssigned: !!existingAdmin,
          assignedToAdmin: existingAdmin
            ? {
                id: existingAdmin._id,
                name: `${existingAdmin.firstName} ${existingAdmin.lastName}`,
              }
            : null,
        };
      })
    );

    res.json({
      status: "success",
      data: facultiesWithAdmins,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Fakultet admin uchun guruhlarni olish (tutor assignment status bilan)
router.get("/groups-with-tutors", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    const facultyAdmin = await facultyAdminModel.findById(userId);
    if (!facultyAdmin) {
      return res.status(401).json({
        status: "error",
        message: "Bunday fakultet admin topilmadi",
      });
    }

    const facultyNames = facultyAdmin.faculties.map((f) => f.name);

    const allGroups = await GroupModel.find({ facultyName: { $in: facultyNames } })
      .sort({ name: 1 })
      .lean();

    const groupsWithTutors = await Promise.all(
      allGroups.map(async (group) => {
        const existingTutor = await tutorModel.findOne({
          "group.code": group.id.toString(),
        });

        return {
          id: group.id,
          name: group.name,
          educationLang: group.educationLang || { name: "O'zbek" },
          faculty: group.facultyName,
          facultyCode: group.facultyCode,
          isAssigned: !!existingTutor,
          assignedToTutor: existingTutor
            ? {
                id: existingTutor._id,
                name: existingTutor.name,
              }
            : null,
        };
      })
    );

    res.json({
      status: "success",
      data: groupsWithTutors,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Tutor yaratish - FormData va JSON handler
router.post("/tutor-create", authMiddleware, async (req, res) => {
  try {
    console.log("📡 Faculty admin tutor create request");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);

    const { userId } = req.userData;

    // Faculty admin tekshirish
    const findFacultyAdmin = await facultyAdminModel.findById(userId);
    if (!findFacultyAdmin) {
      return res.status(401).json({
        status: "error",
        message: "Siz fakultet admini emassiz",
      });
    }

    // Content-Type ni tekshirish
    const contentType = req.headers["content-type"];

    if (contentType && contentType.includes("multipart/form-data")) {
      // FormData handler
      return uploadSingleImage(req, res, async (err) => {
        if (err) {
          console.error("Multer error:", err);
          return res.status(400).json({
            status: "error",
            message: "Fayl yuklashda xatolik",
          });
        }

        const { login, name, phone, password, group } = req.body;

        // Validation
        if (
          !login?.trim() ||
          !name?.trim() ||
          !phone?.trim() ||
          !password?.trim()
        ) {
          return res.status(400).json({
            status: "error",
            message: "Iltimos, barcha majburiy maydonlarni to'liq kiriting",
          });
        }

        let parsedGroup;
        try {
          parsedGroup = typeof group === "string" ? JSON.parse(group) : group;
        } catch (error) {
          return res.status(400).json({
            status: "error",
            message: "Guruh ma'lumotlarida xatolik",
          });
        }

        if (!Array.isArray(parsedGroup) || parsedGroup.length === 0) {
          return res.status(400).json({
            status: "error",
            message: "Iltimos, tutorga kamida bitta guruh biriktiring",
          });
        }

        // Login unique check
        const existingTutor = await tutorModel.findOne({ login: login.trim() });
        if (existingTutor) {
          return res.status(400).json({
            status: "error",
            message: "Bu login allaqachon ishlatilgan",
          });
        }

        // Image path
        let imagePath =
          "https://static.vecteezy.com/system/resources/thumbnails/024/983/914/small/simple-user-default-icon-free-png.png";
        if (req.file) {
          imagePath = `/public/images/${req.file.filename}`;
        }

        const tutor = await tutorModel.create({
          login: login.trim(),
          name: name.trim(),
          phone: phone.trim(),
          password: password.trim(),
          group: parsedGroup,
          facultyAdmin: userId,
          image: imagePath,
        });

        res.status(200).json({
          status: "success",
          message: "Tutor muvaffaqiyatli yaratildi",
          data: tutor,
        });
      });
    } else {
      // JSON handler
      const { login, name, phone, password, group } = req.body;

      console.log("Processing JSON data:", {
        login,
        name,
        phone,
        password,
        group,
      });

      // Validation - har bir maydonni alohida tekshirish
      if (!login?.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Login maydoni bo'sh bo'lmasligi kerak",
        });
      }

      if (!name?.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Ism maydoni bo'sh bo'lmasligi kerak",
        });
      }

      if (!phone?.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Telefon raqami bo'sh bo'lmasligi kerak",
        });
      }

      if (!password?.trim()) {
        return res.status(400).json({
          status: "error",
          message: "Parol maydoni bo'sh bo'lmasligi kerak",
        });
      }

      if (!group || !Array.isArray(group) || group.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "Iltimos, tutorga kamida bitta guruh biriktiring",
        });
      }

      // Login unique check
      const existingTutor = await tutorModel.findOne({ login: login.trim() });
      if (existingTutor) {
        return res.status(400).json({
          status: "error",
          message: "Bu login allaqachon ishlatilgan",
        });
      }

      console.log("Creating tutor with data:", {
        login: login.trim(),
        name: name.trim(),
        phone: phone.trim(),
        password: password.trim(),
        group,
        facultyAdmin: userId,
      });

      const tutor = await tutorModel.create({
        login: login.trim(),
        name: name.trim(),
        phone: phone.trim(),
        password: password.trim(),
        group: group,
        facultyAdmin: userId,
        image:
          "https://static.vecteezy.com/system/resources/thumbnails/024/983/914/small/simple-user-default-icon-free-png.png",
      });

      console.log("Tutor created successfully:", tutor._id);

      res.status(200).json({
        status: "success",
        message: "Tutor muvaffaqiyatli yaratildi",
        data: tutor,
      });
    }
  } catch (error) {
    console.error("Faculty admin tutor create error:", error);
    res.status(500).json({
      status: "error",
      message: "Serverda xatolik yuz berdi: " + error.message,
    });
  }
});

// Tutor yangilash - rasm bilan
router.put(
  "/tutor/:id",
  authMiddleware,
  uploadSingleImage,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, login, phone, password } = req.body;

      const findTutor = await tutorModel.findById(id);
      if (!findTutor) {
        return res.status(400).json({
          status: "error",
          message: "Bunday tutor topilmadi",
        });
      }

      // Login unique ekanligini tekshirish
      if (login && login !== findTutor.login) {
        const existingTutor = await tutorModel.findOne({
          login,
          _id: { $ne: id },
        });

        if (existingTutor) {
          return res.status(400).json({
            status: "error",
            message: "Bu login allaqachon ishlatilgan",
          });
        }
      }

      const updateFields = {};
      if (name) updateFields.name = name;
      if (login) updateFields.login = login;
      if (phone) updateFields.phone = phone;
      if (password && password.trim()) updateFields.password = password.trim(); // Plain text

      // Image yangilash
      if (req.file) {
        // Eski rasmni o'chirish (default bo'lmasa)
        if (
          findTutor.image &&
          !findTutor.image.includes("default-icon") &&
          !findTutor.image.includes("vecteezy")
        ) {
          try {
            const oldPath = path.join(__dirname, "..", findTutor.image);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          } catch (err) {
            console.log("Eski rasmni o'chirishda xatolik:", err.message);
          }
        }
        updateFields.image = `/public/images/${req.file.filename}`;
      }

      const updatedTutor = await tutorModel.findByIdAndUpdate(
        id,
        { $set: updateFields },
        { new: true }
      );

      res.status(200).json({
        status: "success",
        message: "Tutor muvaffaqiyatli yangilandi",
        data: updatedTutor,
      });
    } catch (error) {
      console.error("Update tutor error:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  }
);

// Fakultet admin yaratish (faqat main admin)
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, login, password, faculties } = req.body;

    if (
      !firstName ||
      !lastName ||
      !login ||
      !password ||
      !Array.isArray(faculties) ||
      faculties.length === 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "Iltimos, barcha maydonlarni to'liq kiriting",
      });
    }

    // Login unique ekanligini tekshirish
    const existingFacultyAdmin = await facultyAdminModel.findOne({ login });
    if (existingFacultyAdmin) {
      return res.status(400).json({
        status: "error",
        message: "Bu login allaqachon ishlatilgan",
      });
    }

    const facultyAdmin = await facultyAdminModel.create({
      firstName,
      lastName,
      login,
      password, // Hash qilinmaydi
      faculties,
    });

    res.status(200).json({
      status: "success",
      message: "Fakultet admin muvaffaqiyatli yaratildi",
      data: facultyAdmin,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Barcha fakultet adminlarni olish (faqat main admin)
router.get("/list", authMiddleware, async (req, res) => {
  try {
    const facultyAdmins = await facultyAdminModel.find();
    res.status(200).json({ status: "success", data: facultyAdmins });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Fakultet admin profili (fakultet admin uchun)
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const findFacultyAdmin = await facultyAdminModel.findById(userId);

    if (!findFacultyAdmin) {
      return res.status(401).json({
        status: "error",
        message: "Bunday fakultet admin topilmadi",
      });
    }

    res.status(200).json({ status: "success", data: findFacultyAdmin });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Guruh qo'shish endpoint - URL ni to'g'irlash
router.post("/add-groups", authMiddleware, async (req, res) => {
  try {
    console.log("📡 /faculty-admin/add-groups endpoint called");
    console.log("Request body:", req.body);
    console.log("User data:", req.userData);

    const { tutorId, groups } = req.body;

    if (!tutorId || !Array.isArray(groups) || groups.length === 0) {
      console.log("❌ Validation failed");
      return res.status(400).json({
        status: "error",
        message: "Tutor ID va guruhlar majburiy",
      });
    }

    const tutor = await tutorModel.findById(tutorId);
    if (!tutor) {
      console.log("❌ Tutor not found");
      return res.status(404).json({
        status: "error",
        message: "Tutor topilmadi",
      });
    }

    console.log("✅ Tutor found:", tutor.name);

    // Yangi guruhlarni qo'shish
    const existingGroupCodes = tutor.group.map((g) => g.code || g.id);
    const newGroups = groups.filter(
      (g) => !existingGroupCodes.includes(g.code)
    );

    console.log("Existing group codes:", existingGroupCodes);
    console.log("New groups to add:", newGroups);

    if (newGroups.length === 0) {
      console.log("⚠️ No new groups to add");
      return res.status(400).json({
        status: "error",
        message: "Barcha guruhlar allaqachon qo'shilgan",
      });
    }

    const updatedTutor = await tutorModel.findByIdAndUpdate(
      tutorId,
      { $push: { group: { $each: newGroups } } },
      { new: true }
    );

    console.log("✅ Groups added successfully");

    res.status(200).json({
      status: "success",
      message: `${newGroups.length} ta guruh qo'shildi`,
      data: updatedTutor,
    });
  } catch (error) {
    console.error("❌ Error in add-groups:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Tutorlarni olish - password bilan
router.get("/my-tutors", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    const findFacultyAdmin = await facultyAdminModel.findById(userId);
    if (!findFacultyAdmin) {
      return res.status(401).json({
        status: "error",
        message: "Bunday fakultet admin topilmadi",
      });
    }

    // Password ham qaytariladi
    const findTutors = await tutorModel.find({
      facultyAdmin: userId,
    });

    res.status(200).json({
      status: "success",
      data: findTutors, // Password plain text ko'rinadi
    });
  } catch (error) {
    console.error("Get faculty admin tutors error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Fakultetlar ro'yxatini olish (Faculty modeldan)
router.get("/faculties", async (req, res) => {
  try {
    const faculties = await FacultyModel.find({ active: true })
      .select("name code")
      .sort({ name: 1 })
      .lean();

    res.json({ status: "success", data: faculties });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Fakultetga tegishli guruhlarni olish (Group modeldan)
router.get("/faculty-groups/:facultyName", async (req, res) => {
  try {
    const { facultyName } = req.params;

    const groups = await GroupModel.find({ facultyName: facultyName })
      .select("id name educationLang")
      .sort({ name: 1 })
      .lean();

    res.json({ status: "success", data: groups });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
