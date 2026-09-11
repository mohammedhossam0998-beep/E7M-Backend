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
// CREATE PITCH
// ========================================

const createPitch = async (req, res) => {
  try {
    const {
      city_id,
      name,
      description,
      address,
      latitude,
      longitude,
      pitch_type,
      capacity,
      base_price,
      deposit_amount
    } = req.body;

    // ========================================
    // CHECK REQUIRED FIELDS
    // ========================================

    if (
      !city_id ||
      !name ||
      !pitch_type ||
      !capacity ||
      base_price === undefined ||
      base_price === null ||
      deposit_amount === undefined ||
      deposit_amount === null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "city_id, name, pitch_type, capacity, base_price and deposit_amount are required"
      });
    }

    // ========================================
    // VALIDATE NUMBERS
    // ========================================

    const basePrice = Number(base_price);
    const depositAmount = Number(deposit_amount);

    if (
      !Number.isFinite(basePrice) ||
      !Number.isFinite(depositAmount)
    ) {
      return res.status(400).json({
        success: false,
        message: "base_price and deposit_amount must be valid numbers"
      });
    }

    // ========================================
    // VALIDATE PRICE VALUES
    // ========================================

    if (basePrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "base_price must be greater than 0"
      });
    }

    if (depositAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "deposit_amount cannot be negative"
      });
    }

    if (depositAmount > basePrice) {
      return res.status(400).json({
        success: false,
        message: "deposit_amount cannot be greater than base_price"
      });
    }

    // ========================================
    // GET OWNER ID
    // ========================================

    const owner_id = await getOwnerId(req.user.userId);

    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    // ========================================
    // CREATE PITCH
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO pitches (
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        deposit_amount,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12
      )
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        deposit_amount,
        status,
        created_at,
        updated_at
      `,
      [
        owner_id,
        city_id,
        name,
        description || null,
        address || null,
        latitude || null,
        longitude || null,
        pitch_type,
        capacity,
        basePrice,
        depositAmount,
        "pending"
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Pitch created successfully",
      pitch: result.rows[0]
    });

  } catch (error) {
    console.error("CREATE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create pitch"
    });
  }
};

// ========================================
// GET OWNER PITCHES
// ========================================

const getOwnerPitches = async (req, res) => {
  try {
    const owner_id = await getOwnerId(req.user.userId);

    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        deposit_amount,
        status,
        created_at,
        updated_at
      FROM pitches
      WHERE owner_id = $1
      ORDER BY created_at DESC
      `,
      [owner_id]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      pitches: result.rows
    });

  } catch (error) {
    console.error("GET OWNER PITCHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owner pitches"
    });
  }
};

// ========================================
// GET ONE OWNER PITCH
// ========================================

const getOwnerPitchById = async (req, res) => {
  try {
    const { id } = req.params;

    const owner_id = await getOwnerId(req.user.userId);

    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        deposit_amount,
        status,
        created_at,
        updated_at
      FROM pitches
      WHERE id = $1
      AND owner_id = $2
      `,
      [id, owner_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      pitch: result.rows[0]
    });

  } catch (error) {
    console.error("GET OWNER PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch"
    });
  }
};

// ========================================
// UPDATE OWNER PITCH
// ========================================

const updatePitch = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      city_id,
      name,
      description,
      address,
      latitude,
      longitude,
      pitch_type,
      capacity,
      base_price,
      deposit_amount
    } = req.body;

    const owner_id = await getOwnerId(req.user.userId);

    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    // ========================================
    // VALIDATE REQUIRED PRICE DATA
    // ========================================

    if (
      base_price === undefined ||
      base_price === null ||
      deposit_amount === undefined ||
      deposit_amount === null
    ) {
      return res.status(400).json({
        success: false,
        message: "base_price and deposit_amount are required"
      });
    }

    const basePrice = Number(base_price);
    const depositAmount = Number(deposit_amount);

    if (
      !Number.isFinite(basePrice) ||
      !Number.isFinite(depositAmount)
    ) {
      return res.status(400).json({
        success: false,
        message: "base_price and deposit_amount must be valid numbers"
      });
    }

    if (basePrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "base_price must be greater than 0"
      });
    }

    if (depositAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "deposit_amount cannot be negative"
      });
    }

    if (depositAmount > basePrice) {
      return res.status(400).json({
        success: false,
        message: "deposit_amount cannot be greater than base_price"
      });
    }

    // ========================================
    // UPDATE PITCH
    // ========================================

    const result = await pool.query(
      `
      UPDATE pitches
      SET
        city_id = $1,
        name = $2,
        description = $3,
        address = $4,
        latitude = $5,
        longitude = $6,
        pitch_type = $7,
        capacity = $8,
        base_price = $9,
        deposit_amount = $10,
        updated_at = NOW()
      WHERE id = $11
      AND owner_id = $12
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        deposit_amount,
        status,
        created_at,
        updated_at
      `,
      [
        city_id,
        name,
        description || null,
        address || null,
        latitude || null,
        longitude || null,
        pitch_type,
        capacity,
        basePrice,
        depositAmount,
        id,
        owner_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch updated successfully",
      pitch: result.rows[0]
    });

  } catch (error) {
    console.error("UPDATE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update pitch"
    });
  }
};

// ========================================
// DELETE OWNER PITCH
// ========================================

const deletePitch = async (req, res) => {
  try {
    const { id } = req.params;

    const owner_id = await getOwnerId(req.user.userId);

    if (!owner_id) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const result = await pool.query(
      `
      DELETE FROM pitches
      WHERE id = $1
      AND owner_id = $2
      RETURNING id
      `,
      [id, owner_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch deleted successfully"
    });

  } catch (error) {
    console.error("DELETE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete pitch"
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  createPitch,
  getOwnerPitches,
  getOwnerPitchById,
  updatePitch,
  deletePitch
};