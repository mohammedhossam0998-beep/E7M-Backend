const pool = require("../config/db");

// ========================================
// GET PLAYER ID
// ========================================

const getPlayerId = async (userId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM player_profiles
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
// CREATE ACADEMY ENROLLMENT
// ========================================

// POST
// /api/player/academies/:academyId/programs/:programId/enroll

const enrollInAcademyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      academyId,
      programId
    } = req.params;

    // ========================================
    // GET PLAYER
    // ========================================

    const playerId = await getPlayerId(userId);

    if (!playerId) {
      return res.status(403).json({
        success: false,
        message: "Player profile not found"
      });
    }

    // ========================================
    // VERIFY ACADEMY
    // ========================================

    const academyResult = await pool.query(
      `
      SELECT
        id,
        name,
        status
      FROM academies
      WHERE id = $1
      `,
      [academyId]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    const academy = academyResult.rows[0];

    // ========================================
    // CHECK ACADEMY STATUS
    // ========================================

    if (academy.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Academy is not approved"
      });
    }

    // ========================================
    // VERIFY PROGRAM
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
      [
        programId,
        academyId
      ]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found or does not belong to this academy"
      });
    }

    const program = programResult.rows[0];

    // ========================================
    // CHECK EXISTING ENROLLMENT
    // ========================================

    const existingEnrollment = await pool.query(
      `
      SELECT
        id,
        status
      FROM academy_enrollments
      WHERE academy_id = $1
      AND program_id = $2
      AND player_id = $3
      `,
      [
        academyId,
        programId,
        playerId
      ]
    );

    if (existingEnrollment.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Player is already enrolled in this program",
        enrollment: existingEnrollment.rows[0]
      });
    }

    // ========================================
    // CREATE ENROLLMENT
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO academy_enrollments (
        academy_id,
        program_id,
        player_id,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        'pending'
      )
      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [
        academyId,
        programId,
        playerId
      ]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,
      message: "Academy enrollment request created successfully",

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status
      },

      program,

      enrollment: result.rows[0]
    });

  } catch (error) {
    console.error(
      "CREATE ACADEMY ENROLLMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create academy enrollment"
    });
  }
};

// ========================================
// GET PLAYER ENROLLMENTS
// ========================================

// GET
// /api/player/academies/enrollments

const getPlayerAcademyEnrollments = async (req, res) => {
  try {
    const userId = req.user.userId;

    // ========================================
    // GET PLAYER
    // ========================================

    const playerId = await getPlayerId(userId);

    if (!playerId) {
      return res.status(403).json({
        success: false,
        message: "Player profile not found"
      });
    }

    // ========================================
    // GET ENROLLMENTS
    // ========================================

    const result = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,
        ae.enrolled_at,
        ae.updated_at,

        a.name AS academy_name,
        a.status AS academy_status,

        ap.name AS program_name,
        ap.description AS program_description,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks

      FROM academy_enrollments ae

      INNER JOIN academies a
        ON a.id = ae.academy_id

      INNER JOIN academy_programs ap
        ON ap.id = ae.program_id

      WHERE ae.player_id = $1

      ORDER BY ae.id DESC
      `,
      [playerId]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      enrollments: result.rows
    });

  } catch (error) {
    console.error(
      "GET PLAYER ACADEMY ENROLLMENTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get academy enrollments"
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  enrollInAcademyProgram,
  getPlayerAcademyEnrollments
};