import mongoose from "mongoose";

const statusServerSchema = new mongoose.Schema(
  {
    serverStatus: {
      type: String,
      enum: ["online", "offline", "maintenance"],
      default: "online",
    },
    lastChecked: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const StatusServer = mongoose.model("StatusServer", statusServerSchema);

export default StatusServer;
