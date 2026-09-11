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
// VERIFY OWNER ACADEMY
// ========================================

const getOwnerAcademy = async (academyId, ownerId) => {
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
    [academyId, ownerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// ========================================
// ASSIGN COACH TO ACADEMY
// ========================================

const assignCoachToAcademy = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;
    const { coach_id, role } = req.body;

    // ========================================
    // VALIDATE ACADEMY ID
    // ========================================

    if (!academyId) {
      return res.status(400).json({
        success: false,
        message: "Academy ID is required",
      });
    }

    // ========================================
    // VALIDATE COACH ID
    // ========================================

    if (!coach_id) {
      return res.status(400).json({
        success: false,
        message: "Coach ID is required",
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

    const academy = await getOwnerAcademy(
      academyId,
      ownerId
    );

    if (!academy) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    // ========================================
    // VERIFY COACH
    // ========================================

    const coachResult = await pool.query(
      `
      SELECT
        id,
        user_id,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved,
        gender,
        coach_type,
        city,
        address,
        rating,
        reviews_count,
        players_count,
        certificates_count,
        is_blocked,
        is_featured,
        cover_url
      FROM coaches
      WHERE id = $1
      `,
      [coach_id]
    );

    if (coachResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    const coach = coachResult.rows[0];

    // ========================================
    // CHECK COACH APPROVAL
    // ========================================

    if (!coach.is_approved) {
      return res.status(403).json({
        success: false,
        message: "Coach is not approved",
      });
    }

    // ========================================
    // CHECK COACH BLOCKED STATUS
    // ========================================

    if (coach.is_blocked) {
      return res.status(403).json({
        success: false,
        message: "Coach is blocked",
      });
    }

    // ========================================
    // CHECK EXISTING ASSIGNMENT
    // ========================================

    const existingAssignment = await pool.query(
      `
      SELECT
        id
      FROM academy_coaches
      WHERE academy_id = $1
      AND coach_id = $2
      `,
      [academyId, coach_id]
    );

    if (existingAssignment.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Coach is already assigned to this academy",
      });
    }

    // ========================================
    // CREATE ASSIGNMENT
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO academy_coaches (
        academy_id,
        coach_id,
        role
      )
      VALUES (
        $1,
        $2,
        $3
      )
      RETURNING
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      `,
      [
        academyId,
        coach_id,
        role ? role.trim() : null,
      ]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,
      message: "Coach assigned to academy successfully",

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      coach: {
        id: coach.id,
        user_id: coach.user_id,
        is_approved: coach.is_approved,
        is_blocked: coach.is_blocked,
        rating: coach.rating,
      },

      assignment: result.rows[0],
    });

  } catch (error) {
    console.error(
      "ASSIGN COACH TO ACADEMY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to assign coach to academy",
    });
  }
};

// ========================================
// GET AVAILABLE COACHES FOR OWNER
// ========================================

const getAvailableCoaches = async (req, res) => {
  try {
    const { academyId } = req.params;

    const result = await pool.query(
      `
      SELECT
        c.id AS coach_id,
        c.user_id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        c.experience_years,
        c.hourly_rate,
        c.bio,
        c.is_private,
        c.is_approved
      FROM coaches c
      INNER JOIN users u
        ON u.id = c.user_id
      WHERE
        u.role = 'coach'
        AND u.is_active = true
        AND c.is_approved = true
        AND NOT EXISTS (
          SELECT 1
          FROM academy_coaches ac
          WHERE ac.academy_id = $1
          AND ac.coach_id = c.id
        )
      ORDER BY u.full_name ASC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      coaches: result.rows
    });
  } catch (error) {
    console.error(
      "GET AVAILABLE COACHES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get available coaches"
    });
  }
};


// ========================================
// GET ACADEMY COACHES
// ========================================

const getAcademyCoaches = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;

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

    const academy = await getOwnerAcademy(
      academyId,
      ownerId
    );

    if (!academy) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    // ========================================
    // GET COACHES
    // ========================================

    const result = await pool.query(
      `
      SELECT
        ac.id AS assignment_id,
        ac.academy_id,
        ac.coach_id,
        ac.role,
        ac.assigned_at,

        c.user_id,
        c.experience_years,
        c.hourly_rate,
        c.bio,
        c.is_private,
        c.is_approved,
        c.gender,
        c.coach_type,
        c.city,
        c.address,
        c.rating,
        c.reviews_count,
        c.players_count,
        c.certificates_count,
        c.is_blocked,
        c.is_featured,
        c.cover_url,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image

      FROM academy_coaches ac

      INNER JOIN coaches c
        ON c.id = ac.coach_id

      INNER JOIN users u
        ON u.id = c.user_id

      WHERE ac.academy_id = $1

      ORDER BY ac.assigned_at DESC
      `,
      [academyId]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      count: result.rows.length,
      coaches: result.rows,
    });

  } catch (error) {
    console.error(
      "GET ACADEMY COACHES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get academy coaches",
    });
  }
};

// ========================================
// UPDATE COACH ASSIGNMENT
// ========================================

const updateCoachAssignment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, coachId } = req.params;
    const { role } = req.body;

    // ========================================
    // VALIDATE ROLE
    // ========================================

    if (role === undefined) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
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

    const academy = await getOwnerAcademy(
      academyId,
      ownerId
    );

    if (!academy) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    // ========================================
    // UPDATE ASSIGNMENT
    // ========================================

    const result = await pool.query(
      `
      UPDATE academy_coaches
      SET role = $1
      WHERE academy_id = $2
      AND coach_id = $3

      RETURNING
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      `,
      [
        role.trim() || null,
        academyId,
        coachId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach assignment not found",
      });
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Academy coach assignment updated successfully",

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      assignment: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPDATE COACH ASSIGNMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update coach assignment",
    });
  }
};

// ========================================
// REMOVE COACH FROM ACADEMY
// ========================================

const removeCoachFromAcademy = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, coachId } = req.params;

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

    const academy = await getOwnerAcademy(
      academyId,
      ownerId
    );

    if (!academy) {
      return res.status(404).json({
        success: false,
        message: "Academy not found or does not belong to you",
      });
    }

    // ========================================
    // GET ASSIGNMENT
    // ========================================

    const existingAssignment = await pool.query(
      `
      SELECT
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      FROM academy_coaches
      WHERE academy_id = $1
      AND coach_id = $2
      `,
      [academyId, coachId]
    );

    if (existingAssignment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach assignment not found",
      });
    }

    // ========================================
    // DELETE ASSIGNMENT
    // ========================================

    const result = await pool.query(
      `
      DELETE FROM academy_coaches
      WHERE academy_id = $1
      AND coach_id = $2

      RETURNING
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      `,
      [academyId, coachId]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Coach removed from academy successfully",

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      assignment: result.rows[0],
    });

  } catch (error) {
    console.error(
      "REMOVE COACH FROM ACADEMY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to remove coach from academy",
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  assignCoachToAcademy,
  getAvailableCoaches,
  getAcademyCoaches,
  updateCoachAssignment,
  removeCoachFromAcademy,
};