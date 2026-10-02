const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const path = require("path");

const serviceAccount = require(
  path.join(__dirname, "config", "firebase-service-account.json")
);

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

console.log("✅ Firebase Admin initialized successfully");