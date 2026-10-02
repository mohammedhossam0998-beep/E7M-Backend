const pool = require("../config/db");

// ============================================================
// GET OWNER ID
// ============================================================

const getOwnerId = async (userId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM owners
    WHERE user_id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

// ============================================================
// CHECK PITCH OWNERSHIP
// ============================================================

const checkPitchOwnership = async (pitchId, ownerId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM pitches
    WHERE id = $1
      AND owner_id = $2
    `,
    [pitchId, ownerId]
  );

  return result.rows.length > 0;
};

// ============================================================
// GET AVAILABILITY SETTINGS
// ============================================================

const getAvailabilitySettings = async (req, res) => {
  try {
    const pitchId = Number(req.params.id);

    if (!Number.isInteger(pitchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id",
      });
    }

    const ownerId = await getOwnerId(req.user.userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const ownsPitch = await checkPitchOwnership(
      pitchId,
      ownerId
    );

    if (!ownsPitch) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or does not belong to you",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        pitch_id,
        weekly_days,
        start_time,
        end_time,
        slot_duration,
        default_price,
        created_at,
        updated_at
      FROM pitch_availability_settings
      WHERE pitch_id = $1
      `,
      [pitchId]
    );

    // ========================================================
    // NO SETTINGS SAVED YET
    // ========================================================

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        exists: false,
        settings: {
          pitch_id: pitchId,
          weekly_days: [6, 7, 1, 2, 3, 4],
          start_time: "12:00:00",
          end_time: "00:00:00",
          slot_duration: 90,
          default_price: "300.00",
        },
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      settings: result.rows[0],
    });
  } catch (error) {
    console.error(
      "GET AVAILABILITY SETTINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get availability settings",
    });
  }
};

// ============================================================
// SAVE / UPDATE AVAILABILITY SETTINGS
// ============================================================

const saveAvailabilitySettings = async (req, res) => {
  try {
    const pitchId = Number(req.params.id);

    if (!Number.isInteger(pitchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id",
      });
    }

    const {
      weekly_days,
      start_time,
      end_time,
      slot_duration,
      default_price,
    } = req.body;

    // ========================================================
    // VALIDATE DAYS
    // ========================================================

    if (!Array.isArray(weekly_days)) {
      return res.status(400).json({
        success: false,
        message: "weekly_days must be an array",
      });
    }

    if (weekly_days.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one working day is required",
      });
    }

    const validDays = [1, 2, 3, 4, 5, 6, 7];

    const normalizedDays = weekly_days.map(Number);

    const invalidDay = normalizedDays.some(
      (day) => !validDays.includes(day)
    );

    if (invalidDay) {
      return res.status(400).json({
        success: false,
        message: "weekly_days must contain values from 1 to 7",
      });
    }

    // Remove duplicates
    const uniqueDays = [...new Set(normalizedDays)];

    // ========================================================
    // VALIDATE DURATION
    // ========================================================

    const duration = Number(slot_duration);

    if (![60, 90, 120].includes(duration)) {
      return res.status(400).json({
        success: false,
        message: "slot_duration must be 60, 90 or 120",
      });
    }

    // ========================================================
    // VALIDATE PRICE
    // ========================================================

    const price = Number(default_price);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: "default_price must be a valid positive number",
      });
    }

    // ========================================================
    // VALIDATE TIME
    // ========================================================

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "start_time and end_time are required",
      });
    }

    // ========================================================
    // GET OWNER
    // ========================================================

    const ownerId = await getOwnerId(req.user.userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ========================================================
    // CHECK PITCH
    // ========================================================

    const ownsPitch = await checkPitchOwnership(
      pitchId,
      ownerId
    );

    if (!ownsPitch) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or does not belong to you",
      });
    }

    // ========================================================
    // INSERT OR UPDATE
    // ========================================================

    const result = await pool.query(
      `
      INSERT INTO pitch_availability_settings (
        pitch_id,
        weekly_days,
        start_time,
        end_time,
        slot_duration,
        default_price,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        NOW()
      )

      ON CONFLICT (pitch_id)

      DO UPDATE SET
        weekly_days = EXCLUDED.weekly_days,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        slot_duration = EXCLUDED.slot_duration,
        default_price = EXCLUDED.default_price,
        updated_at = NOW()

      RETURNING
        id,
        pitch_id,
        weekly_days,
        start_time,
        end_time,
        slot_duration,
        default_price,
        created_at,
        updated_at
      `,
      [
        pitchId,
        uniqueDays,
        start_time,
        end_time,
        duration,
        price,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Availability settings saved successfully",
      settings: result.rows[0],
    });
  } catch (error) {
    console.error(
      "SAVE AVAILABILITY SETTINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to save availability settings",
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAvailabilitySettings,
  saveAvailabilitySettings,
};