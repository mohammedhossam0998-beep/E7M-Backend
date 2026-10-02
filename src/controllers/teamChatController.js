const pool = require("../config/db");

// ============================================================
// GET TEAM MESSAGES
// GET /api/player/teams/:teamId/messages
// TEAM MEMBERS ONLY
// ============================================================

const getTeamMessages = async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    const playerId = req.user.userId;

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid team ID",
      });
    }

    // ========================================================
    // CHECK MEMBERSHIP
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

    if (memberResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You must be a team member to access this chat",
      });
    }

    // ========================================================
    // GET MESSAGES
    // ========================================================

    const result = await pool.query(
      `
      SELECT
        tm.id,
        tm.team_id,
        tm.sender_id,
        tm.message,
        tm.created_at,

        u.full_name,
        u.profile_image

      FROM team_messages tm

      JOIN users u
        ON u.id = tm.sender_id

      WHERE tm.team_id = $1

      ORDER BY tm.created_at ASC, tm.id ASC

      LIMIT 100
      `,
      [teamId]
    );

    return res.status(200).json({
      success: true,
      team_id: teamId,
      messages: result.rows,
    });
  } catch (error) {
    console.error("GET TEAM MESSAGES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get team messages",
    });
  }
};

// ============================================================
// SEND TEAM MESSAGE
// POST /api/player/teams/:teamId/messages
// TEAM MEMBERS ONLY
// ============================================================

const sendTeamMessage = async (req, res) => {
  try {
    const teamId = Number(req.params.teamId);
    const senderId = req.user.userId;

    const { message } = req.body;

    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid team ID",
      });
    }

    // ========================================================
    // VALIDATE MESSAGE
    // ========================================================

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    const cleanMessage = message.trim();

    if (cleanMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message cannot exceed 2000 characters",
      });
    }

    // ========================================================
    // CHECK MEMBERSHIP
    // ========================================================

    const memberResult = await pool.query(
      `
      SELECT 1
      FROM team_members
      WHERE team_id = $1
        AND player_id = $2
      LIMIT 1
      `,
      [teamId, senderId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You must be a team member to send messages",
      });
    }

    // ========================================================
    // INSERT MESSAGE
    // ========================================================

    const result = await pool.query(
      `
      INSERT INTO team_messages (
        team_id,
        sender_id,
        message
      )
      VALUES ($1, $2, $3)

      RETURNING
        id,
        team_id,
        sender_id,
        message,
        created_at
      `,
      [
        teamId,
        senderId,
        cleanMessage,
      ]
    );

    // ========================================================
    // GET SENDER INFO
    // ========================================================

    const senderResult = await pool.query(
      `
      SELECT
        id,
        full_name,
        profile_image
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [senderId]
    );

    const savedMessage = {
      ...result.rows[0],
      full_name:
        senderResult.rows[0]?.full_name ?? null,
      profile_image:
        senderResult.rows[0]?.profile_image ?? null,
    };

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: savedMessage,
    });
  } catch (error) {
    console.error("SEND TEAM MESSAGE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send team message",
    });
  }
};

module.exports = {
  getTeamMessages,
  sendTeamMessage,
};