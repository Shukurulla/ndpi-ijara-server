import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    forStudents: {
      type: [
        {
          studentId: {
            type: String,
          },
        },
      ],
    },
    for: {
      type: String,
      default: "all",
    },
    status: {
      type: String,
      enum: ["process", "finished"],
      default: "process",
    },
  },
  {
    timestamps: true,
  }
);

const permissionModel = mongoose.model("permission", permissionSchema);

// Indexes for frequently queried fields
permissionModel.collection.createIndex({ tutorId: 1 }); // Tutor permissions lookup
permissionModel.collection.createIndex({ status: 1 }); // Status filtering
permissionModel.collection.createIndex({ tutorId: 1, status: 1 }); // Compound index

export default permissionModel;
