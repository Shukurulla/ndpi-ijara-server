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

const router = express.Router();

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

    console.log("🔍 Login attempt:", login);

    // 1️⃣ BIRINCHI - HEMIS orqali autentifikatsiya
    let hemisResponse;
    try {
      console.log("📡 HEMIS ga so'rov yuborilmoqda...");

      hemisResponse = await axios.post(
        "https://student.karsu.uz/rest/v1/auth/login",
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
        }
      );

      console.log(
        "✅ HEMIS javobi:",
        hemisResponse.data?.success ? "Muvaffaqiyatli" : "Xato"
      );

      // HEMIS login muvaffaqiyatsiz bo'lsa
      if (!hemisResponse.data?.success) {
        return res.status(401).json({
          status: "error",
          message: "Login yoki parol noto'g'ri",
          hemisError: true,
        });
      }
    } catch (hemisError) {
      console.error("❌ HEMIS xatosi:", hemisError.message);

      // Agar HEMIS 401 xato qaytarsa - login/parol noto'g'ri
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

      // Agar HEMIS server ishlamasa
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

      // Boshqa HEMIS xatolari
      return res.status(500).json({
        status: "error",
        message: "HEMIS tizimida xatolik. Keyinroq urinib ko'ring",
        hemisServiceError: true,
      });
    }

    // 2️⃣ IKKINCHI - HEMIS muvaffaqiyatli bo'lsa, local bazadan studentni topish
    console.log(
      "✅ HEMIS autentifikatsiya muvaffaqiyatli, bazadan qidirilmoqda..."
    );

    // Aggregation orqali qidirish (string/number muammosini hal qiladi)
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

    // Agar topilmasa, alternativ usul
    if (!findStudent) {
      console.log("⚠️ Aggregation ishlamadi, alternativ qidiruv...");

      const allStudents = await StudentModel.find()
        .select("student_id_number")
        .lean();

      const foundStudent = allStudents.find((s) => {
        const studentId = s.student_id_number;
        return studentId == login || String(studentId) === String(login);
      });

      if (foundStudent) {
        findStudent = await StudentModel.findById(foundStudent._id).lean();
      }
    }

    // 3️⃣ Agar HEMIS da bor lekin local bazada yo'q bo'lsa
    if (!findStudent) {
      console.log("⚠️ HEMIS da mavjud, lekin local bazada topilmadi");

      // HEMIS dan student ma'lumotlarini olishga urinish
      if (hemisResponse?.data?.data) {
        // Agar HEMIS student ma'lumotlarini qaytarsa
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
          token: null, // Token bermaymiz chunki local bazada yo'q
          needsSync: true, // Adminlarga sync kerakligini ko'rsatish
        });
      }

      return res.status(404).json({
        status: "error",
        message: "Student local bazada topilmadi. Admin bilan bog'laning",
        hemisAuthenticated: true,
        localNotFound: true,
      });
    }

    console.log("✅ Student topildi:", findStudent.student_id_number);

    // 4️⃣ Appartment mavjudligini tekshirish
    let existAppartment = false;
    try {
      const apartment = await AppartmentModel.findOne({
        studentId: findStudent._id,
      }).lean();
      existAppartment = !!apartment;
      console.log("🏠 Appartment mavjudmi:", existAppartment);
    } catch (error) {
      console.error("Apartment check error:", error);
    }

    // 5️⃣ Token generatsiya
    const token = generateToken(findStudent._id);

    // 6️⃣ Muvaffaqiyatli javob
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
    console.error("❌ Student sign xatosi:", error);
    return res.status(500).json({
      status: "error",
      message: "Serverda xatolik yuz berdi",
      details: error.message,
    });
  }
});

// TEST UCHUN - HEMIS siz login (faqat development uchun)
router.post("/student/sign-dev", async (req, res) => {
  try {
    const { login } = req.body;

    if (!login) {
      return res.status(400).json({
        status: "error",
        message: "Login kiritish majburiy",
      });
    }

    console.log("🧪 DEV MODE - HEMIS siz login:", login);

    // Aggregation orqali qidirish
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

    const findStudent = students[0];

    if (!findStudent) {
      return res.status(404).json({
        status: "error",
        message: "Student topilmadi (DEV MODE)",
      });
    }

    // Appartment tekshirish
    const apartment = await AppartmentModel.findOne({
      studentId: findStudent._id,
    }).lean();

    // Token generatsiya
    const token = generateToken(findStudent._id);

    return res.status(200).json({
      status: "success",
      message: "DEV MODE - Login muvaffaqiyatli",
      student: {
        ...findStudent,
        existAppartment: !!apartment,
      },
      token,
      devMode: true,
    });
  } catch (error) {
    console.error("❌ DEV sign error:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Appartment mavjudligini tekshirish
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

// Test uchun student yaratish
router.post("/student/create-byside", async (req, res) => {
  try {
    console.log("🧪 Creating test student...");
    const cleanedData = cleanStudentData(req.body);
    const student = await StudentModel.create(cleanedData);

    console.log("✅ Test student created:", student.student_id_number);
    res.status(201).json({
      status: "success",
      message: "Test student yaratildi",
      student: student,
    });
  } catch (error) {
    console.error("❌ Create test student error:", error);
    res.status(500).json({
      status: "error",
      message: "Test student yaratishda xatolik",
      details: error.name === "ValidationError" ? error.errors : undefined,
    });
  }
});

// Student notification olish
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

// Student profil ma'lumotlari
router.get("/student/profile", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    const findStudent = await StudentModel.findById(userId).select(
      "gender province image full_name first_name second_name student_id_number group level department"
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

// Tutor profil yangilash (bu endpoint student routes da nima qilyapti?)
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

      // Fayl yuklash
      if (req.file) {
        updateFields.image = `/public/images/${req.file.filename}`;

        // Eski rasmni o'chirish
        if (findTutor.image && !findTutor.image.includes("default-icon")) {
          const oldImagePath = path.join(
            __dirname,
            "../public/images",
            findTutor.image.split("/public/images/")[1]
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }

      const updatedTutor = await tutorModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true }
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
  }
);

// Student qidirish (ID bo'yicha)
router.get("/student/find/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const findStudent = await StudentModel.find({
      student_id_number: id,
    }).select(
      "full_name first_name second_name student_id_number group level image"
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
    console.error("Student search error:", error);
    res.status(500).json({
      status: "error",
      message: "Student qidirishda xatolik",
      error: error.message,
    });
  }
});

// Student ma'lumotlarini yangilash
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

      // Fayl yuklash
      if (req.file) {
        updateFields.image = `/public/images/${req.file.filename}`;

        // Eski rasmni o'chirish
        if (findStudent.image && !findStudent.image.includes("default-icon")) {
          const oldImagePath = path.join(
            __dirname,
            "../public/images",
            findStudent.image.split("/public/images/")[1]
          );
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }

      const updatedStudent = await StudentModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true, runValidators: false }
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
  }
);

// Student statistikasi (admin uchun)
router.get("/students/stats", authMiddleware, async (req, res) => {
  try {
    const totalStudents = await StudentModel.countDocuments();
    const studentsWithApartments = await AppartmentModel.distinct("studentId")
      .length;

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

router.get("/students/all", async (req, res) => {
  try {
    // await StudentModel.deleteMany();
    const findAllStudents = await StudentModel.find().limit(200);
    res.status(200).json({ status: "success", data: findAllStudents });
  } catch (error) {
    res.status(500).json({ status: "success", message: error.message });
  }
});

// Real-time search endpoint
router.get("/students/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(200).json({ status: "success", data: [] });
    }

    // Case-insensitive search by full_name
    const students = await StudentModel.find({
      full_name: { $regex: q, $options: "i" },
    })
      .select("full_name image level group department gender")
      .populate("group", "name")
      .populate("department", "name")
      .populate("gender", "name")
      .limit(20);

    res.status(200).json({ status: "success", data: students });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Get student with current apartment
router.get("/students/:id/apartment", async (req, res) => {
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

    // Find current apartment with current permission
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

const baseStudent = {
  gender: {
    code: "11",
    name: "Erkak",
  },
  country: {
    code: "UZ",
    name: "O‘zbekiston",
  },
  province: {
    code: "1735",
    name: "Qoraqalpog‘iston Resp.",
    _parent: "1735",
  },
  currentProvince: {
    code: "1735",
    name: "Qoraqalpog‘iston Resp.",
    _parent: "1735",
  },
  district: {
    code: "1735401",
    name: "Nukus shahri",
    _parent: "1735",
  },
  currentDistrict: {
    code: "1735401",
    name: "Nukus shahri",
    _parent: "1735",
  },
  terrain: {
    code: "423",
    name: "NAWPIR",
  },
  currentTerrain: {
    code: "423",
    name: "NAWPIR",
  },
  citizenship: {
    code: "11",
    name: "O‘zbekiston Respublikasi fuqarosi",
  },
  studentStatus: {
    code: "11",
    name: "O‘qimoqda",
  },
  educationForm: {
    code: "11",
    name: "Kunduzgi",
  },
  educationType: {
    code: "11",
    name: "Bakalavr",
  },
  paymentForm: {
    code: "12",
    name: "To‘lov-shartnoma",
  },
  studentType: {
    code: "19",
    name: "Ikkinchi oliy (Kunduzgi)",
  },
  socialCategory: {
    code: "10",
    name: "Boshqa",
  },
  accommodation: {
    code: "11",
    name: "O‘z uyida",
  },
  department: {
    structureType: {
      code: "11",
      name: "Fakultet",
    },
    localityType: {
      code: "11",
      name: "Mahalliy",
    },
    id: "6",
    name: "Iqtisodiyot",
    code: "346-106",
    parent: null,
    active: true,
  },
  specialty: {
    id: "487",
    code: "60410500",
    name: "Moliya va moliyaviy texnologiyalar",
  },
  group: {
    educationLang: {
      code: "13",
      name: "Qoraqalpoq",
    },
    id: "2769",
    name: "2024-Finans qq ",
  },
  level: {
    code: "12",
    name: "2-kurs",
  },
  semester: {
    id: "9278",
    code: "13",
    name: "3-semestr",
  },
  educationYear: {
    code: "2025",
    name: "2025-2026",
    current: true,
  },
  _id: "68ca867e0d54780e6e683473",
  id: 60087,
  university: {
    code: "346",
    name: "Berdaq nomidagi Qoraqalpoq davlat universiteti",
  },
  full_name: "SHAMURATOV AZAMAT ABDIMURAT ULI",
  short_name: "SHAMURATOV A. A.",
  first_name: "AZAMAT",
  second_name: "SHAMURATOV",
  third_name: "ABDIMURAT ULI",
  birth_date: 957830400,
  student_id_number: 346251105278,
  image: "https://hemis.karsu.uz/static/crop/2/3/320__90_2376713866.jpg",
  avg_gpa: 0,
  avg_grade: 0,
  total_credit: 0,
  _curriculum: 1260,
  year_of_enter: 2025,
  roommate_count: null,
  is_graduate: false,
  total_acload: null,
  other:
    "2019 - 2023, Berdaq nomidagi Qoraqalpoq davlat universiteti, B № 00287136",
  created_at: 1758100206,
  updated_at: 1758100245,
  hash: "a2f529d8d672e511684fd006ac7ba0263a6fd04ecc0d50aae6e635a94c49eb98",
  validateUrl:
    "https://student.karsu.uz/api/info/student?h=c8a51187-4535-2716-bd52-b5e21fea2849",
  __v: 0,
};

const hemisStudents = {
  id: 61938,
  meta_id: 434664,
  university: {
    code: "346",
    name: "Berdaq nomidagi Qoraqalpoq davlat universiteti",
  },
  full_name: "KUTLÍMURATOV JASURBEK BAXADÍROVICH",
  short_name: "KUTLÍMURATOV J. B.",
  first_name: "JASURBEK",
  second_name: "KUTLÍMURATOV",
  third_name: "BAXADÍROVICH",
  gender: {
    code: "11",
    name: "Erkak",
  },
  birth_date: 1167868800,
  student_id_number: "346241107124",
  image: "https://hemis.karsu.uz/static/crop/1/5/320__90_1587768629.jpg",
  image_full:
    "https://hemis.karsu.uz/static/uploads/pi/e/1/e1bf134afc00f273732409481b6a5547.jpg",
  avg_gpa: 3.73,
  avg_grade: 38.8,
  total_credit: 90,
  country: {
    code: "UZ",
    name: "O‘zbekiston",
  },
  province: {
    code: "1735",
    name: "Qoraqalpog‘iston Resp.",
    _parent: "1735",
  },
  currentProvince: {
    code: "1735",
    name: "Qoraqalpog‘iston Resp.",
    _parent: "1735",
  },
  district: {
    code: "1735225",
    name: "Nukus tumani",
    _parent: "1735",
  },
  currentDistrict: {
    code: "1735225",
    name: "Nukus tumani",
    _parent: "1735",
  },
  terrain: {
    code: "15575",
    name: "ÚLGILIMÁKAN",
  },
  currentTerrain: {
    code: "15575",
    name: "ÚLGILIMÁKAN",
  },
  citizenship: {
    code: "11",
    name: "O‘zbekiston Respublikasi fuqarosi",
  },
  studentStatus: {
    code: "11",
    name: "O‘qimoqda",
  },
  _curriculum: 1253,
  educationForm: {
    code: "11",
    name: "Kunduzgi",
  },
  educationType: {
    code: "11",
    name: "Bakalavr",
  },
  paymentForm: {
    code: "12",
    name: "To‘lov-shartnoma",
  },
  studentType: {
    code: "28",
    name: "Ichki transfer",
  },
  socialCategory: {
    code: "10",
    name: "Boshqa",
  },
  povertyLevel: null,
  accommodation: {
    code: "11",
    name: "O‘z uyida",
  },
  department: {
    id: 7,
    name: "Jismoniy madaniyat",
    code: "346-107",
    structureType: {
      code: "11",
      name: "Fakultet",
    },
    localityType: {
      code: "11",
      name: "Mahalliy",
    },
    parent: null,
    active: true,
  },
  specialty: {
    id: 530,
    code: "61010204",
    name: "Sport faoliyati: futbol",
  },
  group: {
    id: 2865,
    name: "2024-2028 211 sport faoliyati  futbol QQ",
    educationLang: {
      code: "13",
      name: "Qoraqalpoq",
    },
  },
  level: {
    code: "12",
    name: "2-kurs",
  },
  semester: {
    id: 9222,
    code: "13",
    name: "3-semestr",
  },
  educationYear: {
    code: "2025",
    name: "2025-2026",
    current: true,
  },
  year_of_enter: 2024,
  roommate_count: null,
  is_graduate: false,
  total_acload: 2700,
  other:
    "2013-2024, Nukus shaxar 37-sonli umumiy o'rta ta'lim maktabi, UM 02195679",
  created_at: 1760684853,
  updated_at: 1760684872,
  hash: "fca21e1aa3841a9c801f210659dfc6ca97bc715182eb2acc33bd86dcc2be12c2",
  validateUrl:
    "https://student.karsu.uz/api/info/student?h=6711fac0-67ef-c5c5-4ff3-d1192836bf2e",
  email: "",
};
