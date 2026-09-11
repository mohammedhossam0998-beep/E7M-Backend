const pool = require("../config/db");

// ========================================
// GET ALL APPROVED PITCHES
// GET /api/pitches
// ========================================

const getAllPitches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.owner_id,
        p.city_id,
        c.name AS city_name,
        p.name,
        p.description,
        p.address,
        p.latitude,
        p.longitude,
        p.pitch_type,
        p.capacity,
        p.base_price,
        p.deposit_amount,
        p.status,
        p.created_at,
        p.updated_at,

        (
          SELECT pi.image_url
          FROM pitch_images pi
          WHERE pi.pitch_id = p.id
          ORDER BY
            pi.is_primary DESC,
            pi.created_at ASC,
            pi.id ASC
          LIMIT 1
        ) AS primary_image

      FROM pitches p

      LEFT JOIN cities c
        ON c.id = p.city_id

      WHERE p.status = 'approved'

      ORDER BY p.created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      pitches: result.rows,
    });
  } catch (error) {
    console.error("GET ALL APPROVED PITCHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitches",
    });
  }
};

// ========================================
// GET ONE APPROVED PITCH
// GET /api/pitches/:id
// ========================================

const getPitchById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.owner_id,
        p.city_id,
        c.name AS city_name,
        p.name,
        p.description,
        p.address,
        p.latitude,
        p.longitude,
        p.pitch_type,
        p.capacity,
        p.base_price,
        p.deposit_amount,
        p.status,
        p.created_at,
        p.updated_at,

        (
          SELECT pi.image_url
          FROM pitch_images pi
          WHERE pi.pitch_id = p.id
          ORDER BY
            pi.is_primary DESC,
            pi.created_at ASC,
            pi.id ASC
          LIMIT 1
        ) AS primary_image

      FROM pitches p

      LEFT JOIN cities c
        ON c.id = p.city_id

      WHERE p.id = $1
        AND p.status = 'approved'
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or not approved",
      });
    }

    return res.status(200).json({
      success: true,
      pitch: result.rows[0],
    });
  } catch (error) {
    console.error("GET PITCH BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch",
    });
  }
};

// ========================================
// GET AVAILABLE PITCH SLOTS
// GET /api/pitches/:id/slots
// ========================================

const getPlayerPitchSlots = async (req, res) => {
  try {
    const { id } = req.params;

    // ----------------------------------------
    // Check that pitch exists and is approved
    // ----------------------------------------

    const pitchResult = await pool.query(
      `
      SELECT id
      FROM pitches
      WHERE id = $1
        AND status = 'approved'
      `,
      [id]
    );

    if (pitchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or not approved",
      });
    }

    // ----------------------------------------
    // Get only available slots
    // ----------------------------------------

    const result = await pool.query(
      `
      SELECT
        id,
        pitch_id,
        slot_date,
        start_time,
        end_time,
        price,
        status,
        created_at
      FROM pitch_slots
      WHERE pitch_id = $1
        AND status = 'available'
      ORDER BY
        slot_date ASC,
        start_time ASC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      slots: result.rows,
    });
  } catch (error) {
    console.error("GET PLAYER PITCH SLOTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch slots",
    });
  }
};
// ========================================
// GET PITCH IMAGES
// GET /api/pitches/:id/images
// ========================================

const getPitchImages = async (req, res) => {
  try {
    const { id } = req.params;

    // ----------------------------------------
    // Check that pitch exists and is approved
    // ----------------------------------------

    const pitchResult = await pool.query(
      `
      SELECT id
      FROM pitches
      WHERE id = $1
        AND status = 'approved'
      `,
      [id]
    );

    if (pitchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or not approved",
      });
    }

    // ----------------------------------------
    // Get all pitch images
    // ----------------------------------------

    const result = await pool.query(
      `
      SELECT
        id,
        pitch_id,
        image_url,
        is_primary,
        created_at
      FROM pitch_images
      WHERE pitch_id = $1
      ORDER BY
        is_primary DESC,
        created_at ASC,
        id ASC
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      images: result.rows,
    });
  } catch (error) {
    console.error("GET PITCH IMAGES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch images",
    });
  }
};
// ========================================
// EXPORT
// ========================================

module.exports = {
  getAllPitches,
  getPitchById,
  getPlayerPitchSlots,
  getPitchImages,
};