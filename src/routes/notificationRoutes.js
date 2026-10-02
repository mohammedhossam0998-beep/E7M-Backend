const express = require("express");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  getMyNotifications,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  registerDevice,
  getNotificationSettings,
  updateNotificationSettings,
} = require("../controllers/notificationController");

const router = express.Router();

// ============================================================
// NOTIFICATIONS
// ============================================================

// GET MY NOTIFICATIONS
// GET /api/notifications
router.get(
  "/",
  authenticateToken,
  getMyNotifications
);

// GET UNREAD NOTIFICATIONS COUNT
// GET /api/notifications/unread-count
router.get(
  "/unread-count",
  authenticateToken,
  getUnreadNotificationsCount
);

// REGISTER / UPDATE FCM DEVICE
// POST /api/notifications/device
router.post(
  "/device",
  authenticateToken,
  registerDevice
);

// ============================================================
// NOTIFICATION SETTINGS
// ============================================================

// GET NOTIFICATION SETTINGS
// GET /api/notifications/settings

router.get(
  "/settings",
  authenticateToken,
  getNotificationSettings
);

// UPDATE NOTIFICATION SETTINGS
// PATCH /api/notifications/settings

router.patch(
  "/settings",
  authenticateToken,
  updateNotificationSettings
);

// MARK ALL NOTIFICATIONS AS READ
// PATCH /api/notifications/read-all
router.patch(
  "/read-all",
  authenticateToken,
  markAllNotificationsAsRead
);

// MARK ONE NOTIFICATION AS READ
// PATCH /api/notifications/:id/read
router.patch(
  "/:id/read",
  authenticateToken,
  markNotificationAsRead
);

// DELETE NOTIFICATION
// DELETE /api/notifications/:id
router.delete(
  "/:id",
  authenticateToken,
  deleteNotification
);

module.exports = router;