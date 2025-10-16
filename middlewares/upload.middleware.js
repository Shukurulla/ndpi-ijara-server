import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rasm uchun storage
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

// PDF fayllar uchun storage
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

// Ads uchun storage
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
    const prefix = file.mimetype.split("/")[0]; // 'image'
    cb(null, `${uniqueSuffix}_${prefix}${fileExt}`);
  },
});

// Combined storage for mixed file types
const mixedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // contractPdf uchun files papkasi
    if (file.fieldname === "contractPdf") {
      const uploadDir = path.join(__dirname, "../public/files");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    }
    // Boshqa rasmlar uchun images papkasi
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

// Fayl filtri
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Faqat JPG, JPEG, PNG va GIF formatlar qabul qilinadi!"));
  }
};

// Mixed fayl filtri (rasmlar va PDF uchun)
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

// Limitlar
const uploadLimits = {
  fileSize: 100 * 1024 * 1024, // 100MB
  files: 10,
  fields: 100, // 20 emas, 100 qilib qo‘ying
  fieldNameSize: 200,
  fieldSize: 1024 * 1024,
};
// Upload middleware-lari
export const uploadSingleImage = multer({
  storage: imageStorage,
  limits: uploadLimits,
  fileFilter: fileFilter,
}).single("image");

// Updated: contractImage va contractPdf qo'shildi
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

// Default export
const upload = multer({
  storage: imageStorage,
  limits: uploadLimits,
  fileFilter: fileFilter,
});

export default upload;
