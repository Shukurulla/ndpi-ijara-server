import mongoose from "mongoose";

const districtSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    region: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const districtModel = mongoose.model("district", districtSchema);

// Indexes for frequently queried fields
districtModel.collection.createIndex({ name: 1 }); // Name search
districtModel.collection.createIndex({ region: 1 }); // Region filtering
districtModel.collection.createIndex({ name: "text", region: "text" }); // Text search

export default districtModel;
