import express from "express";
import tutorModel from "../models/tutor.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import adminModel from "../models/admin.model.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/token.js";
import StudentModel from "../models/student.model.js";
import AppartmentModel from "../models/appartment.model.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import NotificationModel from "../models/notification.model.js";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";
import tutorNotificationModel from "../models/tutorNotification.model.js";
import facultyAdminModel from "../models/faculty.admin.model.js";
import permissionModel from "../models/permission.model.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tutor uchun barcha studentlarga report notification jo'natish
router.post("/tutor/send-report-all", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const { message } = req.body;

    // Tutorni topish
    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res.status(400).json({
        status: "error",
        message: "Bunday tutor topilmadi",
      });
    }

    // Tutor guruhlarini olish
    const groupNames = findTutor.group.map((g) => g.name);

    // Guruhlarga tegishli studentlarni topish
    const students = await StudentModel.find({
      "group.name": { $in: groupNames },
    });

    if (!students.length) {
      return res.status(400).json({
        status: "error",
        message: "Bu guruhlarda studentlar topilmadi",
      });
    }

    const notifications = [];
    const updateOperations = [];

    // Har bir student uchun
    for (const student of students) {
      // Studentning barcha appartmentlarini topish
      const appartments = await AppartmentModel.find({
        studentId: student._id,
      });

      if (appartments.length > 0) {
        // Barcha appartmentlarni eski qilish (needNew: true, current: false)
        updateOperations.push(
          AppartmentModel.updateMany(
            { studentId: student._id },
            {
              $set: {
                needNew: true,
                current: false,
              },
            }
          )
        );

        // Eng oxirgi appartmentni topish (notification uchun)
        const latestAppartment = appartments.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )[0];

        // Notification yaratish
        notifications.push({
          userId: student._id,
          message: message || "Ijara ma'lumotlarini qayta to'ldiring",
          appartmentId: latestAppartment._id,
          status: "red",
          need_data: "Ijara ma'lumotlarini qayta kiritish talab qilinadi",
          notification_type: "report",
          isRead: false,
        });
      }
    }

    // Barcha update operatsiyalarini bajarish
    await Promise.all(updateOperations);

    // Notificationlarni yaratish
    if (notifications.length > 0) {
      await NotificationModel.insertMany(notifications);
    }

    res.status(200).json({
      status: "success",
      message: `${notifications.length} ta studentga notification jo'natildi`,
      data: {
        studentsCount: students.length,
        notificationsCount: notifications.length,
      },
    });
  } catch (error) {
    console.error("Notification jo'natishda xatolik:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

router.post(
  "/tutor/create",
  authMiddleware,
  uploadSingleImage,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      const { login, password, group, name, phone } = req.body;

      const findAdmin = await adminModel.findById(userId);
      if (!findAdmin) {
        return res
          .status(400)
          .json({ status: "error", message: "Bunday admin topilmadi" });
      }

      if (!login || !password || !group || !Array.isArray(JSON.parse(group))) {
        return res.status(400).json({
          status: "error",
          message: "Iltimos, barcha ma'lumotlarni to'g'ri kiriting",
        });
      }

      const findTutor = await tutorModel.findOne({ login });
      if (findTutor) {
        return res.status(400).json({
          status: "error",
          message: "Bu tutor oldin ro'yxatdan o'tgan",
        });
      }

      let imagePath = null;

      // Fayl yuklanganligini tekshirish
      if (req.file) {
        imagePath = `/public/images/${req.file.filename}`;
      }

      const tutor = await tutorModel.create({
        login,
        group: JSON.parse(group),
        name,
        phone,
        password: password,
        image: imagePath,
      });

      res.status(200).json({ status: "success", data: tutor });
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ status: "error", message: error.message });
    }
  }
);

router.post("/tutor/login", async (req, res) => {
  try {
    const { login, password } = req.body;
    console.log(req.body);

    if (!login || !password) {
      return res.status(400).json({
        status: "error",
        message: "Iltimos, ma'lumotlarni to'liq kiriting",
      });
    }
    const findTutor = await tutorModel.findOne({ login });

    if (!findTutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    // Tutor guruhlarini arrayga olish
    const groupNames = findTutor.group.map((g) => g.name);

    // Faqat kerakli guruhlarga tegishli studentlarni olish
    const students = await StudentModel.aggregate([
      { $match: { "group.name": { $in: groupNames } } },
      {
        $group: {
          _id: "$group.name",
          faculty: { $first: "$specialty.name" },
          studentCount: { $sum: 1 },
        },
      },
    ]);

    // Guruhlar bo'yicha array yaratish
    const findStudents = findTutor.group.map((item) => {
      const groupInfo = students.find((s) => s._id === item.name);
      return {
        name: item.name,
        faculty: groupInfo ? groupInfo.faculty : "Noma'lum",
        studentCount: groupInfo ? groupInfo.studentCount : 0,
      };
    });

    // Parolni tekshirish
    const compare = password == findTutor.password ? true : false;
    if (!compare) {
      return res
        .status(400)
        .json({ status: "error", message: "Parol mos kelmadi" });
    }

    // Token yaratish va ma'lumotlarni jo'natish
    const token = generateToken(findTutor._id);
    const { _id, name, role, createdAt, updatedAt, phone, image } = findTutor;
    const data = {
      _id,
      login: findTutor.login,
      name,
      role,
      createdAt,
      phone,
      image,
      updatedAt,
      group: findStudents,
    };

    res.status(200).json({
      status: "success",
      data,
      token,
    });
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ status: "error", message: error.message });
  }
});

router.get("/all-students", async (req, res) => {
  try {
    const students = await StudentModel.find().select("group ").lean();
    console.log("📌 students:", students);
    return res.status(200).json({ data: students });
  } catch (error) {
    console.error("❌ error:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/tutor/my-students", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    // 🔹 Tutorni topish
    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    // 🔹 Tutor guruh kodlarini olish (hammasini stringga o‘tkazamiz)
    const groupCodes = findTutor.group.map((g) => String(g.code));

    // 🔹 Studentlarni olish (group.id va group.name ni string qilib solishtiramiz)
    const findStudents = await StudentModel.find({
      $or: [
        { "group.id": { $in: groupCodes } },
        { "group.name": { $in: groupCodes } },
      ],
    }).select(
      "group.name group.id student_id_number accommodation faculty.name first_name second_name third_name full_name short_name university image address role"
    );

    // 🔹 Guruhlar bo‘yicha studentlarni ajratib chiqish
    const groupStudents = groupCodes.map((groupCode) => ({
      group: groupCode,
      students: findStudents.filter(
        (s) =>
          String(s.group.id) === String(groupCode) ||
          String(s.group.name) === String(groupCode)
      ),
    }));

    // 🔹 Javob qaytarish
    res.status(200).json({
      status: "success",
      data: groupStudents,
      findStudents,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Tutorga guruh qo'shish (yangi route)
router.post("/tutor/add-group/:tutorId", authMiddleware, async (req, res) => {
  try {
    const { tutorId } = req.params;
    const { groups } = req.body; // massiv: [{ name: "guruh nomi", code: "guruh kodi" }, {...}, ...]

    const findTutor = await tutorModel.findById(tutorId);
    if (!findTutor) {
      return res
        .status(404)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Groups massivda bo'lishi kerak va bo'sh bo'lmasligi kerak",
      });
    }

    // Yangi guruhlarni qo'shish (duplikatlarni tekshirish)
    const existingGroupNames = findTutor.group.map((g) => g.name);
    const newGroups = groups.filter(
      (g) => !existingGroupNames.includes(g.name)
    );

    if (newGroups.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Barcha guruhlar allaqachon qo'shilgan",
      });
    }

    // Grouplar massiviga yangi grouplarni qo'shish
    const updatedTutor = await tutorModel.findByIdAndUpdate(
      tutorId,
      { $push: { group: { $each: newGroups } } },
      { new: true }
    );

    // TutorNotification yaratish
    const groupNames = newGroups.map((g) => g.name).join(", ");
    await tutorNotificationModel.create({
      tutorId,
      message: `Siz ${groupNames} guruh${
        newGroups.length > 1 ? "lari" : "i"
      }ga tutor qilib qo'shildingiz`,
      isRead: false,
    });

    res.status(200).json({
      status: "success",
      message: `${newGroups.length} ta guruh qo'shildi`,
      tutor: updatedTutor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "Server xatosi" });
  }
});

router.post("/tutor/change-password", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const findTutor = await tutorModel.findById(userId);

    if (!findTutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const { confirmPassword, newPassword } = req.body;

    if (!findTutor.password != confirmPassword) {
      return res
        .status(400)
        .json({ status: "error", message: "Tasdiqlash paroli hato" });
    }

    const changeTutorData = await tutorModel.findByIdAndUpdate(
      findTutor,
      {
        $set: {
          password: newPassword,
        },
      },
      { new: true }
    );

    res.status(201).json({
      status: "success",
      data: changeTutorData,
      message: "Password muaffaqiyatli ozgartirildi!",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/tutor/groups", authMiddleware, async (req, res) => {
  try {
    const findGroups = await StudentModel.find().select("group");
    const uniqueGroups = Array.from(
      new Map(findGroups.map((item) => [item.group.name, item.group])).values()
    );

    res.json({ status: "success", data: uniqueGroups });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/tutor/students-group/:group", authMiddleware, async (req, res) => {
  try {
    const { group } = req.params;

    console.log("📋 Getting students for group:", group);

    // Guruh bo'yicha qidirish (name yoki id bo'yicha)
    const filter = {
      $or: [{ "group.name": group }, { "group.id": group }],
    };

    // Studentlarni olish
    const findStudents = await StudentModel.find(filter)
      .select(
        "group province gender department specialty level full_name short_name first_name second_name third_name image"
      )
      .lean();

    res.json({
      status: "success",
      data: findStudents,
    });
  } catch (error) {
    console.error("❌ Get group students error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

router.get("/tutor/profile", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const findTutor = await tutorModel.findById(userId);

    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const groupNames = findTutor.group.map((g) => g.name);
    const students = await StudentModel.find({
      "group.name": { $in: groupNames },
    }).select("group department");

    const tutorFaculty = findTutor.group.map((item) => {
      const student = students.find((c) => c.group.name === item.name);

      return {
        name: item.name,
        code: item.code,
        studentCount: students.filter((c) => c.group.id == item.code).length,
        faculty: student ? student.department.name : "Noma'lum fakultet",
      };
    });

    const {
      _id,
      login,
      name,
      password,
      image,
      phone,
      role,
      createdAt,
      updatedAt,
    } = findTutor;

    res.json({
      status: "success",
      data: {
        _id,
        login,
        name,
        password,
        role,
        image,
        phone,
        createdAt,
        updatedAt,
        group: tutorFaculty,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/tutor/notification/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 🔹 Javob
    res.status(200).json({
      status: "success",
      data: [
        {
          __v: 0,
          _id: "64f123456789abcdef123456",
          createdAt: "2025-09-06T10:15:30.000Z",
          isRead: false,
          message: "Sizga yangi xabar keldi",
          updatedAt: "2025-09-06T10:20:00.000Z",
          userId: "user_987654321",
        },
        {
          __v: 0,
          _id: "64f987654321abcdef654321",
          createdAt: "2025-09-05T14:45:00.000Z",
          isRead: true,
          message: "Dars jadvali yangilandi",
          updatedAt: "2025-09-05T15:00:00.000Z",
          userId: "user_123456789",
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});
router.post("/tutor/notification", authMiddleware, async (req, res) => {
  try {
    const { userId, message } = req.body;
    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }
    const notification = await NotificationModel.create({ userId, message });
    res.json({ status: "success", data: notification });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
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
        return res
          .status(400)
          .json({ status: "error", message: "Bunday tutor topilmadi" });
      }

      const updateFields = {};
      const { login, name, phone, group } = req.body;
      if (login) updateFields.login = login;
      if (name) updateFields.name = name;
      if (phone) updateFields.phone = phone;
      if (group) updateFields.group = JSON.parse(group);

      // Fayl yuklangan bo'lsa, uni saqlaymiz
      if (req.file) {
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
        updateFields.image = `/public/images/${req.file.filename}`;
      }

      const updatedTutor = await tutorModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true }
      );

      res.status(200).json({
        status: "success",
        message: "Tutor yangilandi",
        tutor: updatedTutor,
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);
router.put("/tutor/profile/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, login, phone } = req.body;

    console.log("🔄 Update tutor request:", { userId, name, login, phone });

    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res.status(400).json({
        status: "error",
        message: "Bunday tutor topilmadi",
      });
    }

    // Login unique ekanligini tekshirish (o'zi bundan tashqari)
    if (login && login !== findTutor.login) {
      const existingTutor = await tutorModel.findOne({
        login,
        _id: { $ne: userId },
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

    const updatedTutor = await tutorModel.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    );

    console.log("✅ Tutor successfully updated");

    res.status(200).json({
      status: "success",
      message: "Tutor muvaffaqiyatli yangilandi",
      data: updatedTutor,
    });
  } catch (error) {
    console.error("❌ Update tutor error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

router.post(
  "/tutor/delete-group/:tutorId",
  authMiddleware,
  async (req, res) => {
    try {
      const { tutorId } = req.params;
      const { groupName } = req.body;

      console.log("🔄 Delete group request:", { tutorId, groupName });

      const findTutor = await tutorModel.findById(tutorId);
      if (!findTutor) {
        return res.status(401).json({
          status: "error",
          message: "Bunday tutor topilmadi",
        });
      }

      const { group } = findTutor;
      console.log("📋 Current groups:", group);

      const findGroup = group.find((c) => c.name === groupName);
      if (!findGroup) {
        return res.status(401).json({
          status: "error",
          message: `Bu tutorda "${groupName}" nomli guruh mavjud emas`,
        });
      }

      // Guruhni olib tashlash
      const updatedGroups = group.filter((c) => c.name !== groupName);
      console.log("🆕 Updated groups:", updatedGroups);

      const editedTutor = await tutorModel.findByIdAndUpdate(
        tutorId,
        { $set: { group: updatedGroups } },
        { new: true }
      );

      if (!editedTutor) {
        return res.status(500).json({
          status: "error",
          message: "Tutor ma'lumotlarini o'zgartirishda xatolik yuz berdi",
        });
      }

      console.log("✅ Group successfully removed from tutor");

      // TutorNotification yaratish
      await tutorNotificationModel.create({
        tutorId: tutorId,
        message: `Siz endi ${groupName} guruhining tutori emassiz`,
        type: "group_removed",
        isRead: false,
      });

      res.status(200).json({
        status: "success",
        message: "Guruh muvaffaqiyatli o'chirildi",
        data: editedTutor,
      });
    } catch (error) {
      console.error("❌ Delete group error:", error);
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  }
);

router.get(
  "/appertment/statistics/for-tutor",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      // 1️⃣ Tutor bormi?
      const findTutor = await tutorModel.findById(userId).lean();
      if (!findTutor) {
        return res.status(400).json({
          status: "error",
          message: "Bunday tutor topilmadi",
        });
      }

      // 2️⃣ Active permissionni olish
      const findActivePermission = await permissionModel
        .findOne({ tutorId: findTutor._id, status: "process" })
        .lean();

      if (!findActivePermission) {
        return res.status(200).json({
          status: "success",
          statistics: {
            green: { percent: "0%", total: 0 },
            yellow: { percent: "0%", total: 0 },
            red: { percent: "0%", total: 0 },
            blue: { percent: "0%", total: 0 },
          },
          total: 0,
        });
      }

      // 3️⃣ Oxirgi appartments (har bir student uchun)
      const studentAppartments = await AppartmentModel.aggregate([
        {
          $match: {
            typeAppartment: "tenant",
            permission: findActivePermission._id.toString(),
          },
        },
        { $sort: { createdAt: -1 } }, // eng oxirgilari oldinda
        {
          $group: {
            _id: "$studentId",
            latestAppartment: { $first: "$$ROOT" },
          },
        },
      ]);

      if (!studentAppartments.length) {
        return res.json({
          status: "success",
          message:
            "Sizning studentlaringiz hali ijara ma'lumotlarini qo'shmagan",
          statistics: {
            green: { percent: "0%", total: 0 },
            yellow: { percent: "0%", total: 0 },
            red: { percent: "0%", total: 0 },
            blue: { percent: "0%", total: 0 },
          },
          total: 0,
        });
      }

      // 4️⃣ Statistikani hisoblash
      const totalCount = studentAppartments.length;
      const statusCounts = studentAppartments.reduce(
        (acc, { latestAppartment }) => {
          const status = latestAppartment.status;
          if (status === "Being checked") {
            acc.blue += 1;
          } else {
            acc[status] = (acc[status] || 0) + 1;
          }
          return acc;
        },
        { green: 0, yellow: 0, red: 0, blue: 0 }
      );

      const statusPercentages = {
        green: {
          percent: ((statusCounts.green / totalCount) * 100).toFixed(2) + "%",
          total: statusCounts.green,
        },
        yellow: {
          percent: ((statusCounts.yellow / totalCount) * 100).toFixed(2) + "%",
          total: statusCounts.yellow,
        },
        red: {
          percent: ((statusCounts.red / totalCount) * 100).toFixed(2) + "%",
          total: statusCounts.red,
        },
        blue: {
          percent: ((statusCounts.blue / totalCount) * 100).toFixed(2) + "%",
          total: statusCounts.blue,
        },
      };

      // 5️⃣ Natijani yuborish
      res.status(200).json({
        status: "success",
        statistics: statusPercentages,
        total: totalCount,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Server xatosi" });
    }
  }
);

router.delete("/tutor/delete/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const findTutor = await tutorModel.findById(id);
    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }
    await tutorModel.findByIdAndDelete(id);
    res
      .status(200)
      .json({ status: "success", message: "Tutor muaffaqiyatli ochirildi" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/tutor/my-groups", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    // Tutorni olish
    const tutor = await tutorModel.findById(userId).lean();
    if (!tutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    // Har bir guruh uchun studentlarni hisoblash
    const groupsWithCounts = await Promise.all(
      tutor.group.map(async (grp) => {
        const students = await StudentModel.find({
          "group.id": `${grp.code}`,
        }).select("_id");

        // Studentlar idlarini arrayga olish
        const studentIds = students.map((s) => s._id.toString());

        // Total students = studentlar soni - appartment topilganlar soni
        const totalStudents = students.length;

        return {
          name: grp.name,
          code: grp.code,
          totalStudents,
        };
      })
    );

    res.status(200).json({ status: "success", data: groupsWithCounts });
  } catch (error) {
    console.error("Error in /tutor/my-groups:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get(
  "/tutor/groups-with-assignment",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      // Fakultet admin profilini olish
      const facultyAdmin = await facultyAdminModel.findById(userId);
      if (!facultyAdmin) {
        return res.status(401).json({
          status: "error",
          message: "Bunday fakultet admin topilmadi",
        });
      }

      const facultyNames = facultyAdmin.faculties.map((f) => f.name);

      // Fakultetlardagi guruhlarni olish
      const allGroups = [];
      for (const facultyName of facultyNames) {
        const students = await StudentModel.find({
          "department.name": facultyName,
        }).select("group");

        // Unique guruhlarni olish
        const uniqueGroups = [];
        const seen = new Set();

        students.forEach((student) => {
          if (student.group && student.group.name) {
            const groupKey = `${student.group.name}_${student.group.id}`;
            if (!seen.has(groupKey)) {
              seen.add(groupKey);
              uniqueGroups.push({
                id: student.group.id,
                name: student.group.name,
                educationLang: student.group.educationLang || {
                  name: "O'zbek",
                },
                faculty: facultyName,
              });
            }
          }
        });

        allGroups.push(...uniqueGroups);
      }

      // Har bir guruh uchun tutor assignment statusini tekshirish
      const groupsWithAssignment = await Promise.all(
        allGroups.map(async (group) => {
          const existingTutor = await tutorModel
            .findOne({
              "group.code": group.id.toString(),
              facultyAdmin: userId,
            })
            .select("name");

          return {
            ...group,
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
        data: groupsWithAssignment,
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  }
);

router.get(
  "/tutor/no-data-students/:groupId",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      const { groupId } = req.params;

      // Tutor tekshirish
      const findTutor = await tutorModel.findById(userId).lean();
      if (!findTutor) {
        return res
          .status(401)
          .json({ status: "error", message: "Bunday tutor topilmadi" });
      }

      // Aggregation orqali faqat appartment yo‘q studentlar
      const students = await StudentModel.aggregate([
        {
          $match: { "group.id": groupId }, // faqat shu guruh studentlari
        },
        {
          $lookup: {
            from: "appartments", // collection nomi (katta harf emas!)
            localField: "_id", // StudentModel._id
            foreignField: "studentId", // AppartmentModel.studentId
            as: "appartmentData",
          },
        },
        {
          $match: { appartmentData: { $size: 0 } }, // faqat appartment topilmaganlar
        },
        {
          $project: {
            image: 1,
            gender: 1,
            university: 1,
            full_name: 1,
            short_name: 1,
            first_name: 1,
            second_name: 1,
            third_name: 1,
            province: 1,
            specialty: 1,
            level: 1,
          },
        },
      ]);

      res.status(200).json({ status: "success", data: students });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

export default router;
