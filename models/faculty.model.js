import mongoose from "mongoose";

const facultySchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
    },
    structureType: {
      code: String,
      name: String,
    },
    localityType: {
      code: String,
      name: String,
    },
    parent: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

facultySchema.index({ name: 1 });

let FacultyModel;

try {
  FacultyModel = mongoose.model("faculty");
} catch (error) {
  FacultyModel = mongoose.model("faculty", facultySchema);
}

export default FacultyModel;
