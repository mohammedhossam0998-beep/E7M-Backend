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
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

// ============================================================
// CREATE ACADEMY PROGRAM
// ============================================================

const createAcademyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;

    const {
      name,
      description,
      level,
      price,
      duration_weeks,
    } = req.body;

    // ========================================================
    // VALIDATE ACADEMY ID
    // ========================================================

    if (!academyId || !/^\d+$/.test(String(academyId))) {
      return res.status(400).json({
        success: false,
        message: "Valid Academy ID is required",
      });
    }

    // ========================================================
    // VALIDATE PROGRAM NAME
    // ========================================================

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Program name is required",
      });
    }

    // ========================================================
    // GET OWNER ID
    // ========================================================

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ========================================================
    // VERIFY ACADEMY OWNERSHIP
    // ========================================================

    const academyResult = await pool.query(
      `
      SELECT
        id,
        name,
        status,
        owner_id
      FROM academies
      WHERE id = $1
      AND owner_id = $2
      `,
      [academyId, ownerId]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    const academy = academyResult.rows[0];

    // ========================================================
    // VALIDATE PRICE
    // ========================================================

    if (
      price !== undefined &&
      price !== null &&
      (
        price === "" ||
        isNaN(price) ||
        Number(price) < 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number",
      });
    }

    // ========================================================
    // VALIDATE DURATION
    // ========================================================

    if (
      duration_weeks !== undefined &&
      duration_weeks !== null &&
      (
        duration_weeks === "" ||
        !Number.isInteger(Number(duration_weeks)) ||
        Number(duration_weeks) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Duration weeks must be a positive integer",
      });
    }

    // ========================================================
    // CREATE PROGRAM
    // ========================================================

    const result = await pool.query(
      `
      INSERT INTO academy_programs (
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )
      RETURNING
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      `,
      [
        academy.id,
        name.trim(),
        description?.trim() || null,
        level?.trim() || null,
        price !== undefined && price !== null
          ? Number(price)
          : null,
        duration_weeks !== undefined &&
        duration_weeks !== null
          ? Number(duration_weeks)
          : null,
      ]
    );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,
      message: "Academy program created successfully",

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      program: result.rows[0],
    });

  } catch (error) {
    console.error(
      "CREATE ACADEMY PROGRAM ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create academy program",
    });
  }
};

// ============================================================
// GET OWNER ACADEMY PROGRAMS
// ============================================================

const getOwnerAcademyPrograms = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;

    // ========================================================
    // VALIDATE ACADEMY ID
    // ========================================================

    if (!academyId || !/^\d+$/.test(String(academyId))) {
      return res.status(400).json({
        success: false,
        message: "Valid Academy ID is required",
      });
    }

    // ========================================================
    // GET OWNER ID
    // ========================================================

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ========================================================
    // VERIFY ACADEMY OWNERSHIP
    // ========================================================

    const academyResult = await pool.query(
      `
      SELECT
        id,
        name,
        status
      FROM academies
      WHERE id = $1
      AND owner_id = $2
      `,
      [academyId, ownerId]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found",
      });
    }

    // ========================================================
    // GET PROGRAMS
    // ========================================================

    const programsResult = await pool.query(
      `
      SELECT
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      FROM academy_programs
      WHERE academy_id = $1
      ORDER BY id DESC
      `,
      [academyId]
    );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      academy: academyResult.rows[0],

      count: programsResult.rows.length,

      programs: programsResult.rows,
    });

  } catch (error) {
    console.error(
      "GET OWNER ACADEMY PROGRAMS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get academy programs",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================
// ========================================
// UPDATE ACADEMY PROGRAM
// ========================================

const updateAcademyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, programId } = req.params;

    const {
      name,
      description,
      level,
      price,
      duration_weeks,
    } = req.body;

    // ========================================
    // VALIDATE IDs
    // ========================================

    if (!academyId || !programId) {
      return res.status(400).json({
        success: false,
        message: "Academy ID and Program ID are required",
      });
    }

    // ========================================
    // GET OWNER ID
    // ========================================

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ========================================
    // VERIFY ACADEMY OWNERSHIP
    // ========================================

    const academyResult = await pool.query(
      `
      SELECT
        id,
        name,
        status
      FROM academies
      WHERE id = $1
      AND owner_id = $2
      `,
      [academyId, ownerId]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    // ========================================
    // VERIFY PROGRAM BELONGS TO ACADEMY
    // ========================================

    const programResult = await pool.query(
      `
      SELECT
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      FROM academy_programs
      WHERE id = $1
      AND academy_id = $2
      `,
      [programId, academyId]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found or does not belong to this academy",
      });
    }

    // ========================================
    // VALIDATE NAME
    // ========================================

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Program name cannot be empty",
        });
      }
    }

    // ========================================
    // VALIDATE PRICE
    // ========================================

    if (
      price !== undefined &&
      price !== null &&
      (isNaN(price) || Number(price) < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number",
      });
    }

    // ========================================
    // VALIDATE DURATION
    // ========================================

    if (
      duration_weeks !== undefined &&
      duration_weeks !== null &&
      (
        !Number.isInteger(Number(duration_weeks)) ||
        Number(duration_weeks) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Duration weeks must be a positive integer",
      });
    }

    // ========================================
    // UPDATE PROGRAM
    // ========================================

    const result = await pool.query(
      `
      UPDATE academy_programs
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        level = COALESCE($3, level),
        price = COALESCE($4, price),
        duration_weeks = COALESCE($5, duration_weeks)
      WHERE id = $6
      AND academy_id = $7
      RETURNING
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      `,
      [
        name !== undefined ? name.trim() : null,
        description !== undefined ? description : null,
        level !== undefined ? level : null,
        price !== undefined && price !== null
          ? Number(price)
          : null,
        duration_weeks !== undefined && duration_weeks !== null
          ? Number(duration_weeks)
          : null,
        programId,
        academyId,
      ]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Academy program updated successfully",
      academy: academyResult.rows[0],
      program: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPDATE ACADEMY PROGRAM ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update academy program",
    });
  }
};
// ========================================
// DELETE ACADEMY PROGRAM
// ========================================

const deleteAcademyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, programId } = req.params;

    // ========================================
    // VALIDATE IDS
    // ========================================

    if (!academyId || !programId) {
      return res.status(400).json({
        success: false,
        message: "Academy ID and Program ID are required",
      });
    }

    // ========================================
    // GET OWNER ID
    // ========================================

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ========================================
    // VERIFY ACADEMY OWNERSHIP
    // ========================================

    const academyResult = await pool.query(
      `
      SELECT
        id,
        name,
        status
      FROM academies
      WHERE id = $1
      AND owner_id = $2
      `,
      [academyId, ownerId]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    // ========================================
    // VERIFY PROGRAM BELONGS TO ACADEMY
    // ========================================

    const programResult = await pool.query(
      `
      SELECT
        id,
        academy_id,
        name
      FROM academy_programs
      WHERE id = $1
      AND academy_id = $2
      `,
      [programId, academyId]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found or does not belong to this academy",
      });
    }

    // ========================================
    // DELETE PROGRAM
    // ========================================

    const deleteResult = await pool.query(
      `
      DELETE FROM academy_programs
      WHERE id = $1
      AND academy_id = $2
      RETURNING
        id,
        academy_id,
        name
      `,
      [programId, academyId]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found",
      });
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Academy program deleted successfully",
      academy: academyResult.rows[0],
      program: deleteResult.rows[0],
    });

  } catch (error) {
    console.error(
      "DELETE ACADEMY PROGRAM ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete academy program",
    });
  }
};
module.exports = {
   createAcademyProgram,
  getOwnerAcademyPrograms,
  updateAcademyProgram,
  deleteAcademyProgram,
};