import express from "express";
import tutorModel from "../models/tutor.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import adminModel from "../models/admin.model.js";
import bcrypt from "bcrypt";
import generateToken from "../utils/token.js";
import StudentModel from "../models/student.model.js";
import GroupModel from "../models/group.model.js";
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

router.post("/tutor/send-report-all", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const { message } = req.body;

    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res.status(400).json({
        status: "error",
        message: "Bunday tutor topilmadi",
      });
    }

    const groupNames = findTutor.group.map((g) => g.name);

    const students = await StudentModel.find({
      "group.name": { $in: groupNames },
    });

    if (!students.length) {
      return res.status(400).json({
        status: "error",
        message: "Bu guruhlarda studentlar topilmadi",
      });
    }

    const studentIds = students.map((s) => s._id);

    const latestAppartments = await AppartmentModel.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$studentId",
          latestAppartment: { $first: "$$ROOT" },
        },
      },
    ]);

    const studentsWithAppartments = latestAppartments.map((a) => a._id);

    if (studentsWithAppartments.length > 0) {
      await AppartmentModel.updateMany(
        { studentId: { $in: studentsWithAppartments } },
        { $set: { needNew: true, current: false } },
      );
    }

    const notifications = latestAppartments.map((item) => ({
      userId: item._id,
      message: message || "Ijara ma'lumotlarini qayta to'ldiring",
      appartmentId: item.latestAppartment._id,
      status: "red",
      need_data: "Ijara ma'lumotlarini qayta kiritish talab qilinadi",
      notification_type: "report",
      isRead: false,
    }));

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

      if (req.file) {
        imagePath = `/public/images/${req.file.filename}`;
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const tutor = await tutorModel.create({
        login,
        group: JSON.parse(group),
        name,
        phone,
        password: hashedPassword,
        image: imagePath,
      });

      const { password: _, ...tutorData } = tutor.toObject();
      res.status(200).json({ status: "success", data: tutorData });
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ status: "error", message: error.message });
    }
  },
);

router.post("/tutor/login", async (req, res) => {
  try {
    const { login, password } = req.body;

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
        .json({ status: "error", message: "Login yoki parol noto'g'ri" });
    }

    const groupNames = findTutor.group.map((g) => g.name);

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

    const findStudents = findTutor.group.map((item) => {
      const groupInfo = students.find((s) => s._id === item.name);
      return {
        name: item.name,
        faculty: groupInfo ? groupInfo.faculty : "Noma'lum",
        studentCount: groupInfo ? groupInfo.studentCount : 0,
      };
    });

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
      .status(500)
      .json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/all-students", authMiddleware, async (req, res) => {
  try {
    const students = await StudentModel.find().select("group").lean();
    return res.status(200).json({ data: students });
  } catch (error) {
    return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/tutor/my-students", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;

    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const groupCodes = findTutor.group.map((g) => +g.code);

    const findStudents = await StudentModel.find({
      $or: [
        { "group.id": { $in: groupCodes } },
        { "group.name": { $in: groupCodes } },
      ],
    }).select(
      "group.name group.id student_id_number accommodation faculty.name first_name second_name third_name full_name short_name university image address role",
    );

    const groupStudents = groupCodes.map((groupCode) => ({
      group: groupCode,
      students: findStudents.filter(
        (s) =>
          String(s.group.id) === String(groupCode) ||
          String(s.group.name) === String(groupCode),
      ),
    }));

    res.status(200).json({
      status: "success",
      data: groupStudents,
      findStudents,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.post("/tutor/add-group/:tutorId", authMiddleware, async (req, res) => {
  try {
    const { tutorId } = req.params;
    const { groups } = req.body;

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

    const existingGroupNames = findTutor.group.map((g) => g.name);
    const newGroups = groups.filter(
      (g) => !existingGroupNames.includes(g.name),
    );

    if (newGroups.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Barcha guruhlar allaqachon qo'shilgan",
      });
    }

    const updatedTutor = await tutorModel.findByIdAndUpdate(
      tutorId,
      { $push: { group: { $each: newGroups } } },
      { new: true },
    );

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

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ status: "error", message: "Joriy va yangi parolni kiriting" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({
          status: "error",
          message: "Yangi parol kamida 6 belgidan iborat bo'lishi kerak",
        });
    }

    const isMatch = await bcrypt.compare(currentPassword, findTutor.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ status: "error", message: "Joriy parol noto'g'ri" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await tutorModel.findByIdAndUpdate(
      userId,
      { $set: { password: hashedNewPassword } },
      { new: true },
    );

    res.status(200).json({
      status: "success",
      message: "Parol muvaffaqiyatli o'zgartirildi",
    });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/tutor/groups", authMiddleware, async (req, res) => {
  try {
    const groups = await GroupModel.find()
      .select("id name educationLang facultyName facultyCode")
      .sort({ name: 1 })
      .lean();

    res.json({ status: "success", data: groups });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/tutor/students-group/:group", authMiddleware, async (req, res) => {
  try {
    const { group } = req.params;

    console.log("📋 Getting students for group:", group);

    const filter = {
      $or: [
        { "group.name": group.toString() },
        { "group.id": group.toString() },
      ],
    };

    const findStudents = await StudentModel.find(filter)
      .select(
        "group province gender department specialty level full_name short_name first_name second_name third_name image",
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

    const { _id, login, name, image, phone, role, createdAt, updatedAt } =
      findTutor;

    res.json({
      status: "success",
      data: {
        _id,
        login,
        name,
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

      if (req.file) {
        if (findTutor.image && !findTutor.image.includes("default-icon")) {
          const oldImagePath = path.join(
            __dirname,
            "../public/images",
            findTutor.image.split("/public/images/")[1],
          );
          fs.promises.unlink(oldImagePath).catch(() => {});
        }
        updateFields.image = `/public/images/${req.file.filename}`;
      }

      const updatedTutor = await tutorModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true },
      );

      res.status(200).json({
        status: "success",
        message: "Tutor yangilandi",
        tutor: updatedTutor,
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  },
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
      { new: true },
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

      const updatedGroups = group.filter((c) => c.name !== groupName);
      console.log("🆕 Updated groups:", updatedGroups);

      const editedTutor = await tutorModel.findByIdAndUpdate(
        tutorId,
        { $set: { group: updatedGroups } },
        { new: true },
      );

      if (!editedTutor) {
        return res.status(500).json({
          status: "error",
          message: "Tutor ma'lumotlarini o'zgartirishda xatolik yuz berdi",
        });
      }

      console.log("✅ Group successfully removed from tutor");

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
  },
);

router.get(
  "/appertment/statistics/for-tutor",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      const findTutor = await tutorModel.findById(userId).lean();
      if (!findTutor) {
        return res.status(400).json({
          status: "error",
          message: "Bunday tutor topilmadi",
        });
      }

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

      const studentAppartments = await AppartmentModel.aggregate([
        {
          $match: {
            typeAppartment: "tenant",
            permission: findActivePermission._id.toString(),
          },
        },
        { $sort: { createdAt: -1 } },
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
        { green: 0, yellow: 0, red: 0, blue: 0 },
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

      res.status(200).json({
        status: "success",
        statistics: statusPercentages,
        total: totalCount,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: "Server xatosi" });
    }
  },
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

    const tutor = await tutorModel.findById(userId).lean();
    if (!tutor) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const groupCodes = tutor.group.map((g) => g.code.toString());
    const studentCounts = await StudentModel.aggregate([
      { $match: { "group.id": { $in: groupCodes } } },
      {
        $group: {
          _id: { $toString: "$group.id" },
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = {};
    for (const item of studentCounts) {
      countMap[item._id] = item.count;
    }

    const groupsWithCounts = tutor.group.map((grp) => ({
      name: grp.name,
      code: grp.code,
      totalStudents: countMap[grp.code.toString()] || 0,
    }));

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

      const facultyAdmin = await facultyAdminModel.findById(userId).lean();
      if (!facultyAdmin) {
        return res.status(401).json({
          status: "error",
          message: "Bunday fakultet admin topilmadi",
        });
      }

      const facultyNames = facultyAdmin.faculties.map((f) => f.name);

      const allGroups = await GroupModel.find({
        facultyName: { $in: facultyNames },
      })
        .select("id name educationLang facultyName facultyCode")
        .sort({ name: 1 })
        .lean();

      const groupIds = allGroups.map((g) => g.id.toString());
      const tutors = await tutorModel
        .find({
          "group.code": { $in: groupIds },
          facultyAdmin: userId,
        })
        .select("name group")
        .lean();

      const tutorMap = {};
      for (const tutor of tutors) {
        for (const grp of tutor.group) {
          tutorMap[grp.code.toString()] = { id: tutor._id, name: tutor.name };
        }
      }

      const groupsWithAssignment = allGroups.map((group) => ({
        id: group.id,
        name: group.name,
        educationLang: group.educationLang || { name: "O'zbek" },
        faculty: group.facultyName,
        facultyCode: group.facultyCode,
        isAssigned: !!tutorMap[group.id.toString()],
        assignedToTutor: tutorMap[group.id.toString()] || null,
      }));

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
  },
);

router.get(
  "/tutor/no-data-students/:groupId",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      const { groupId } = req.params;

      const findTutor = await tutorModel.findById(userId).lean();
      if (!findTutor) {
        return res
          .status(401)
          .json({ status: "error", message: "Bunday tutor topilmadi" });
      }

      const activePermissions = await permissionModel
        .find({
          status: "process",
        })
        .select("_id");

      if (activePermissions.length === 0) {
        return res.status(200).json({
          status: "success",
          data: [],
          message: "Hozirda process holatidagi permissionlar mavjud emas",
        });
      }

      const permissionIds = activePermissions.map((p) => p._id.toString());

      const students = await StudentModel.aggregate([
        {
          $match: { "group.id": groupId },
        },
        {
          $lookup: {
            from: "appartments",
            localField: "_id",
            foreignField: "studentId",
            as: "appartmentData",
          },
        },
        {
          $addFields: {
            hasFilledForCurrentPermission: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: "$appartmentData",
                      cond: { $in: ["$$this.permission", permissionIds] },
                    },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $match: { hasFilledForCurrentPermission: false },
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
            appartmentData: {
              $filter: {
                input: "$appartmentData",
                cond: { $in: ["$$this.permission", permissionIds] },
              },
            },
          },
        },
      ]);

      res.status(200).json({ status: "success", data: students });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  },
);

export default router;
