import axios from "axios";
import FacultyModel from "../models/faculty.model.js";

export async function syncFaculties() {
  const apiUrl = process.env.HEMIS_API_URL || "https://student.ndpi.uz/rest/v1";
  const profileUrl = `${apiUrl}/public/university-profile`;

  const response = await axios.get(profileUrl, { timeout: 15000 });
  const specialties = response.data?.data?.specialties || [];

  const departmentMap = new Map();
  for (const specialty of specialties) {
    if (specialty.department && specialty.department.code) {
      departmentMap.set(specialty.department.code, specialty.department);
    }
  }

  const departments = Array.from(departmentMap.values());
  let created = 0;
  let updated = 0;

  for (const dept of departments) {
    const result = await FacultyModel.updateOne(
      { code: dept.code },
      {
        $set: {
          id: dept.id,
          name: dept.name,
          code: dept.code,
          structureType: dept.structureType,
          localityType: dept.localityType,
          parent: dept.parent,
          active: dept.active,
        },
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  return { total: departments.length, created, updated };
}
