const pool = require("../config/db");


// ========================================
// GET OWNER ID
// ========================================

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


// ========================================
// SLOT TIME VALIDATION
// ========================================

const isSameTime = (startTime, endTime) => {
  if (!startTime || !endTime) {
    return false;
  }

  return String(startTime).slice(0, 5) ===
         String(endTime).slice(0, 5);
};


// ========================================
// CREATE PITCH SLOT
// ========================================

const createSlot = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      slot_date,
      start_time,
      end_time,
      price
    } = req.body;


    // Check required fields
    if (
      !slot_date ||
      !start_time ||
      !end_time ||
      price === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "slot_date, start_time, end_time and price are required"
      });
    }


    if (isSameTime(start_time, end_time)) {
      return res.status(400).json({
        success: false,
        message: "Start time and end time cannot be the same"
      });
    }


    // Get owner ID
    const owner_id = await getOwnerId(req.user.userId);


    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }


    // Check that pitch belongs to this owner
    const pitchResult = await pool.query(
      `
      SELECT id
      FROM pitches
      WHERE id = $1
      AND owner_id = $2
      `,
      [id, owner_id]
    );


    if (pitchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or does not belong to you"
      });
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
        TO_CHAR(slot_date, 'YYYY-MM-DD') AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      `,
      [
        id,
        slot_date,
        start_time,
        end_time,
        price
      ]
    );


    return res.status(201).json({
      success: true,
      message: "Pitch slot created successfully",
      slot: result.rows[0]
    });


  } catch (error) {

    console.error("CREATE SLOT ERROR:", error);

    // Duplicate slot
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "A slot with the same date and start time already exists"
      });
    }

    if (error.code === "23514") {
      return res.status(400).json({
        success: false,
        message:
          "Start time and end time cannot be the same"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create pitch slot"
    });
  }
};


// ========================================
// GET PITCH SLOTS
// ========================================

const getPitchSlots = async (req, res) => {
  try {

    const { id } = req.params;


    // Get owner ID
    const owner_id = await getOwnerId(req.user.userId);


    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }


    // Check that pitch belongs to this owner
    const pitchResult = await pool.query(
      `
      SELECT id
      FROM pitches
      WHERE id = $1
      AND owner_id = $2
      `,
      [id, owner_id]
    );


    if (pitchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or does not belong to you"
      });
    }


    // Get slots
    const result = await pool.query(
      `
      SELECT
        id,
        pitch_id,
        TO_CHAR(slot_date, 'YYYY-MM-DD') AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      FROM pitch_slots
      WHERE pitch_id = $1
      ORDER BY slot_date ASC, start_time ASC
      `,
      [id]
    );


    return res.status(200).json({
      success: true,
      count: result.rows.length,
      slots: result.rows
    });


  } catch (error) {

    console.error("GET PITCH SLOTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch slots"
    });
  }
};


// ========================================
// UPDATE PITCH SLOT
// ========================================

const updateSlot = async (req, res) => {
  try {

    const { id, slotId } = req.params;

    const {
      slot_date,
      start_time,
      end_time,
      price
    } = req.body;


    // Get owner ID
    const owner_id = await getOwnerId(req.user.userId);


    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }


    // Check slot ownership
    const slotResult = await pool.query(
      `
      SELECT
        ps.id,
        ps.pitch_id,
        ps.slot_date,
        ps.start_time,
        ps.end_time,
        ps.price,
        ps.status
      FROM pitch_slots ps
      INNER JOIN pitches p
        ON p.id = ps.pitch_id
      WHERE ps.id = $1
      AND ps.pitch_id = $2
      AND p.owner_id = $3
      `,
      [
        slotId,
        id,
        owner_id
      ]
    );


    if (slotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Slot not found or does not belong to you"
      });
    }


    const currentSlot = slotResult.rows[0];


    // Booked slots cannot be edited
    if (currentSlot.status === "booked") {
      return res.status(409).json({
        success: false,
        message: "Booked slots cannot be edited"
      });
    }


    // Keep existing values if not provided
    const newSlotDate =
      slot_date ?? currentSlot.slot_date;

    const newStartTime =
      start_time ?? currentSlot.start_time;

    const newEndTime =
      end_time ?? currentSlot.end_time;

    const newPrice =
      price ?? currentSlot.price;


    // Validate required values
    if (
      !newSlotDate ||
      !newStartTime ||
      !newEndTime ||
      newPrice === undefined ||
      newPrice === null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "slot_date, start_time, end_time and price are required"
      });
    }


    if (isSameTime(newStartTime, newEndTime)) {
      return res.status(400).json({
        success: false,
        message: "Start time and end time cannot be the same"
      });
    }


    // Update slot
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
      RETURNING
        id,
        pitch_id,
        TO_CHAR(slot_date, 'YYYY-MM-DD') AS slot_date,
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
        newPrice,
        slotId,
        id
      ]
    );


    return res.status(200).json({
      success: true,
      message: "Pitch slot updated successfully",
      slot: result.rows[0]
    });


  } catch (error) {

    console.error("UPDATE SLOT ERROR:", error);


    // Duplicate slot
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "A slot with the same date and start time already exists"
      });
    }


    // Invalid slot time
    if (error.code === "23514") {
      return res.status(400).json({
        success: false,
        message:
          "Start time and end time cannot be the same"
      });
    }


    return res.status(500).json({
      success: false,
      message: "Failed to update pitch slot"
    });
  }
};


// ========================================
// DELETE PITCH SLOT
// ========================================

const deleteSlot = async (req, res) => {
  try {

    const { id, slotId } = req.params;


    // Get owner ID
    const owner_id = await getOwnerId(req.user.userId);


    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }


    // Check slot ownership and status
    const slotResult = await pool.query(
      `
      SELECT
        ps.id,
        ps.status
      FROM pitch_slots ps
      INNER JOIN pitches p
        ON p.id = ps.pitch_id
      WHERE ps.id = $1
      AND ps.pitch_id = $2
      AND p.owner_id = $3
      `,
      [
        slotId,
        id,
        owner_id
      ]
    );


    if (slotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Slot not found or does not belong to you"
      });
    }


    const slot = slotResult.rows[0];


    // Booked slots cannot be deleted
    if (slot.status === "booked") {
      return res.status(409).json({
        success: false,
        message: "Booked slots cannot be deleted"
      });
    }


    // Delete slot
    await pool.query(
      `
      DELETE FROM pitch_slots
      WHERE id = $1
      AND pitch_id = $2
      `,
      [
        slotId,
        id
      ]
    );


    return res.status(200).json({
      success: true,
      message: "Pitch slot deleted successfully"
    });


  } catch (error) {

    console.error("DELETE SLOT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete pitch slot"
    });
  }
};


// ========================================
// UPDATE SLOT STATUS
// ========================================

const updateSlotStatus = async (req, res) => {
  try {

    const { id, slotId } = req.params;

    const { status } = req.body;


    // Only these status changes are allowed manually
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


    // Get owner ID
    const owner_id = await getOwnerId(req.user.userId);


    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }


    // Check slot ownership
    const slotResult = await pool.query(
      `
      SELECT
        ps.id,
        ps.status
      FROM pitch_slots ps
      INNER JOIN pitches p
        ON p.id = ps.pitch_id
      WHERE ps.id = $1
      AND ps.pitch_id = $2
      AND p.owner_id = $3
      `,
      [
        slotId,
        id,
        owner_id
      ]
    );


    if (slotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Slot not found or does not belong to you"
      });
    }


    const currentStatus = slotResult.rows[0].status;


    // Booked slots cannot be manually changed
    if (currentStatus === "booked") {
      return res.status(409).json({
        success: false,
        message: "Booked slot status cannot be changed manually"
      });
    }


    // Update status
    const result = await pool.query(
      `
      UPDATE pitch_slots
      SET status = $1
      WHERE id = $2
      AND pitch_id = $3
      RETURNING
        id,
        pitch_id,
        TO_CHAR(slot_date, 'YYYY-MM-DD') AS slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      `,
      [
        status,
        slotId,
        id
      ]
    );


    return res.status(200).json({
      success: true,
      message: "Slot status updated successfully",
      slot: result.rows[0]
    });


  } catch (error) {

    console.error("UPDATE SLOT STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update slot status"
    });
  }
};


// ========================================
// EXPORT
// ========================================

module.exports = {
  createSlot,
  getPitchSlots,
  updateSlot,
  deleteSlot,
  updateSlotStatus
};