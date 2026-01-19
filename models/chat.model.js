import mongoose from "mongoose";

const ChatSchema = new mongoose.Schema(
  {
    tutorId: {
      type: mongoose.Types.ObjectId,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    groups: [
      {
        id: {
          type: Number,
          default: null,
        },
        name: {
          type: String,
          default: null,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const chatModel = mongoose.model("chat", ChatSchema);

// Indexes for frequently queried fields
chatModel.collection.createIndex({ tutorId: 1 }); // Tutor messages lookup
chatModel.collection.createIndex({ "groups.id": 1 }); // Group messages lookup
chatModel.collection.createIndex({ createdAt: -1 }); // Sorting by date

export default chatModel;
