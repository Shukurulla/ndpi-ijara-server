import mongoose from "mongoose";
const appartmentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "student",
      default: null,
    },

    studentPhoneNumber: {
      type: String,
      default: null,
    },
    district: {
      type: String,
      default: null,
    },
    region: {
      type: String,
      required: false,
      default: null,
    },
    fullAddress: {
      type: String,
      default: null,
    },
    smallDistrict: {
      type: String,
      default: null,
    },
    typeOfAppartment: {
      type: String,
      default: null,
    },
    contract: {
      type: Boolean,
      default: null,
    },
    contractImage: {
      type: String,
      default: null,
    },
    contractPdf: {
      type: String,
      default: null,
    },
    typeOfBoiler: {
      type: String,
      default: null,
    },
    priceAppartment: {
      type: Number,
      default: null,
    },
    numberOfStudents: {
      type: Number,
      default: null,
    },
    appartmentOwnerName: {
      type: String,
      default: null,
    },
    appartmentOwnerPhone: {
      type: String,
      default: null,
    },
    appartmentNumber: {
      type: String,
      default: null,
    },
    addition: String,
    current: {
      type: Boolean,
      default: true,
    },
    boilerImage: {
      url: {
        type: String,
        default: null,
      },
      status: {
        type: String,
        default: "Being checked",
      },
    },
    gazStove: {
      url: {
        type: String,
        default: null,
      },
      status: {
        type: String,
        default: "Being checked",
      },
    },
    additionImage: {
      url: {
        type: String,
        default: "",
      },
      status: {
        type: String,
        default: "Being checked",
      },
    },
    chimney: {
      url: {
        type: String,
        default: null,
      },
      status: {
        type: String,
        default: "Being checked",
      },
    },
    status: {
      type: String,
      default: "Being checked",
    },
    needNew: {
      type: Boolean,
      default: false,
    },
    location: {
      lat: {
        type: String,
        default: null,
      },
      long: {
        type: String,
        default: null,
      },
    },
    view: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
    },
    typeAppartment: {
      type: String,
      enum: ["tenant", "relative", "littleHouse", "bedroom"],
    },
    bedroom: {
      bedroomNumber: {
        type: String,
        default: null,
      },
      roomNumber: {
        type: String,
        default: null,
      },
    },
    permission: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const AppartmentModel = mongoose.model("appartment", appartmentSchema);

AppartmentModel.collection.createIndex({ permission: 1, studentId: 1 });

export default AppartmentModel;
