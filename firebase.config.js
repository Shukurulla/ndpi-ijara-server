// ============================================
// FILE 1: firebase.config.js
// Path: /root/TutorAppServer/firebase.config.js
// ============================================

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseApp = null;
let messaging = null;
let isInitialized = false;

/**
 * Initialize Firebase Admin SDK (faqat bir marta)
 */
function initializeFirebase() {
  if (isInitialized) {
    return { app: firebaseApp, messaging };
  }

  try {
    const existingApps = getApps();

    if (existingApps.length > 0) {
      firebaseApp = getApp();
      messaging = getMessaging(firebaseApp);
      isInitialized = true;
      console.log("✅ Using existing Firebase app");
      return { app: firebaseApp, messaging };
    }

    const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

    if (!existsSync(serviceAccountPath)) {
      console.error("❌ serviceAccountKey.json not found");
      isInitialized = true;
      return { app: null, messaging: null };
    }

    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    messaging = getMessaging(firebaseApp);
    isInitialized = true;

    console.log("✅ Firebase initialized successfully");
    console.log(`🔑 Project ID: ${serviceAccount.project_id}`);

    return { app: firebaseApp, messaging };
  } catch (error) {
    console.error("❌ Firebase error:", error.message);
    isInitialized = true;
    return { app: null, messaging: null };
  }
}

function getFirebaseApp() {
  if (!isInitialized) {
    initializeFirebase();
  }
  return firebaseApp;
}

function getFirebaseMessaging() {
  if (!isInitialized) {
    initializeFirebase();
  }
  return messaging;
}

function isFirebaseReady() {
  return firebaseApp !== null && messaging !== null;
}

export {
  initializeFirebase,
  getFirebaseApp,
  getFirebaseMessaging,
  isFirebaseReady,
};
