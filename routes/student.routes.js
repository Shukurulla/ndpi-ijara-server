import express from "express";
import tutorModel from "../models/tutor.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import adminModel from "../models/admin.model.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/token.js";
import StudentModel from "../models/student.model.js";
import AppartmentModel from "../models/appartment.model.js";
import permissionModel from "../models/permission.model.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";
import axios from "axios";
import GroupModel from "../models/group.model.js";

const router = express.Router();

const HEMIS_API_URL = process.env.HEMIS_API_URL || "https://student.ndpi.uz/rest/v1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.post("/student/sign", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        status: "error",
        message: "Login va parol kiritish majburiy",
      });
    }

    let hemisResponse;
    try {
      hemisResponse = await axios.post(
        `${HEMIS_API_URL}/auth/login`,
        {
          login: login.toString(),
          password: password.toString(),
        },
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      if (!hemisResponse.data?.success) {
        return res.status(401).json({
          status: "error",
          message: "Login yoki parol noto'g'ri",
          hemisError: true,
        });
      }
    } catch (hemisError) {
      if (
        hemisError.response?.status === 401 ||
        hemisError.response?.status === 400
      ) {
        return res.status(401).json({
          status: "error",
          message: "Login yoki parol noto'g'ri",
          hemisError: true,
        });
      }

      if (
        hemisError.code === "ECONNABORTED" ||
        hemisError.code === "ETIMEDOUT"
      ) {
        return res.status(503).json({
          status: "error",
          message: "HEMIS serveriga ulanib bo'lmadi. Keyinroq urinib ko'ring",
          hemisTimeout: true,
        });
      }

      return res.status(500).json({
        status: "error",
        message: "HEMIS tizimida xatolik. Keyinroq urinib ko'ring",
        hemisServiceError: true,
      });
    }

    const students = await StudentModel.aggregate([
      {
        $addFields: {
          studentIdString: {
            $toString: "$student_id_number",
          },
        },
      },
      {
        $match: {
          studentIdString: login.toString(),
        },
      },
      {
        $limit: 1,
      },
    ]);

    let findStudent = students[0] || null;

    if (!findStudent) {
      findStudent = await StudentModel.findOne({
        $or: [
          { student_id_number: login },
          { student_id_number: parseInt(login) },
          { student_id_number: login.toString() },
        ],
      }).lean();
    }

    if (!findStudent) {
      if (hemisResponse?.data?.data) {
        const hemisStudentData = hemisResponse.data.data;

        return res.status(200).json({
          status: "success",
          message: "Student HEMIS da mavjud, lekin local bazada topilmadi",
          student: {
            student_id_number: login,
            full_name: hemisStudentData.full_name || "Noma'lum",
            fromHemis: true,
            existAppartment: false,
          },
          hemisData: hemisStudentData,
          token: null,
          needsSync: true,
        });
      }

      return res.status(404).json({
        status: "error",
        message: "Student local bazada topilmadi. Admin bilan bog'laning",
        hemisAuthenticated: true,
        localNotFound: true,
      });
    }

    let existAppartment = false;
    try {
      const apartment = await AppartmentModel.findOne({
        studentId: findStudent._id,
      }).lean();
      existAppartment = !!apartment;
    } catch (_) {
    }

    const token = generateToken(findStudent._id);

    return res.status(200).json({
      status: "success",
      message: "Muvaffaqiyatli kirish",
      student: {
        ...findStudent,
        existAppartment,
      },
      token,
      hemisAuthenticated: true,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Serverda xatolik yuz berdi",
    });
  }
});

router.post("/student/sign-hemis", async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        status: "error",
        message: "Login va parol kiritish majburiy",
      });
    }

    let hemisResponse;
    try {
      hemisResponse = await axios.post(
        `${HEMIS_API_URL}/auth/login`,
        {
          login: login.toString(),
          password: password.toString(),
        },
        {
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      if (!hemisResponse.data?.success) {
        return res.status(401).json({
          status: "error",
          message: "Login yoki parol noto'g'ri",
          hemisError: true,
        });
      }
    } catch (hemisError) {
      if (
        hemisError.response?.status === 401 ||
        hemisError.response?.status === 400
      ) {
        return res.status(401).json({
          status: "error",
          message: "Login yoki parol noto'g'ri",
          hemisError: true,
        });
      }

      if (
        hemisError.code === "ECONNABORTED" ||
        hemisError.code === "ETIMEDOUT"
      ) {
        return res.status(503).json({
          status: "error",
          message: "HEMIS serveriga ulanib bo'lmadi. Keyinroq urinib ko'ring",
          hemisTimeout: true,
        });
      }

      return res.status(500).json({
        status: "error",
        message: "HEMIS tizimida xatolik. Keyinroq urinib ko'ring",
        hemisServiceError: true,
      });
    }

    const hemisToken = hemisResponse.data?.data?.token;
    if (!hemisToken) {
      return res.status(500).json({
        status: "error",
        message: "HEMIS dan token olinmadi",
      });
    }

    let hemisData;
    try {
      const studentInfo = await axios.get(
        `${HEMIS_API_URL}/account/me`,
        {
          timeout: 10000,
          headers: {
            Authorization: `Bearer ${hemisToken}`,
            Accept: "application/json",
          },
        },
      );
      hemisData = studentInfo.data?.data || studentInfo.data;
    } catch (infoError) {
      return res.status(500).json({
        status: "error",
        message: "HEMIS dan student ma'lumotlarini olishda xatolik",
      });
    }

    if (!hemisData?.student_id_number) {
      return res.status(500).json({
        status: "error",
        message: "HEMIS dan student ID olinmadi",
      });
    }

    const studentIdNumber = hemisData.student_id_number;
    let findStudent = await StudentModel.findOne({
      $or: [
        { student_id_number: studentIdNumber },
        { student_id_number: parseInt(studentIdNumber) },
        { student_id_number: studentIdNumber.toString() },
      ],
    });

    const updateFields = {
      id: hemisData.id,
      full_name: hemisData.full_name,
      short_name: hemisData.short_name,
      first_name: hemisData.first_name,
      second_name: hemisData.second_name,
      third_name: hemisData.third_name,
      student_id_number: parseInt(studentIdNumber) || studentIdNumber,
      image: hemisData.image,
      birth_date: hemisData.birth_date,
      gender: hemisData.gender,
      university:
        typeof hemisData.university === "string"
          ? { name: hemisData.university }
          : hemisData.university,
      avg_gpa: hemisData.avg_gpa
        ? parseFloat(hemisData.avg_gpa)
        : undefined,
      specialty: hemisData.specialty
        ? { id: String(hemisData.specialty.id), code: hemisData.specialty.code, name: hemisData.specialty.name }
        : undefined,
      group: hemisData.group
        ? { id: String(hemisData.group.id), name: hemisData.group.name, educationLang: hemisData.group.educationLang }
        : undefined,
      department: hemisData.faculty
        ? {
            id: String(hemisData.faculty.id),
            name: hemisData.faculty.name,
            code: hemisData.faculty.code,
            structureType: hemisData.faculty.structureType,
            localityType: hemisData.faculty.localityType,
            parent: hemisData.faculty.parent,
            active: hemisData.faculty.active,
          }
        : undefined,
      level: hemisData.level,
      semester: hemisData.semester
        ? { id: String(hemisData.semester.id), code: hemisData.semester.code, name: hemisData.semester.name }
        : undefined,
      educationYear: hemisData.semester?.education_year
        ? {
            code: hemisData.semester.education_year.code,
            name: hemisData.semester.education_year.name,
            current: hemisData.semester.education_year.current,
          }
        : undefined,
      educationForm: hemisData.educationForm,
      educationType: hemisData.educationType,
      paymentForm: hemisData.paymentForm,
      studentStatus: hemisData.studentStatus,
      socialCategory: hemisData.socialCategory,
      accommodation: hemisData.accommodation,
      country: hemisData.country,
      province: hemisData.province,
      district: hemisData.district,
      hash: hemisData.hash,
      validateUrl: hemisData.validateUrl,
      updated_at: Date.now(),
    };

    if (findStudent) {
      findStudent = await StudentModel.findByIdAndUpdate(
        findStudent._id,
        { $set: updateFields },
        { new: true },
      ).lean();
    } else {
      findStudent = await StudentModel.create({
        ...updateFields,
        created_at: Date.now(),
      });
      findStudent = findStudent.toObject();
    }

    // Guruhni Group modeliga saqlash
    if (hemisData.group && hemisData.group.id) {
      try {
        await GroupModel.updateOne(
          { id: String(hemisData.group.id) },
          {
            $set: {
              id: String(hemisData.group.id),
              name: hemisData.group.name,
              educationLang: hemisData.group.educationLang,
              facultyName: hemisData.faculty?.name || null,
              facultyCode: hemisData.faculty?.code || null,
            },
          },
          { upsert: true }
        );
      } catch (groupError) {
        console.error("Group upsert error:", groupError.message);
      }
    }

    let existAppartment = false;
    try {
      const apartment = await AppartmentModel.findOne({
        studentId: findStudent._id,
      }).lean();
      existAppartment = !!apartment;
    } catch (_) {}

    const token = generateToken(findStudent._id);

    return res.status(200).json({
      status: "success",
      message: "Muvaffaqiyatli kirish",
      student: {
        ...findStudent,
        existAppartment,
      },
      token,
      hemisAuthenticated: true,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Serverda xatolik yuz berdi",
    });
  }
});

router.get("/student/existAppartment", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    if (!userId) {
      return res.status(400).json({
        status: "error",
        message: "Foydalanuvchi ID topilmadi",
      });
    }

    const findAppartment = await AppartmentModel.findOne({
      studentId: userId,
    });

    res.status(200).json({
      status: "success",
      exist: !!findAppartment,
      apartmentId: findAppartment?._id || null,
    });
  } catch (error) {
    console.error("Error checking apartment existence:", error);
    res.status(500).json({
      status: "error",
      message: "Ijara ma'lumotlarini tekshirishda xatolik",
    });
  }
});

router.get("/student/notification/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const findStudent = await StudentModel.findById(id);
    if (!findStudent) {
      return res.status(404).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }

    const appartments = await AppartmentModel.find({
      studentId: id,
      view: false,
    }).sort({ createdAt: -1 });

    const notifications = appartments
      .filter((c) => c.status !== "Being checked")
      .map((item) => ({
        status: item.status,
        apartmentId: item._id,
        createdAt: item.createdAt,
      }));

    res.status(200).json({
      status: "success",
      data: notifications,
      total: notifications.length,
    });
  } catch (error) {
    console.error("Error getting student notifications:", error);
    res.status(500).json({
      status: "error",
      message: "Notificationlarni olishda xatolik",
    });
  }
});

router.get("/student/profile", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    const findStudent = await StudentModel.findById(userId).select(
      "gender province image full_name first_name second_name student_id_number group level department",
    );

    if (!findStudent) {
      return res.status(404).json({
        status: "error",
        message: "Bunday student topilmadi",
      });
    }

    const profileData = {
      id: findStudent._id,
      fullName: findStudent.full_name,
      firstName: findStudent.first_name,
      secondName: findStudent.second_name,
      studentIdNumber: findStudent.student_id_number,
      gender: findStudent.gender,
      province: findStudent.province?.name || "Noma'lum",
      image: findStudent.image || null,
      group: findStudent.group?.name || "Noma'lum",
      level: findStudent.level?.name || "Noma'lum",
      department: findStudent.department?.name || "Noma'lum",
      groupId: findStudent.group.id,
    };

    res.status(200).json({
      status: "success",
      data: profileData,
    });
  } catch (error) {
    console.error("Error getting student profile:", error);
    res.status(500).json({
      status: "error",
      message: "Profil ma'lumotlarini olishda xatolik",
    });
  }
});

router.put(
  "/tutor/profile",
  authMiddleware,
  uploadSingleImage,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      const findTutor = await tutorModel.findById(userId);

      if (!findTutor) {
        return res.status(404).json({
          status: "error",
          message: "Bunday tutor topilmadi",
        });
      }

      const updateFields = {};
      const { login, name, phone, group } = req.body;

      if (login) updateFields.login = login;
      if (name) updateFields.name = name;
      if (phone) updateFields.phone = phone;
      if (group) updateFields.group = JSON.parse(group);

      if (req.file) {
        updateFields.image = `/public/images/${req.file.filename}`;

        if (findTutor.image && !findTutor.image.includes("default-icon")) {
          const oldImagePath = path.join(
            __dirname,
            "../public/images",
            findTutor.image.split("/public/images/")[1],
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }

      const updatedTutor = await tutorModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true },
      );

      res.status(200).json({
        status: "success",
        message: "Tutor profili yangilandi",
        tutor: updatedTutor,
      });
    } catch (error) {
      console.error("Tutor profile update error:", error);
      res.status(500).json({
        status: "error",
        message: "Tutor profilini yangilashda xatolik",
      });
    }
  },
);

router.get("/student/find/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const findStudent = await StudentModel.find({
      student_id_number: id,
    }).select(
      "full_name first_name second_name student_id_number group level image",
    );

    if (!findStudent.length) {
      return res.status(404).json({
        status: "error",
        message: "Bunday student topilmadi",
        data: [],
      });
    }

    res.status(200).json({
      status: "success",
      data: findStudent,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Student qidirishda xatolik",
    });
  }
});

router.put(
  "/student/profile",
  authMiddleware,
  uploadSingleImage,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      const findStudent = await StudentModel.findById(userId);

      if (!findStudent) {
        return res.status(404).json({
          status: "error",
          message: "Bunday student topilmadi",
        });
      }

      const updateFields = {};
      const { roommate_count, other } = req.body;

      if (roommate_count !== undefined)
        updateFields.roommate_count = roommate_count;
      if (other !== undefined) updateFields.other = other;
      updateFields.updated_at = Date.now();

      if (req.file) {
        updateFields.image = `/public/images/${req.file.filename}`;

        if (findStudent.image && !findStudent.image.includes("default-icon")) {
          const oldImagePath = path.join(
            __dirname,
            "../public/images",
            findStudent.image.split("/public/images/")[1],
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }

      const updatedStudent = await StudentModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true, runValidators: false },
      );

      res.status(200).json({
        status: "success",
        message: "Student profili yangilandi",
        student: updatedStudent,
      });
    } catch (error) {
      console.error("Student profile update error:", error);
      res.status(500).json({
        status: "error",
        message: "Student profilini yangilashda xatolik",
      });
    }
  },
);

router.get("/students/stats", authMiddleware, async (req, res) => {
  try {
    const totalStudents = await StudentModel.countDocuments();
    const studentsWithApartments =
      await AppartmentModel.distinct("studentId").length;

    const genderStats = await StudentModel.aggregate([
      {
        $group: {
          _id: "$gender.name",
          count: { $sum: 1 },
        },
      },
    ]);

    const levelStats = await StudentModel.aggregate([
      {
        $group: {
          _id: "$level.name",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        total: totalStudents,
        withApartments: studentsWithApartments,
        withoutApartments: totalStudents - studentsWithApartments,
        genderDistribution: genderStats,
        levelDistribution: levelStats,
      },
    });
  } catch (error) {
    console.error("Students stats error:", error);
    res.status(500).json({
      status: "error",
      message: "Student statistikasini olishda xatolik",
    });
  }
});

router.get("/students/all", authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const skip = (page - 1) * limit;

    const findAllStudents = await StudentModel.find()
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await StudentModel.countDocuments();

    res.status(200).json({
      status: "success",
      data: findAllStudents,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/student/search/:name", authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const safeName = escapeRegex(name.trim());

    const findStudents = await StudentModel.find({
      full_name: { $regex: safeName, $options: "i" },
    })
      .limit(50)
      .lean();

    res.status(200).json({ status: "success", data: findStudents });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Student qidirishda xatolik" });
  }
});

router.get("/students/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.trim() === "") {
      return res.status(200).json({ status: "success", data: [] });
    }

    const safeQ = escapeRegex(q.trim());
    const students = await StudentModel.find({
      full_name: { $regex: safeQ, $options: "i" },
    })
      .select("full_name image level group department gender")
      .limit(20)
      .lean();

    res.status(200).json({ status: "success", data: students });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/students/:id/apartment", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const student = await StudentModel.findById(id)
      .populate("group", "name")
      .populate("department", "name")
      .populate("gender", "name");

    if (!student) {
      return res
        .status(404)
        .json({ status: "error", message: "Student topilmadi" });
    }

    const currentPermission = await permissionModel
      .findOne({ status: { $ne: "finished" } })
      .sort({ createdAt: -1 });

    let apartment = null;
    if (currentPermission) {
      apartment = await AppartmentModel.findOne({
        studentId: id,
        current: true,
        permission: currentPermission._id,
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        student,
        apartment,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
