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
import { syncFaculties } from "../utils/syncFaculties.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/admin/faculty-admins/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    let query = {};
    if (q && typeof q === "string") {
      const safeQ = escapeRegex(q.trim());
      query = {
        $or: [
          { firstName: { $regex: safeQ, $options: "i" } },
          { lastName: { $regex: safeQ, $options: "i" } },
          { login: { $regex: safeQ, $options: "i" } },
          { "faculties.name": { $regex: safeQ, $options: "i" } },
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
    if (q && typeof q === "string") {
      const safeQ = escapeRegex(q.trim());
      query.$or = [
        { name: { $regex: safeQ, $options: "i" } },
        { login: { $regex: safeQ, $options: "i" } },
        { "group.name": { $regex: safeQ, $options: "i" } },
      ];
    }

    const findTutors = await tutorModel.find(query);
    res.status(200).json({ status: "success", data: findTutors });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        status: "error",
        message: "Login va parol majburiy",
      });
    }

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
      const { password: _, ...mainAdminData } = findMainAdmin.toObject();
      return res.status(200).json({
        status: "success",
        data: {
          ...mainAdminData,
          role: "mainAdmin",
        },
        token,
      });
    }

    const findFacultyAdmin = await facultyAdminModel.findOne({
      login: username,
    });

    if (findFacultyAdmin) {
      const comparePass = await bcrypt.compare(
        password,
        findFacultyAdmin.password
      );
      if (!comparePass) {
        return res.status(400).json({
          status: "error",
          message: "Parol noto'g'ri",
        });
      }

      const token = generateToken(findFacultyAdmin._id);
      const { password: _, ...adminData } = findFacultyAdmin.toObject();
      return res.status(200).json({
        status: "success",
        data: {
          ...adminData,
          role: "facultyAdmin",
        },
        token,
      });
    }

    return res.status(401).json({
      status: "error",
      message: "Login yoki parol noto'g'ri",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/admin/faculty-admins", authMiddleware, async (req, res) => {
  try {
    const facultyAdmins = await facultyAdminModel.find().select("-password");

    const formattedFacultyAdmins = facultyAdmins.map((admin) => ({
      _id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      fullName: `${admin.firstName} ${admin.lastName}`,
      login: admin.login,
      faculties: admin.faculties,
      role: admin.role,
      image: admin.image,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }));

    res.status(200).json({ status: "success", data: formattedFacultyAdmins });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.post("/admin/add-faculties", authMiddleware, async (req, res) => {
  try {
    const { facultyAdminId, faculties } = req.body;

    if (
      !facultyAdminId ||
      !Array.isArray(faculties) ||
      faculties.length === 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "Fakultet admin ID va fakultetlar majburiy",
      });
    }

    const facultyAdmin = await facultyAdminModel.findById(facultyAdminId);
    if (!facultyAdmin) {
      return res.status(404).json({
        status: "error",
        message: "Fakultet admin topilmadi",
      });
    }

    const existingFacultyNames = facultyAdmin.faculties.map((f) => f.name);
    const newFaculties = faculties.filter(
      (f) => !existingFacultyNames.includes(f.name)
    );

    if (newFaculties.length === 0) {
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

    res.status(200).json({
      status: "success",
      message: `${newFaculties.length} ta fakultet qo'shildi`,
      data: updatedFacultyAdmin,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.post("/admin/create-faculty-admin", authMiddleware, async (req, res) => {
  try {
    if (
      req.headers["content-type"] &&
      req.headers["content-type"].includes("multipart/form-data")
    ) {
      return uploadSingleImage(req, res, async (err) => {
        if (err) {
          return res.status(400).json({
            status: "error",
            message: "Fayl yuklashda xatolik",
          });
        }

        const { firstName, lastName, login, password, faculties } = req.body;

        if (!firstName || !lastName || !login || !password) {
          return res.status(400).json({
            status: "error",
            message: "Barcha maydonlarni to'ldiring",
          });
        }

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

        let imagePath = null;
        if (req.file) {
          imagePath = `/public/images/${req.file.filename}`;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const facultyAdmin = await facultyAdminModel.create({
          firstName,
          lastName,
          login,
          password: hashedPassword,
          faculties:
            typeof faculties === "string" ? JSON.parse(faculties) : faculties,
          image: imagePath,
        });

        const { password: _, ...adminData } = facultyAdmin.toObject();
        res.status(200).json({
          status: "success",
          message: "Fakultet admin muvaffaqiyatli yaratildi",
          data: adminData,
        });
      });
    } else {
      const { firstName, lastName, login, password, faculties } = req.body;

      if (!firstName || !lastName || !login || !password) {
        return res.status(400).json({
          status: "error",
          message: "Barcha maydonlarni to'ldiring",
        });
      }

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

      const hashedPassword = await bcrypt.hash(password, 10);
      const facultyAdmin = await facultyAdminModel.create({
        firstName,
        lastName,
        login,
        password: hashedPassword,
        faculties,
      });

      const { password: _, ...adminData } = facultyAdmin.toObject();
      res.status(200).json({
        status: "success",
        message: "Fakultet admin muvaffaqiyatli yaratildi",
        data: adminData,
      });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/admin/me", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    const mainAdmin = await adminModel.findById(userId).select("-password");
    if (mainAdmin) {
      return res.status(200).json({
        status: "success",
        data: {
          ...mainAdmin.toObject(),
          role: "mainAdmin",
        },
      });
    }

    const facultyAdmin = await facultyAdminModel.findById(userId).select("-password");
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
    res.status(500).json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

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

      if (password && password.trim()) {
        updateData.password = await bcrypt.hash(password.trim(), 10);
      }

      if (req.file) {
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

router.get("/admin/tutors", authMiddleware, async (req, res) => {
  try {
    const tutors = await tutorModel.find().select("-password");
    res.status(200).json({ status: "success", data: tutors });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

// Fakultetlarni HEMIS API dan sinxronlash
router.post("/admin/sync-faculties", authMiddleware, async (req, res) => {
  try {
    const result = await syncFaculties();
    res.status(200).json({
      status: "success",
      message: `Fakultetlar sinxronlandi: ${result.created} ta yangi, ${result.updated} ta yangilandi`,
      data: result,
    });
  } catch (error) {
    console.error("Faculty sync error:", error.message);
    res.status(500).json({
      status: "error",
      message: "Fakultetlarni sinxronlashda xatolik: " + error.message,
    });
  }
});

export default router;
