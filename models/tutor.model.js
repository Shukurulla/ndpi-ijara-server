// models/tutor.model.js
import mongoose from "mongoose";

const tutorSchema = new mongoose.Schema(
  {
    login: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "tutor",
    },
    group: {
      type: [Object],
      required: true,
    },
    image: {
      type: String,
      default:
        "https://static.vecteezy.com/system/resources/thumbnails/024/983/914/small/simple-user-default-icon-free-png.png",
    },
    facultyAdmin: {
      type: mongoose.Types.ObjectId,
      ref: "facultyAdmin",
      required: true,
    },
  },
  { timestamps: true }
);

const tutorModel = mongoose.model("tutor", tutorSchema);

// Indexes for frequently queried fields
tutorModel.collection.createIndex({ login: 1 }); // Login queries
tutorModel.collection.createIndex({ facultyAdmin: 1 }); // Admin filtering
tutorModel.collection.createIndex({ "group.code": 1 }); // Group lookups
tutorModel.collection.createIndex({ facultyAdmin: 1, "group.code": 1 }); // Compound index

export default tutorModel;
