import mongoose from "mongoose";
import dotenv from "dotenv";
import StudentModel from "./models/student.model.js";
import GroupModel from "./models/group.model.js";

dotenv.config();

async function migrateGroups() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB ga ulandi");

    const groups = await StudentModel.aggregate([
      { $match: { "group.id": { $exists: true, $ne: null } } },
      {
        $group: {
          _id: "$group.id",
          name: { $first: "$group.name" },
          educationLang: { $first: "$group.educationLang" },
          faculty: { $first: "$department.name" },
        },
      },
    ]);

    console.log(`${groups.length} ta unique guruh topildi`);

    let created = 0;
    let updated = 0;

    for (const group of groups) {
      const result = await GroupModel.updateOne(
        { id: String(group._id) },
        {
          $set: {
            id: String(group._id),
            name: group.name,
            educationLang: group.educationLang,
            facultyName: group.facultyName,
            facultyCode: group.facultyCode,
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount > 0) created++;
      else if (result.modifiedCount > 0) updated++;
    }

    console.log(`Migration tugadi: ${created} ta yangi guruh yaratildi, ${updated} ta yangilandi`);
    process.exit(0);
  } catch (error) {
    console.error("Migration xatolik:", error.message);
    process.exit(1);
  }
}

migrateGroups();
