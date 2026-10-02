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
      AND is_deleted = false
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

// ========================================
// GET ACADEMY ENROLLMENTS
// ========================================

const getAcademyEnrollments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;

    if (!academyId) {
      return res.status(400).json({
        success: false,
        message: "Academy ID is required",
      });
    }

    // ----------------------------------------
    // GET OWNER
    // ----------------------------------------

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------
    // VERIFY ACADEMY OWNERSHIP
    // ----------------------------------------

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

    // ----------------------------------------
    // GET ENROLLMENTS
    // ----------------------------------------

    const enrollmentsResult = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,
        ae.enrolled_at,
        ae.updated_at,

        ap.name AS program_name,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks AS program_duration_weeks,

        pp.user_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image

      FROM academy_enrollments ae

      INNER JOIN academy_programs ap
        ON ap.id = ae.program_id

      INNER JOIN player_profiles pp
        ON pp.id = ae.player_id

      INNER JOIN users u
        ON u.id = pp.user_id

      WHERE ae.academy_id = $1

      ORDER BY ae.id DESC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      academy: academyResult.rows[0],
      count: enrollmentsResult.rows.length,
      enrollments: enrollmentsResult.rows,
    });
  } catch (error) {
    console.error(
      "GET ACADEMY ENROLLMENTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get academy enrollments",
    });
  }
};

// ========================================
// APPROVE ENROLLMENT
// ========================================

const approveAcademyEnrollment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, enrollmentId } = req.params;

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const enrollmentResult = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,

        a.name AS academy_name,
        a.status AS academy_status

      FROM academy_enrollments ae

      INNER JOIN academies a
        ON a.id = ae.academy_id

      WHERE ae.id = $1
        AND ae.academy_id = $2
        AND a.owner_id = $3
      `,
      [
        enrollmentId,
        academyId,
        ownerId,
      ]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Enrollment not found or does not belong to this academy",
      });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Enrollment is already approved",
      });
    }

    const result = await pool.query(
      `
      UPDATE academy_enrollments

      SET
        status = 'approved',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = $1

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [enrollmentId]
    );

    return res.status(200).json({
      success: true,
      message: "Academy enrollment approved successfully",

      academy: {
        id: enrollment.academy_id,
        name: enrollment.academy_name,
        status: enrollment.academy_status,
      },

      enrollment: result.rows[0],
    });
  } catch (error) {
    console.error(
      "APPROVE ACADEMY ENROLLMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to approve academy enrollment",
    });
  }
};

// ========================================
// REJECT ENROLLMENT
// ========================================

const rejectAcademyEnrollment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, enrollmentId } = req.params;

    const ownerId = await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const enrollmentResult = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,

        a.name AS academy_name,
        a.status AS academy_status

      FROM academy_enrollments ae

      INNER JOIN academies a
        ON a.id = ae.academy_id

      WHERE ae.id = $1
        AND ae.academy_id = $2
        AND a.owner_id = $3
      `,
      [
        enrollmentId,
        academyId,
        ownerId,
      ]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Enrollment not found or does not belong to this academy",
      });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Enrollment is already rejected",
      });
    }

    const result = await pool.query(
      `
      UPDATE academy_enrollments

      SET
        status = 'rejected',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = $1

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [enrollmentId]
    );

    return res.status(200).json({
      success: true,
      message: "Academy enrollment rejected successfully",

      academy: {
        id: enrollment.academy_id,
        name: enrollment.academy_name,
        status: enrollment.academy_status,
      },

      enrollment: result.rows[0],
    });
  } catch (error) {
    console.error(
      "REJECT ACADEMY ENROLLMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reject academy enrollment",
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  getAcademyEnrollments,
  approveAcademyEnrollment,
  rejectAcademyEnrollment,
};