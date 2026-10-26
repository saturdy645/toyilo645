// Firebase Admin — 서버에서만 사용. 키는 Vercel 환경변수에만 둡니다.
const admin = require("firebase-admin");

function credential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  return admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  });
}

if (!admin.apps.length) admin.initializeApp({ credential: credential() });

module.exports = { admin, adminAuth: admin.auth(), adminDb: admin.firestore() };
