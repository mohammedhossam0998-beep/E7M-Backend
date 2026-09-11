const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const {
  getMessaging,
} = require("firebase-admin/messaging");

const path = require("path");

const serviceAccount = require(
  path.join(__dirname, "config", "firebase-service-account.json")
);

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

// حط هنا FCM TOKEN بتاع الجهاز
const fcmToken = "daubjZOvTfiQ6s-cQLveBF:APA91bH77-QLcl9JEu976XSPqSIf4aZPGrjrX_ubUFZbtWT2b-cBUhFatvepENxzxJCkizhFFQ4tf9UMUklkhwCLqcjNIhv8tdgxxu1jrRiB8DcDUCNXmp0";

async function sendTestPush() {
  try {
    const messaging = getMessaging();

    const message = {
      token: fcmToken,

      notification: {
        title: "🎉 E7M",
        body: "دي أول Push Notification حقيقية من E7M 🚀",
      },

      data: {
        type: "test",
        screen: "notifications",
      },

      android: {
        priority: "high",

        notification: {
          sound: "default",
        },
      },
    };

    const response = await messaging.send(message);

    console.log("✅ PUSH SENT SUCCESSFULLY");
    console.log("📨 Message ID:", response);
  } catch (error) {
    console.error("❌ PUSH FAILED");
    console.error(error);
  }
}

sendTestPush();