const pool = require("../config/db");

// ============================================================
// GET AUTHENTICATED USER ID
// ============================================================
// IMPORTANT:
// pitches.owner_id references users.id,
// NOT owners.id.
//
// Therefore, pitch ownership must be checked using
// req.user.userId directly.
// ============================================================

const getAuthenticatedUserId = (req) => {
  const userId = Number(req.user?.userId);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
};

// ============================================================
// CHECK PITCH OWNERSHIP
// ============================================================

const checkPitchOwnership = async (pitchId, userId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM pitches
    WHERE id = $1
      AND owner_id = $2
    LIMIT 1
    `,
    [pitchId, userId]
  );

  return result.rows.length > 0;
};

// ============================================================
// VALIDATE PITCH ID
// ============================================================

const getValidPitchId = (rawId) => {
  const pitchId = Number(rawId);

  if (
    !Number.isSafeInteger(pitchId) ||
    pitchId <= 0
  ) {
    return null;
  }

  return pitchId;
};

// ============================================================
// GET AVAILABILITY SETTINGS
// ============================================================

const getAvailabilitySettings = async (req, res) => {
  try {
    // --------------------------------------------------------
    // VALIDATE PITCH ID
    // --------------------------------------------------------

    const pitchId = getValidPitchId(req.params.id);

    if (pitchId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id",
      });
    }

    // --------------------------------------------------------
    // GET AUTHENTICATED USER
    // --------------------------------------------------------

    const userId = getAuthenticatedUserId(req);

    if (userId === null) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // --------------------------------------------------------
    // CHECK PITCH OWNERSHIP
    // --------------------------------------------------------

    const ownsPitch = await checkPitchOwnership(
      pitchId,
      userId
    );

    if (!ownsPitch) {
      return res.status(404).json({
        success: false,
        message:
          "Pitch not found or does not belong to you",
      });
    }

    // --------------------------------------------------------
    // GET SAVED SETTINGS
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // NO SETTINGS SAVED YET
    // Use the pitch's configured base price instead of a
    // hard-coded price so newly generated slots match the
    // owner's stadium price by default.
    // --------------------------------------------------------

    if (result.rows.length === 0) {
      const pitchResult = await pool.query(
        `
        SELECT base_price
        FROM pitches
        WHERE id = $1
        LIMIT 1
        `,
        [pitchId]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pitch not found",
        });
      }

      return res.status(200).json({
        success: true,
        exists: false,
        settings: {
          pitch_id: pitchId,
          weekly_days: [6, 7, 1, 2, 3, 4],
          start_time: "12:00:00",
          end_time: "00:00:00",
          slot_duration: 90,
          default_price: Number(
            pitchResult.rows[0].base_price
          ).toFixed(2),
        },
      });
    }

    // --------------------------------------------------------
    // RETURN EXISTING SETTINGS
    // --------------------------------------------------------

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
      message:
        "Failed to get availability settings",
    });
  }
};

// ============================================================
// SAVE / UPDATE AVAILABILITY SETTINGS
// ============================================================

const saveAvailabilitySettings = async (req, res) => {
  try {
    // --------------------------------------------------------
    // VALIDATE PITCH ID
    // --------------------------------------------------------

    const pitchId = getValidPitchId(req.params.id);

    if (pitchId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id",
      });
    }

    // --------------------------------------------------------
    // GET AUTHENTICATED USER
    // --------------------------------------------------------

    const userId = getAuthenticatedUserId(req);

    if (userId === null) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // --------------------------------------------------------
    // CHECK PITCH OWNERSHIP
    // --------------------------------------------------------

    const ownsPitch = await checkPitchOwnership(
      pitchId,
      userId
    );

    if (!ownsPitch) {
      return res.status(404).json({
        success: false,
        message:
          "Pitch not found or does not belong to you",
      });
    }

    // --------------------------------------------------------
    // GET REQUEST BODY
    // --------------------------------------------------------

    const {
      weekly_days,
      start_time,
      end_time,
      slot_duration,
      default_price,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATE WORKING DAYS
    // --------------------------------------------------------

    if (!Array.isArray(weekly_days)) {
      return res.status(400).json({
        success: false,
        message: "weekly_days must be an array",
      });
    }

    if (weekly_days.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "At least one working day is required",
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
        message:
          "weekly_days must contain values from 1 to 7",
      });
    }

    // Remove duplicate days
    const uniqueDays = [...new Set(normalizedDays)];

    // --------------------------------------------------------
    // VALIDATE SLOT DURATION
    // --------------------------------------------------------

    const duration = Number(slot_duration);

    if (![60, 90, 120].includes(duration)) {
      return res.status(400).json({
        success: false,
        message:
          "slot_duration must be 60, 90 or 120",
      });
    }

    // --------------------------------------------------------
    // VALIDATE DEFAULT PRICE
    // --------------------------------------------------------

    if (
      default_price === null ||
      default_price === undefined ||
      String(default_price).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "default_price is required",
      });
    }

    const price = Number(default_price);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "default_price must be a valid non-negative number",
      });
    }

    // --------------------------------------------------------
    // VALIDATE TIME
    // --------------------------------------------------------

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message:
          "start_time and end_time are required",
      });
    }

    const timeRegex =
      /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

    if (
      typeof start_time !== "string" ||
      typeof end_time !== "string" ||
      !timeRegex.test(start_time) ||
      !timeRegex.test(end_time)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid time format. Use HH:mm or HH:mm:ss",
      });
    }

    // A complete working day must still be represented
    // by different start and end times.

    if (start_time.slice(0, 5) === end_time.slice(0, 5)) {
      return res.status(400).json({
        success: false,
        message:
          "Start time and end time cannot be the same",
      });
    }

    // --------------------------------------------------------
    // INSERT OR UPDATE AVAILABILITY SETTINGS
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // SUCCESS RESPONSE
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Availability settings saved successfully",
      settings: result.rows[0],
    });

  } catch (error) {
    console.error(
      "SAVE AVAILABILITY SETTINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to save availability settings",
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