const pool = require("../config/db");

// ============================================================
// CREATE TEAM
// POST /api/player/teams
// ============================================================

const createTeam = async (req, res) => {
  try {
    // ========================================================
    // AUTHENTICATED USER
    // ========================================================

    const captainId = req.user.userId;

    // ========================================================
    // REQUEST BODY
    // ========================================================

    const {
      name,
      description,
      logo,
      game_type,
      skill_level,
      city,
      location_name,
      latitude,
      longitude,
      max_players,
    } = req.body;

    // ========================================================
    // VALIDATION
    // ========================================================

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Team name is required",
      });
    }

    if (!game_type) {
      return res.status(400).json({
        success: false,
        message: "Game type is required",
      });
    }

    if (!["5v5", "6v6", "7v7"].includes(game_type)) {
      return res.status(400).json({
        success: false,
        message: "Game type must be 5v5, 6v6, or 7v7",
      });
    }

    if (!skill_level) {
      return res.status(400).json({
        success: false,
        message: "Skill level is required",
      });
    }

    if (
      !["Beginner", "Intermediate", "Advanced"].includes(
        skill_level
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Skill level must be Beginner, Intermediate, or Advanced",
      });
    }

    if (
      max_players === undefined ||
      max_players === null ||
      !Number.isInteger(Number(max_players)) ||
      Number(max_players) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Max players must be a positive integer",
      });
    }

    // ========================================================
    // LOCATION VALIDATION
    // ========================================================

    if (
      latitude !== undefined &&
      latitude !== null &&
      (Number.isNaN(Number(latitude)) ||
        Number(latitude) < -90 ||
        Number(latitude) > 90)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude",
      });
    }

    if (
      longitude !== undefined &&
      longitude !== null &&
      (Number.isNaN(Number(longitude)) ||
        Number(longitude) < -180 ||
        Number(longitude) > 180)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude",
      });
    }

    // ========================================================
    // CREATE TEAM
    // ========================================================

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const teamResult = await client.query(
        `
        INSERT INTO teams (
          name,
          captain_id,
          description,
          logo,
          game_type,
          skill_level,
          city,
          location_name,
          latitude,
          longitude,
          max_players
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11
        )
        RETURNING
          id,
          name,
          captain_id,
          description,
          logo,
          game_type,
          skill_level,
          city,
          location_name,
          latitude,
          longitude,
          max_players,
          created_at
        `,
        [
          name.trim(),
          captainId,
          description?.trim() || null,
          logo?.trim() || null,
          game_type,
          skill_level,
          city?.trim() || null,
          location_name?.trim() || null,
          latitude !== undefined && latitude !== null
            ? Number(latitude)
            : null,
          longitude !== undefined && longitude !== null
            ? Number(longitude)
            : null,
          Number(max_players),
        ]
      );

      const team = teamResult.rows[0];

      // ======================================================
      // ADD CAPTAIN AS TEAM MEMBER
      // ======================================================

      await client.query(
        `
        INSERT INTO team_members (
          team_id,
          player_id,
          role,
          joined_at
        )
        VALUES ($1, $2, $3, NOW())
        `,
        [team.id, captainId, "captain"]
      );

      await client.query("COMMIT");

      // ======================================================
      // SUCCESS
      // ======================================================

      return res.status(201).json({
        success: true,
        message: "Team created successfully",
        team,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("CREATE TEAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create team",
    });
  }
};

// ============================================================
// GET MY TEAMS
// GET /api/player/teams/my
// ============================================================

const getMyTeams = async (req, res) => {
  try {
    const playerId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.name,
        t.description,
        t.logo,
        t.game_type,
        t.skill_level,
        t.city,
        t.location_name,
        t.latitude,
        t.longitude,
        t.max_players,
        t.created_at,

        tm.role,

        -- Determine whether the current user is the captain
        (tm.role = 'captain') AS is_captain,

        COUNT(DISTINCT members.player_id)::INTEGER
          AS members_count,

        GREATEST(
          t.max_players - COUNT(DISTINCT members.player_id),
          0
        )::INTEGER AS available_slots

      FROM team_members tm

      JOIN teams t
        ON t.id = tm.team_id

      LEFT JOIN team_members members
        ON members.team_id = t.id

      WHERE tm.player_id = $1

      GROUP BY
        t.id,
        t.name,
        t.description,
        t.logo,
        t.game_type,
        t.skill_level,
        t.city,
        t.location_name,
        t.latitude,
        t.longitude,
        t.max_players,
        t.created_at,
        tm.role

      ORDER BY t.created_at DESC
      `,
      [playerId]
    );

    return res.status(200).json({
      success: true,
      teams: result.rows,
    });
  } catch (error) {
    console.error("GET MY TEAMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get your teams",
    });
  }
};

// ============================================================
// GET TEAM DETAILS
// GET /api/player/teams/:id
// ============================================================

const getTeamDetails = async (req, res) => {
  try {
    const teamId = req.params.id;
    const playerId = req.user.userId;

    // ========================================================
    // GET TEAM
    // ========================================================

    const teamResult = await pool.query(
      `
      SELECT
        t.id,
        t.name,
        t.captain_id,
        t.description,
        t.logo,
        t.game_type,
        t.skill_level,
        t.city,
        t.location_name,
        t.latitude,
        t.longitude,
        t.max_players,
        t.created_at,

        COUNT(DISTINCT tm.player_id)::INTEGER
          AS members_count,

        GREATEST(
          t.max_players - COUNT(DISTINCT tm.player_id),
          0
        )::INTEGER AS available_slots,

        EXISTS (
          SELECT 1
          FROM team_members current_member
          WHERE current_member.team_id = t.id
            AND current_member.player_id = $2
        ) AS is_member,

        (t.captain_id = $2) AS is_captain,

        EXISTS (
          SELECT 1
          FROM team_join_requests jr
          WHERE jr.team_id = t.id
            AND jr.player_id = $2
            AND jr.status = 'pending'
        ) AS has_pending_request

      FROM teams t

      LEFT JOIN team_members tm
        ON tm.team_id = t.id

      WHERE t.id = $1

      GROUP BY
        t.id,
        t.name,
        t.captain_id,
        t.description,
        t.logo,
        t.game_type,
        t.skill_level,
        t.city,
        t.location_name,
        t.latitude,
        t.longitude,
        t.max_players,
        t.created_at
      `,
      [teamId, playerId]
    );

    // ========================================================
    // TEAM NOT FOUND
    // ========================================================

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    // ========================================================
    // GET TEAM MEMBERS
    // ========================================================

    const membersResult = await pool.query(
      `
      SELECT
        u.id,
        u.full_name,
        u.profile_image,
        tm.role,
        tm.joined_at
      FROM team_members tm
      JOIN users u
        ON u.id = tm.player_id
      WHERE tm.team_id = $1
      ORDER BY
        CASE
          WHEN tm.role = 'captain' THEN 0
          ELSE 1
        END,
        tm.joined_at ASC
      `,
      [teamId]
    );

    team.members = membersResult.rows;

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      team,
    });
  } catch (error) {
    console.error("GET TEAM DETAILS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get team details",
    });
  }
};

// ============================================================
// REQUEST TO JOIN TEAM
// POST /api/player/teams/:id/join
// ============================================================

const requestToJoinTeam = async (req, res) => {
  try {
    const teamId = req.params.id;
    const playerId = req.user.userId;

    // ========================================================
    // GET TEAM
    // ========================================================

    const teamResult = await pool.query(
      `
      SELECT
        id,
        name,
        captain_id,
        max_players
      FROM teams
      WHERE id = $1
      LIMIT 1
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    // ========================================================
    // CAPTAIN CANNOT REQUEST HIS OWN TEAM
    // ========================================================

    if (Number(team.captain_id) === Number(playerId)) {
      return res.status(400).json({
        success: false,
        message: "You are already the captain of this team",
      });
    }

    // ========================================================
    // CHECK IF ALREADY A MEMBER
    // ========================================================

    const memberResult = await pool.query(
      `
      SELECT 1
      FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      LIMIT 1
      `,
      [teamId, playerId]
    );

    if (memberResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You are already a member of this team",
      });
    }

    // ========================================================
    // CHECK TEAM CAPACITY
    // ========================================================

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::INTEGER AS members_count
      FROM team_members
      WHERE team_id = $1
      `,
      [teamId]
    );

    const membersCount = countResult.rows[0].members_count;

    if (membersCount >= team.max_players) {
      return res.status(400).json({
        success: false,
        message: "This team is full",
      });
    }

    // ========================================================
    // CHECK EXISTING PENDING REQUEST
    // ========================================================

    const pendingResult = await pool.query(
      `
      SELECT
        id,
        status,
        created_at
      FROM team_join_requests
      WHERE team_id = $1
        AND player_id = $2
        AND status = 'pending'
      LIMIT 1
      `,
      [teamId, playerId]
    );

    if (pendingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending join request",
        request: pendingResult.rows[0],
      });
    }

    // ========================================================
    // CREATE REQUEST
    // ========================================================

    const requestResult = await pool.query(
      `
      INSERT INTO team_join_requests (
        team_id,
        player_id,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'pending', NOW(), NOW())
      RETURNING
        id,
        team_id,
        player_id,
        status,
        created_at,
        updated_at
      `,
      [teamId, playerId]
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(201).json({
      success: true,
      message: "Join request sent successfully",
      request: requestResult.rows[0],
    });
  } catch (error) {
    console.error("REQUEST TO JOIN TEAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send join request",
    });
  }
};

// ============================================================
// GET TEAM JOIN REQUESTS
// GET /api/player/teams/:id/join-requests
// CAPTAIN ONLY
// ============================================================

const getJoinRequests = async (req, res) => {
  try {
    const teamId = req.params.id;
    const captainId = req.user.userId;

    // ========================================================
    // CHECK TEAM + CAPTAIN
    // ========================================================

    const teamResult = await pool.query(
      `
      SELECT
        id,
        name,
        captain_id,
        max_players
      FROM teams
      WHERE id = $1
      LIMIT 1
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    if (Number(team.captain_id) !== Number(captainId)) {
      return res.status(403).json({
        success: false,
        message: "Only the team captain can view join requests",
      });
    }

    // ========================================================
    // GET REQUESTS
    // ========================================================

    const requestsResult = await pool.query(
      `
      SELECT
        r.id,
        r.team_id,
        r.player_id,
        r.status,
        r.created_at,
        r.updated_at,

        u.full_name,
        u.profile_image,

        pp.position,
        pp.skill_level,
        pp.city,
        pp.experience

      FROM team_join_requests r

      JOIN users u
        ON u.id = r.player_id

      LEFT JOIN player_profiles pp
        ON pp.user_id = r.player_id

      WHERE r.team_id = $1

      ORDER BY
        CASE
          WHEN r.status = 'pending' THEN 0
          WHEN r.status = 'approved' THEN 1
          ELSE 2
        END,
        r.created_at DESC
      `,
      [teamId]
    );

    return res.status(200).json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        max_players: team.max_players,
      },
      requests: requestsResult.rows,
    });
  } catch (error) {
    console.error("GET JOIN REQUESTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get join requests",
    });
  }
};

// ============================================================
// APPROVE TEAM JOIN REQUEST
// PATCH /api/player/teams/:id/join-requests/:requestId
// CAPTAIN ONLY
// ============================================================

const approveJoinRequest = async (req, res) => {
  const client = await pool.connect();

  try {
    const teamId = req.params.id;
    const requestId = req.params.requestId;
    const captainId = req.user.userId;

    await client.query("BEGIN");

    // ========================================================
    // CHECK TEAM + CAPTAIN
    // ========================================================

    const teamResult = await client.query(
      `
      SELECT
        id,
        name,
        captain_id,
        max_players
      FROM teams
      WHERE id = $1
      FOR UPDATE
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    if (Number(team.captain_id) !== Number(captainId)) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Only the team captain can approve join requests",
      });
    }

    // ========================================================
    // GET REQUEST
    // ========================================================

    const requestResult = await client.query(
      `
      SELECT
        id,
        team_id,
        player_id,
        status
      FROM team_join_requests
      WHERE id = $1
        AND team_id = $2
      FOR UPDATE
      `,
      [requestId, teamId]
    );

    if (requestResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Join request not found",
      });
    }

    const request = requestResult.rows[0];

    // ========================================================
    // REQUEST MUST BE PENDING
    // ========================================================

    if (request.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: `This join request has already been ${request.status}`,
      });
    }

    // ========================================================
    // CHECK IF PLAYER IS ALREADY A MEMBER
    // ========================================================

    const memberResult = await client.query(
      `
      SELECT 1
      FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      LIMIT 1
      `,
      [teamId, request.player_id]
    );

    if (memberResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Player is already a member of this team",
      });
    }

    // ========================================================
    // CHECK TEAM CAPACITY
    // ========================================================

    const countResult = await client.query(
      `
      SELECT COUNT(*)::INTEGER AS members_count
      FROM team_members
      WHERE team_id = $1
      `,
      [teamId]
    );

    const membersCount = countResult.rows[0].members_count;

    if (membersCount >= team.max_players) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "This team is full",
      });
    }

    // ========================================================
    // ADD PLAYER TO TEAM
    // ========================================================

    await client.query(
      `
      INSERT INTO team_members (
        team_id,
        player_id,
        role,
        joined_at
      )
      VALUES ($1, $2, 'player', NOW())
      `,
      [teamId, request.player_id]
    );

    // ========================================================
    // UPDATE REQUEST
    // ========================================================

    const updatedRequestResult = await client.query(
      `
      UPDATE team_join_requests
      SET
        status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        team_id,
        player_id,
        status,
        created_at,
        updated_at
      `,
      [requestId]
    );

    await client.query("COMMIT");

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Join request approved successfully",
      request: updatedRequestResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("APPROVE JOIN REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve join request",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// REJECT TEAM JOIN REQUEST
// PATCH /api/player/teams/:id/join-requests/:requestId/reject
// CAPTAIN ONLY
// ============================================================

const rejectJoinRequest = async (req, res) => {
  try {
    const teamId = req.params.id;
    const requestId = req.params.requestId;
    const captainId = req.user.userId;

    // ========================================================
    // CHECK TEAM + CAPTAIN
    // ========================================================

    const teamResult = await pool.query(
      `
      SELECT
        id,
        name,
        captain_id
      FROM teams
      WHERE id = $1
      LIMIT 1
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    if (Number(team.captain_id) !== Number(captainId)) {
      return res.status(403).json({
        success: false,
        message: "Only the team captain can reject join requests",
      });
    }

    // ========================================================
    // CHECK REQUEST
    // ========================================================

    const requestResult = await pool.query(
      `
      SELECT
        id,
        team_id,
        player_id,
        status
      FROM team_join_requests
      WHERE id = $1
        AND team_id = $2
      LIMIT 1
      `,
      [requestId, teamId]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Join request not found",
      });
    }

    const request = requestResult.rows[0];

    // ========================================================
    // REQUEST MUST BE PENDING
    // ========================================================

    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `This join request has already been ${request.status}`,
      });
    }

    // ========================================================
    // REJECT REQUEST
    // ========================================================

    const updatedRequestResult = await pool.query(
      `
      UPDATE team_join_requests
      SET
        status = 'rejected',
        updated_at = NOW()
      WHERE id = $1
        AND team_id = $2
      RETURNING
        id,
        team_id,
        player_id,
        status,
        created_at,
        updated_at
      `,
      [requestId, teamId]
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Join request rejected successfully",
      request: updatedRequestResult.rows[0],
    });
  } catch (error) {
    console.error("REJECT JOIN REQUEST ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject join request",
    });
  }
};

// ============================================================
// UPDATE TEAM
// PATCH /api/player/teams/:id
// CAPTAIN ONLY
// ============================================================

const updateTeam = async (req, res) => {
  try {
    const teamId = req.params.id;
    const captainId = req.user.userId;

    const {
      name,
      description,
      logo,
      game_type,
      skill_level,
      city,
      location_name,
      latitude,
      longitude,
      max_players,
    } = req.body;

    // Check team + captain
    const teamResult = await pool.query(
      `
      SELECT
        id,
        captain_id,
        max_players
      FROM teams
      WHERE id = $1
      LIMIT 1
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    if (Number(team.captain_id) !== Number(captainId)) {
      return res.status(403).json({
        success: false,
        message: "Only the team captain can update the team",
      });
    }

    // Validation
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({
        success: false,
        message: "Team name cannot be empty",
      });
    }

    if (
      game_type !== undefined &&
      !["5v5", "6v6", "7v7"].includes(game_type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Game type must be 5v5, 6v6, or 7v7",
      });
    }

    if (
      skill_level !== undefined &&
      !["Beginner", "Intermediate", "Advanced"].includes(skill_level)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Skill level must be Beginner, Intermediate, or Advanced",
      });
    }

    if (
      max_players !== undefined &&
      (!Number.isInteger(Number(max_players)) ||
        Number(max_players) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Max players must be a positive integer",
      });
    }

    if (
      latitude !== undefined &&
      latitude !== null &&
      (Number.isNaN(Number(latitude)) ||
        Number(latitude) < -90 ||
        Number(latitude) > 90)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude",
      });
    }

    if (
      longitude !== undefined &&
      longitude !== null &&
      (Number.isNaN(Number(longitude)) ||
        Number(longitude) < -180 ||
        Number(longitude) > 180)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude",
      });
    }

    // Prevent reducing capacity below current members
    if (max_players !== undefined) {
      const countResult = await pool.query(
        `
        SELECT COUNT(*)::INTEGER AS members_count
        FROM team_members
        WHERE team_id = $1
        `,
        [teamId]
      );

      const membersCount = countResult.rows[0].members_count;

      if (Number(max_players) < membersCount) {
        return res.status(400).json({
          success: false,
          message: `Max players cannot be less than current members count (${membersCount})`,
        });
      }
    }

    // Update only provided fields
    const updateResult = await pool.query(
      `
      UPDATE teams
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        logo = COALESCE($3, logo),
        game_type = COALESCE($4, game_type),
        skill_level = COALESCE($5, skill_level),
        city = COALESCE($6, city),
        location_name = COALESCE($7, location_name),
        latitude = COALESCE($8, latitude),
        longitude = COALESCE($9, longitude),
        max_players = COALESCE($10, max_players)
      WHERE id = $11
      RETURNING
        id,
        name,
        captain_id,
        description,
        logo,
        game_type,
        skill_level,
        city,
        location_name,
        latitude,
        longitude,
        max_players,
        created_at
      `,
      [
        name !== undefined ? name.trim() : null,
        description !== undefined ? description?.trim() : null,
        logo !== undefined ? logo?.trim() : null,
        game_type ?? null,
        skill_level ?? null,
        city !== undefined ? city?.trim() : null,
        location_name !== undefined ? location_name?.trim() : null,
        latitude !== undefined && latitude !== null
          ? Number(latitude)
          : null,
        longitude !== undefined && longitude !== null
          ? Number(longitude)
          : null,
        max_players !== undefined ? Number(max_players) : null,
        teamId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Team updated successfully",
      team: updateResult.rows[0],
    });
  } catch (error) {
    console.error("UPDATE TEAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update team",
    });
  }
};

// ============================================================
// REMOVE PLAYER FROM TEAM
// DELETE /api/player/teams/:id/members/:playerId
// CAPTAIN ONLY
// ============================================================

const removePlayerFromTeam = async (req, res) => {
  try {
    const teamId = req.params.id;
    const playerId = req.params.playerId;
    const captainId = req.user.userId;

    // ========================================================
    // CHECK TEAM + CAPTAIN
    // ========================================================

    const teamResult = await pool.query(
      `
      SELECT
        id,
        name,
        captain_id
      FROM teams
      WHERE id = $1
      LIMIT 1
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    if (Number(team.captain_id) !== Number(captainId)) {
      return res.status(403).json({
        success: false,
        message: "Only the team captain can remove players",
      });
    }

    // ========================================================
    // CANNOT REMOVE CAPTAIN
    // ========================================================

    if (Number(playerId) === Number(captainId)) {
      return res.status(400).json({
        success: false,
        message: "The team captain cannot be removed",
      });
    }

    // ========================================================
    // CHECK MEMBERSHIP
    // ========================================================

    const memberResult = await pool.query(
      `
      SELECT
        team_id,
        player_id,
        role
      FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      LIMIT 1
      `,
      [teamId, playerId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player is not a member of this team",
      });
    }

    // ========================================================
    // REMOVE PLAYER
    // ========================================================

    await pool.query(
      `
      DELETE FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      `,
      [teamId, playerId]
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Player removed from team successfully",
      team_id: teamId,
      player_id: playerId,
    });
  } catch (error) {
    console.error("REMOVE PLAYER FROM TEAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove player from team",
    });
  }
};

// ============================================================
// LEAVE TEAM
// DELETE /api/player/teams/:id/leave
// ============================================================

const leaveTeam = async (req, res) => {
  try {
    const teamId = req.params.id;
    const playerId = req.user.userId;

    // ========================================================
    // CHECK TEAM
    // ========================================================

    const teamResult = await pool.query(
      `
      SELECT
        id,
        name,
        captain_id
      FROM teams
      WHERE id = $1
      LIMIT 1
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    // ========================================================
    // CAPTAIN CANNOT LEAVE
    // ========================================================

    if (Number(team.captain_id) === Number(playerId)) {
      return res.status(400).json({
        success: false,
        message:
          "The team captain cannot leave the team. Transfer captaincy or delete the team instead.",
      });
    }

    // ========================================================
    // CHECK MEMBERSHIP
    // ========================================================

    const memberResult = await pool.query(
      `
      SELECT
        team_id,
        player_id,
        role
      FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      LIMIT 1
      `,
      [teamId, playerId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "You are not a member of this team",
      });
    }

    // ========================================================
    // LEAVE TEAM
    // ========================================================

    await pool.query(
      `
      DELETE FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      `,
      [teamId, playerId]
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "You have left the team successfully",
      team_id: teamId,
    });
  } catch (error) {
    console.error("LEAVE TEAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to leave team",
    });
  }
};

// ============================================================
// TRANSFER TEAM CAPTAINCY
// PATCH /api/player/teams/:id/captain
// CAPTAIN ONLY
// ============================================================

const transferCaptaincy = async (req, res) => {
  const client = await pool.connect();

  try {
    const teamId = req.params.id;
    const captainId = req.user.userId;
    const { new_captain_id } = req.body;

    if (!new_captain_id) {
      return res.status(400).json({
        success: false,
        message: "new_captain_id is required",
      });
    }

    await client.query("BEGIN");

    // ========================================================
    // CHECK TEAM + CAPTAIN
    // ========================================================

    const teamResult = await client.query(
      `
      SELECT
        id,
        name,
        captain_id
      FROM teams
      WHERE id = $1
      FOR UPDATE
      `,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const team = teamResult.rows[0];

    if (Number(team.captain_id) !== Number(captainId)) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Only the team captain can transfer captaincy",
      });
    }

    // ========================================================
    // CANNOT TRANSFER TO SELF
    // ========================================================

    if (Number(new_captain_id) === Number(captainId)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "You are already the captain of this team",
      });
    }

    // ========================================================
    // NEW CAPTAIN MUST BE A MEMBER
    // ========================================================

    const memberResult = await client.query(
      `
      SELECT
        team_id,
        player_id,
        role
      FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      FOR UPDATE
      `,
      [teamId, new_captain_id]
    );

    if (memberResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "The new captain must be a current member of the team",
      });
    }

    // ========================================================
    // UPDATE TEAM CAPTAIN
    // ========================================================

    const updatedTeamResult = await client.query(
      `
      UPDATE teams
      SET captain_id = $1
      WHERE id = $2
      RETURNING
        id,
        name,
        captain_id,
        description,
        logo,
        game_type,
        skill_level,
        city,
        location_name,
        latitude,
        longitude,
        max_players,
        created_at
      `,
      [new_captain_id, teamId]
    );

    // ========================================================
    // UPDATE MEMBER ROLES
    // ========================================================

    await client.query(
      `
      UPDATE team_members
      SET role = 'player'
      WHERE team_id = $1
        AND player_id = $2
      `,
      [teamId, captainId]
    );

    await client.query(
      `
      UPDATE team_members
      SET role = 'captain'
      WHERE team_id = $1
        AND player_id = $2
      `,
      [teamId, new_captain_id]
    );

    await client.query("COMMIT");

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Captaincy transferred successfully",
      team: updatedTeamResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("TRANSFER CAPTAINCY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to transfer captaincy",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// GET NEARBY TEAMS
// GET /api/player/teams/nearby
// ============================================================

const getNearbyTeams = async (req, res) => {
  try {
    const playerId = req.user.userId;

    // ========================================================
    // QUERY PARAMETERS
    // ========================================================

    const {
      latitude,
      longitude,
      radius = 20,
      game_type,
      skill_level,
      city,
      only_available,
      search,
    } = req.query;

    // ========================================================
    // VALIDATION
    // ========================================================

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const lat = Number(latitude);
    const lon = Number(longitude);
    const radiusKm = Number(radius);

    if (
      Number.isNaN(lat) ||
      lat < -90 ||
      lat > 90
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude",
      });
    }

    if (
      Number.isNaN(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid longitude",
      });
    }

    if (
      Number.isNaN(radiusKm) ||
      radiusKm <= 0 ||
      radiusKm > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Radius must be greater than 0 and cannot exceed 100 km",
      });
    }

    // ========================================================
    // FILTER VALIDATION
    // ========================================================

    if (
      game_type !== undefined &&
      !["5v5", "6v6", "7v7"].includes(game_type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Game type must be 5v5, 6v6, or 7v7",
      });
    }

    if (
      skill_level !== undefined &&
      !["Beginner", "Intermediate", "Advanced"].includes(skill_level)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Skill level must be Beginner, Intermediate, or Advanced",
      });
    }

    if (
      only_available !== undefined &&
      !["true", "false"].includes(only_available)
    ) {
      return res.status(400).json({
        success: false,
        message: "only_available must be true or false",
      });
    }

    const normalizedSearch =
      search !== undefined ? search.trim() : null;

    // ========================================================
    // GET NEARBY TEAMS
    // ========================================================

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.name,
        t.captain_id,
        t.description,
        t.logo,
        t.game_type,
        t.skill_level,
        t.city,
        t.location_name,
        t.latitude,
        t.longitude,
        t.max_players,
        t.created_at,

        COUNT(DISTINCT tm.player_id)::INTEGER AS members_count,

        GREATEST(
          t.max_players - COUNT(DISTINCT tm.player_id),
          0
        )::INTEGER AS available_slots,

        ROUND(
          (
            6371 * 2 * ASIN(
              SQRT(
                POWER(
                  SIN(
                    RADIANS(t.latitude - $1) / 2
                  ),
                  2
                )
                +
                COS(RADIANS($1))
                *
                COS(RADIANS(t.latitude))
                *
                POWER(
                  SIN(
                    RADIANS(t.longitude - $2) / 2
                  ),
                  2
                )
              )
            )
          )::numeric,
          2
        ) AS distance_km,

        EXISTS (
          SELECT 1
          FROM team_members current_member
          WHERE current_member.team_id = t.id
            AND current_member.player_id = $3
        ) AS is_member,

        EXISTS (
          SELECT 1
          FROM team_join_requests jr
          WHERE jr.team_id = t.id
            AND jr.player_id = $3
            AND jr.status = 'pending'
        ) AS has_pending_request

      FROM teams t

      LEFT JOIN team_members tm
        ON tm.team_id = t.id

      WHERE
        t.latitude IS NOT NULL
        AND t.longitude IS NOT NULL

        AND (
          $5::text IS NULL
          OR t.game_type = $5
        )

        AND (
          $6::text IS NULL
          OR t.skill_level = $6
        )

        AND (
          $7::text IS NULL
          OR LOWER(t.city) = LOWER($7)
        )

        AND (
          $9::text IS NULL
          OR (
            LOWER(t.name) LIKE '%' || LOWER($9) || '%'
            OR LOWER(COALESCE(t.location_name, '')) LIKE '%' || LOWER($9) || '%'
            OR LOWER(COALESCE(t.city, '')) LIKE '%' || LOWER($9) || '%'
            OR LOWER(COALESCE(t.description, '')) LIKE '%' || LOWER($9) || '%'
          )
        )

      GROUP BY
        t.id,
        t.name,
        t.captain_id,
        t.description,
        t.logo,
        t.game_type,
        t.skill_level,
        t.city,
        t.location_name,
        t.latitude,
        t.longitude,
        t.max_players,
        t.created_at

      HAVING
        (
          6371 * 2 * ASIN(
            SQRT(
              POWER(
                SIN(
                  RADIANS(t.latitude - $1) / 2
                ),
                2
              )
              +
              COS(RADIANS($1))
              *
              COS(RADIANS(t.latitude))
              *
              POWER(
                SIN(
                  RADIANS(t.longitude - $2) / 2
                ),
                2
              )
            )
          )
        ) <= $4

        AND (
          $8::boolean IS NOT TRUE
          OR COUNT(DISTINCT tm.player_id) < t.max_players
        )

      ORDER BY distance_km ASC, t.created_at DESC
      `,
      [
        lat,
        lon,
        playerId,
        radiusKm,
        game_type ?? null,
        skill_level ?? null,
        city?.trim() || null,
        only_available === "true",
        normalizedSearch || null,
      ]
    );

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      location: {
        latitude: lat,
        longitude: lon,
      },
      radius_km: radiusKm,
      teams_count: result.rows.length,
      teams: result.rows,
    });
  } catch (error) {
    console.error("GET NEARBY TEAMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get nearby teams",
    });
  }
};

module.exports = {
  createTeam,
  getMyTeams,
  getTeamDetails,
  requestToJoinTeam,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  updateTeam,
  removePlayerFromTeam,
  leaveTeam,
  transferCaptaincy,
  getNearbyTeams,
};