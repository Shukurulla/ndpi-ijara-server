import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import districtsModel from "../models/districts.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Excel fayldan Nukus va Chimboy tumanlaridagi mahallalarni
 * districts modeliga yuklash funksiyasi
 */
export const loadDistrictsFromExcel = async () => {
  try {
    const excelPath = path.join(__dirname, "..", "districts.xlsx");

    // Excel faylni o'qish
    const workbook = XLSX.readFile(excelPath);
    const sheet = workbook.Sheets["Лист1"];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Nukus mahallalarini filtrlash
    const nukusDistricts = data
      .filter(
        (d) =>
          d["__EMPTY_2"] &&
          (d["__EMPTY_2"].includes("Нукус шаҳар") ||
            d["__EMPTY_2"].includes("Нукус шахар"))
      )
      .map((d) => ({
        name: d["__EMPTY_3"],
        region: "Нукус шаҳар",
      }));

    // Chimboy mahallalarini filtrlash
    const chimboyDistricts = data
      .filter((d) => d["__EMPTY_2"] && d["__EMPTY_2"].includes("Чимбой тумани"))
      .map((d) => ({
        name: d["__EMPTY_3"],
        region: "Чимбой тумани",
      }));

    // Barcha mahallalarni birlashtirish
    const allDistricts = [...nukusDistricts, ...chimboyDistricts];

    // Faqat mavjud bo'lmagan mahallalarni qo'shish
    let addedCount = 0;
    let skippedCount = 0;

    for (const district of allDistricts) {
      // Bo'sh mahalla nomlarini o'tkazib yuborish
      if (!district.name || district.name.trim() === "") {
        skippedCount++;
        continue;
      }

      // Mahalla allaqachon mavjudmi tekshirish
      const existingDistrict = await districtsModel.findOne({
        name: district.name,
        region: district.region,
      });

      if (!existingDistrict) {
        await districtsModel.create(district);
        addedCount++;
      } else {
        skippedCount++;
      }
    }

    return {
      success: true,
      message: `${addedCount} ta mahalla qo'shildi, ${skippedCount} ta mavjud bo'lgani uchun o'tkazildi`,
      total: allDistricts.length,
      added: addedCount,
      skipped: skippedCount,
      details: {
        nukus: nukusDistricts.length,
        chimboy: chimboyDistricts.length,
      },
    };
  } catch (error) {
    console.error("Mahallalarni yuklashda xato:", error);
    return {
      success: false,
      message: error.message,
      error: error,
    };
  }
};
