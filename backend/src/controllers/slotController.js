
const pool = require("../config/db");

// ============================================================
// HELPERS
// ============================================================

// pitches.owner_id references users.id.
// Do not use owners.id for pitch ownership.

const parseId = (value) => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  return id;
};

const isSameTime = (startTime, endTime) => {
  if (!startTime || !endTime) {
    return false;
  }

  return (
    String(startTime).slice(0, 5) ===
    String(endTime).slice(0, 5)
  );
};

const isValidTime = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(
    value
  );
};

const isValidPrice = (value) => {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return false;
  }

  const price = Number(value);

  return Number.isFinite(price) && price >= 0;
};

// ============================================================
// CHECK PITCH OWNERSHIP
// ============================================================

const checkPitchOwnership = async (
  req,
  res,
  pitchId
) => {
  const userId = parseId(req.user?.userId);

  if (userId === null) {
    res.status(401).json({
      success: false,
      message: "Authentication required"
    });

    return false;
  }

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

  if (result.rows.length === 0) {
    res.status(404).json({
      success: false,
      message:
        "Pitch not found or does not belong to you"
    });

    return false;
  }

  return true;
};

// ============================================================
// GET SLOT BY ID
// ============================================================

const getSlotById = async (pitchId, slotId) => {
  const result = await pool.query(
    `
    SELECT
      id,
      pitch_id,
      slot_date,
      start_time,
      end_time,
      price,
      status
    FROM pitch_slots
    WHERE id = $1
      AND pitch_id = $2
    `,
    [slotId, pitchId]
  );

  return result.rows[0] || null;
};

// ============================================================
// VALIDATE SLOT VALUES
// ============================================================

const validateSlot = ({
  slot_date,
  start_time,
  end_time,
  price
}) => {
  if (
    !slot_date ||
    !start_time ||
    !end_time ||
    price === undefined ||
    price === null
  ) {
    return (
      "slot_date, start_time, end_time and " +
      "price are required"
    );
  }

  if (
    !isValidTime(start_time) ||
    !isValidTime(end_time)
  ) {
    return "Invalid time format. Use HH:mm or HH:mm:ss";
  }

  if (isSameTime(start_time, end_time)) {
    return "Start time and end time cannot be the same";
  }

  if (!isValidPrice(price)) {
    return "Price must be a valid non-negative number";
  }

  return null;
};

// ============================================================
// DATABASE ERROR HANDLER
// ============================================================

const handleSlotError = (
  res,
  error,
  operation
) => {
  console.error(`${operation} ERROR:`, error);

  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message:
        "A slot with the same date and start time already exists"
    });
  }

  if (error.code === "23P01") {
    return res.status(409).json({
      success: false,
      message:
        "Slot overlaps with an existing slot"
    });
  }

  if (error.code === "23514") {
    return res.status(400).json({
      success: false,
      message: "Invalid slot values or time range"
    });
  }

  if (
    error.code === "22007" ||
    error.code === "22008"
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid slot date or time"
    });
  }

  return res.status(500).json({
    success: false,
    message: `Failed to ${operation.toLowerCase()}`
  });
};

// ============================================================
// CREATE PITCH SLOT
// ============================================================

const createSlot = async (req, res) => {
  try {
    const pitchId = parseId(req.params.id);

    if (pitchId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id"
      });
    }

    const {
      slot_date,
      start_time,
      end_time,
      price
    } = req.body || {};

    // Validate input
    const validationError = validateSlot({
      slot_date,
      start_time,
      end_time,
      price
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Verify pitch ownership using users.id
    const ownsPitch = await checkPitchOwnership(
      req,
      res,
      pitchId
    );

    if (!ownsPitch) {
      return;
    }

    // Create slot
    const result = await pool.query(
      `
      INSERT INTO pitch_slots (
        pitch_id,
        slot_date,
        start_time,
        end_time,
        price
      )
      VALUES ($1, $2, $3, $4, $5)

      RETURNING
        id,
        pitch_id,
        TO_CHAR(
          slot_date,
          'YYYY-MM-DD'
        ) AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      `,
      [
        pitchId,
        slot_date,
        start_time,
        end_time,
        Number(price)
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Pitch slot created successfully",
      slot: result.rows[0]
    });

  } catch (error) {
    return handleSlotError(
      res,
      error,
      "Create pitch slot"
    );
  }
};

// ============================================================
// GET PITCH SLOTS
// ============================================================

const getPitchSlots = async (req, res) => {
  try {
    const pitchId = parseId(req.params.id);

    if (pitchId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id"
      });
    }

    // Verify pitch ownership
    const ownsPitch = await checkPitchOwnership(
      req,
      res,
      pitchId
    );

    if (!ownsPitch) {
      return;
    }

    // Fetch all slots for this pitch
    const result = await pool.query(
      `
      SELECT
        id,
        pitch_id,
        TO_CHAR(
          slot_date,
          'YYYY-MM-DD'
        ) AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at

      FROM pitch_slots

      WHERE pitch_id = $1

      ORDER BY
        slot_date ASC,
        start_time ASC
      `,
      [pitchId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      slots: result.rows
    });

  } catch (error) {
    return handleSlotError(
      res,
      error,
      "Get pitch slots"
    );
  }
};

// ============================================================
// UPDATE PITCH SLOT
// ============================================================

const updateSlot = async (req, res) => {
  try {
    const pitchId = parseId(req.params.id);
    const slotId = parseId(req.params.slotId);

    if (pitchId === null || slotId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id or slot id"
      });
    }

    // Verify pitch ownership
    const ownsPitch = await checkPitchOwnership(
      req,
      res,
      pitchId
    );

    if (!ownsPitch) {
      return;
    }

    // Get existing slot
    const currentSlot = await getSlotById(
      pitchId,
      slotId
    );

    if (!currentSlot) {
      return res.status(404).json({
        success: false,
        message:
          "Slot not found or does not belong to you"
      });
    }

    // Prevent editing booked slots
    if (currentSlot.status === "booked") {
      return res.status(409).json({
        success: false,
        message: "Booked slots cannot be edited"
      });
    }

    const {
      slot_date,
      start_time,
      end_time,
      price
    } = req.body || {};

    // Use existing values for omitted fields
    const newSlotDate =
      slot_date ?? currentSlot.slot_date;

    const newStartTime =
      start_time ?? currentSlot.start_time;

    const newEndTime =
      end_time ?? currentSlot.end_time;

    const newPrice =
      price ?? currentSlot.price;

    // Validate final values
    const validationError = validateSlot({
      slot_date: newSlotDate,
      start_time: newStartTime,
      end_time: newEndTime,
      price: newPrice
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Update slot.
    // The extra status condition protects against
    // a booking made after the initial status check.
    const result = await pool.query(
      `
      UPDATE pitch_slots

      SET
        slot_date = $1,
        start_time = $2,
        end_time = $3,
        price = $4

      WHERE id = $5
        AND pitch_id = $6
        AND status <> 'booked'

      RETURNING
        id,
        pitch_id,
        TO_CHAR(
          slot_date,
          'YYYY-MM-DD'
        ) AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      `,
      [
        newSlotDate,
        newStartTime,
        newEndTime,
        Number(newPrice),
        slotId,
        pitchId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Slot is no longer available for editing"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch slot updated successfully",
      slot: result.rows[0]
    });

  } catch (error) {
    return handleSlotError(
      res,
      error,
      "Update pitch slot"
    );
  }
};

// ============================================================
// DELETE PITCH SLOT
// ============================================================

const deleteSlot = async (req, res) => {
  try {
    const pitchId = parseId(req.params.id);
    const slotId = parseId(req.params.slotId);

    if (pitchId === null || slotId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id or slot id"
      });
    }

    // Verify pitch ownership
    const ownsPitch = await checkPitchOwnership(
      req,
      res,
      pitchId
    );

    if (!ownsPitch) {
      return;
    }

    // Get existing slot
    const slot = await getSlotById(
      pitchId,
      slotId
    );

    if (!slot) {
      return res.status(404).json({
        success: false,
        message:
          "Slot not found or does not belong to you"
      });
    }

    // Prevent deleting booked slots
    if (slot.status === "booked") {
      return res.status(409).json({
        success: false,
        message: "Booked slots cannot be deleted"
      });
    }

    // Delete only non-booked slot
    const result = await pool.query(
      `
      DELETE FROM pitch_slots
      WHERE id = $1
        AND pitch_id = $2
        AND status <> 'booked'
      RETURNING id
      `,
      [slotId, pitchId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Slot is no longer available for deletion"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch slot deleted successfully"
    });

  } catch (error) {
    return handleSlotError(
      res,
      error,
      "Delete pitch slot"
    );
  }
};

// ============================================================
// UPDATE SLOT STATUS
// ============================================================

const updateSlotStatus = async (req, res) => {
  try {
    const pitchId = parseId(req.params.id);
    const slotId = parseId(req.params.slotId);

    if (pitchId === null || slotId === null) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch id or slot id"
      });
    }

    const { status } = req.body || {};

    // Only available / blocked are allowed manually
    if (
      status !== "available" &&
      status !== "blocked"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status must be either available or blocked"
      });
    }

    // Verify pitch ownership
    const ownsPitch = await checkPitchOwnership(
      req,
      res,
      pitchId
    );

    if (!ownsPitch) {
      return;
    }

    // Get existing slot
    const currentSlot = await getSlotById(
      pitchId,
      slotId
    );

    if (!currentSlot) {
      return res.status(404).json({
        success: false,
        message:
          "Slot not found or does not belong to you"
      });
    }

    // Booked slots cannot change manually
    if (currentSlot.status === "booked") {
      return res.status(409).json({
        success: false,
        message:
          "Booked slot status cannot be changed manually"
      });
    }

    // Update status with a second booked check
    const result = await pool.query(
      `
      UPDATE pitch_slots
      SET status = $1

      WHERE id = $2
        AND pitch_id = $3
        AND status <> 'booked'

      RETURNING
        id,
        pitch_id,
        TO_CHAR(
          slot_date,
          'YYYY-MM-DD'
        ) AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      `,
      [
        status,
        slotId,
        pitchId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Slot status changed. Refresh and try again"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Slot status updated successfully",
      slot: result.rows[0]
    });

  } catch (error) {
    return handleSlotError(
      res,
      error,
      "Update slot status"
    );
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createSlot,
  getPitchSlots,
  updateSlot,
  deleteSlot,
  updateSlotStatus
};
