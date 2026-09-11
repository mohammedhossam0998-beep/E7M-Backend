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
// GET OWNER ACADEMY
// ============================================================

const getOwnerAcademy = async (
  academyId,
  ownerId
) => {
  const result = await pool.query(
    `
    SELECT
      id,
      name,
      status
    FROM academies
    WHERE id = $1
      AND owner_id = $2
    `,
    [
      academyId,
      ownerId,
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// ============================================================
// GET OWNER ACADEMY PLAYERS / ENROLLMENTS
// GET /api/owner/academies/:academyId/players
// ============================================================

const getOwnerAcademyPlayers = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;

    // ----------------------------------------------------------
    // VALIDATE ACADEMY ID
    // ----------------------------------------------------------

    if (!academyId) {
      return res.status(400).json({
        success: false,
        message: "Academy ID is required",
      });
    }

    // ----------------------------------------------------------
    // GET OWNER
    // ----------------------------------------------------------

    const ownerId =
      await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------------------------
    // VERIFY ACADEMY OWNERSHIP
    // ----------------------------------------------------------

    const academy =
      await getOwnerAcademy(
        academyId,
        ownerId
      );

    if (!academy) {
      return res.status(404).json({
        success: false,
        message:
          "Academy not found or does not belong to you",
      });
    }

    // ----------------------------------------------------------
    // GET ENROLLMENTS
    // ----------------------------------------------------------

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

        -- PROGRAM
        ap.name AS program_name,
        ap.description AS program_description,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks AS program_duration_weeks,

        -- PLAYER PROFILE
        pp.user_id AS player_user_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,

        -- USER
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

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      count: result.rows.length,

      players: result.rows,

      enrollments: result.rows,
    });

  } catch (error) {
    console.error(
      "GET OWNER ACADEMY PLAYERS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get academy players",
    });
  }
};

// ============================================================
// GET OWNER ENROLLMENT BY ID
// GET /api/owner/enrollments/:id
// ============================================================

const getOwnerEnrollmentById = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    // ----------------------------------------------------------
    // VALIDATE ID
    // ----------------------------------------------------------

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Enrollment ID is required",
      });
    }

    // ----------------------------------------------------------
    // GET OWNER
    // ----------------------------------------------------------

    const ownerId =
      await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------------------------
    // GET ENROLLMENT
    // ----------------------------------------------------------

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

        -- ACADEMY
        a.name AS academy_name,
        a.status AS academy_status,

        -- PROGRAM
        ap.name AS program_name,
        ap.description AS program_description,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks AS program_duration_weeks,

        -- PLAYER PROFILE
        pp.user_id AS player_user_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,

        -- USER
        u.full_name,
        u.email,
        u.phone,
        u.profile_image

      FROM academy_enrollments ae

      INNER JOIN academies a
        ON a.id = ae.academy_id

      INNER JOIN academy_programs ap
        ON ap.id = ae.program_id

      INNER JOIN player_profiles pp
        ON pp.id = ae.player_id

      INNER JOIN users u
        ON u.id = pp.user_id

      WHERE ae.id = $1
        AND a.owner_id = $2
      `,
      [
        id,
        ownerId,
      ]
    );

    // ----------------------------------------------------------
    // NOT FOUND
    // ----------------------------------------------------------

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Enrollment not found or does not belong to you",
      });
    }

    const enrollment =
      result.rows[0];

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      enrollment: {
        id: enrollment.id,
        academy_id:
          enrollment.academy_id,
        program_id:
          enrollment.program_id,
        player_id:
          enrollment.player_id,
        status:
          enrollment.status,
        enrolled_at:
          enrollment.enrolled_at,
        updated_at:
          enrollment.updated_at,
      },

      academy: {
        id: enrollment.academy_id,
        name:
          enrollment.academy_name,
        status:
          enrollment.academy_status,
      },

      program: {
        id:
          enrollment.program_id,
        name:
          enrollment.program_name,
        description:
          enrollment.program_description,
        level:
          enrollment.program_level,
        price:
          enrollment.program_price,
        duration_weeks:
          enrollment.program_duration_weeks,
      },

      player: {
        id:
          enrollment.player_id,
        user_id:
          enrollment.player_user_id,
        full_name:
          enrollment.full_name,
        email:
          enrollment.email,
        phone:
          enrollment.phone,
        profile_image:
          enrollment.profile_image,
        position:
          enrollment.position,
        skill_level:
          enrollment.skill_level,
        date_of_birth:
          enrollment.date_of_birth,
        preferred_foot:
          enrollment.preferred_foot,
        bio:
          enrollment.bio,
      },

    });

  } catch (error) {
    console.error(
      "GET OWNER ENROLLMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get enrollment",
    });
  }
};

// ============================================================
// APPROVE OWNER ENROLLMENT
// PATCH /api/owner/enrollments/:id/approve
// ============================================================

const approveOwnerEnrollment = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    // ----------------------------------------------------------
    // VALIDATE ID
    // ----------------------------------------------------------

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Enrollment ID is required",
      });
    }

    // ----------------------------------------------------------
    // GET OWNER
    // ----------------------------------------------------------

    const ownerId =
      await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------------------------
    // VERIFY ENROLLMENT OWNERSHIP
    // ----------------------------------------------------------

    const enrollmentResult =
      await pool.query(
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
          AND a.owner_id = $2
        `,
        [
          id,
          ownerId,
        ]
      );

    if (
      enrollmentResult.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Enrollment not found or does not belong to you",
      });
    }

    const enrollment =
      enrollmentResult.rows[0];

    // ----------------------------------------------------------
    // ONLY PENDING CAN BE APPROVED
    // ----------------------------------------------------------

    if (enrollment.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          `Enrollment cannot be approved because its current status is '${enrollment.status}'`,
      });
    }

    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

    const result = await pool.query(
      `
      UPDATE academy_enrollments

      SET
        status = 'approved',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = $1
        AND status = 'pending'

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Enrollment status changed before approval",
      });
    }

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Academy enrollment approved successfully",

      academy: {
        id:
          enrollment.academy_id,
        name:
          enrollment.academy_name,
        status:
          enrollment.academy_status,
      },

      enrollment:
        result.rows[0],
    });

  } catch (error) {
    console.error(
      "APPROVE OWNER ENROLLMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to approve enrollment",
    });
  }
};

// ============================================================
// REJECT OWNER ENROLLMENT
// PATCH /api/owner/enrollments/:id/reject
// ============================================================

const rejectOwnerEnrollment = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    // ----------------------------------------------------------
    // VALIDATE ID
    // ----------------------------------------------------------

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Enrollment ID is required",
      });
    }

    // ----------------------------------------------------------
    // GET OWNER
    // ----------------------------------------------------------

    const ownerId =
      await getOwnerId(userId);

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ----------------------------------------------------------
    // VERIFY ENROLLMENT OWNERSHIP
    // ----------------------------------------------------------

    const enrollmentResult =
      await pool.query(
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
          AND a.owner_id = $2
        `,
        [
          id,
          ownerId,
        ]
      );

    if (
      enrollmentResult.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Enrollment not found or does not belong to you",
      });
    }

    const enrollment =
      enrollmentResult.rows[0];

    // ----------------------------------------------------------
    // ONLY PENDING CAN BE REJECTED
    // ----------------------------------------------------------

    if (enrollment.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          `Enrollment cannot be rejected because its current status is '${enrollment.status}'`,
      });
    }

    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

    const result = await pool.query(
      `
      UPDATE academy_enrollments

      SET
        status = 'rejected',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = $1
        AND status = 'pending'

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message:
          "Enrollment status changed before rejection",
      });
    }

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Academy enrollment rejected successfully",

      academy: {
        id:
          enrollment.academy_id,
        name:
          enrollment.academy_name,
        status:
          enrollment.academy_status,
      },

      enrollment:
        result.rows[0],
    });

  } catch (error) {
    console.error(
      "REJECT OWNER ENROLLMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to reject enrollment",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getOwnerAcademyPlayers,
  getOwnerEnrollmentById,
  approveOwnerEnrollment,
  rejectOwnerEnrollment,
};