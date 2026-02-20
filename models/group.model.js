import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    educationLang: {
      code: String,
      name: String,
    },
    facultyName: {
      type: String,
      default: null,
    },
    facultyCode: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

groupSchema.index({ name: 1 });
groupSchema.index({ facultyName: 1 });
groupSchema.index({ facultyCode: 1 });

let GroupModel;

try {
  GroupModel = mongoose.model("group");
} catch (error) {
  GroupModel = mongoose.model("group", groupSchema);
}

export default GroupModel;
