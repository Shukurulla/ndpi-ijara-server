import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  id: Number,
  university: Object,
  full_name: String,
  short_name: String,
  first_name: String,
  second_name: String,
  third_name: String,
  gender: {
    code: String,
    name: String,
  },
  birth_date: Number,
  student_id_number: { type: Number, unique: true },
  image: String,
  avg_gpa: Number,
  avg_grade: Number,
  total_credit: Number,
  country: {
    code: String,
    name: String,
  },
  province: {
    code: String,
    name: String,
    _parent: String,
  },
  currentProvince: {
    code: String,
    name: String,
    _parent: String,
  },
  district: {
    code: String,
    name: String,
    _parent: String,
  },
  currentDistrict: {
    code: String,
    name: String,
    _parent: String,
  },
  terrain: {
    code: String,
    name: String,
  },
  currentTerrain: {
    code: String,
    name: String,
  },
  citizenship: {
    code: String,
    name: String,
  },
  studentStatus: {
    code: String,
    name: String,
  },
  _curriculum: Number,
  educationForm: {
    code: String,
    name: String,
  },
  educationType: {
    code: String,
    name: String,
  },
  paymentForm: {
    code: String,
    name: String,
  },
  studentType: {
    code: String,
    name: String,
  },
  socialCategory: {
    code: String,
    name: String,
  },
  accommodation: {
    code: String,
    name: String,
  },
  department: {
    id: mongoose.Schema.Types.Mixed,
    name: String,
    code: String,
    structureType: {
      code: String,
      name: String,
    },
    localityType: {
      code: String,
      name: String,
    },
    parent: {
      type: String,
      default: null,
    },
    active: Boolean,
  },
  specialty: {
    id: mongoose.Schema.Types.Mixed,
    code: String,
    name: String,
  },
  group: {
    id: mongoose.Schema.Types.Mixed,
    name: String,
    educationLang: {
      code: String,
      name: String,
    },
  },
  level: {
    code: String,
    name: String,
  },
  semester: {
    id: mongoose.Schema.Types.Mixed,
    code: String,
    name: String,
  },
  educationYear: {
    code: String,
    name: String,
    current: Boolean,
  },
  year_of_enter: Number,
  roommate_count: {
    type: String,
    default: null,
  },
  is_graduate: Boolean,
  total_acload: {
    type: String,
    default: null,
  },
  other: String,
  created_at: Number,
  updated_at: Number,
  hash: String,
  validateUrl: String,
  fcmToken: {
    type: String,
  },
});

const StudentModel = mongoose.model("student", studentSchema);

studentSchema.index({ "group.id": 1 });
studentSchema.index({ "group.name": 1 });
studentSchema.index({ "department.name": 1 });
studentSchema.index({ "province.name": 1 });
studentSchema.index({ full_name: "text" });

export default StudentModel;
