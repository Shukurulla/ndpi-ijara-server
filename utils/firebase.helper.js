// utils/firebase.helper.js
import admin from "firebase-admin";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let isFirebaseInitialized = false;

class FirebaseHelper {
  constructor() {
    this.initializeFirebase();
  }

  initializeFirebase() {
    try {
      // Service account key faylini o'qish
      const serviceAccountPath = path.join(
        __dirname,
        "../serviceAccountKey.json"
      );
      console.log("📁 Service account path:", serviceAccountPath);

      const serviceAccount = JSON.parse(
        readFileSync(serviceAccountPath, "utf8")
      );
      console.log("🔑 Project ID:", serviceAccount.project_id);
      console.log("📧 Client Email:", serviceAccount.client_email);

      // Firebase admin SDK ni initialize qilish
      if (!admin.apps.length) {
        const app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"), // Private key ni to'g'irlash
          }),
          databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
        });

        console.log("🚀 Firebase app initialized:", app.name);

        db = admin.database();
        this.messagesRef = db.ref("messages");
        this.groupsRef = db.ref("groups");

        // Test yozish
        this.testFirebaseConnection();

        isFirebaseInitialized = true;
        console.log("✅ Firebase muvaffaqiyatli ishga tushdi");
      }
    } catch (error) {
      console.error("❌ Firebase initialization xatosi:", error.message);
      console.error("Stack:", error.stack);
      console.log(
        "⚠️ Firebase ishlamayotgan bo'lsa ham, Socket.IO orqali ishlashda davom etamiz"
      );
      isFirebaseInitialized = false;
    }
  }

  async testFirebaseConnection() {
    try {
      console.log("🧪 Firebase connection test boshlanmoqda...");

      // Test ma'lumot yozish
      const testRef = db.ref("test");
      await testRef.set({
        message: "Test connection",
        timestamp: Date.now(),
      });

      // Test ma'lumotni o'qish
      const snapshot = await testRef.once("value");
      const testData = snapshot.val();

      if (testData) {
        console.log("✅ Firebase test muvaffaqiyatli:", testData);

        // Test ma'lumotni o'chirish
        await testRef.remove();
        console.log("🧹 Test ma'lumot o'chirildi");
      } else {
        console.log("⚠️ Firebase test ma'lumotini o'qib bo'lmadi");
      }

      // Connection status
      const connectedRef = db.ref(".info/connected");
      connectedRef.on("value", (snap) => {
        if (snap.val() === true) {
          console.log("🟢 Firebase Realtime Database: CONNECTED");
        } else {
          console.log("🔴 Firebase Realtime Database: DISCONNECTED");
        }
      });
    } catch (error) {
      console.error("❌ Firebase test xatosi:", error.message);
      console.error("Sabab:", error.code);

      if (error.code === "PERMISSION_DENIED") {
        console.log("⚠️ Firebase Rules ni tekshiring!");
        console.log("Rules ni quyidagicha o'zgartiring:");
        console.log(
          JSON.stringify(
            {
              rules: {
                ".read": true,
                ".write": true,
              },
            },
            null,
            2
          )
        );
      }
    }
  }

  // Xabarni Firebase ga saqlash
  async saveMessageToFirebase(tutorId, message, groupData) {
    if (!isFirebaseInitialized) {
      console.log("⚠️ Firebase ishlamayapti, faqat MongoDB ga saqlanadi");
      return { success: false, error: "Firebase not initialized" };
    }

    try {
      // GroupId ni string qilib olish
      const groupIdStr = String(groupData.id);
      console.log(`🔍 Firebase path: messages/${groupIdStr}`);

      const messageRef = this.messagesRef.child(groupIdStr).push();
      const messageData = {
        tutorId: tutorId.toString(),
        message,
        groupId: groupIdStr,
        groupName: groupData.name,
        createdAt: Date.now(),
        type: "text",
      };

      console.log("📝 Firebase ga yozilayotgan data:", messageData);

      await messageRef.set(messageData);

      console.log(`✅ Firebase ga saqlandi: ${messageRef.key}`);

      // Saqlangan ma'lumotni tekshirish
      const savedData = await messageRef.once("value");
      console.log("✔️ Firebase dan o'qildi:", savedData.val());

      return { success: true, key: messageRef.key };
    } catch (error) {
      console.error("❌ Firebase ga saqlashda xatolik:", error);
      console.error("Error stack:", error.stack);
      return { success: false, error: error.message };
    }
  }

  // Studentni guruhga qo'shish (Firebase da ro'yxatdan o'tkazish)
  async registerStudentToGroup(studentId, groupId) {
    if (!isFirebaseInitialized) {
      console.log("⚠️ Firebase ishlamayapti");
      return { success: false, error: "Firebase not initialized" };
    }

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
      console.error(
        "⚠️ Firebase da guruhga qo'shishda xatolik:",
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  // Guruh xabarlarini olish (studentlar uchun)
  async getGroupMessages(groupId, limit = 50) {
    if (!isFirebaseInitialized) {
      console.log(
        "⚠️ Firebase ishlamayapti, MongoDB dan olishga harakat qiling"
      );
      return {
        success: false,
        error: "Firebase not initialized",
        fallbackToMongo: true,
      };
    }

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
      console.error(
        "⚠️ Firebase dan xabarlarni olishda xatolik:",
        error.message
      );
      return { success: false, error: error.message, fallbackToMongo: true };
    }
  }

  // Xabarni o'chirish
  async deleteMessageFromFirebase(groupId, messageKey) {
    if (!isFirebaseInitialized) {
      return { success: false, error: "Firebase not initialized" };
    }

    try {
      await this.messagesRef.child(groupId).child(messageKey).remove();
      console.log(`✅ Xabar Firebase dan o'chirildi: ${messageKey}`);
      return { success: true };
    } catch (error) {
      console.error(
        "⚠️ Firebase dan xabar o'chirishda xatolik:",
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  // Barcha guruh xabarlarini o'chirish
  async clearGroupMessages(groupId) {
    if (!isFirebaseInitialized) {
      return { success: false, error: "Firebase not initialized" };
    }

    try {
      await this.messagesRef.child(groupId).remove();
      console.log(`✅ Guruh ${groupId} xabarlari Firebase dan tozalandi`);
      return { success: true };
    } catch (error) {
      console.error(
        "⚠️ Firebase dan xabarlarni tozalashda xatolik:",
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  // Firebase holatini tekshirish
  isFirebaseActive() {
    return isFirebaseInitialized;
  }
}

export default new FirebaseHelper();
