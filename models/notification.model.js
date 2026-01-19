import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    appartmentId: {
      type: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
    },
    need_data: {
      type: String,
      default: null,
    },
    notification_type: {
      type: String,
      enum: ["report", "push"],
    },
    permission: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const NotificationModel = mongoose.model("notification", notificationSchema);

// Indexes for frequently queried fields
NotificationModel.collection.createIndex({
  userId: 1,
  notification_type: 1,
  status: 1,
});
NotificationModel.collection.createIndex({ userId: 1 }); // User notifications
NotificationModel.collection.createIndex({ isRead: 1 }); // Unread count
NotificationModel.collection.createIndex({ appartmentId: 1 }); // Apartment notifications
NotificationModel.collection.createIndex({ userId: 1, isRead: 1 }); // Compound for unread

export default NotificationModel;
