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
// CREATE ACADEMY SCHEDULE
// ========================================

const createAcademySchedule = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId } = req.params;

    const {
      program_id,
      day_of_week,
      start_time,
      end_time,
      location,
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!academyId) {
      return res.status(400).json({
        success: false,
        message: "Academy ID is required",
      });
    }

    if (!day_of_week) {
      return res.status(400).json({
        success: false,
        message: "day_of_week is required",
      });
    }

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "start_time and end_time are required",
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

    const academy = academyResult.rows[0];

    // ========================================
    // VERIFY PROGRAM
    // ========================================

    if (program_id !== undefined && program_id !== null) {
      const programResult = await pool.query(
        `
        SELECT id
        FROM academy_programs
        WHERE id = $1
        AND academy_id = $2
        `,
        [program_id, academyId]
      );

      if (programResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Program not found or does not belong to this academy",
        });
      }
    }

    // ========================================
    // VALIDATE TIME
    // ========================================

    if (start_time >= end_time) {
      return res.status(400).json({
        success: false,
        message: "start_time must be before end_time",
      });
    }

    // ========================================
    // CREATE SCHEDULE
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO academy_schedule (
        academy_id,
        program_id,
        day_of_week,
        start_time,
        end_time,
        location
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
        program_id,
        day_of_week,
        start_time,
        end_time,
        location,
        created_at
      `,
      [
        academyId,
        program_id ?? null,
        day_of_week.trim(),
        start_time,
        end_time,
        location?.trim() || null,
      ]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,
      message: "Academy schedule created successfully",

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      schedule: result.rows[0],
    });

  } catch (error) {
    console.error(
      "CREATE ACADEMY SCHEDULE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create academy schedule",
    });
  }
};

// ========================================
// GET OWNER ACADEMY SCHEDULE
// ========================================

const getOwnerAcademySchedule = async (req, res) => {
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

    // ========================================
    // GET SCHEDULE
    // ========================================

    const scheduleResult = await pool.query(
      `
      SELECT
        s.id,
        s.academy_id,
        s.program_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.location,
        s.created_at,
        p.name AS program_name
      FROM academy_schedule s
      LEFT JOIN academy_programs p
        ON p.id = s.program_id
      WHERE s.academy_id = $1
      ORDER BY
        s.day_of_week,
        s.start_time,
        s.id
      `,
      [academyId]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,

      academy: academyResult.rows[0],

      count: scheduleResult.rows.length,

      schedule: scheduleResult.rows,
    });

  } catch (error) {
    console.error(
      "GET OWNER ACADEMY SCHEDULE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get academy schedule",
    });
  }
};

// ========================================
// GET SCHEDULE BY ID
// ========================================

const getOwnerScheduleById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { academyId, scheduleId } = req.params;

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
    // GET SCHEDULE
    // ========================================

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.academy_id,
        s.program_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.location,
        s.created_at,
        p.name AS program_name,
        a.name AS academy_name,
        a.status AS academy_status
      FROM academy_schedule s
      INNER JOIN academies a
        ON a.id = s.academy_id
      LEFT JOIN academy_programs p
        ON p.id = s.program_id
      WHERE s.id = $1
      AND s.academy_id = $2
      AND a.owner_id = $3
      `,
      [
        scheduleId,
        academyId,
        ownerId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    return res.status(200).json({
      success: true,
      schedule: result.rows[0],
    });

  } catch (error) {
    console.error(
      "GET OWNER SCHEDULE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get schedule",
    });
  }
};

// ========================================
// UPDATE ACADEMY SCHEDULE
// ========================================

const updateAcademySchedule = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      academyId,
      scheduleId,
    } = req.params;

    const {
      program_id,
      day_of_week,
      start_time,
      end_time,
      location,
    } = req.body;

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
    // VERIFY SCHEDULE OWNERSHIP
    // ========================================

    const existingResult = await pool.query(
      `
      SELECT
        s.id,
        s.academy_id,
        a.name AS academy_name,
        a.status AS academy_status
      FROM academy_schedule s
      INNER JOIN academies a
        ON a.id = s.academy_id
      WHERE s.id = $1
      AND s.academy_id = $2
      AND a.owner_id = $3
      `,
      [
        scheduleId,
        academyId,
        ownerId,
      ]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    const existing = existingResult.rows[0];

    // ========================================
    // VERIFY PROGRAM
    // ========================================

    if (program_id !== undefined && program_id !== null) {
      const programResult = await pool.query(
        `
        SELECT id
        FROM academy_programs
        WHERE id = $1
        AND academy_id = $2
        `,
        [
          program_id,
          academyId,
        ]
      );

      if (programResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Program not found or does not belong to this academy",
        });
      }
    }

    // ========================================
    // VALIDATE TIME
    // ========================================

    if (start_time !== undefined && end_time !== undefined) {
      if (start_time >= end_time) {
        return res.status(400).json({
          success: false,
          message: "start_time must be before end_time",
        });
      }
    }

    // ========================================
    // UPDATE
    // ========================================

    const result = await pool.query(
      `
      UPDATE academy_schedule
      SET
        program_id = COALESCE($1, program_id),
        day_of_week = COALESCE($2, day_of_week),
        start_time = COALESCE($3, start_time),
        end_time = COALESCE($4, end_time),
        location = COALESCE($5, location)
      WHERE id = $6
      AND academy_id = $7
      RETURNING
        id,
        academy_id,
        program_id,
        day_of_week,
        start_time,
        end_time,
        location,
        created_at
      `,
      [
        program_id ?? null,
        day_of_week?.trim() ?? null,
        start_time ?? null,
        end_time ?? null,
        location?.trim() ?? null,
        scheduleId,
        academyId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Academy schedule updated successfully",

      academy: {
        id: existing.academy_id,
        name: existing.academy_name,
        status: existing.academy_status,
      },

      schedule: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPDATE ACADEMY SCHEDULE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update academy schedule",
    });
  }
};

// ========================================
// DELETE ACADEMY SCHEDULE
// ========================================

const deleteAcademySchedule = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      academyId,
      scheduleId,
    } = req.params;

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
    // GET SCHEDULE + VERIFY OWNERSHIP
    // ========================================

    const existingResult = await pool.query(
      `
      SELECT
        s.id,
        s.academy_id,
        s.program_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.location,
        a.name AS academy_name,
        a.status AS academy_status
      FROM academy_schedule s
      INNER JOIN academies a
        ON a.id = s.academy_id
      WHERE s.id = $1
      AND s.academy_id = $2
      AND a.owner_id = $3
      `,
      [
        scheduleId,
        academyId,
        ownerId,
      ]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    const schedule = existingResult.rows[0];

    // ========================================
    // DELETE
    // ========================================

    await pool.query(
      `
      DELETE FROM academy_schedule
      WHERE id = $1
      AND academy_id = $2
      `,
      [
        scheduleId,
        academyId,
      ]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Academy schedule deleted successfully",

      academy: {
        id: schedule.academy_id,
        name: schedule.academy_name,
        status: schedule.academy_status,
      },

      schedule: {
        id: schedule.id,
        academy_id: schedule.academy_id,
        program_id: schedule.program_id,
        day_of_week: schedule.day_of_week,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        location: schedule.location,
      },
    });

  } catch (error) {
    console.error(
      "DELETE ACADEMY SCHEDULE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete academy schedule",
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  createAcademySchedule,
  getOwnerAcademySchedule,
  getOwnerScheduleById,
  updateAcademySchedule,
  deleteAcademySchedule,
};