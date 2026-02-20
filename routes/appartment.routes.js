import express from "express";
import AppartmentModel from "../models/appartment.model.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import StudentModel from "../models/student.model.js";
import FacultyModel from "../models/faculty.model.js";
import GroupModel from "../models/group.model.js";
import tutorModel from "../models/tutor.model.js";
import { uploadMultipleImages } from "../middlewares/upload.middleware.js";
import NotificationModel from "../models/notification.model.js";
import mongoose from "mongoose";
import permissionModel from "../models/permission.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
router.get("/appartment-types-count", async (req, res) => {
  try {
    const permissions = await permissionModel.find({ status: "process" });
    const permissionIds = permissions.map((p) => p._id.toString());
    const tenantCount = await AppartmentModel.countDocuments({
      typeAppartment: "tenant",
      permission: { $in: permissionIds },
    });
    const relativeCount = await AppartmentModel.countDocuments({
      typeAppartment: "relative",
      permission: { $in: permissionIds },
    });
    const littleHouseCount = await AppartmentModel.countDocuments({
      typeAppartment: "littleHouse",
      permission: { $in: permissionIds },
    });
    const bedroomCount = await AppartmentModel.countDocuments({
      typeAppartment: "bedroom",
      permission: { $in: permissionIds },
    });
    const total = await AppartmentModel.countDocuments({
      permission: { $in: permissionIds },
    });

    res.status(200).json({
      status: "success",
      data: {
        tenant: tenantCount,
        relative: relativeCount,
        littleHouse: littleHouseCount,
        bedroom: bedroomCount,
      },
      total: total,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});
router.post(
  "/appartment/create",
  authMiddleware,
  uploadMultipleImages,
  async (req, res) => {
    try {
      const { studentId, typeAppartment, permission } = req.body;

      if (!studentId || studentId === "undefined" || studentId.trim() === "") {
        return res.status(401).json({
          status: "error",
          message: "studentId kiritilmagan",
        });
      }

      const findStudent = await StudentModel.findById(studentId);
      if (!findStudent) {
        return res
          .status(401)
          .json({ status: "error", message: "Bunday student topilmadi" });
      }

      const currentAppartment = await AppartmentModel.findOne({
        studentId,
        current: true,
        needNew: false,
        permission,
      });

      if (!permission) {
        return res
          .status(400)
          .json({ status: "error", message: "Permission _id kiritilmagan" });
      }

      const findPermission = await permissionModel.findById(permission);

      if (!findPermission) {
        return res.status(400).json({
          status: "error",
          message: "Permission malumotlari topilmadi",
        });
      }

      if (findPermission.status == "finished") {
        return res
          .status(400)
          .json({ status: "error", message: "Bu xabarnoma muddati tugagan" });
      }

      if (currentAppartment) {
        return res.status(401).json({
          status: "error",
          message: "Siz oldin ijara ma'lumotlarini kiritgansiz",
        });
      }

      if (typeAppartment == "tenant") {
        if (
          !req.files ||
          !req.files.boilerImage ||
          !req.files.gazStove ||
          !req.files.chimney ||
          !req.files.additionImage
        ) {
          return res.status(400).json({
            status: "error",
            message: "Katyol, gazplita va Mo'ri rasmlari yuklanishi kerak",
          });
        }

        if (!req.body.lat || !req.body.lon) {
          return res.status(400).json({
            status: "error",
            message: "Siz joylashuvga ruhsat bermagansiz",
          });
        }

        const boilerImage = req.files.boilerImage[0];
        const gazStove = req.files.gazStove[0];
        const chimney = req.files.chimney[0];
        const additionImage = req.files?.additionImage
          ? req.files?.additionImage[0]
          : null;

        const contractImage = req.files?.contractImage
          ? req.files?.contractImage[0]
          : null;
        const contractPdf = req.files?.contractPdf
          ? req.files?.contractPdf[0]
          : null;

        const getFileUrl = (file, isImage = true) => {
          const folder = isImage ? "images" : "files";
          return `/public/${folder}/${file.filename}${
            file.originalname.includes(".")
              ? ""
              : "." + file.originalname.split(".").pop()
          }`;
        };

        const apartmentData = {
          studentId,
          boilerImage: { url: getFileUrl(boilerImage) },
          gazStove: { url: getFileUrl(gazStove) },
          chimney: { url: getFileUrl(chimney) },
          additionImage: additionImage
            ? { url: getFileUrl(additionImage) }
            : null,
          needNew: false,
          current: true,
          location: {
            lat: req.body.lat,
            long: req.body.lon,
          },
          ...req.body,
        };

        if (contractImage) {
          apartmentData.contractImage = getFileUrl(contractImage);
        }
        if (contractPdf) {
          apartmentData.contractPdf = getFileUrl(contractPdf, false);
        }

        if (contractImage || contractPdf || req.body.contract) {
          apartmentData.contract = true;
        }

        const newAppartment = new AppartmentModel(apartmentData);

        await newAppartment.save();

        await NotificationModel.deleteMany({
          userId: studentId,
          notification_type: "report",
          status: "red",
        });
        await NotificationModel.deleteMany({
          userId: studentId,
          notification_type: "report",
          status: "yellow",
        });
        await NotificationModel.create({
          userId: studentId,
          notification_type: "report",
          message: "Tekshirilmoqda",
          status: "blue",
          appartmentId: newAppartment._id,
        });

        return res.status(201).json({
          status: "success",
          message: "Ijara ma'lumotlari muvaffaqiyatli yaratildi",
          data: newAppartment,
        });
      }

      if (typeAppartment == "relative" || typeAppartment == "littleHouse") {
        const {
          studentId,
          studentPhoneNumber,
          appartmentOwnerName,
          appartmentOwnerPhone,
          typeAppartment,
          permission,
        } = req.body;

        const appartment = await AppartmentModel.create({
          studentId,
          studentPhoneNumber,
          appartmentOwnerName,
          appartmentOwnerPhone,
          typeAppartment,
          green: "green",
          permission,
        });

        const filterAppartment = {
          studentPhoneNumber: appartment.studentPhoneNumber,
          studentId: appartment.studentId,
          appartmentOwnerName: appartment.appartmentOwnerName,
          appartmentOwnerPhone: appartment.appartmentOwnerPhone,
          typeAppartment: appartment.typeAppartment,
          createdAt: appartment.createdAt,
          updatedAt: appartment.updatedAt,
          _id: appartment._id,
          green: "green",
          permission: appartment.appartment,
        };

        await NotificationModel.deleteMany({
          userId: studentId,
          status: "Being checked",
        });
        await NotificationModel.deleteMany({
          userId: studentId,
          status: "red",
        });
        await NotificationModel.deleteMany({
          userId: studentId,
          status: "yellow",
        });

        await NotificationModel.create({
          userId: studentId,
          notification_type: "report",
          message: "Tabriklaymiz siz yashil zonadasiz",
          status: "green",
          appartmentId: appartment._id,
        });

        return res
          .status(200)
          .json({ status: "success", data: filterAppartment });
      }

      if (typeAppartment == "bedroom") {
        const {
          studentId,
          bedroomNumber,
          permission,
          roomNumber,
          studentPhoneNumber,
        } = req.body;

        const appartment = await AppartmentModel.create({
          studentPhoneNumber,
          studentId,
          permission,
          bedroom: {
            bedroomNumber: bedroomNumber.toString(),
            roomNumber: roomNumber.toString(),
          },
          status: "green",
          typeAppartment,
        });

        const filterAppartment = {
          studentPhoneNumber: appartment.studentPhoneNumber,
          bedroom: appartment.bedroom,
          typeAppartment: appartment.typeAppartment,
          _id: appartment._id,
          studentId: appartment.studentId,
          createdAt: appartment.createdAt,
          green: "green",
          permission: appartment.permission,
          updatedAt: appartment.updatedAt,
        };

        await NotificationModel.deleteMany({
          userId: studentId,
          status: "Being checked",
        });
        await NotificationModel.deleteMany({
          userId: studentId,
          status: "red",
        });
        await NotificationModel.deleteMany({
          userId: studentId,
          status: "yellow",
        });
        await NotificationModel.create({
          userId: studentId,
          notification_type: "report",
          message: "Ijara malumotlari tekshirildi",
          status: "green",
          appartmentId: appartment._id,
        });
        await NotificationModel.create({
          userId: studentId,
          notification_type: "push",
          message: "Tabriklaymiz siz yashil zonadasiz",
          status: "green",
          appartmentId: appartment._id,
        });

        return res.status(201).json({
          status: "success",
          message: "Ijara ma'lumotlari muvaffaqiyatli yaratildi",
          data: filterAppartment,
        });
      }
    } catch (error) {
      res.status(500).json({
        status: "error",
        message: "Serverda xatolik yuz berdi",
      });
    }
  }
);

router.get("/appartment/all", authMiddleware, async (req, res) => {
  try {
    const appartments = await AppartmentModel.find();
    res.json({ message: "success", data: appartments });
  } catch (error) {
    res.json({ status: "error", message: "Serverda xatolik yuz berdi" });
  }
});

router.get("/appartment/by-group/:name", async (req, res) => {
  try {
    const findStudents = await StudentModel.find({
      "group.name": req.params.name,
    });

    const appartments = await AppartmentModel.find({
      typeAppartment: "tenant",
    }).select("-bedroom");

    const filteredAppartments = findStudents.map((student) => {
      const studentAppartments = appartments
        .filter((c) => c.studentId == student.student_id_number)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return {
        student: {
          group: student.group,
          _id: student._id,
          image: student.image,
          full_name: student.full_name,
          faculty: student.faculty,
        },
        appartment: studentAppartments[0] || null,
      };
    });
    res.json({ status: "success", data: filteredAppartments });
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ status: "error", message: error.message });
  }
});

router.post("/appartment/check", authMiddleware, async (req, res) => {
  try {
    const { appartmentId, chimney, gazStove, boiler, additionImage } = req.body;

    let status = null;

    if ([chimney, gazStove, boiler].includes("red")) {
      status = "red";
    } else if ([chimney, gazStove, boiler].includes("yellow")) {
      status = "yellow";
    } else {
      status = "green";
    }

    const findAppartment = await AppartmentModel.findById(appartmentId).select(
      "-bedroom "
    );
    if (!findAppartment) {
      return res
        .status(400)
        .json({ status: "error", message: "Bunday kvartira topilmadi" });
    }

    let additionImageStatus = "";
    if (additionImage) additionImageStatus = additionImage;

    const findYellowNotification = await NotificationModel.findOne({
      userId: findAppartment.studentId,
      notification_type: "report",
      status: "yellow",
      appartmentId,
    });

    if (findYellowNotification) {
      return res.status(400).json({
        status: "error",
        message: "Siz bu student uchun qayta topshirish buyrugini jonatgansiz",
      });
    }

    await AppartmentModel.findByIdAndUpdate(appartmentId, {
      status,
      boilerImage: { ...findAppartment.boilerImage, status: boiler },
      chimney: { ...findAppartment.chimney, status: chimney },
      gazStove: { ...findAppartment.gazStove, status: gazStove },
      additionImage: {
        ...findAppartment.additionImage,
        status: additionImageStatus,
      },
    });

    await NotificationModel.deleteMany({
      appartmentId,
      userId: findAppartment.studentId,
      status: "blue",
      notification_type: "report",
    });

    await NotificationModel.deleteOne({
      appartmentId,
      userId: findAppartment.studentId,
      status: "green",
      message: "Ijara malumotlari tekshirildi",
      notification_type: "report",
    });

    switch (status) {
      case "green":
        await NotificationModel.create({
          appartmentId,
          userId: findAppartment.studentId,
          status: "green",
          message: "Siz yashil zonaga kirdingiz",
          notification_type: "report",
        });
        break;
      case "yellow":
        await NotificationModel.create({
          appartmentId,
          userId: findAppartment.studentId,
          status: "green",
          message: "Siz sariq zonaga kirdingiz ",
          notification_type: "report",
        });
        break;
      case "red":
        await NotificationModel.create({
          appartmentId,
          userId: findAppartment.studentId,
          status: "green",
          message: "Siz qizil zonaga kirdingiz ",
          notification_type: "report",
        });
        break;

      default:
        break;
    }

    const checkedAppartment = await AppartmentModel.findById(appartmentId);
    res.status(200).json({ status: "success", data: checkedAppartment });
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ status: "error", message: error.message });
  }
});

router.get("/faculties", async (req, res) => {
  try {
    const faculties = await FacultyModel.find({ active: true })
      .select("name")
      .sort({ name: 1 })
      .lean();
    res.json({ data: faculties.map((f) => f.name) });
  } catch (error) {
    res.json({ message: error.message });
  }
});

router.get("/groups", async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const groups = await GroupModel.find(query)
      .select("id name educationLang")
      .sort({ name: 1 })
      .lean();
    res.json({ data: groups });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/students-filter", async (req, res) => {
  try {
    const { gender, faculty, year } = req.body;

    const findStudents = await StudentModel.find({
      "department.name": faculty,
      "gender.name": gender,
    }).select(
      "full_name image birth_date district currentDistrict group level educationYear"
    );

    const filteredStudents = findStudents
      .filter((c) => {
        const birthDate = new Date(c.birth_date * 1000);
        return birthDate.getFullYear() == year;
      })
      .map((student) => {
        const birthDate = new Date(student.birth_date * 1000);
        const day = String(birthDate.getDate()).padStart(2, "0");
        const month = String(birthDate.getMonth() + 1).padStart(2, "0");
        const year = birthDate.getFullYear();
        const formattedDate = `${day}.${month}.${year}`;

        return {
          ...student._doc,
          birth_date: formattedDate,
        };
      });

    res.json({
      data: filteredStudents,
      total: filteredStudents.length,
    });
  } catch (error) {
    res.json({ message: error.message });
  }
});

router.get("/name/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const findStudents = await StudentModel.find({
      first_name: name.toLocaleUpperCase(),
    }).select("level full_name district image birth_date");

    const filteredStudents = findStudents.map((student) => {
      const birthDate = new Date(student.birth_date * 1000);
      const day = String(birthDate.getDate()).padStart(2, "0");
      const month = String(birthDate.getMonth() + 1).padStart(2, "0");
      const year = birthDate.getFullYear();
      const formattedDate = `${day}.${month}.${year}`;

      return {
        ...student._doc,
        birth_date: formattedDate,
      };
    });
    res.json({ data: filteredStudents });
  } catch (error) {
    res.json({ message: error.message });
  }
});

router.get("/appartment/new/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.userData;

    const findTutor = await tutorModel.findById(userId);
    if (!findTutor) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday tutor topilmadi" });
    }

    const activePermission = await permissionModel.findOne({
      tutorId: findTutor._id,
      status: "process",
    });

    if (!activePermission) {
      return res
        .status(404)
        .json({ status: "error", message: "Aktiv permission topilmadi" });
    }

    const permissionId = req.query?.permissionId
      ? req.query.permissionId
      : activePermission._id.toString();

    const findStudent = await StudentModel.findById(id).select("_id");
    if (!findStudent) {
      return res
        .status(401)
        .json({ status: "error", message: "Bunday student topilmadi" });
    }

    const findAppartment = await AppartmentModel.find({
      studentId: id,
      permission: permissionId,
    });

    res.json({ status: "success", data: findAppartment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get("/appartment/status/:status", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.userData;
    const { status } = req.params;

    if (!["red", "yellow", "green", "blue"].includes(status)) {
      return res.status(401).json({
        status: "error",
        message: "Bunday status mavjud emas",
      });
    }

    const findTutor = await tutorModel.findById(userId).lean();
    if (!findTutor) {
      return res.status(400).json({
        status: "error",
        message: "Bunday tutor topilmadi",
      });
    }

    const tutorGroups = findTutor.group.map((g) => ({
      code: g.code?.toString().trim(),
      name: g.name,
    }));

    const activePermission = await permissionModel
      .findOne({
        tutorId: userId,
        status: "process",
      })
      .lean();

    if (!activePermission) {
      return res.status(400).json({
        status: "error",
        message: "Process holatidagi permission topilmadi",
      });
    }

    const normalizedStatus = status.toLowerCase();
    const statusQuery =
      normalizedStatus === "blue"
        ? {
            $or: [{ status: /being checked/i }, { status: { $exists: false } }],
          }
        : { status: normalizedStatus };

    const appartments = await AppartmentModel.find({
      typeAppartment: "tenant",
      permission: activePermission._id.toString(),
      ...statusQuery,
    })
      .populate("studentId", "group")
      .lean();

    console.log(
      "Student groups:",
      appartments.map((a) => a.studentId?.group)
    );

    const groupCounts = {};
    for (const app of appartments) {
      const student = app.studentId;
      if (student?.group?.id) {
        const studentGroupCode = student.group.id.toString().trim();

        if (!groupCounts[studentGroupCode]) {
          groupCounts[studentGroupCode] = 0;
        }
        groupCounts[studentGroupCode] += 1;
      }
    }

    const result = tutorGroups.map((tg) => ({
      code: tg.code,
      groupName: tg.name,
      countStudents: groupCounts[tg.code] || 0,
    }));

    res.json({
      status: "success",
      data: result,
    });
  } catch (error) {
    console.error("Appartment status router error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

router.get(
  "/appartment/status/:status/:groupId",
  authMiddleware,
  async (req, res) => {
    try {
      const { status, groupId } = req.params;
      const { userId } = req.userData;

      const statusQuery =
        status == "blue"
          ? {
              $or: [
                { status: "Being checked" },
                { status: { $exists: false } },
              ],
            }
          : { status: status };

      const findActivePermission = await permissionModel
        .findOne({ status: "process", tutorId: userId })
        .select("_id");

      if (!findActivePermission) {
        return res.status(400).json({
          status: "error",
          message: "Hozirda active ruxsatnomalar mavjud emas",
        });
      }

      const findStudents = await StudentModel.find({
        "group.id": groupId,
      }).select(
        "university full_name short_name first_name second_name third_name gender image province specialty level"
      );

      const studentIds = findStudents.map((s) => s._id);

      const findAppartments = await AppartmentModel.find({
        permission: findActivePermission._id.toString(),
        ...statusQuery,
        typeAppartment: "tenant",
        studentId: { $in: studentIds },
      }).select("-bedroom");

      res.status(200).json({
        status: "success",
        data: findAppartments.map((a) => ({
          student: findStudents.find((s) => s._id == a.studentId.toString()),
          appartment: a,
        })),
      });
    } catch (error) {
      console.error("❌ Router error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get(
  "/appartment/my-appartments/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;

      const findStudent = await StudentModel.findById(id);
      if (!findStudent) {
        return res
          .status(400)
          .json({ status: "error", message: "Bunday student topilmadi" });
      }

      const findAppartments = await AppartmentModel.find({ studentId: id });

      res.status(200).json({ status: "success", data: findAppartments });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.put(
  "/appartment/:id",
  authMiddleware,
  uploadMultipleImages,
  async (req, res) => {
    try {
      const { userId } = req.userData;

      const findAppartment = await AppartmentModel.findById(req.params.id);
      if (!findAppartment) {
        return res.status(400).json({
          status: "error",
          message: "Bunday ijara ma'lumotlari topilmadi",
        });
      }

      const updatedData = { ...req.body };
      console.log("Body ma'lumotlari:", updatedData);
      console.log("Yuklangan fayllar:", req.files);

      const changedFields = [];

      const handleImageUpdate = (fieldName, existingUrl) => {
        if (req.files[fieldName] && req.files[fieldName][0]) {
          if (existingUrl) {
            const oldPath = path.join(__dirname, "..", existingUrl);
            fs.promises.unlink(oldPath).catch(() => {});
          }
          changedFields.push(fieldName);
          return `/public/images/${req.files[fieldName][0].filename}`;
        }
        return existingUrl;
      };

      if (req.files.boilerImage && req.files.boilerImage[0]) {
        updatedData.boilerImage = {
          url: handleImageUpdate(
            "boilerImage",
            findAppartment.boilerImage?.url
          ),
          status: "Being checked",
        };
      }

      if (req.files.gazStove && req.files.gazStove[0]) {
        updatedData.gazStove = {
          url: handleImageUpdate("gazStove", findAppartment.gazStove?.url),
          status: "Being checked",
        };
      }

      if (req.files.chimney && req.files.chimney[0]) {
        updatedData.chimney = {
          url: handleImageUpdate("chimney", findAppartment.chimney?.url),
          status: "Being checked",
        };
      }

      if (req.files.additionImage && req.files.additionImage[0]) {
        updatedData.additionImage = {
          url: handleImageUpdate(
            "additionImage",
            findAppartment.additionImage?.url
          ),
          status: "Being checked",
        };
      }

      if (req.body.lat && req.body.lon) {
        updatedData.location = {
          lat: req.body.lat,
          long: req.body.lon,
        };
        delete updatedData.lat;
        delete updatedData.lon;
      }

      if (changedFields.length > 0) {
        updatedData.status = "Being checked";
      }

      console.log("O'zgargan rasmlar:", changedFields);
      console.log("Yangilanayotgan ma'lumotlar:", updatedData);

      const updateAppartment = await AppartmentModel.findByIdAndUpdate(
        req.params.id,
        { $set: updatedData },
        { new: true }
      );

      for (const field of changedFields) {
        await NotificationModel.findOneAndDelete({
          appartmentId: req.params.id,
          need_data: field,
        });

        await NotificationModel.create({
          userId,
          notification_type: "report",
          message: `Tekshirilmoqda`,
          status: "blue",
          appartmentId: req.params.id,
          need_data: field,
        });
      }

      res.status(200).json({
        status: "success",
        message: "Ijara ma'lumotlari muvaffaqiyatli yangilandi",
        data: updateAppartment,
      });
    } catch (error) {
      console.error("Appartment yangilashda xatolik:", error);
      res.status(500).json({
        status: "error",
        message: "Serverda xatolik yuz berdi",
        error: error.message,
      });
    }
  }
);

router.delete("/appartment/clear", authMiddleware, async (req, res) => {
  try {
    await AppartmentModel.deleteMany({});
    res
      .status(200)
      .json({ status: "success", message: "Ijara malumotlari tozalandi" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

router.get(
  "/appartment/type/:type/:groupId",
  authMiddleware,
  async (req, res) => {
    try {
      const { type, groupId } = req.params;
      const students = await StudentModel.find({ "group.id": groupId })
        .select("_id")
        .lean();
      const studentIds = students.map((s) => s._id);

      const appartments = await AppartmentModel.find({
        typeAppartment: type,
        studentId: { $in: studentIds },
      }).lean();

      res.status(200).json({ status: "success", data: appartments });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

router.get("/appartment/count-by-type", async (req, res) => {
  try {
    const permissions = await permissionModel
      .find({ status: "process" })
      .select("_id")
      .lean();
    const permissionIds = permissions.map((p) => p._id.toString());

    const stats = await AppartmentModel.aggregate([
      { $match: { permission: { $in: permissionIds } } },
      {
        $facet: {
          tenantTotal: [
            { $match: { typeAppartment: "tenant" } },
            { $count: "count" },
          ],
          tenantRed: [
            { $match: { typeAppartment: "tenant", status: "red" } },
            { $count: "count" },
          ],
          tenantYellow: [
            { $match: { typeAppartment: "tenant", status: "yellow" } },
            { $count: "count" },
          ],
          tenantGreen: [
            { $match: { typeAppartment: "tenant", status: "green" } },
            { $count: "count" },
          ],
          tenantBlue: [
            { $match: { typeAppartment: "tenant", status: "Being checked" } },
            { $count: "count" },
          ],
          relative: [
            { $match: { typeAppartment: "relative" } },
            { $count: "count" },
          ],
          littleHouse: [
            { $match: { typeAppartment: "littleHouse" } },
            { $count: "count" },
          ],
          bedroom: [
            { $match: { typeAppartment: "bedroom" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const s = stats[0];
    const data = {
      tenant: {
        total: s.tenantTotal[0]?.count || 0,
        red: s.tenantRed[0]?.count || 0,
        yellow: s.tenantYellow[0]?.count || 0,
        green: s.tenantGreen[0]?.count || 0,
        blue: s.tenantBlue[0]?.count || 0,
      },
      relative: s.relative[0]?.count || 0,
      littleHouse: s.littleHouse[0]?.count || 0,
      bedroom: s.bedroom[0]?.count || 0,
    };

    res.status(200).json({
      status: "success",
      data,
      total:
        data.tenant.total + data.relative + data.littleHouse + data.bedroom ||
        0,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

export default router;
