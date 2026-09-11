const pool = require("../config/db");

// ========================================
// CREATE REPORT
// POST /api/reports
// ========================================

const createReport = async (req, res) => {
  try {

    const reporterId = req.user.userId;

    const {
      reported_user_id,
      pitch_id,
      booking_id,
      reason,
      description
    } = req.body;

    // ========================================
    // VALIDATE REQUIRED DATA
    // ========================================

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "reason is required"
      });
    }

    // ========================================
    // CHECK REPORTED USER
    // ========================================

    if (reported_user_id) {

      const userResult = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id = $1
        `,
        [reported_user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Reported user not found"
        });
      }
    }

    // ========================================
    // CHECK PITCH
    // ========================================

    if (pitch_id) {

      const pitchResult = await pool.query(
        `
        SELECT id
        FROM pitches
        WHERE id = $1
        `,
        [pitch_id]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pitch not found"
        });
      }
    }

    // ========================================
    // CHECK BOOKING
    // ========================================

    if (booking_id) {

      const bookingResult = await pool.query(
        `
        SELECT id
        FROM bookings
        WHERE id = $1
        `,
        [booking_id]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }
    }

    // ========================================
    // CREATE REPORT
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO reports (
        reporter_id,
        reported_user_id,
        pitch_id,
        booking_id,
        reason,
        description,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'pending'
      )
      RETURNING
        id,
        reporter_id,
        reported_user_id,
        pitch_id,
        booking_id,
        reason,
        description,
        status,
        created_at
      `,
      [
        reporterId,
        reported_user_id || null,
        pitch_id || null,
        booking_id || null,
        reason.trim(),
        description || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Report created successfully",
      report: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE REPORT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create report"
    });
  }
};

module.exports = {
  createReport
};