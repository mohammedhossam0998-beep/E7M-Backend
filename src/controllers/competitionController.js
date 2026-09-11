const pool = require("../config/db");

// ============================================================
// CREATE COMPETITION
// POST /api/owner/competitions
// ============================================================

const createCompetition = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      name,
      description,
      location,
      start_date,
      end_date,
      registration_start_date,
      registration_deadline,
      entry_fee,
      competition_type,
      format,
      seeding_method,
      max_participants,
      min_players_per_team,
      max_players_per_team,
      approval_mode,
      payment_window_minutes,
      waiting_list_enabled,
      visibility,
      allow_withdrawal,
      refund_policy,
    } = req.body;

    // ========================================================
    // BASIC VALIDATION
    // ========================================================

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Competition name is required",
      });
    }

    if (name.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: "Competition name must not exceed 150 characters",
      });
    }

    // ========================================================
    // COMPETITION TYPE
    // ========================================================

    if (!["team", "individual"].includes(competition_type)) {
      return res.status(400).json({
        success: false,
        message: "competition_type must be either team or individual",
      });
    }

    const allowedFormats = ["league", "knockout", "groups_knockout"];

    if (format !== undefined && !allowedFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid competition format. Allowed values: league, knockout, groups_knockout",
      });
    }

    const allowedSeedingMethods = ["random", "manual", "ranking"];

    if (
      seeding_method !== undefined &&
      !allowedSeedingMethods.includes(seeding_method)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid seeding method. Allowed values: random, manual, ranking",
      });
    }

    // ========================================================
    // DATES
    // ========================================================

    if (start_date && end_date) {
      const start = new Date(start_date);
      const end = new Date(end_date);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid competition dates",
        });
      }

      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "start_date cannot be after end_date",
        });
      }
    }

    if (registration_start_date && registration_deadline) {
      const registrationStart = new Date(registration_start_date);
      const registrationDeadline = new Date(registration_deadline);

      if (
        Number.isNaN(registrationStart.getTime()) ||
        Number.isNaN(registrationDeadline.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid registration dates",
        });
      }

      if (registrationStart > registrationDeadline) {
        return res.status(400).json({
          success: false,
          message:
            "registration_start_date cannot be after registration_deadline",
        });
      }
    }

    if (registration_deadline && start_date) {
      const deadline = new Date(registration_deadline);
      const start = new Date(start_date);

      if (
        !Number.isNaN(deadline.getTime()) &&
        !Number.isNaN(start.getTime()) &&
        deadline > start
      ) {
        return res.status(400).json({
          success: false,
          message:
            "registration_deadline cannot be after competition start_date",
        });
      }
    }

    // ========================================================
    // ENTRY FEE
    // ========================================================

    const normalizedEntryFee =
      entry_fee === undefined ||
      entry_fee === null ||
      entry_fee === ""
        ? 0
        : Number(entry_fee);

    if (
      !Number.isFinite(normalizedEntryFee) ||
      normalizedEntryFee < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "entry_fee must be a valid number greater than or equal to 0",
      });
    }

    // ========================================================
    // MAX PARTICIPANTS
    // ========================================================

    if (
      max_participants !== undefined &&
      max_participants !== null
    ) {
      if (
        !Number.isInteger(Number(max_participants)) ||
        Number(max_participants) <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "max_participants must be a positive integer",
        });
      }
    }

    // ========================================================
    // TEAM RULES
    // Only valid for team competitions
    // ========================================================

    if (competition_type === "individual") {
      if (
        min_players_per_team !== undefined &&
        min_players_per_team !== null
      ) {
        return res.status(400).json({
          success: false,
          message:
            "min_players_per_team must be null for individual competitions",
        });
      }

      if (
        max_players_per_team !== undefined &&
        max_players_per_team !== null
      ) {
        return res.status(400).json({
          success: false,
          message:
            "max_players_per_team must be null for individual competitions",
        });
      }
    }

    if (competition_type === "team") {
      if (
        min_players_per_team === undefined ||
        min_players_per_team === null ||
        max_players_per_team === undefined ||
        max_players_per_team === null
      ) {
        return res.status(400).json({
          success: false,
          message:
            "min_players_per_team and max_players_per_team are required for team competitions",
        });
      }

      const minPlayers = Number(min_players_per_team);
      const maxPlayers = Number(max_players_per_team);

      if (
        !Number.isInteger(minPlayers) ||
        !Number.isInteger(maxPlayers) ||
        minPlayers <= 0 ||
        maxPlayers <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Team player limits must be positive integers",
        });
      }

      if (minPlayers > maxPlayers) {
        return res.status(400).json({
          success: false,
          message:
            "min_players_per_team cannot be greater than max_players_per_team",
        });
      }
    }

    // ========================================================
    // APPROVAL MODE
    // ========================================================

    const normalizedApprovalMode =
      approval_mode || "auto";

    if (!["auto", "manual"].includes(normalizedApprovalMode)) {
      return res.status(400).json({
        success: false,
        message: "approval_mode must be either auto or manual",
      });
    }

    // ========================================================
    // PAYMENT WINDOW
    // ========================================================

    const normalizedPaymentWindow =
      payment_window_minutes === undefined ||
      payment_window_minutes === null ||
      payment_window_minutes === ""
        ? null
        : Number(payment_window_minutes);

    if (
      normalizedPaymentWindow !== null &&
      (!Number.isInteger(normalizedPaymentWindow) ||
        normalizedPaymentWindow <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "payment_window_minutes must be a positive integer",
      });
    }

    // ========================================================
    // VISIBILITY
    // ========================================================

    const normalizedVisibility =
      visibility || "public";

    if (!["public", "private"].includes(normalizedVisibility)) {
      return res.status(400).json({
        success: false,
        message: "visibility must be either public or private",
      });
    }

    // ========================================================
    // REFUND POLICY
    // ========================================================

    const normalizedRefundPolicy =
      refund_policy || "none";

    if (
      ![
        "none",
        "full_before_deadline",
        "tiered",
      ].includes(normalizedRefundPolicy)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "refund_policy must be none, full_before_deadline, or tiered",
      });
    }

    // ========================================================
    // BOOLEAN VALUES
    // ========================================================

    const normalizedWaitingList =
      waiting_list_enabled === undefined
        ? false
        : Boolean(waiting_list_enabled);

    const normalizedAllowWithdrawal =
      allow_withdrawal === undefined
        ? true
        : Boolean(allow_withdrawal);

    // ========================================================
    // CREATE COMPETITION
    // ========================================================

    const query = `
      INSERT INTO competitions (
        name,
        description,
        location,
        start_date,
        end_date,
        registration_start_date,
        registration_deadline,
        entry_fee,
        status,
        created_by,
        competition_type,
        format,
        seeding_method,
        max_participants,
        min_players_per_team,
        max_players_per_team,
        approval_mode,
        payment_window_minutes,
        waiting_list_enabled,
        visibility,
        allow_withdrawal,
        refund_policy
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
        'upcoming',
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17,
        $18,
        $19,
        $20,
        $21
      )
      RETURNING *;
    `;

    const values = [
      name.trim(),
      description || null,
      location || null,
      start_date || null,
      end_date || null,
      registration_start_date || null,
      registration_deadline || null,
      normalizedEntryFee,
      userId,
      competition_type,
      format || "league",
      seeding_method || "random",
      max_participants ?? null,
      competition_type === "team"
        ? Number(min_players_per_team)
        : null,
      competition_type === "team"
        ? Number(max_players_per_team)
        : null,
      normalizedApprovalMode,
      normalizedPaymentWindow,
      normalizedWaitingList,
      normalizedVisibility,
      normalizedAllowWithdrawal,
      normalizedRefundPolicy,
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Competition created successfully",
      competition: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Create competition error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create competition",
    });
  }
};

// ============================================================
// GET OWNER COMPETITIONS
// GET /api/owner/competitions
// ============================================================

const getOwnerCompetitions = async (req, res) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT
        *
      FROM competitions
      WHERE created_by = $1
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, [userId]);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      competitions: result.rows,
    });
  } catch (error) {
    console.error(
      "Get owner competitions error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get owner competitions",
    });
  }
};

// ============================================================
// GET OWNER COMPETITION BY ID
// GET /api/owner/competitions/:id
// ============================================================

const getOwnerCompetitionById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.id;

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    const query = `
      SELECT
        *
      FROM competitions
      WHERE id = $1
        AND created_by = $2
      LIMIT 1;
    `;

    const result = await pool.query(query, [
      competitionId,
      userId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    return res.status(200).json({
      success: true,
      competition: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Get owner competition by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition",
    });
  }
};
// ============================================================
// UPDATE OWNER COMPETITION
// PUT /api/owner/competitions/:id
// ============================================================

const updateCompetition = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.id;

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    const {
      name,
      description,
      location,
      start_date,
      end_date,
      registration_start_date,
      registration_deadline,
      entry_fee,
      competition_type,
      max_participants,
      min_players_per_team,
      max_players_per_team,
      approval_mode,
      payment_window_minutes,
      waiting_list_enabled,
      visibility,
      allow_withdrawal,
      refund_policy,
    } = req.body;

    // ========================================================
    // GET CURRENT COMPETITION
    // ========================================================

    const currentResult = await pool.query(
      `
        SELECT *
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    const current = currentResult.rows[0];

    // ========================================================
    // CHECK EXISTING REGISTRATIONS
    // ========================================================

    const registrationsResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM competition_registrations
        WHERE competition_id = $1
          AND status NOT IN ('rejected', 'cancelled');
      `,
      [competitionId]
    );

    const registrationCount =
      registrationsResult.rows[0].count;

    // ========================================================
    // USE CURRENT VALUES WHEN FIELD IS NOT SENT
    // ========================================================

    const finalName =
      name !== undefined ? name.trim() : current.name;

    const finalDescription =
      description !== undefined
        ? description
        : current.description;

    const finalLocation =
      location !== undefined
        ? location
        : current.location;

    const finalStartDate =
      start_date !== undefined
        ? start_date
        : current.start_date;

    const finalEndDate =
      end_date !== undefined
        ? end_date
        : current.end_date;

    const finalRegistrationStart =
      registration_start_date !== undefined
        ? registration_start_date
        : current.registration_start_date;

    const finalRegistrationDeadline =
      registration_deadline !== undefined
        ? registration_deadline
        : current.registration_deadline;

    const finalEntryFee =
      entry_fee !== undefined
        ? Number(entry_fee)
        : Number(current.entry_fee);

    const finalType =
      competition_type !== undefined
        ? competition_type
        : current.competition_type;

    const finalMaxParticipants =
      max_participants !== undefined
        ? Number(max_participants)
        : current.max_participants;

    const finalMinPlayers =
      min_players_per_team !== undefined
        ? min_players_per_team === null
          ? null
          : Number(min_players_per_team)
        : current.min_players_per_team;

    const finalMaxPlayers =
      max_players_per_team !== undefined
        ? max_players_per_team === null
          ? null
          : Number(max_players_per_team)
        : current.max_players_per_team;

    const finalApprovalMode =
      approval_mode !== undefined
        ? approval_mode
        : current.approval_mode;

    const finalPaymentWindow =
      payment_window_minutes !== undefined
        ? payment_window_minutes === null || payment_window_minutes === ""
          ? null
          : Number(payment_window_minutes)
        : current.payment_window_minutes;

    const finalWaitingList =
      waiting_list_enabled !== undefined
        ? Boolean(waiting_list_enabled)
        : current.waiting_list_enabled;

    const finalVisibility =
      visibility !== undefined
        ? visibility
        : current.visibility;

    const finalAllowWithdrawal =
      allow_withdrawal !== undefined
        ? Boolean(allow_withdrawal)
        : current.allow_withdrawal;

    const finalRefundPolicy =
      refund_policy !== undefined
        ? refund_policy
        : current.refund_policy;

    // ========================================================
    // BASIC VALIDATION
    // ========================================================

    if (!finalName) {
      return res.status(400).json({
        success: false,
        message: "Competition name is required",
      });
    }

    if (finalName.length > 150) {
      return res.status(400).json({
        success: false,
        message:
          "Competition name must not exceed 150 characters",
      });
    }

    if (!["team", "individual"].includes(finalType)) {
      return res.status(400).json({
        success: false,
        message:
          "competition_type must be either team or individual",
      });
    }

    // ========================================================
    // DATE VALIDATION
    // ========================================================

    if (finalStartDate && finalEndDate) {
      const start = new Date(finalStartDate);
      const end = new Date(finalEndDate);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid competition dates",
        });
      }

      if (start > end) {
        return res.status(400).json({
          success: false,
          message:
            "start_date cannot be after end_date",
        });
      }
    }

    if (
      finalRegistrationStart &&
      finalRegistrationDeadline
    ) {
      const registrationStart =
        new Date(finalRegistrationStart);

      const registrationDeadline =
        new Date(finalRegistrationDeadline);

      if (
        Number.isNaN(registrationStart.getTime()) ||
        Number.isNaN(registrationDeadline.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid registration dates",
        });
      }

      if (registrationStart > registrationDeadline) {
        return res.status(400).json({
          success: false,
          message:
            "registration_start_date cannot be after registration_deadline",
        });
      }
    }

    if (
      finalRegistrationDeadline &&
      finalStartDate
    ) {
      const deadline =
        new Date(finalRegistrationDeadline);

      const start =
        new Date(finalStartDate);

      if (
        !Number.isNaN(deadline.getTime()) &&
        !Number.isNaN(start.getTime()) &&
        deadline > start
      ) {
        return res.status(400).json({
          success: false,
          message:
            "registration_deadline cannot be after competition start_date",
        });
      }
    }

    // ========================================================
    // ENTRY FEE
    // ========================================================

    if (
      !Number.isFinite(finalEntryFee) ||
      finalEntryFee < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "entry_fee must be a valid number greater than or equal to 0",
      });
    }

    // ========================================================
    // MAX PARTICIPANTS
    // ========================================================

    if (
      finalMaxParticipants !== null &&
      finalMaxParticipants !== undefined
    ) {
      if (
        !Number.isInteger(finalMaxParticipants) ||
        finalMaxParticipants <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "max_participants must be a positive integer",
        });
      }

      if (
        finalMaxParticipants < registrationCount
      ) {
        return res.status(400).json({
          success: false,
          message:
            "max_participants cannot be lower than the current number of registrations",
        });
      }
    }

    // ========================================================
    // TEAM RULES
    // ========================================================

    if (finalType === "individual") {
      if (
        finalMinPlayers !== null ||
        finalMaxPlayers !== null
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Team player limits must be null for individual competitions",
        });
      }
    }

    if (finalType === "team") {
      if (
        finalMinPlayers === null ||
        finalMaxPlayers === null ||
        !Number.isInteger(finalMinPlayers) ||
        !Number.isInteger(finalMaxPlayers) ||
        finalMinPlayers <= 0 ||
        finalMaxPlayers <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid team player limits are required for team competitions",
        });
      }

      if (finalMinPlayers > finalMaxPlayers) {
        return res.status(400).json({
          success: false,
          message:
            "min_players_per_team cannot be greater than max_players_per_team",
        });
      }
    }

    // ========================================================
    // PREVENT TYPE CHANGE AFTER REGISTRATIONS
    // ========================================================

    if (
      registrationCount > 0 &&
      finalType !== current.competition_type
    ) {
      return res.status(400).json({
        success: false,
        message:
          "competition_type cannot be changed after registrations exist",
      });
    }

    // ========================================================
    // APPROVAL MODE
    // ========================================================

    if (
      !["auto", "manual"].includes(
        finalApprovalMode
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "approval_mode must be either auto or manual",
      });
    }

    // ========================================================
    // PAYMENT WINDOW
    // ========================================================

    if (
      finalPaymentWindow !== null &&
      (!Number.isInteger(finalPaymentWindow) ||
        finalPaymentWindow <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "payment_window_minutes must be a positive integer",
      });
    }

    // ========================================================
    // PREVENT ENTRY FEE CHANGE AFTER REGISTRATIONS
    // ========================================================

    if (
      registrationCount > 0 &&
      finalEntryFee !== Number(current.entry_fee)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "entry_fee cannot be changed after registrations exist",
      });
    }

    // ========================================================
    // VISIBILITY
    // ========================================================

    if (
      !["public", "private"].includes(
        finalVisibility
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "visibility must be either public or private",
      });
    }

    // ========================================================
    // REFUND POLICY
    // ========================================================

    if (
      ![
        "none",
        "full_before_deadline",
        "tiered",
      ].includes(finalRefundPolicy)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "refund_policy must be none, full_before_deadline, or tiered",
      });
    }

    // ========================================================
    // UPDATE
    // ========================================================

    const result = await pool.query(
      `
        UPDATE competitions
        SET
          name = $1,
          description = $2,
          location = $3,
          start_date = $4,
          end_date = $5,
          registration_start_date = $6,
          registration_deadline = $7,
          entry_fee = $8,
          competition_type = $9,
          max_participants = $10,
          min_players_per_team = $11,
          max_players_per_team = $12,
          approval_mode = $13,
          payment_window_minutes = $14,
          waiting_list_enabled = $15,
          visibility = $16,
          allow_withdrawal = $17,
          refund_policy = $18
        WHERE id = $19
          AND created_by = $20
        RETURNING *;
      `,
      [
        finalName,
        finalDescription,
        finalLocation,
        finalStartDate,
        finalEndDate,
        finalRegistrationStart,
        finalRegistrationDeadline,
        finalEntryFee,
        finalType,
        finalMaxParticipants,
        finalMinPlayers,
        finalMaxPlayers,
        finalApprovalMode,
        finalPaymentWindow,
        finalWaitingList,
        finalVisibility,
        finalAllowWithdrawal,
        finalRefundPolicy,
        competitionId,
        userId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Competition updated successfully",
      competition: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Update competition error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update competition",
    });
  }
};
// ============================================================
// DELETE OWNER COMPETITION
// DELETE /api/owner/competitions/:id
// ============================================================

const deleteCompetition = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.id;

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id, status
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // CHECK REGISTRATIONS
    // ========================================================

    const registrationsResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM competition_registrations
        WHERE competition_id = $1;
      `,
      [competitionId]
    );

    const registrationCount =
      registrationsResult.rows[0].count;

    if (registrationCount > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Competition cannot be deleted because it has registrations",
      });
    }

    // ========================================================
    // CHECK PRIZES
    // ========================================================

    const prizesResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM competition_prizes
        WHERE competition_id = $1;
      `,
      [competitionId]
    );

    const prizeCount =
      prizesResult.rows[0].count;

    if (prizeCount > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Competition cannot be deleted because it has prizes",
      });
    }

    // ========================================================
    // DELETE
    // ========================================================

    await pool.query(
      `
        DELETE FROM competitions
        WHERE id = $1
          AND created_by = $2;
      `,
      [competitionId, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Competition deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete competition error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete competition",
    });
  }
};
// ============================================================
// CREATE COMPETITION PRIZE
// POST /api/owner/competitions/:competitionId/prizes
// ============================================================

const createCompetitionPrize = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;

    const {
      name,
      description,
      prize_type,
      amount,
      currency,
      position,
    } = req.body;

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // NAME VALIDATION
    // ========================================================

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Prize name is required",
      });
    }

    if (name.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: "Prize name must not exceed 150 characters",
      });
    }

    // ========================================================
    // PRIZE TYPE VALIDATION
    // ========================================================

    const allowedPrizeTypes = [
      "cash",
      "trophy",
      "medal",
      "equipment",
      "other",
    ];

    if (!allowedPrizeTypes.includes(prize_type)) {
      return res.status(400).json({
        success: false,
        message:
          "prize_type must be cash, trophy, medal, equipment, or other",
      });
    }

    // ========================================================
    // AMOUNT VALIDATION
    // ========================================================

    let normalizedAmount = null;

    if (
      amount !== undefined &&
      amount !== null &&
      amount !== ""
    ) {
      normalizedAmount = Number(amount);

      if (
        !Number.isFinite(normalizedAmount) ||
        normalizedAmount < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "amount must be a valid number greater than or equal to 0",
        });
      }
    }

    // ========================================================
    // POSITION VALIDATION
    // ========================================================

    let normalizedPosition = null;

    if (
      position !== undefined &&
      position !== null &&
      position !== ""
    ) {
      normalizedPosition = Number(position);

      if (
        !Number.isInteger(normalizedPosition) ||
        normalizedPosition <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "position must be a positive integer",
        });
      }
    }

    // ========================================================
    // INSERT PRIZE
    // ========================================================

    const result = await pool.query(
      `
        INSERT INTO competition_prizes (
          competition_id,
          name,
          description,
          prize_type,
          amount,
          currency,
          position
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING *;
      `,
      [
        competitionId,
        name.trim(),
        description || null,
        prize_type,
        normalizedAmount,
        currency || null,
        normalizedPosition,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Competition prize created successfully",
      prize: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Create competition prize error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create competition prize",
    });
  }
};
// ============================================================
// GET OWNER COMPETITION PRIZES
// GET /api/owner/competitions/:competitionId/prizes
// ============================================================

const getOwnerCompetitionPrizes = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // GET PRIZES
    // ========================================================

    const result = await pool.query(
      `
        SELECT *
        FROM competition_prizes
        WHERE competition_id = $1
        ORDER BY
          position ASC NULLS LAST,
          id ASC;
      `,
      [competitionId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      prizes: result.rows,
    });
  } catch (error) {
    console.error(
      "Get owner competition prizes error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition prizes",
    });
  }
};
// ============================================================
// GET OWNER COMPETITION PRIZE BY ID
// GET /api/owner/competitions/:competitionId/prizes/:prizeId
// ============================================================

const getOwnerCompetitionPrizeById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;
    const prizeId = req.params.prizeId;

    // ========================================================
    // VALIDATE IDs
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(prizeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prize ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // GET PRIZE
    // ========================================================

    const result = await pool.query(
      `
        SELECT *
        FROM competition_prizes
        WHERE id = $1
          AND competition_id = $2
        LIMIT 1;
      `,
      [prizeId, competitionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition prize not found",
      });
    }

    return res.status(200).json({
      success: true,
      prize: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Get owner competition prize by ID error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition prize",
    });
  }
};
// ============================================================
// UPDATE OWNER COMPETITION PRIZE
// PUT /api/owner/competitions/:competitionId/prizes/:prizeId
// ============================================================

const updateCompetitionPrize = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;
    const prizeId = req.params.prizeId;

    const {
      name,
      description,
      prize_type,
      amount,
      currency,
      position,
    } = req.body;

    // ========================================================
    // VALIDATE IDs
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(prizeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prize ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // GET CURRENT PRIZE
    // ========================================================

    const currentResult = await pool.query(
      `
        SELECT *
        FROM competition_prizes
        WHERE id = $1
          AND competition_id = $2
        LIMIT 1;
      `,
      [prizeId, competitionId]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition prize not found",
      });
    }

    const current = currentResult.rows[0];

    // ========================================================
    // USE CURRENT VALUES WHEN FIELD IS NOT SENT
    // ========================================================

    const finalName =
      name !== undefined ? name.trim() : current.name;

    const finalDescription =
      description !== undefined
        ? description
        : current.description;

    const finalPrizeType =
      prize_type !== undefined
        ? prize_type
        : current.prize_type;

    let finalAmount;

    if (amount !== undefined) {
      if (amount === null || amount === "") {
        finalAmount = null;
      } else {
        finalAmount = Number(amount);
      }
    } else {
      finalAmount =
        current.amount !== null
          ? Number(current.amount)
          : null;
    }

    const finalCurrency =
      currency !== undefined
        ? currency
        : current.currency;

    let finalPosition;

    if (position !== undefined) {
      if (position === null || position === "") {
        finalPosition = null;
      } else {
        finalPosition = Number(position);
      }
    } else {
      finalPosition = current.position;
    }

    // ========================================================
    // NAME VALIDATION
    // ========================================================

    if (!finalName) {
      return res.status(400).json({
        success: false,
        message: "Prize name is required",
      });
    }

    if (finalName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Prize name must not exceed 150 characters",
      });
    }

    // ========================================================
    // PRIZE TYPE VALIDATION
    // ========================================================

    const allowedPrizeTypes = [
      "cash",
      "trophy",
      "medal",
      "equipment",
      "other",
    ];

    if (!allowedPrizeTypes.includes(finalPrizeType)) {
      return res.status(400).json({
        success: false,
        message:
          "prize_type must be cash, trophy, medal, equipment, or other",
      });
    }

    // ========================================================
    // AMOUNT VALIDATION
    // ========================================================

    if (
      finalAmount !== null &&
      (!Number.isFinite(finalAmount) || finalAmount < 0)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "amount must be a valid number greater than or equal to 0",
      });
    }

    // ========================================================
    // POSITION VALIDATION
    // ========================================================

    if (
      finalPosition !== null &&
      (!Number.isInteger(finalPosition) || finalPosition <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "position must be a positive integer",
      });
    }

    // ========================================================
    // UPDATE PRIZE
    // ========================================================

    const result = await pool.query(
      `
        UPDATE competition_prizes
        SET
          name = $1,
          description = $2,
          prize_type = $3,
          amount = $4,
          currency = $5,
          position = $6
        WHERE id = $7
          AND competition_id = $8
        RETURNING *;
      `,
      [
        finalName,
        finalDescription,
        finalPrizeType,
        finalAmount,
        finalCurrency,
        finalPosition,
        prizeId,
        competitionId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Competition prize updated successfully",
      prize: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Update competition prize error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update competition prize",
    });
  }
};
// ============================================================
// DELETE OWNER COMPETITION PRIZE
// DELETE /api/owner/competitions/:competitionId/prizes/:prizeId
// ============================================================

const deleteCompetitionPrize = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;
    const prizeId = req.params.prizeId;

    // ========================================================
    // VALIDATE IDs
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(prizeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid prize ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // DELETE PRIZE
    // ========================================================

    const result = await pool.query(
      `
        DELETE FROM competition_prizes
        WHERE id = $1
          AND competition_id = $2
        RETURNING *;
      `,
      [prizeId, competitionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition prize not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Competition prize deleted successfully",
      prize: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Delete competition prize error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete competition prize",
    });
  }
};
// ============================================================
// GET OWNER COMPETITION REGISTRATIONS
// GET /api/owner/competitions/:competitionId/registrations
// ============================================================

const getOwnerCompetitionRegistrations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // GET REGISTRATIONS
    // ========================================================

    const result = await pool.query(
      `
        SELECT
          cr.id,
          cr.competition_id,
          cr.team_id,
          cr.player_id,
          cr.status,
          cr.registered_at,
          cr.reviewed_at,
          cr.reviewed_by,
          cr.waitlist_position,
          cr.cancelled_at,

          t.name AS team_name,

          u.full_name AS player_name,
          u.email AS player_email,
          u.profile_image AS player_profile_image

        FROM competition_registrations cr

        LEFT JOIN teams t
          ON t.id = cr.team_id

        LEFT JOIN users u
          ON u.id = cr.player_id

        WHERE cr.competition_id = $1

        ORDER BY cr.registered_at DESC, cr.id DESC;
      `,
      [competitionId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      registrations: result.rows,
    });
  } catch (error) {
    console.error(
      "Get owner competition registrations error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition registrations",
    });
  }
};
// ============================================================
// APPROVE COMPETITION REGISTRATION
// PATCH /api/owner/competitions/:competitionId/registrations/:registrationId/approve
// ============================================================

const approveCompetitionRegistration = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;
    const registrationId = req.params.registrationId;

    // ========================================================
    // VALIDATE IDS
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(registrationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID",
      });
    }

    await client.query("BEGIN");

    // ========================================================
    // LOCK COMPETITION + CHECK OWNERSHIP
    // ========================================================

    const competitionResult = await client.query(
      `
        SELECT
          id,
          entry_fee,
          max_participants,
          payment_window_minutes,
          status
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        FOR UPDATE;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    const competition = competitionResult.rows[0];

    // ========================================================
    // CHECK REGISTRATION
    // ========================================================

    const registrationResult = await client.query(
      `
        SELECT
          id,
          competition_id,
          team_id,
          player_id,
          status
        FROM competition_registrations
        WHERE id = $1
          AND competition_id = $2
        FOR UPDATE;
      `,
      [registrationId, competitionId]
    );

    if (registrationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition registration not found",
      });
    }

    const registration = registrationResult.rows[0];

    // ========================================================
    // ONLY PENDING REGISTRATIONS CAN BE APPROVED
    // ========================================================

    if (registration.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only pending registrations can be approved",
      });
    }

    // ========================================================
    // CHECK COMPETITION CAPACITY
    // ========================================================

    if (competition.max_participants !== null) {
      const capacityResult = await client.query(
        `
          SELECT COUNT(*)::integer AS count
          FROM competition_registrations
          WHERE competition_id = $1
            AND status IN (
              'approved',
              'payment_pending',
              'paid'
            );
        `,
        [competitionId]
      );

      const currentActiveRegistrations =
        capacityResult.rows[0].count;

      if (
        currentActiveRegistrations >=
        Number(competition.max_participants)
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Competition has reached its maximum capacity",
        });
      }
    }

    // ========================================================
    // FREE COMPETITION
    // pending -> approved
    // ========================================================

    if (Number(competition.entry_fee) === 0) {
      const result = await client.query(
        `
          UPDATE competition_registrations
          SET
            status = 'approved',
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by = $1,
            waitlist_position = NULL,
            payment_deadline = NULL,
            slot_locked_at = NULL
          WHERE id = $2
            AND competition_id = $3
          RETURNING *;
        `,
        [userId, registrationId, competitionId]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Competition registration approved successfully",
        registration: result.rows[0],
      });
    }

    // ========================================================
    // PAID COMPETITION
    // pending -> payment_pending
    // ========================================================

    const paymentWindowMinutes =
      Number(competition.payment_window_minutes) > 0
        ? Number(competition.payment_window_minutes)
        : 1440; // 24 hours fallback

    const result = await client.query(
      `
        UPDATE competition_registrations
        SET
          status = 'payment_pending',
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = $1,
          waitlist_position = NULL,
          payment_deadline =
            CURRENT_TIMESTAMP +
            ($2 * INTERVAL '1 minute'),
          slot_locked_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND competition_id = $4
        RETURNING *;
      `,
      [
        userId,
        paymentWindowMinutes,
        registrationId,
        competitionId,
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message:
        "Competition registration approved and payment is now required",
      registration: result.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "Approve competition registration error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to approve competition registration",
    });
  } finally {
    client.release();
  }
};
// ============================================================
// REJECT COMPETITION REGISTRATION
// PATCH /api/owner/competitions/:competitionId/registrations/:registrationId/reject
// ============================================================

const rejectCompetitionRegistration = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;
    const registrationId = req.params.registrationId;

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(registrationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // REJECT REGISTRATION
    // ========================================================

    const result = await pool.query(
      `
        UPDATE competition_registrations
        SET
          status = 'rejected',
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = $1,
          waitlist_position = NULL
        WHERE id = $2
          AND competition_id = $3
        RETURNING *;
      `,
      [userId, registrationId, competitionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition registration not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Competition registration rejected successfully",
      registration: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Reject competition registration error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reject competition registration",
    });
  }
};
// ============================================================
// MOVE COMPETITION REGISTRATION TO WAITING LIST
// PATCH /api/owner/competitions/:competitionId/registrations/:registrationId/waitlist
// ============================================================

const moveCompetitionRegistrationToWaitlist = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;
    const registrationId = req.params.registrationId;

    // ========================================================
    // VALIDATE IDs
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(registrationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // CHECK REGISTRATION
    // ========================================================

    const registrationResult = await pool.query(
      `
        SELECT
          id,
          status
        FROM competition_registrations
        WHERE id = $1
          AND competition_id = $2
        LIMIT 1;
      `,
      [registrationId, competitionId]
    );

    if (registrationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition registration not found",
      });
    }

    const registration = registrationResult.rows[0];

    // ========================================================
    // ONLY PENDING REGISTRATIONS CAN ENTER WAITING LIST
    // ========================================================

    if (registration.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending registrations can be moved to the waiting list",
      });
    }

    // ========================================================
    // GET NEXT WAITLIST POSITION
    // ========================================================

    const positionResult = await pool.query(
      `
        SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS next_position
        FROM competition_registrations
        WHERE competition_id = $1
          AND status = 'waitlisted';
      `,
      [competitionId]
    );

    const nextPosition = Number(
      positionResult.rows[0].next_position
    );

    // ========================================================
    // MOVE TO WAITING LIST
    // ========================================================

    const result = await pool.query(
      `
        UPDATE competition_registrations
        SET
          status = 'waitlisted',
          waitlist_position = $1,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = $2
        WHERE id = $3
          AND competition_id = $4
        RETURNING *;
      `,
      [
        nextPosition,
        userId,
        registrationId,
        competitionId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Competition registration moved to waiting list successfully",
      registration: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Move competition registration to waitlist error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to move competition registration to waiting list",
    });
  }
};
// ============================================================
// SEND PRIVATE COMPETITION INVITATION
// POST /api/owner/competitions/:competitionId/invitations
// ============================================================

const sendCompetitionInvitation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;

    const {
      player_id,
      team_id,
      expires_at,
    } = req.body;

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT
          id,
          visibility,
          competition_type
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    const competition = competitionResult.rows[0];

    // ========================================================
    // PRIVATE COMPETITION ONLY
    // ========================================================

    if (competition.visibility !== "private") {
      return res.status(400).json({
        success: false,
        message: "Invitations can only be sent for private competitions",
      });
    }

    // ========================================================
    // EXACTLY ONE RECIPIENT
    // ========================================================

    const hasPlayer = player_id !== undefined && player_id !== null;
    const hasTeam = team_id !== undefined && team_id !== null;

    if (
      (hasPlayer && hasTeam) ||
      (!hasPlayer && !hasTeam)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide either player_id or team_id",
      });
    }

    // ========================================================
    // COMPETITION TYPE VALIDATION
    // ========================================================

    if (
      competition.competition_type === "individual" &&
      !hasPlayer
    ) {
      return res.status(400).json({
        success: false,
        message: "Individual competitions can only invite players",
      });
    }

    if (
      competition.competition_type === "team" &&
      !hasTeam
    ) {
      return res.status(400).json({
        success: false,
        message: "Team competitions can only invite teams",
      });
    }

    // ========================================================
    // VALIDATE PLAYER
    // ========================================================

    if (hasPlayer && !/^\d+$/.test(String(player_id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
    }

    if (hasPlayer) {
      const playerResult = await pool.query(
        `
          SELECT id
          FROM users
          WHERE id = $1
            AND role = 'player'
          LIMIT 1;
        `,
        [player_id]
      );

      if (playerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Player not found",
        });
      }
    }

    // ========================================================
    // VALIDATE TEAM
    // ========================================================

    if (hasTeam && !/^\d+$/.test(String(team_id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid team ID",
      });
    }

    if (hasTeam) {
      const teamResult = await pool.query(
        `
          SELECT id
          FROM teams
          WHERE id = $1
          LIMIT 1;
        `,
        [team_id]
      );

      if (teamResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Team not found",
        });
      }
    }

    // ========================================================
    // VALIDATE EXPIRATION
    // ========================================================

    let normalizedExpiresAt = null;

    if (expires_at !== undefined && expires_at !== null && expires_at !== "") {
      const expiresDate = new Date(expires_at);

      if (Number.isNaN(expiresDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid expires_at",
        });
      }

      if (expiresDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "expires_at must be in the future",
        });
      }

      normalizedExpiresAt = expiresDate;
    }

    // ========================================================
    // PREVENT DUPLICATE PENDING INVITATION
    // ========================================================

    const duplicateResult = await pool.query(
      `
        SELECT id
        FROM competition_invitations
        WHERE competition_id = $1
          AND status = 'pending'
          AND (
            ($2::bigint IS NOT NULL AND player_id = $2)
            OR
            ($3::bigint IS NOT NULL AND team_id = $3)
          )
        LIMIT 1;
      `,
      [
        competitionId,
        hasPlayer ? player_id : null,
        hasTeam ? team_id : null,
      ]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A pending invitation already exists for this recipient",
      });
    }

    // ========================================================
    // CREATE INVITATION
    // ========================================================

    const result = await pool.query(
      `
        INSERT INTO competition_invitations (
          competition_id,
          player_id,
          team_id,
          status,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'pending',
          $4
        )
        RETURNING *;
      `,
      [
        competitionId,
        hasPlayer ? player_id : null,
        hasTeam ? team_id : null,
        normalizedExpiresAt,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Competition invitation sent successfully",
      invitation: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Send competition invitation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to send competition invitation",
    });
  }
};
// ============================================================
// GET OWNER COMPETITION INVITATIONS
// GET /api/owner/competitions/:competitionId/invitations
// ============================================================

const getOwnerCompetitionInvitations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.competitionId;

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // CHECK COMPETITION OWNERSHIP
    // ========================================================

    const competitionResult = await pool.query(
      `
        SELECT id
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, userId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // ========================================================
    // GET INVITATIONS
    // ========================================================

    const result = await pool.query(
      `
        SELECT
          ci.id,
          ci.competition_id,
          ci.player_id,
          ci.team_id,
          ci.status,
          ci.expires_at,
          ci.responded_at,
          ci.created_at,

          u.full_name AS player_name,
          u.email AS player_email,
          u.profile_image AS player_profile_image,

          t.name AS team_name,
          t.captain_id AS team_captain_id

        FROM competition_invitations ci

        LEFT JOIN users u
          ON u.id = ci.player_id

        LEFT JOIN teams t
          ON t.id = ci.team_id

        WHERE ci.competition_id = $1

        ORDER BY ci.created_at DESC, ci.id DESC;
      `,
      [competitionId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      invitations: result.rows,
    });
  } catch (error) {
    console.error(
      "Get owner competition invitations error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition invitations",
    });
  }
};
// ============================================================
// UPDATE COMPETITION STATUS
// PATCH /api/owner/competitions/:id/status
// ============================================================

const updateCompetitionStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const competitionId = req.params.id;
    const { status } = req.body;

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(competitionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // VALIDATE STATUS
    // ========================================================

    const allowedStatuses = [
      "upcoming",
      "open",
      "ongoing",
      "completed",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition status",
        allowed_statuses: allowedStatuses,
      });
    }

    // ========================================================
    // UPDATE STATUS
    // ========================================================

    const result = await pool.query(
      `
        UPDATE competitions
        SET status = $1
        WHERE id = $2
          AND created_by = $3
        RETURNING *;
      `,
      [
        status,
        competitionId,
        userId,
      ]
    );

    // ========================================================
    // CHECK COMPETITION
    // ========================================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Competition status updated successfully",
      competition: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Update competition status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update competition status",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  createCompetition,
  updateCompetitionStatus,
  getOwnerCompetitions,
  getOwnerCompetitionById,
  updateCompetition,
  deleteCompetition,
  createCompetitionPrize,
  getOwnerCompetitionPrizes,
  getOwnerCompetitionPrizeById,
  updateCompetitionPrize,
  deleteCompetitionPrize,
  getOwnerCompetitionRegistrations,
  approveCompetitionRegistration,
  rejectCompetitionRegistration,
  moveCompetitionRegistrationToWaitlist,
  sendCompetitionInvitation,
  getOwnerCompetitionInvitations,
};