import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../public/images");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${fileExt}`);
  },
});

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../public/files");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${fileExt}`);
  },
});

const adsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../public/ads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExt = path.extname(file.originalname);
    const prefix = file.mimetype.split("/")[0];
    cb(null, `${uniqueSuffix}_${prefix}${fileExt}`);
  },
});

const mixedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "contractPdf") {
      const uploadDir = path.join(__dirname, "../public/files");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    }
    else {
      const uploadDir = path.join(__dirname, "../public/images");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${fileExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Faqat JPG, JPEG, PNG va GIF formatlar qabul qilinadi!"));
  }
};

const mixedFileFilter = (req, file, cb) => {
  const imageTypes = ["image/jpeg", "image/png", "image/jpg", "image/gif"];
  const pdfTypes = ["application/pdf"];

  if (file.fieldname === "contractPdf" && pdfTypes.includes(file.mimetype)) {
    cb(null, true);
  } else if (imageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Faqat JPG, JPEG, PNG, GIF va PDF formatlar qabul qilinadi!"));
  }
};

const uploadLimits = {
  fileSize: 10 * 1024 * 1024,
  files: 6,
  fields: 30,
  fieldNameSize: 200,
  fieldSize: 1024 * 1024,
};

export const uploadSingleImage = multer({
  storage: imageStorage,
  limits: uploadLimits,
  fileFilter: fileFilter,
}).single("image");

export const uploadMultipleImages = multer({
  storage: mixedStorage,
  limits: uploadLimits,
  fileFilter: mixedFileFilter,
}).fields([
  { name: "boilerImage", maxCount: 1 },
  { name: "gazStove", maxCount: 1 },
  { name: "chimney", maxCount: 1 },
  { name: "additionImage", maxCount: 1 },
  { name: "contractImage", maxCount: 1 },
  { name: "contractPdf", maxCount: 1 },
]);

export const uploadAdsImages = multer({
  storage: adsStorage,
  limits: uploadLimits,
  fileFilter: fileFilter,
}).fields([
  { name: "image", maxCount: 1 },
  { name: "icon", maxCount: 1 },
]);

const upload = multer({
  storage: imageStorage,
  limits: uploadLimits,
  fileFilter: fileFilter,
});

export default upload;
