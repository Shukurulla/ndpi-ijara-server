import express from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import adminModel from "../models/admin.model.js";
import AppartmentModel from "../models/appartment.model.js";
import StudentModel from "../models/student.model.js";
import facultyAdminModel from "../models/faculty.admin.model.js";
import {
  requireFacultyAdmin,
  requireMainAdmin,
} from "../middlewares/auth.middleware.js";
import axios from "axios";
import { config } from "dotenv";
import permissionModel from "../models/permission.model.js";
import tutorModel from "../models/tutor.model.js";
config();

const router = express.Router();

function getStudentCountByLevel(data) {
  const result = {};

  Object.values(data.level).forEach((degree) => {
    Object.entries(degree).forEach(([course, students]) => {
      if (!result[course]) {
        result[course] = 0;
      }
      result[course] += Object.values(students).reduce(
        (sum, count) => sum + count,
        0
      );
    });
  });

  return Object.entries(result).map(([level, total]) => ({ level, total }));
}

const isAdmin = async (id, res) => {
  const findAdmin = await adminModel.findById(id);

  if (!findAdmin) {
    return res
      .status(401)
      .json({ status: "error", message: "Bunday admin topilmadi" });
  }
};

router.get("/statistics/students/gender", async (req, res) => {
  try {
    const maleStudents = await StudentModel.countDocuments({
      "gender.name": "Erkak",
    });
    const femaleStudents = await StudentModel.countDocuments({
      "gender.name": "Ayol",
    });
    const data = {
      Erkak: maleStudents,
      Ayol: femaleStudents,
    };

    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// routes/statistics.routes.js - appartments/map endpoint yangilash
router.get("/statistics/appartments/map", authMiddleware, async (req, res) => {
  try {
    const { userId, role } = req.userData;
    console.log("Map endpoint called - role:", role);

    let query = {
      status: { $ne: "Being checked" },
      location: { $exists: true },
      "location.lat": { $exists: true, $ne: null, $ne: "" },
      "location.long": { $exists: true, $ne: null, $ne: "" },
    };

    // Faculty admin uchun faqat o'z fakulteti studentlari
    if (role === "facultyAdmin") {
      const facultyAdmin = await facultyAdminModel.findById(userId);
      if (!facultyAdmin) {
        return res.status(404).json({
          status: "error",
          message: "Fakultet admin topilmadi",
        });
      }

      const facultyNames = facultyAdmin.faculties.map((f) => f.name);

      // Faculty admin fakultetlaridagi studentlarni olish
      const students = await StudentModel.find({
        "department.name": { $in: facultyNames },
      }).select("_id");

      const studentIds = students.map((s) => s._id);
      query.studentId = { $in: studentIds };

      console.log(
        `Faculty admin: ${facultyNames.join(", ")} - ${
          studentIds.length
        } students`
      );
    }

    const allAppartments = await AppartmentModel.find(query)
      .select("location status _id studentId createdAt")
      .sort({ createdAt: -1 });

    console.log(
      `Found ${allAppartments.length} valid apartments for role: ${role}`
    );

    // Har bir student uchun eng oxirgi appartmentni olish
    const studentMap = new Map();

    for (const apartment of allAppartments) {
      const studentId = apartment.studentId.toString();

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, apartment);
      } else {
        const existing = studentMap.get(studentId);
        if (new Date(apartment.createdAt) > new Date(existing.createdAt)) {
          studentMap.set(studentId, apartment);
        }
      }
    }

    const latestAppartments = Array.from(studentMap.values());
    console.log(`Final apartments for map: ${latestAppartments.length}`);

    const formattedData = latestAppartments.map((apt) => ({
      _id: apt._id,
      studentId: apt.studentId,
      status: apt.status,
      location: {
        lat: apt.location.lat,
        long: apt.location.long,
      },
    }));

    res.status(200).json({
      status: "success",
      data: formattedData,
      total: formattedData.length,
      message: `${formattedData.length} ta apartment topildi`,
    });
  } catch (error) {
    console.error("Map endpoint error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

router.get(
  "/statistics/faculty-admin/students",
  authMiddleware,
  requireFacultyAdmin,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      // Faculty admin profilini olish
      const facultyAdmin = await facultyAdminModel.findById(userId);
      if (!facultyAdmin) {
        return res.status(404).json({
          status: "error",
          message: "Fakultet admin topilmadi",
        });
      }

      // Fakultet nomlarini olish
      const facultyNames = facultyAdmin.faculties.map((f) => f.name);

      // Shu fakultetlardagi studentlarni olish
      const students = await StudentModel.find({
        "department.name": { $in: facultyNames },
      }).select("gender department group level");

      // Jins bo'yicha statistika
      const genderStats = students.reduce((acc, student) => {
        const gender = student.gender?.name || "Noma'lum";
        acc[gender] = (acc[gender] || 0) + 1;
        return acc;
      }, {});

      // Kurs bo'yicha statistika
      const levelStats = students.reduce((acc, student) => {
        const level = student.level?.name || "Noma'lum";
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      }, {});

      // Fakultet bo'yicha statistika
      const facultyStats = students.reduce((acc, student) => {
        const faculty = student.department?.name || "Noma'lum";
        acc[faculty] = (acc[faculty] || 0) + 1;
        return acc;
      }, {});

      res.json({
        status: "success",
        data: {
          total: students.length,
          genderStats,
          levelStats,
          facultyStats,
          faculties: facultyNames,
        },
      });
    } catch (error) {
      console.error("Faculty admin statistics error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

// Faculty admin uchun ijara statistikasi
router.get(
  "/statistics/faculty-admin/appartments",
  authMiddleware,
  requireFacultyAdmin,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      // Faculty admin profilini olish
      const facultyAdmin = await facultyAdminModel.findById(userId);
      if (!facultyAdmin) {
        return res.status(404).json({
          status: "error",
          message: "Fakultet admin topilmadi",
        });
      }

      // Fakultet nomlarini olish
      const facultyNames = facultyAdmin.faculties.map((f) => f.name);

      // Shu fakultetlardagi studentlarni olish
      const students = await StudentModel.find({
        "department.name": { $in: facultyNames },
      }).select("_id");

      const studentIds = students.map((s) => s._id);

      // Ijara ma'lumotlarini olish
      const appartments = await AppartmentModel.find({
        studentId: { $in: studentIds },
        status: { $ne: "Being checked" },
      });

      // Status bo'yicha statistika
      const statusStats = appartments.reduce((acc, apt) => {
        const status = apt.status;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      res.json({
        status: "success",
        data: {
          totalStudents: students.length,
          totalAppartments: appartments.length,
          studentsWithAppartments: appartments.length,
          studentsWithoutAppartments: students.length - appartments.length,
          statusStats,
        },
      });
    } catch (error) {
      console.error("Faculty admin appartments statistics error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get(
  "/statistics/appartments/level",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      isAdmin(userId, res);
      const { data } = await axios.get(
        `https://student.karsu.uz/rest/v1/public/stat-student`
      );
      const totalStudents = getStudentCountByLevel(data.data);
      res.status(200).json({ status: "success", data: totalStudents });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get(
  "/statistics/appartment/boiler",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      await isAdmin(userId, res);

      // Aggregation pipeline yordamida optimizatsiya
      const boilerStats = await AppartmentModel.aggregate([
        // Faqat "Being checked" bo'lmagan appartmentlarni olish
        {
          $match: {
            status: { $ne: "Being checked" },
            typeOfBoiler: { $exists: true, $ne: null },
          },
        },
        // Har bir student uchun eng oxirgi appartmentni olish
        {
          $sort: { studentId: 1, createdAt: -1 },
        },
        {
          $group: {
            _id: "$studentId",
            latestAppartment: { $first: "$$ROOT" },
          },
        },
        // typeOfBoiler bo'yicha guruhlash
        {
          $group: {
            _id: "$latestAppartment.typeOfBoiler",
            count: { $sum: 1 },
          },
        },
      ]);

      const boilerTypes = [
        "Ariston kotyol",
        "Qo'l bo'la kotyol",
        "Qo'l bo'la pech",
        "Elektropech",
        "Konditsioner",
        "Isitish uskunasi yo'q",
      ];

      // Natijalarni formatlash
      const result = boilerTypes.map((boilerType) => {
        const found = boilerStats.find((stat) => stat._id === boilerType);
        return {
          title: boilerType,
          total: found ? found.count : 0,
        };
      });

      // Debug uchun log
      console.log("Boiler statistics:", result);
      console.log("Raw aggregation result:", boilerStats);

      res.json({
        status: "success",
        data: result,
      });
    } catch (error) {
      console.error("Boiler statistics error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get(
  "/statistics/appartment/smallDistrict",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.userData;
      await isAdmin(userId, res);

      // Aggregation pipeline yordamida optimizatsiya
      const districtStats = await AppartmentModel.aggregate([
        // Faqat "Being checked" bo'lmagan appartmentlarni olish
        {
          $match: {
            status: { $ne: "Being checked" },
            smallDistrict: { $exists: true, $ne: null, $ne: "" },
          },
        },
        // Har bir student uchun eng oxirgi appartmentni olish
        {
          $sort: { studentId: 1, createdAt: -1 },
        },
        {
          $group: {
            _id: "$studentId",
            latestAppartment: { $first: "$$ROOT" },
          },
        },
        // smallDistrict bo'yicha guruhlash (trim qilish uchun)
        {
          $addFields: {
            trimmedDistrict: {
              $trim: { input: "$latestAppartment.smallDistrict" },
            },
          },
        },
        {
          $group: {
            _id: "$trimmedDistrict",
            count: { $sum: 1 },
          },
        },
      ]);

      const smallDistricts = [
        "20 - kichik tuman",
        "21 - kichik tuman",
        "22 - kichik tuman",
        "23 - kichik tuman",
        "24 - kichik tuman",
        "25 - kichik tuman",
        "26 - kichik tuman",
        "27 - kichik tuman",
        "28 - kichik tuman",
      ];

      // Natijalarni formatlash
      const result = smallDistricts.map((district) => {
        const found = districtStats.find((stat) => stat._id === district);
        return {
          title: district,
          total: found ? found.count : 0,
        };
      });

      // Debug uchun log
      console.log("SmallDistrict statistics:", result);
      console.log("Raw aggregation result:", districtStats);

      res.json({
        status: "success",
        data: result,
      });
    } catch (error) {
      console.error("SmallDistrict statistics error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get("/statistics/region", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    isAdmin(userId, res);
    const { data } = await axios.get(
      `https://student.karsu.uz/rest/v1/public/stat-student`
    );
    const transformData = (data) => {
      return Object.entries(data.region).map(([region, values]) => ({
        region,
        total: values.Bakalavr + values.Magistr,
      }));
    };

    res.status(200).json({ status: "success", data: transformData(data.data) });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/appartment/student-info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const findAppartment = await AppartmentModel.findById(id);
    if (!findAppartment) {
      return res.status(401).json({
        status: "error",
        message: "Bunday ijara malumotlari topilmadi",
      });
    }
    const findStudent = await StudentModel.findById(
      findAppartment.studentId
    ).select("image second_name province level first_name");
    const dataSchema = {
      appartment: findAppartment,
      student: findStudent,
    };
    res.status(200).json({ status: "success", data: dataSchema });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/statistics/students/all", async (req, res) => {
  try {
    const students = await StudentModel.find();
    res.json({ status: "success", data: students });
  } catch (error) {
    res.json({ status: "error", message: error.message });
  }
});

router.post(
  "/statistics/appartment/filter",
  authMiddleware,
  async (req, res) => {
    try {
      const { status, smallDistrict, province, course } = req.body;

      let studentFilter = {};

      // Student filter yaratish
      if (province) studentFilter["province.name"] = province;
      if (course) studentFilter["level.name"] = course;

      // Studentlarni topish
      let targetStudents = [];
      if (province || course) {
        targetStudents = await StudentModel.find(studentFilter, "_id");
      } else {
        targetStudents = await StudentModel.find({}, "_id");
      }

      if (targetStudents.length === 0) {
        return res.json({
          status: "success",
          data: [],
        });
      }

      // Har bir student uchun eng oxirgi appartmentni topish
      const filteredAppartments = [];
      for (const student of targetStudents) {
        let appartmentFilter = { studentId: student._id };

        // Appartment filter qo'shish
        if (status) appartmentFilter.status = status;
        if (smallDistrict) appartmentFilter.smallDistrict = smallDistrict;

        const latestAppartment = await AppartmentModel.findOne(appartmentFilter)
          .select("location status")
          .sort({ createdAt: -1 });

        if (latestAppartment) {
          filteredAppartments.push(latestAppartment);
        }
      }

      res.json({
        status: "success",
        data: filteredAppartments.filter((c) => c.status !== "Being checked"),
      });
    } catch (error) {
      console.error("Xatolik:", error);
      res
        .status(500)
        .json({ status: "error", message: "Internal Server Error" });
    }
  }
);

router.post("/statistics/faculty-data", authMiddleware, async (req, res) => {
  try {
    const { faculty } = req.body; // Filter ma'lumotlari body orqali keladi

    // Process holatidagi permissionlarni olish
    const activePermissions = await permissionModel.find({
      status: "process",
    });
    const permissionIds = activePermissions.map((p) => p._id.toString());

    const matchStage = {
      "accommodation.name": { $ne: "O'z uyida" }, // "O'z uyida" bo'lmagan talabalar
    };

    if (faculty?.length) {
      matchStage["department.name"] = { $in: faculty }; // Faqat tanlangan fakultetlar
    }

    const facultyStats = await StudentModel.aggregate([
      { $match: matchStage }, // Faqat kerakli studentlarni olish
      {
        $lookup: {
          from: "appartments", // AppartmentModel bilan bog'lash
          localField: "_id",
          foreignField: "studentId",
          as: "rentedInfo",
        },
      },
      {
        $addFields: {
          hasRentedInfo: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: "$rentedInfo",
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
        $group: {
          _id: "$department.name", // Fakultet bo'yicha guruhlash
          jami: { $sum: 1 }, // Har bir fakultet bo'yicha umumiy studentlar soni
          ijarada: {
            $sum: {
              $cond: {
                if: "$hasRentedInfo",
                then: 1,
                else: 0,
              },
            },
          }, // Ijarada yashovchi talabalar sonini hisoblash
        },
      },
      {
        $project: {
          _id: 0,
          name: "$_id", // Fakultet nomi
          jami: 1, // Jami talabalar soni
          ijarada: 1, // Ijarada yashovchilar soni
        },
      },
    ]);

    res.json(facultyStats);
  } catch (error) {
    console.error("Error fetching faculty statistics:", error);
    res.status(500).json({ message: "Serverda xatolik yuz berdi" });
  }
});
// Permission statistikasi - Main Admin uchun (OPTIMIZED)
router.get(
  "/statistics/permission/all",
  authMiddleware,
  requireMainAdmin,
  async (req, res) => {
    try {
      // Barcha process holatidagi permissionlarni olish
      const processPermissions = await permissionModel
        .find({ status: "process" })
        .select("_id createdAt")
        .lean();

      if (processPermissions.length === 0) {
        return res.json({
          status: "success",
          data: {
            hasActivePermission: false,
            message: "Hozirda process holatidagi permissionlar mavjud emas",
          },
        });
      }

      const permissionIds = processPermissions.map((p) => p._id.toString());

      // Barcha fakultetlar
      const faculties = await StudentModel.distinct("department.name");

      // Bir martalik aggregation - barcha kerakli ma'lumotlarni olish
      const appartmentStats = await AppartmentModel.aggregate([
        {
          $match: {
            permission: { $in: permissionIds },
          },
        },
        {
          $lookup: {
            from: "students",
            localField: "studentId",
            foreignField: "_id",
            as: "student",
          },
        },
        {
          $unwind: "$student",
        },
        {
          $group: {
            _id: "$student.department.name",
            filledCount: { $sum: 1 },
            studentIds: { $addToSet: "$studentId" },
          },
        },
      ]);

      // Fakultetlar bo'yicha umumiy talabalar soni
      const facultyStudentCounts = await StudentModel.aggregate([
        {
          $match: {
            "department.name": { $in: faculties.filter(Boolean) },
          },
        },
        {
          $group: {
            _id: "$department.name",
            totalStudents: { $sum: 1 },
          },
        },
      ]);

      // Ma'lumotlarni birlashtirish
      const facultyStatsMap = new Map();

      facultyStudentCounts.forEach((item) => {
        facultyStatsMap.set(item._id, {
          facultyName: item._id,
          totalStudents: item.totalStudents,
          filled: 0,
          notFilled: item.totalStudents,
          percentage: "0.0",
        });
      });

      appartmentStats.forEach((item) => {
        if (item._id && facultyStatsMap.has(item._id)) {
          const faculty = facultyStatsMap.get(item._id);
          faculty.filled = item.filledCount;
          faculty.notFilled = faculty.totalStudents - item.filledCount;
          faculty.percentage =
            faculty.totalStudents > 0
              ? ((item.filledCount / faculty.totalStudents) * 100).toFixed(1)
              : "0.0";
        }
      });

      const facultyStats = Array.from(facultyStatsMap.values());
      const allStudentsCount = await StudentModel.countDocuments();
      // Total statistics
      const totalStats = {
        totalStudents: allStudentsCount,
        totalFilled: facultyStats.reduce((sum, f) => sum + f.filled, 0),
        totalNotFilled: facultyStats.reduce((sum, f) => sum + f.notFilled, 0),
      };

      res.json({
        status: "success",
        data: {
          hasActivePermission: true,
          activePermissionsCount: processPermissions.length,
          permissions: processPermissions,
          faculties: facultyStats.sort((a, b) => b.filled - a.filled),
          totalStats,
        },
      });
    } catch (error) {
      console.error("❌ Permission statistics error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

// Permission statistikasi - Faculty Admin uchun (OPTIMIZED)
router.get(
  "/statistics/permission/faculty-admin",
  authMiddleware,
  requireFacultyAdmin,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      // Faculty admin ma'lumotlari
      const facultyAdmin = await facultyAdminModel.findById(userId).lean();
      if (!facultyAdmin) {
        return res.status(404).json({
          status: "error",
          message: "Fakultet admin topilmadi",
        });
      }

      const facultyNames = facultyAdmin.faculties.map((f) => f.name);

      // Barcha process holatidagi permissionlar
      const processPermissions = await permissionModel
        .find({ status: "process" })
        .select("_id createdAt")
        .lean();

      if (processPermissions.length === 0) {
        return res.json({
          status: "success",
          data: {
            hasActivePermission: false,
            message: "Hozirda process holatidagi permissionlar mavjud emas",
          },
        });
      }

      const permissionIds = processPermissions.map((p) => p._id.toString());

      // Fakultetlar bo'yicha statistika (aggregation)
      const facultyAppartments = await AppartmentModel.aggregate([
        {
          $match: {
            permission: { $in: permissionIds },
          },
        },
        {
          $lookup: {
            from: "students",
            localField: "studentId",
            foreignField: "_id",
            as: "student",
          },
        },
        {
          $unwind: "$student",
        },
        {
          $match: {
            "student.department.name": { $in: facultyNames },
          },
        },
        {
          $group: {
            _id: "$student.department.name",
            filledCount: { $sum: 1 },
          },
        },
      ]);

      const facultyTotals = await StudentModel.aggregate([
        {
          $match: {
            "department.name": { $in: facultyNames },
          },
        },
        {
          $group: {
            _id: "$department.name",
            totalStudents: { $sum: 1 },
          },
        },
      ]);

      const facultyStatsMap = new Map();
      facultyTotals.forEach((item) => {
        facultyStatsMap.set(item._id, {
          facultyName: item._id,
          totalStudents: item.totalStudents,
          filled: 0,
          notFilled: item.totalStudents,
          percentage: "0.0",
        });
      });

      facultyAppartments.forEach((item) => {
        if (facultyStatsMap.has(item._id)) {
          const faculty = facultyStatsMap.get(item._id);
          faculty.filled = item.filledCount;
          faculty.notFilled = faculty.totalStudents - item.filledCount;
          faculty.percentage =
            faculty.totalStudents > 0
              ? ((item.filledCount / faculty.totalStudents) * 100).toFixed(1)
              : "0.0";
        }
      });

      const facultyStats = Array.from(facultyStatsMap.values());

      // Guruhlar bo'yicha statistika
      const tutors = await tutorModel
        .find({ facultyAdmin: userId })
        .select("group")
        .lean();

      const allGroupCodes = tutors.flatMap((t) =>
        t.group.map((g) => g.code.toString())
      );

      const groupAppartments = await AppartmentModel.aggregate([
        {
          $match: {
            permission: { $in: permissionIds },
          },
        },
        {
          $lookup: {
            from: "students",
            localField: "studentId",
            foreignField: "_id",
            as: "student",
          },
        },
        {
          $unwind: "$student",
        },
        {
          $addFields: {
            "student.groupIdString": { $toString: "$student.group.id" },
          },
        },
        {
          $match: {
            "student.groupIdString": { $in: allGroupCodes },
          },
        },
        {
          $group: {
            _id: "$student.group.id",
            groupName: { $first: "$student.group.name" },
            filledCount: { $sum: 1 },
          },
        },
      ]);

      const groupTotals = await StudentModel.aggregate([
        {
          $addFields: {
            groupIdString: { $toString: "$group.id" },
          },
        },
        {
          $match: {
            groupIdString: { $in: allGroupCodes },
          },
        },
        {
          $group: {
            _id: "$group.id",
            groupName: { $first: "$group.name" },
            totalStudents: { $sum: 1 },
          },
        },
      ]);

      const groupStatsMap = new Map();
      groupTotals.forEach((item) => {
        groupStatsMap.set(item._id.toString(), {
          groupName: item.groupName,
          groupCode: item._id,
          totalStudents: item.totalStudents,
          filled: 0,
          notFilled: item.totalStudents,
          percentage: "0.0",
        });
      });

      groupAppartments.forEach((item) => {
        const key = item._id.toString();
        if (groupStatsMap.has(key)) {
          const group = groupStatsMap.get(key);
          group.filled = item.filledCount;
          group.notFilled = group.totalStudents - item.filledCount;
          group.percentage =
            group.totalStudents > 0
              ? ((item.filledCount / group.totalStudents) * 100).toFixed(1)
              : "0.0";
        }
      });

      const groupStats = Array.from(groupStatsMap.values());

      const totalStats = {
        totalStudents: facultyStats.reduce(
          (sum, f) => sum + f.totalStudents,
          0
        ),
        totalFilled: facultyStats.reduce((sum, f) => sum + f.filled, 0),
        totalNotFilled: facultyStats.reduce((sum, f) => sum + f.notFilled, 0),
      };

      res.json({
        status: "success",
        data: {
          hasActivePermission: true,
          activePermissionsCount: processPermissions.length,
          permissions: processPermissions,
          faculties: facultyStats.sort((a, b) => b.filled - a.filled),
          groups: groupStats.sort((a, b) => b.filled - a.filled),
          totalStats,
        },
      });
    } catch (error) {
      console.error("❌ Faculty admin permission statistics error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);
router.post(
  "/statistics/faculty-groups",
  authMiddleware,
  requireMainAdmin,
  async (req, res) => {
    try {
      const { facultyName } = req.body;

      if (!facultyName) {
        return res.status(400).json({
          status: "error",
          message: "Fakultet nomi kiritilmagan",
        });
      }

      // Barcha process holatidagi permissionlar
      const processPermissions = await permissionModel
        .find({ status: "process" })
        .select("_id")
        .lean();

      if (processPermissions.length === 0) {
        return res.json({
          status: "success",
          data: [],
        });
      }

      const permissionIds = processPermissions.map((p) => p._id.toString());

      // Fakultet bo'yicha studentlarni olish
      const students = await StudentModel.find({
        "department.name": facultyName,
      })
        .select("_id group")
        .lean();

      if (students.length === 0) {
        return res.json({
          status: "success",
          data: [],
        });
      }

      // Guruhlar bo'yicha guruhlash
      const groupsMap = new Map();
      students.forEach((s) => {
        if (s.group && s.group.id) {
          const groupKey = s.group.id.toString();
          if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
              groupName: s.group.name,
              groupCode: s.group.id,
              totalStudents: 0,
              studentIds: [],
            });
          }
          const group = groupsMap.get(groupKey);
          group.totalStudents++;
          group.studentIds.push(s._id);
        }
      });

      // Har bir guruh uchun to'ldirilganlik ma'lumotini olish
      const groupsWithStats = await Promise.all(
        Array.from(groupsMap.values()).map(async (group) => {
          const filledCount = await AppartmentModel.countDocuments({
            permission: { $in: permissionIds },
            studentId: { $in: group.studentIds },
          });

          const percentage =
            group.totalStudents > 0
              ? ((filledCount / group.totalStudents) * 100).toFixed(1)
              : "0.0";

          return {
            groupName: group.groupName,
            groupCode: group.groupCode,
            totalStudents: group.totalStudents,
            filled: filledCount,
            notFilled: group.totalStudents - filledCount,
            percentage,
          };
        })
      );

      // Percentage bo'yicha saralash
      groupsWithStats.sort(
        (a, b) => parseFloat(b.percentage) - parseFloat(a.percentage)
      );

      res.json({
        status: "success",
        data: groupsWithStats,
      });
    } catch (error) {
      console.error("❌ Faculty groups error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

// Guruh studentlarini olish (Faculty Admin uchun)
router.post(
  "/statistics/group-students",
  authMiddleware,
  requireFacultyAdmin,
  async (req, res) => {
    try {
      const { groupCode } = req.body;

      if (!groupCode) {
        return res.status(400).json({
          status: "error",
          message: "Guruh kodi kiritilmagan",
        });
      }

      // Barcha process holatidagi permissionlar
      const processPermissions = await permissionModel
        .find({ status: "process" })
        .select("_id")
        .lean();

      if (processPermissions.length === 0) {
        return res.json({
          status: "success",
          data: [],
        });
      }

      const permissionIds = processPermissions.map((p) => p._id.toString());

      // Guruh studentlarini olish
      const students = await StudentModel.find({
        $or: [
          { "group.id": groupCode },
          { "group.id": String(groupCode) },
          { "group.id": Number(groupCode) },
        ],
      })
        .select(
          "full_name first_name second_name image university level specialty province group"
        )
        .lean();

      if (students.length === 0) {
        return res.json({
          status: "success",
          data: [],
        });
      }

      // Har bir student uchun to'ldirilganlik holatini tekshirish
      const studentsWithStatus = await Promise.all(
        students.map(async (student) => {
          const appartment = await AppartmentModel.findOne({
            permission: { $in: permissionIds },
            studentId: student._id,
          }).lean();

          return {
            ...student,
            filled: !!appartment,
            appartmentStatus: appartment?.status || null,
          };
        })
      );

      // To'ldirilmagan studentlar oldinda
      studentsWithStatus.sort((a, b) => a.filled - b.filled);

      res.json({
        status: "success",
        data: studentsWithStatus,
      });
    } catch (error) {
      console.error("❌ Group students error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get(
  "/statistics/permissions/recent",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId, role } = req.userData;

      const activePermissions = await permissionModel.find({
        status: "process",
      });
      const permissionIds = activePermissions.map((p) => p._id.toString());

      let appartmentQuery = {
        permission: { $in: permissionIds },
      };

      // Faculty admin uchun faqat o'z fakulteti studentlarining ma'lumotlari
      if (role === "facultyAdmin") {
        const facultyAdmin = await facultyAdminModel.findById(userId);
        if (!facultyAdmin) {
          return res.status(404).json({
            status: "error",
            message: "Fakultet admin topilmadi",
          });
        }

        const facultyNames = facultyAdmin.faculties.map((f) => f.name);

        // Fakultet studentlarini olish
        const students = await StudentModel.find({
          "department.name": { $in: facultyNames },
        }).select("_id");

        const studentIds = students.map((s) => s._id);
        appartmentQuery.studentId = { $in: studentIds };
      }

      const recentAppartments = await AppartmentModel.find(appartmentQuery);

      const totalTenants = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        typeAppartment: "tenant",
      });
      const totalRelative = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        typeAppartment: "relative",
      });
      const totalLittleHouse = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        typeAppartment: "littleHouse",
      });
      const totalBedRoom = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        typeAppartment: "bedroom",
      });

      const totalAppartments = recentAppartments.length;
      const redAppartments = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        status: "red",
      });
      const greenAppartments = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        status: "green",
      });
      const yellowAppartments = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        status: "yellow",
      });
      const blueAppartments = await AppartmentModel.countDocuments({
        ...appartmentQuery,
        status: "Being checked",
      });

      res.json({
        status: "success",
        data: {
          totalAppartments,
          redAppartments,
          greenAppartments,
          yellowAppartments,
          blueAppartments,
          totalTenants,
          totalRelative,
          totalLittleHouse,
          totalBedRoom,
        },
      });
    } catch (error) {
      console.error("Recent permissions error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

// Dashboard uchun umumiy statistika
router.get(
  "/statistics/dashboard/summary",
  authMiddleware,
  async (req, res) => {
    try {
      const { userId, role } = req.userData;

      // Process holatidagi permissionlarni olish
      const activePermissions = await permissionModel.find({
        status: "process",
      });
      const permissionIds = activePermissions.map((p) => p._id.toString());

      let studentQuery = {};
      let appartmentQuery = {
        permission: { $in: permissionIds },
      };

      // Faculty admin uchun faqat o'z fakulteti
      if (role === "facultyAdmin") {
        const facultyAdmin = await facultyAdminModel.findById(userId);
        if (!facultyAdmin) {
          return res.status(404).json({
            status: "error",
            message: "Fakultet admin topilmadi",
          });
        }

        const facultyNames = facultyAdmin.faculties.map((f) => f.name);
        studentQuery["department.name"] = { $in: facultyNames };

        // Fakultet studentlarini olish
        const students = await StudentModel.find(studentQuery).select("_id");
        const studentIds = students.map((s) => s._id);
        appartmentQuery.studentId = { $in: studentIds };
      }

      // Statistikalarni parallel olish
      const [
        totalStudents,
        totalAppartments,
        tenantCount,
        relativeCount,
        littleHouseCount,
        bedroomCount,
        genderStats,
      ] = await Promise.all([
        StudentModel.countDocuments(studentQuery),
        AppartmentModel.countDocuments(appartmentQuery),
        AppartmentModel.countDocuments({
          ...appartmentQuery,
          typeAppartment: "tenant",
        }),
        AppartmentModel.countDocuments({
          ...appartmentQuery,
          typeAppartment: "relative",
        }),
        AppartmentModel.countDocuments({
          ...appartmentQuery,
          typeAppartment: "littleHouse",
        }),
        AppartmentModel.countDocuments({
          ...appartmentQuery,
          typeAppartment: "bedroom",
        }),
        StudentModel.aggregate([
          { $match: studentQuery },
          {
            $group: {
              _id: "$gender.name",
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      // Gender statistikasini formatlash
      const genderData = {
        Erkak: 0,
        Ayol: 0,
      };
      genderStats.forEach((item) => {
        if (item._id === "Erkak" || item._id === "Ayol") {
          genderData[item._id] = item.count;
        }
      });

      res.json({
        status: "success",
        data: {
          totalStudents,
          totalAppartments,
          studentsWithAppartments: totalAppartments,
          studentsWithoutAppartments: totalStudents - totalAppartments,
          typeBreakdown: {
            tenant: tenantCount,
            relative: relativeCount,
            littleHouse: littleHouseCount,
            bedroom: bedroomCount,
          },
          genderBreakdown: genderData,
        },
      });
    } catch (error) {
      console.error("Dashboard summary error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

export default router;
