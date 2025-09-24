// utils/firebase.helper.js
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Service account key faylini o'qish
const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, "../serviceAccountKey.json"), "utf8")
);

// Firebase admin SDK ni initialize qilish
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
  });
}

// Firebase Realtime Database reference
const db = admin.database();

class FirebaseHelper {
  constructor() {
    this.messagesRef = db.ref("messages");
    this.groupsRef = db.ref("groups");
  }

  // Xabarni Firebase ga saqlash
  async saveMessageToFirebase(tutorId, message, groupData) {
    try {
      const messageRef = this.messagesRef.child(groupData.id).push();
      const messageData = {
        tutorId: tutorId.toString(),
        message,
        groupId: groupData.id,
        groupName: groupData.name,
        createdAt: Date.now(),
        type: "text",
      };

      await messageRef.set(messageData);

      console.log(`✅ Xabar Firebase ga saqlandi: ${messageRef.key}`);
      return { success: true, key: messageRef.key };
    } catch (error) {
      console.error("❌ Firebase ga saqlashda xatolik:", error);
      return { success: false, error: error.message };
    }
  }

  // Studentni guruhga qo'shish (Firebase da ro'yxatdan o'tkazish)
  async registerStudentToGroup(studentId, groupId) {
    try {
      const memberRef = this.groupsRef
        .child(groupId)
        .child("members")
        .child(studentId);

      await memberRef.set({
        studentId,
        joinedAt: Date.now(),
        isOnline: true,
      });

      console.log(
        `✅ Student ${studentId} Firebase da ${groupId} guruhga qo'shildi`
      );
      return { success: true };
    } catch (error) {
      console.error("❌ Firebase da guruhga qo'shishda xatolik:", error);
      return { success: false, error: error.message };
    }
  }

  // Guruh xabarlarini olish (studentlar uchun)
  async getGroupMessages(groupId, limit = 50) {
    try {
      const snapshot = await this.messagesRef
        .child(groupId)
        .orderByChild("createdAt")
        .limitToLast(limit)
        .once("value");

      const messages = [];
      snapshot.forEach((childSnapshot) => {
        messages.push({
          firebaseKey: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });

      return {
        success: true,
        data: messages.reverse(),
      };
    } catch (error) {
      console.error("❌ Firebase dan xabarlarni olishda xatolik:", error);
      return { success: false, error: error.message };
    }
  }

  // Xabarni o'chirish
  async deleteMessageFromFirebase(groupId, messageKey) {
    try {
      await this.messagesRef.child(groupId).child(messageKey).remove();
      console.log(`✅ Xabar Firebase dan o'chirildi: ${messageKey}`);
      return { success: true };
    } catch (error) {
      console.error("❌ Firebase dan xabar o'chirishda xatolik:", error);
      return { success: false, error: error.message };
    }
  }

  // Barcha guruh xabarlarini o'chirish
  async clearGroupMessages(groupId) {
    try {
      await this.messagesRef.child(groupId).remove();
      console.log(`✅ Guruh ${groupId} xabarlari Firebase dan tozalandi`);
      return { success: true };
    } catch (error) {
      console.error("❌ Firebase dan xabarlarni tozalashda xatolik:", error);
      return { success: false, error: error.message };
    }
  }
}

export default new FirebaseHelper();
