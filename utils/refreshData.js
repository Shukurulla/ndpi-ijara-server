import axios from "axios";
import StudentModel from "../models/student.model.js";
import cron from "node-cron";

// Global flag - refresh jarayoni davom etayotganini ko'rsatadi
let isRefreshing = false;

// Sahifa yuklash timeoutini qisqa qilish
const AXIOS_TIMEOUT = 10000;
const CONCURRENT_REQUESTS = 10; // Parallel so'rovlar soni

// Refresh holatini tekshirish funksiyasi
export function isSystemRefreshing() {
  return isRefreshing;
}

// Student ma'lumotlarini tozalash va to'g'ri tipga o'girish
const cleanStudentData = (studentData) => {
  if (!studentData || !studentData.student_id_number) return null;

  return {
    ...studentData,
    specialty: studentData.specialty
      ? { ...studentData.specialty, id: String(studentData.specialty.id) }
      : undefined,
    group: studentData.group
      ? { ...studentData.group, id: String(studentData.group.id) }
      : undefined,
    department: studentData.department
      ? { ...studentData.department, id: String(studentData.department.id) }
      : undefined,
    semester: studentData.semester
      ? { ...studentData.semester, id: String(studentData.semester.id) }
      : undefined,
  };
};

// Biror sahifani olish (retry logic bilan)
const fetchPageWithRetry = async (page, token, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(
        `https://student.karsu.uz/rest/v1/data/student-list?page=${page}&limit=200`,
        {
          headers: { Authorization: token },
          timeout: AXIOS_TIMEOUT,
        }
      );
      return response.data.data.items || [];
    } catch (err) {
      if (attempt === retries) {
        console.error(
          `❌ Sahifa ${page} da xato (${retries + 1} urinish):`,
          err.message
        );
        return [];
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return [];
};

// Progress tracker
const createProgressTracker = (total) => {
  let processed = 0;
  const startTime = Date.now();

  return {
    update: (count) => {
      processed += count;
      const percentage = Math.round((processed / total) * 100);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining =
        processed > 0
          ? Math.round((elapsed * (total - processed)) / processed)
          : 0;

      console.log(
        `📊 Progress: ${percentage}% (${processed}/${total}) | ⏱️ ${elapsed}s o'tdi, ~${remaining}s qoldi`
      );
    },
  };
};

// 🚀 Asosiy funksiya - faqat yangi studentlarni qo'shish (ID'lar saqlanadi)
export async function autoRefreshStudentData() {
  // Agar refresh jarayoni davom etayotgan bo'lsa, xabar qaytarish
  if (isRefreshing) {
    console.log(
      "⚠️  Refresh allaqachon davom etmoqda, yangi refresh boshlanmadi"
    );
    return {
      success: false,
      message:
        "Tizimda yangilanish jarayoni davom etmoqda. Iltimos, keyinroq urinib ko'ring.",
      isRefreshing: true,
    };
  }

  // Refresh boshlanganini belgilash
  isRefreshing = true;
  const startTime = Date.now();
  const token = "Bearer erkFR_9u2IOFoaGxYQPDmjmXVe6Oqv3s";

  try {
    console.log("\n🚀 STUDENT DATA INCREMENTAL REFRESH START");
    console.log(
      `🕐 Boshlangan vaqt: ${new Date().toLocaleString("uz-UZ", {
        timeZone: "Asia/Samarkand",
      })}`
    );

    // 1. API dan jami ma'lumotlar sonini olamiz
    console.log("📡 API ma'lumotlarini tekshirish...");
    const firstResp = await axios.get(
      "https://student.karsu.uz/rest/v1/data/student-list?limit=200",
      {
        headers: { Authorization: token },
        timeout: AXIOS_TIMEOUT,
      }
    );

    const { pageCount, totalCount } = firstResp.data.data.pagination;
    console.log(`📊 API jami: ${totalCount} student, ${pageCount} sahifa`);

    // 2. Bazadagi mavjud student_id_number larni olish
    console.log("💾 Bazadagi mavjud studentlarni tekshirish...");
    const currentDbCount = await StudentModel.countDocuments();
    console.log(`💾 Bazada jami: ${currentDbCount} ta student`);

    // Barcha student_id_number larni olish (distinct limit muammosini hal qilish)
    const existingStudents = await StudentModel.find(
      {},
      { student_id_number: 1, _id: 0 }
    ).lean();
    const existingIdsSet = new Set(
      existingStudents.map((s) => s.student_id_number)
    );
    console.log(`🔍 Mavjud ID lar yuklandi: ${existingIdsSet.size} ta`);

    // 3. Progress tracker yaratamiz
    const progress = createProgressTracker(totalCount);

    // 4. Parallel ravishda sahifalarni yuklaymiz va faqat yangi studentlarni qo'shamiz
    let totalCreated = 0;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let newStudentsBatch = [];
    const BATCH_SIZE = 1000; // Har 1000 tadan batch qilib qo'shamiz

    console.log(
      `⚡ ${CONCURRENT_REQUESTS} ta parallel so'rov bilan yuklash boshlandi...`
    );

    for (let i = 1; i <= pageCount; i += CONCURRENT_REQUESTS) {
      console.log(
        `🔄 Batch ${Math.ceil(
          i / CONCURRENT_REQUESTS
        )}: sahifalar ${i} dan ${Math.min(
          i + CONCURRENT_REQUESTS - 1,
          pageCount
        )} gacha yuklanmoqda...`
      );

      // Parallel sahifalarni yuklash
      const pagePromises = [];
      for (let j = 0; j < CONCURRENT_REQUESTS && i + j <= pageCount; j++) {
        const pageNum = i + j;
        if (pageNum === 1) {
          pagePromises.push(Promise.resolve(firstResp.data.data.items || []));
        } else {
          pagePromises.push(fetchPageWithRetry(pageNum, token));
        }
      }

      const pageResults = await Promise.all(pagePromises);
      console.log(
        `✅ Batch tugadi: ${pageResults
          .map((p) => p.length)
          .join(", ")} ta student olindi`
      );

      // Har bir sahifadagi studentlarni qayta ishlaymiz
      let batchNewCount = 0;
      let batchSkippedCount = 0;
      for (const students of pageResults) {
        for (const studentData of students) {
          totalProcessed++;
          const cleanedData = cleanStudentData(studentData);

          if (cleanedData) {
            // Faqat yangi studentlarni qo'shamiz (mavjud bo'lmaganlarni)
            if (!existingIdsSet.has(cleanedData.student_id_number)) {
              newStudentsBatch.push(cleanedData);
              existingIdsSet.add(cleanedData.student_id_number); // Keyingi tekshirish uchun
              batchNewCount++;
            } else {
              batchSkippedCount++;
              totalSkipped++;
            }
          }
        }
      }
      console.log(
        `📝 Bu batchda: ${batchNewCount} ta yangi, ${batchSkippedCount} ta mavjud student`
      );

      // Batch hajmi yetganda bazaga qo'shamiz
      if (newStudentsBatch.length >= BATCH_SIZE) {
        console.log(
          `💾 ${newStudentsBatch.length} ta yangi student bazaga qo'shilmoqda...`
        );
        try {
          const result = await StudentModel.insertMany(newStudentsBatch, {
            ordered: false,
          });
          totalCreated += result.length;
          console.log(
            `✅ ${result.length} ta student muvaffaqiyatli qo'shildi`
          );
        } catch (error) {
          console.error(`❌ Batch insert error:`, error.message);
        }
        newStudentsBatch = [];
      }

      progress.update(pageResults.reduce((sum, page) => sum + page.length, 0));
    }

    // Oxirgi batch ni ham qo'shamiz
    if (newStudentsBatch.length > 0) {
      console.log(
        `💾 Oxirgi ${newStudentsBatch.length} ta yangi student bazaga qo'shilmoqda...`
      );
      try {
        const result = await StudentModel.insertMany(newStudentsBatch, {
          ordered: false,
        });
        totalCreated += result.length;
        console.log(
          `✅ Oxirgi batch: ${result.length} ta student muvaffaqiyatli qo'shildi`
        );
      } catch (error) {
        console.error(`❌ Oxirgi batch insert error:`, error.message);
      }
    }

    // 5. Yakuniy statistika
    const finalCount = await StudentModel.countDocuments();
    const [genderStats, levelStats] = await Promise.all([
      StudentModel.aggregate([
        { $group: { _id: "$gender.name", count: { $sum: 1 } } },
      ]),
      StudentModel.aggregate([
        { $group: { _id: "$level.name", count: { $sum: 1 } } },
      ]),
    ]);

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log("\n🎉 INCREMENTAL REFRESH COMPLETED");
    console.log(`⏱️  Vaqt: ${duration} sekund`);
    console.log(`📥 API dan tekshirildi: ${totalProcessed} student`);
    console.log(`✨ Bazaga qo'shildi: ${totalCreated} yangi student`);
    console.log(`⏭️  O'tkazib yuborildi: ${totalSkipped} mavjud student`);
    console.log(`💾 Bazada jami: ${finalCount} student`);
    console.log(
      `🎯 API vs Baza: ${totalCount} vs ${finalCount} (farq: ${Math.abs(
        totalCount - finalCount
      )})`
    );
    console.log(`👤 Jins bo'yicha:`, genderStats);
    console.log(`🎓 Daraja bo'yicha:`, levelStats);

    // Refresh tugaganini belgilash
    isRefreshing = false;

    return {
      success: true,
      duration,
      processed: totalProcessed,
      created: totalCreated,
      skipped: totalSkipped,
      finalCount,
      apiCount: totalCount,
      genderStats,
      levelStats,
      efficiency: `${Math.round(totalProcessed / duration)} student/sekund`,
    };
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error("❌ INCREMENTAL REFRESH FAILED:", error.message);

    // Xato bo'lsa ham refresh tugaganini belgilash
    isRefreshing = false;

    return {
      success: false,
      duration,
      error: error.message,
      suggestion: "Internet aloqasini yoki API tokenini tekshiring",
    };
  }
}

const cronTime = "00 2 * * *";

// Cron job - har kuni 01:20 da ishga tushadi
export function startAutoRefreshCron() {
  // Har kuni soat 01:20 da ishga tushadi (Toshkent vaqti bo'yicha)
  cron.schedule(
    cronTime,
    async () => {
      console.log("\n⏰ CRON JOB: Avtomatik refresh boshlandi");
      await autoRefreshStudentData();
    },
    {
      timezone: "Asia/Samarkand",
    }
  );

  console.log(
    `✅ Cron job o'rnatildi: Har kuni ${cronTime} da avtomatik refresh`
  );
}
