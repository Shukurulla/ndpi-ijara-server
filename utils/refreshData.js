import axios from "axios";
import StudentModel from "../models/student.model.js";
import cron from "node-cron";

// Sahifa yuklash timeoutini qisqa qilish
const AXIOS_TIMEOUT = 10000;
const CONCURRENT_REQUESTS = 10; // Parallel so'rovlar soni

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

// 🚀 Asosiy funksiya - to'liq yangilangan
export async function autoRefreshStudentData() {
  const startTime = Date.now();
  const token = "Bearer erkFR_9u2IOFoaGxYQPDmjmXVe6Oqv3s";

  try {
    console.log("\n🚀 STUDENT DATA FULL REFRESH START");
    console.log(
      `🕐 Boshlangan vaqt: ${new Date().toLocaleString("uz-UZ", {
        timeZone: "Asia/Samarkand",
      })}`
    );

    // 1. Barcha studentlarni o'chirish
    console.log("🗑️  Barcha mavjud studentlarni o'chirish...");
    const deleteResult = await StudentModel.deleteMany({});
    console.log(`✅ ${deleteResult.deletedCount} ta student o'chirildi`);

    // 2. API dan jami ma'lumotlar sonini olamiz
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

    // 3. Progress tracker yaratamiz
    const progress = createProgressTracker(totalCount);

    // 4. Parallel ravishda sahifalarni yuklaymiz va bazaga qo'shamiz
    let totalCreated = 0;
    let totalProcessed = 0;
    let studentsBatch = [];
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
      let batchCount = 0;
      for (const students of pageResults) {
        for (const studentData of students) {
          totalProcessed++;
          const cleanedData = cleanStudentData(studentData);

          if (cleanedData) {
            studentsBatch.push(cleanedData);
            batchCount++;
          }
        }
      }
      console.log(`📝 Bu batchda: ${batchCount} ta student tayyorlandi`);

      // Batch hajmi yetganda bazaga qo'shamiz
      if (studentsBatch.length >= BATCH_SIZE) {
        console.log(
          `💾 ${studentsBatch.length} ta student bazaga qo'shilmoqda...`
        );
        try {
          const result = await StudentModel.insertMany(studentsBatch, {
            ordered: false,
          });
          totalCreated += result.length;
          console.log(
            `✅ ${result.length} ta student muvaffaqiyatli qo'shildi`
          );
        } catch (error) {
          console.error(`❌ Batch insert error:`, error.message);
        }
        studentsBatch = [];
      }

      progress.update(pageResults.reduce((sum, page) => sum + page.length, 0));
    }

    // Oxirgi batch ni ham qo'shamiz
    if (studentsBatch.length > 0) {
      console.log(
        `💾 Oxirgi ${studentsBatch.length} ta student bazaga qo'shilmoqda...`
      );
      try {
        const result = await StudentModel.insertMany(studentsBatch, {
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

    console.log("\n🎉 FULL REFRESH COMPLETED");
    console.log(`⏱️  Vaqt: ${duration} sekund`);
    console.log(`📥 API dan olindi: ${totalProcessed} student`);
    console.log(`✨ Bazaga qo'shildi: ${totalCreated} student`);
    console.log(`💾 Bazada jami: ${finalCount} student`);
    console.log(
      `🎯 API vs Baza: ${totalCount} vs ${finalCount} (farq: ${Math.abs(
        totalCount - finalCount
      )})`
    );
    console.log(`👤 Jins bo'yicha:`, genderStats);
    console.log(`🎓 Daraja bo'yicha:`, levelStats);

    return {
      success: true,
      duration,
      processed: totalProcessed,
      created: totalCreated,
      deleted: deleteResult.deletedCount,
      finalCount,
      apiCount: totalCount,
      genderStats,
      levelStats,
      efficiency: `${Math.round(totalProcessed / duration)} student/sekund`,
    };
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error("❌ FULL REFRESH FAILED:", error.message);

    return {
      success: false,
      duration,
      error: error.message,
      suggestion: "Internet aloqasini yoki API tokenini tekshiring",
    };
  }
}

// Cron job - har kuni 00:00 da ishga tushadi
export function startAutoRefreshCron() {
  // Har kuni soat 00:00 da ishga tushadi (Toshkent vaqti bo'yicha)
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("\n⏰ CRON JOB: Avtomatik refresh boshlandi");
      await autoRefreshStudentData();
    },
    {
      timezone: "Asia/Samarkand",
    }
  );

  console.log("✅ Cron job o'rnatildi: Har kuni 00:00 da avtomatik refresh");
}
