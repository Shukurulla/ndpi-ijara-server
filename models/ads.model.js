import mongoose from "mongoose";

const adsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
    },
    image: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
    },
    link: {
      type: String,
      default: null,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const adsModel = mongoose.model("ads", adsSchema);

// Index for sorting by date
adsModel.collection.createIndex({ createdAt: -1 });

export default adsModel;
