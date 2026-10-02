const pool = require("../config/db");

const {
  getMessaging,
} = require("firebase-admin/messaging");

// ============================================================
// SEND PUSH NOTIFICATION
// Internal function
// Sends FCM Push to all active devices of a user
// ============================================================

const sendPushNotification = async ({
  userId,
  title,
  message,
  type = null,
  bookingId = null,
  teamId = null,
}) => {
  try {

    // --------------------------------------------------------
    // CHECK USER NOTIFICATION SETTINGS
    // --------------------------------------------------------

    const settingsResult = await pool.query(
      `
        SELECT
          booking_confirmed,
          booking_rejected,
          payments,
          offers,
          matches,
          general
        FROM user_notification_settings
        WHERE user_id = $1
      `,
      [userId]
    );

    const settings = settingsResult.rows[0];

    // If no settings exist, allow notifications by default.
    if (settings) {
      const settingByType = {
        booking_confirmed: settings.booking_confirmed,
        booking_rejected: settings.booking_rejected,
        payments: settings.payments,
        offers: settings.offers,
        matches: settings.matches,
        general: settings.general,
      };

      const notificationType = type || "general";

      const isAllowed =
        settingByType[notificationType] ?? settings.general;

      if (!isAllowed) {
        console.log(
          "🔕 [FCM] Push blocked by user settings:",
          {
            userId,
            type: notificationType,
          }
        );

        return;
      }
    }

    // --------------------------------------------------------
    // GET ACTIVE DEVICES
    // --------------------------------------------------------

    const devicesResult = await pool.query(
      `
        SELECT
          id,
          fcm_token,
          platform
        FROM user_devices
        WHERE user_id = $1
          AND is_active = TRUE
          AND fcm_token IS NOT NULL
      `,
      [userId]
    );

    if (devicesResult.rows.length === 0) {
      console.log(
        "📱 [FCM] No active devices for user:",
        userId
      );

      return;
    }

    const messaging = getMessaging();

    // --------------------------------------------------------
    // SEND TO ALL USER DEVICES
    // --------------------------------------------------------

    for (const device of devicesResult.rows) {
      try {
        const response = await messaging.send({
          token: device.fcm_token,

          notification: {
            title,
            body: message,
          },

          data: {
            type: type || "general",
            notificationType: type || "general",
            bookingId: bookingId ? String(bookingId) : "",
            teamId: teamId ? String(teamId) : "",
          },

          android: {
            priority: "high",

            notification: {
              sound: "default",
            },
          },
        });

        console.log(
          "✅ [FCM] Push sent successfully:",
          {
            userId,
            deviceId: device.id,
            messageId: response,
          }
        );
      } catch (error) {
        console.error(
          "❌ [FCM] Failed to send push:",
          {
            userId,
            deviceId: device.id,
            errorCode: error.code,
            error: error.message,
          }
        );

        // ----------------------------------------------------------
        // DEACTIVATE INVALID / EXPIRED FCM TOKEN
        // ----------------------------------------------------------

        const invalidTokenErrors = [
          "messaging/registration-token-not-registered",
          "messaging/invalid-registration-token",
        ];

        if (invalidTokenErrors.includes(error.code)) {
          try {
            await pool.query(
              `
                UPDATE user_devices
                SET
                  is_active = FALSE,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
              `,
              [device.id]
            );

            console.log(
              "🧹 [FCM] Invalid token deactivated:",
              device.id
            );
          } catch (cleanupError) {
            console.error(
              "❌ [FCM] Failed to deactivate invalid token:",
              cleanupError.message
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(
      "❌ [FCM] SEND PUSH ERROR:",
      error
    );

    // IMPORTANT:
    // Push failure must NOT break the main notification flow.
  }
};

// ============================================================
// CREATE NOTIFICATION
// Internal function
// Used by other controllers such as Booking / Payment
// ============================================================

const createNotification = async ({
  userId,
  title,
  message,
  type = null,
  bookingId = null,
  teamId = null,
}) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (!title || !message) {
    throw new Error(
      "Notification title and message are required"
    );
  }

  // ----------------------------------------------------------
  // SAVE NOTIFICATION IN DATABASE FIRST
  // ----------------------------------------------------------

  const result = await pool.query(
    `
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at
    `,
    [
      userId,
      title,
      message,
      type,
    ]
  );

  const notification = result.rows[0];

  console.log(
    "🔔 [NOTIFICATION] Created:",
    {
      notificationId: notification.id,
      userId,
      type,
    }
  );

  // ----------------------------------------------------------
  // SEND PUSH AFTER DATABASE SUCCESS
  // ----------------------------------------------------------

  await sendPushNotification({
    userId,
    title,
    message,
    type,
    bookingId,
    teamId,
  });

  return notification;
};

// ============================================================
// GET MY NOTIFICATIONS
// GET /api/notifications
// ============================================================

const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(
      "🔔 NOTIFICATION USER ID:",
      userId
    );

    const result = await pool.query(
      `
        SELECT
          id,
          user_id,
          title,
          message,
          type,
          is_read,
          created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId]
    );

    console.log(
      "🔔 NOTIFICATION DB ROWS:",
      result.rows
    );

    return res.status(200).json({
      success: true,
      notifications: result.rows,
    });
  } catch (error) {
    console.error(
      "❌ GET MY NOTIFICATIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get notifications",
    });
  }
};

// ============================================================
// GET UNREAD COUNT
// GET /api/notifications/unread-count
// ============================================================

const getUnreadNotificationsCount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE user_id = $1
          AND is_read = FALSE
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows[0].count,
    });
  } catch (error) {
    console.error(
      "❌ GET UNREAD NOTIFICATIONS COUNT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get unread notifications count",
    });
  }
};

// ============================================================
// MARK ONE NOTIFICATION AS READ
// PATCH /api/notifications/:id/read
// ============================================================

const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: "Notification ID is required",
      });
    }

    const result = await pool.query(
      `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          user_id,
          title,
          message,
          type,
          is_read,
          created_at
      `,
      [
        notificationId,
        userId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: result.rows[0],
    });
  } catch (error) {
    console.error(
      "❌ MARK NOTIFICATION AS READ ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to mark notification as read",
    });
  }
};

// ============================================================
// MARK ALL NOTIFICATIONS AS READ
// PATCH /api/notifications/read-all
// ============================================================

const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = $1
          AND is_read = FALSE
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message:
        "All notifications marked as read",
      updatedCount: result.rowCount,
    });
  } catch (error) {
    console.error(
      "❌ MARK ALL NOTIFICATIONS AS READ ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to mark all notifications as read",
    });
  }
};

// ============================================================
// DELETE NOTIFICATION
// DELETE /api/notifications/:id
// ============================================================

const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: "Notification ID is required",
      });
    }

    const result = await pool.query(
      `
        DELETE FROM notifications
        WHERE id = $1
          AND user_id = $2
        RETURNING id
      `,
      [
        notificationId,
        userId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Notification deleted successfully",
    });
  } catch (error) {
    console.error(
      "❌ DELETE NOTIFICATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get notification",
    });
  }
};

// ============================================================
// REGISTER / UPDATE DEVICE
// POST /api/notifications/device
// ============================================================

const registerDevice = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      fcmToken,
      platform = "android",
      deviceName = null,
    } = req.body;

    if (!fcmToken || typeof fcmToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    const result = await pool.query(
      `
        INSERT INTO user_devices (
          user_id,
          fcm_token,
          platform,
          device_name,
          is_active,
          last_seen_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)

        ON CONFLICT (fcm_token)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          platform = EXCLUDED.platform,
          device_name = EXCLUDED.device_name,
          is_active = TRUE,
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP

        RETURNING
          id,
          user_id,
          platform,
          device_name,
          is_active,
          last_seen_at,
          created_at,
          updated_at
      `,
      [
        userId,
        fcmToken,
        platform,
        deviceName,
      ]
    );

    console.log(
      "📱 FCM DEVICE REGISTERED:",
      {
        userId,
        deviceId: result.rows[0].id,
        platform,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Device registered successfully",
      device: result.rows[0],
    });

  } catch (error) {
    console.error(
      "❌ REGISTER FCM DEVICE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to register device",
    });
  }
};

// ============================================================
// NOTIFICATION SETTINGS
// ============================================================

// GET /api/notifications/settings

const getNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
        INSERT INTO user_notification_settings (user_id)
        VALUES ($1)
        ON CONFLICT (user_id)
        DO NOTHING
        RETURNING
          user_id,
          booking_confirmed,
          booking_rejected,
          payments,
          offers,
          matches,
          general,
          created_at,
          updated_at
      `,
      [userId]
    );

    let settings;

    if (result.rows.length > 0) {
      settings = result.rows[0];
    } else {
      const existing = await pool.query(
        `
          SELECT
            user_id,
            booking_confirmed,
            booking_rejected,
            payments,
            offers,
            matches,
            general,
            created_at,
            updated_at
          FROM user_notification_settings
          WHERE user_id = $1
        `,
        [userId]
      );

      settings = existing.rows[0];
    }

    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error(
      "❌ GET NOTIFICATION SETTINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get notification settings",
    });
  }
};


// PATCH /api/notifications/settings

const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      booking_confirmed,
      booking_rejected,
      payments,
      offers,
      matches,
      general,
    } = req.body;

    const fields = [];
    const values = [userId];
    let parameterIndex = 2;

    const allowedFields = {
      booking_confirmed,
      booking_rejected,
      payments,
      offers,
      matches,
      general,
    };

    for (const [field, value] of Object.entries(allowedFields)) {
      if (value !== undefined) {
        if (typeof value !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `${field} must be boolean`,
          });
        }

        fields.push(`${field} = $${parameterIndex}`);
        values.push(value);
        parameterIndex++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No notification settings provided",
      });
    }

    // Make sure the user has a settings row
    await pool.query(
      `
        INSERT INTO user_notification_settings (user_id)
        VALUES ($1)
        ON CONFLICT (user_id)
        DO NOTHING
      `,
      [userId]
    );

    fields.push(
      "updated_at = CURRENT_TIMESTAMP"
    );

    const result = await pool.query(
      `
        UPDATE user_notification_settings
        SET
          ${fields.join(", ")}
        WHERE user_id = $1
        RETURNING
          user_id,
          booking_confirmed,
          booking_rejected,
          payments,
          offers,
          matches,
          general,
          created_at,
          updated_at
      `,
      values
    );

    return res.status(200).json({
      success: true,
      message: "Notification settings updated successfully",
      settings: result.rows[0],
    });
  } catch (error) {
    console.error(
      "❌ UPDATE NOTIFICATION SETTINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update notification settings",
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createNotification,
  sendPushNotification,
  getMyNotifications,
  getUnreadNotificationsCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  registerDevice,

  getNotificationSettings,
  updateNotificationSettings,
};