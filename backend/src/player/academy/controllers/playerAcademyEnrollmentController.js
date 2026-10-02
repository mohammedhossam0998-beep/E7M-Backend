const pool = require("../../../config/db");

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
// ENROLL IN ACADEMY PROGRAM
// ========================================

const enrollInAcademyProgram = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, programId } = req.params;

    // ----------------------------------------
    // GET PLAYER
    // ----------------------------------------

    const playerId = await getPlayerId(userId);

    if (!playerId) {
      return res.status(403).json({
        success: false,
        message: "Player profile not found",
      });
    }

    // ----------------------------------------
    // VERIFY ACADEMY EXISTS & APPROVED
    // ----------------------------------------

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
        message: "Academy not found",
      });
    }

    const academy = academyResult.rows[0];

    if (academy.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Academy is not available for enrollment",
      });
    }

    // ----------------------------------------
    // VERIFY PROGRAM BELONGS TO ACADEMY
    // ----------------------------------------

    const programResult = await pool.query(
      `
      SELECT
        id,
        academy_id,
        name,
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
        message: "Program not found in this academy",
      });
    }

    const program = programResult.rows[0];

    // ----------------------------------------
    // CHECK FOR EXISTING ENROLLMENT
    // ----------------------------------------

    const existingResult = await pool.query(
      `
      SELECT
        id,
        status
      FROM academy_enrollments
      WHERE player_id = $1
        AND program_id = $2
      `,
      [playerId, programId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      if (existing.status === "pending" || existing.status === "approved") {
        return res.status(400).json({
          success: false,
          message: `You already have a${
            existing.status === "approved" ? "n approved" : " pending"
          } enrollment in this program`,
        });
      }
    }

    // ----------------------------------------
    // CREATE ENROLLMENT
    // ----------------------------------------

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
        enrolled_at
      `,
      [academyId, programId, playerId]
    );

    return res.status(201).json({
      success: true,
      message: "Enrollment request sent successfully",
      academy: {
        id: academy.id,
        name: academy.name,
      },
      program: {
        id: program.id,
        name: program.name,
        price: program.price,
        duration_weeks: program.duration_weeks,
      },
      enrollment: result.rows[0],
    });

  } catch (error) {
    console.error(
      "ENROLL IN ACADEMY PROGRAM ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to enroll in academy program",
    });
  }
};

// ========================================
// GET PLAYER ACADEMY ENROLLMENTS
// ========================================

const getPlayerAcademyEnrollments = async (req, res) => {
  try {
    const userId = req.user.userId;

    const playerId = await getPlayerId(userId);

    if (!playerId) {
      return res.status(403).json({
        success: false,
        message: "Player profile not found",
      });
    }

    const result = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.status,
        ae.enrolled_at,
        ae.updated_at,

        a.name AS academy_name,

        ap.name AS program_name,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks AS program_duration_weeks

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

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      enrollments: result.rows,
    });

  } catch (error) {
    console.error(
      "GET PLAYER ACADEMY ENROLLMENTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get academy enrollments",
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  enrollInAcademyProgram,
  getPlayerAcademyEnrollments,
};