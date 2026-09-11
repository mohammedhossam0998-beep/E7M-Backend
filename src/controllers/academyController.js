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
      AND is_deleted = false
    LIMIT 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

// ============================================================
// VALIDATE PHONE NUMBER
// ============================================================

const isValidPhoneNumber = (phone) => {
  if (typeof phone !== "string") {
    return false;
  }

  // Egyptian mobile numbers
  return /^01[0125][0-9]{8}$/.test(phone);
};

// ============================================================
// CREATE ACADEMY
// ============================================================

const createAcademy = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // USER FROM JWT
    // ----------------------------------------------------------

    const userId = req.user.userId;

    // ----------------------------------------------------------
    // REQUEST BODY
    // ----------------------------------------------------------

    const {
      name,
      phone_number,
      description,
      address,
      city_id,
      image_url,
      pitch_id,
    } = req.body;

    // ----------------------------------------------------------
    // BASIC VALIDATION
    // ----------------------------------------------------------

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Academy name is required",
      });
    }

    if (!phone_number) {
      return res.status(400).json({
        success: false,
        message: "Academy phone number is required",
      });
    }

    if (!isValidPhoneNumber(phone_number)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Egyptian phone number",
      });
    }

    if (!pitch_id) {
      return res.status(400).json({
        success: false,
        message: "pitch_id is required",
      });
    }

    // ----------------------------------------------------------
    // GET OWNER
    // ----------------------------------------------------------

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------------------------
    // VERIFY PITCH OWNERSHIP
    // ----------------------------------------------------------

    const pitchResult = await pool.query(
      `
      SELECT
        id,
        owner_id,
        city_id,
        name,
        status
      FROM pitches
      WHERE id = $1
        AND owner_id = $2
      LIMIT 1
      `,
      [pitch_id, ownerId]
    );

    if (pitchResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Pitch not found or does not belong to you",
      });
    }

    const pitch = pitchResult.rows[0];

    // ----------------------------------------------------------
    // OPTIONAL CITY VALIDATION
    // ----------------------------------------------------------

    if (city_id !== undefined && city_id !== null) {
      const cityResult = await pool.query(
        `
        SELECT id
        FROM cities
        WHERE id = $1
        LIMIT 1
        `,
        [city_id]
      );

      if (cityResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "City not found",
        });
      }
    }

    // ----------------------------------------------------------
    // CREATE ACADEMY
    // ----------------------------------------------------------

    const result = await pool.query(
      `
      INSERT INTO academies (
        name,
        phone_number,
        description,
        address,
        city_id,
        image_url,
        created_by,
        owner_id,
        pitch_id,
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
        'pending'
      )
      RETURNING
        id,
        name,
        phone_number,
        description,
        address,
        city_id,
        image_url,
        created_by,
        owner_id,
        pitch_id,
        status,
        created_at,
        updated_at
      `,
      [
        name.trim(),
        phone_number,
        description?.trim() || null,
        address?.trim() || null,
        city_id ?? null,
        image_url || null,
        userId,
        ownerId,
        pitch_id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Academy created successfully and is waiting for admin approval",
      academy: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create academy",
    });
  }
};

// ============================================================
// GET OWNER ACADEMIES
// ============================================================

const getOwnerAcademies = async (req, res) => {
  try {
    const userId = req.user.userId;

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.phone_number,
        a.description,
        a.address,
        a.city_id,
        a.image_url,
        a.created_by,
        a.owner_id,
        a.pitch_id,
        a.status,
        a.created_at,
        a.updated_at,

        p.name AS pitch_name,
        p.status AS pitch_status

      FROM academies a

      LEFT JOIN pitches p
        ON p.id = a.pitch_id

      WHERE a.owner_id = $1

      ORDER BY a.created_at DESC
      `,
      [ownerId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      academies: result.rows,
    });
  } catch (error) {
    console.error("GET OWNER ACADEMIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owner academies",
    });
  }
};

// ============================================================
// GET OWNER ACADEMY BY ID
// ============================================================

const getOwnerAcademyById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.phone_number,
        a.description,
        a.address,
        a.city_id,
        a.image_url,
        a.created_by,
        a.owner_id,
        a.pitch_id,
        a.status,
        a.created_at,
        a.updated_at,

        p.name AS pitch_name,
        p.status AS pitch_status

      FROM academies a

      LEFT JOIN pitches p
        ON p.id = a.pitch_id

      WHERE a.id = $1
        AND a.owner_id = $2

      LIMIT 1
      `,
      [id, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found",
      });
    }

    return res.status(200).json({
      success: true,
      academy: result.rows[0],
    });
  } catch (error) {
    console.error("GET OWNER ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy",
    });
  }
};

// ============================================================
// UPDATE OWNER ACADEMY
// ============================================================

const updateAcademy = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const {
      name,
      phone_number,
      description,
      address,
      city_id,
      image_url,
      pitch_id,
    } = req.body;

    // ----------------------------------------------------------
    // GET OWNER
    // ----------------------------------------------------------

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------------------------
    // CHECK ACADEMY OWNERSHIP
    // ----------------------------------------------------------

    const academyResult = await pool.query(
      `
      SELECT
        id,
        owner_id,
        pitch_id,
        status
      FROM academies
      WHERE id = $1
        AND owner_id = $2
      LIMIT 1
      `,
      [id, ownerId]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found",
      });
    }

    // ----------------------------------------------------------
    // PHONE VALIDATION
    // ----------------------------------------------------------

    if (phone_number !== undefined) {
      if (!isValidPhoneNumber(phone_number)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Egyptian phone number",
        });
      }
    }

    // ----------------------------------------------------------
    // PITCH OWNERSHIP CHECK
    // ----------------------------------------------------------

    if (pitch_id !== undefined) {
      const pitchResult = await pool.query(
        `
        SELECT id
        FROM pitches
        WHERE id = $1
          AND owner_id = $2
        LIMIT 1
        `,
        [pitch_id, ownerId]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Pitch not found or does not belong to you",
        });
      }
    }

    // ----------------------------------------------------------
    // CITY VALIDATION
    // ----------------------------------------------------------

    if (city_id !== undefined && city_id !== null) {
      const cityResult = await pool.query(
        `
        SELECT id
        FROM cities
        WHERE id = $1
        LIMIT 1
        `,
        [city_id]
      );

      if (cityResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "City not found",
        });
      }
    }

    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

    const result = await pool.query(
      `
      UPDATE academies
      SET
        name = COALESCE($1, name),
        phone_number = COALESCE($2, phone_number),
        description = COALESCE($3, description),
        address = COALESCE($4, address),
        city_id = COALESCE($5, city_id),
        image_url = COALESCE($6, image_url),
        pitch_id = COALESCE($7, pitch_id),
        updated_at = NOW()
      WHERE id = $8
        AND owner_id = $9

      RETURNING
        id,
        name,
        phone_number,
        description,
        address,
        city_id,
        image_url,
        created_by,
        owner_id,
        pitch_id,
        status,
        created_at,
        updated_at
      `,
      [
        name?.trim() || null,
        phone_number ?? null,
        description !== undefined
          ? description.trim()
          : null,
        address !== undefined
          ? address.trim()
          : null,
        city_id ?? null,
        image_url ?? null,
        pitch_id ?? null,
        id,
        ownerId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Academy updated successfully",
      academy: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update academy",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  createAcademy,
  getOwnerAcademies,
  getOwnerAcademyById,
  updateAcademy,
};