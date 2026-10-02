const pool = require("../config/db");

// ============================================================
// GET COMPETITION MATCHES
// GET /api/owner/competitions/:competitionId/matches
// ============================================================

const getCompetitionMatches = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { competitionId } = req.params;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // --------------------------------------------------------
    // Check competition ownership
    // --------------------------------------------------------

    const competitionResult = await pool.query(
      `
        SELECT
          id,
          name,
          competition_type,
          format,
          tournament_locked
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        LIMIT 1;
      `,
      [competitionId, ownerId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    // --------------------------------------------------------
    // Get matches
    // --------------------------------------------------------

    const result = await pool.query(
      `
        SELECT
          m.id,
          m.competition_id,
          m.match_date,
          m.start_time,
          m.home_score,
          m.away_score,
          m.status,
          m.home_participant_id,
          m.away_participant_id,
          m.round,
          m.match_number,
          m.home_source_match_id,
          m.away_source_match_id,

          hp.player_id AS home_player_id,
          hp.team_id AS home_team_id,

          ap.player_id AS away_player_id,
          ap.team_id AS away_team_id

        FROM matches m

        LEFT JOIN competition_registrations hp
          ON hp.id = m.home_participant_id

        LEFT JOIN competition_registrations ap
          ON ap.id = m.away_participant_id

        WHERE m.competition_id = $1

        ORDER BY
          CASE
            WHEN m.round = 'round_of_2' THEN 1
            WHEN m.round = 'round_of_4' THEN 2
            WHEN m.round = 'quarter_final' THEN 3
            WHEN m.round = 'semi_final' THEN 4
            WHEN m.round = 'final' THEN 5
            ELSE 99
          END,
          m.match_number ASC NULLS LAST,
          m.id ASC;
      `,
      [competitionId]
    );

    return res.status(200).json({
      success: true,
      competition: competitionResult.rows[0],
      count: result.rows.length,
      matches: result.rows,
    });
  } catch (error) {
    console.error("Get competition matches error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get competition matches",
    });
  }
};

// ============================================================
// GET COMPETITION MATCH BY ID
// GET /api/owner/competitions/:competitionId/matches/:matchId
// ============================================================

const getCompetitionMatchById = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { competitionId, matchId } = req.params;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(String(matchId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID",
      });
    }

    const result = await pool.query(
      `
        SELECT
          m.id,
          m.competition_id,
          m.match_date,
          m.start_time,
          m.home_score,
          m.away_score,
          m.status,
          m.home_participant_id,
          m.away_participant_id,
          m.round,
          m.match_number,
          m.home_source_match_id,
          m.away_source_match_id,

          hp.player_id AS home_player_id,
          hp.team_id AS home_team_id,

          ap.player_id AS away_player_id,
          ap.team_id AS away_team_id

        FROM matches m

        INNER JOIN competitions c
          ON c.id = m.competition_id

        LEFT JOIN competition_registrations hp
          ON hp.id = m.home_participant_id

        LEFT JOIN competition_registrations ap
          ON ap.id = m.away_participant_id

        WHERE m.id = $1
          AND m.competition_id = $2
          AND c.created_by = $3
        LIMIT 1;
      `,
      [matchId, competitionId, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition match not found",
      });
    }

    return res.status(200).json({
      success: true,
      match: result.rows[0],
    });
  } catch (error) {
    console.error("Get competition match by ID error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get competition match",
    });
  }
};

// ============================================================
// UPDATE MATCH SCHEDULE
// PUT /api/owner/competitions/:competitionId/matches/:matchId
// ============================================================

const updateCompetitionMatch = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { competitionId, matchId } = req.params;

    const {
      match_date,
      start_time,
    } = req.body;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(String(matchId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID",
      });
    }

    // --------------------------------------------------------
    // Get competition + match
    // --------------------------------------------------------

    const result = await pool.query(
      `
        SELECT
          m.id,
          m.competition_id,
          m.match_date,
          m.start_time,
          m.status,
          c.created_by,
          c.tournament_locked
        FROM matches m

        INNER JOIN competitions c
          ON c.id = m.competition_id

        WHERE m.id = $1
          AND m.competition_id = $2
          AND c.created_by = $3
        LIMIT 1;
      `,
      [matchId, competitionId, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition match not found",
      });
    }

    const match = result.rows[0];

    if (match.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed matches cannot be rescheduled",
      });
    }

    if (match.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled matches cannot be rescheduled",
      });
    }

    // --------------------------------------------------------
    // Keep existing values when field is not provided
    // --------------------------------------------------------

    const finalMatchDate =
      match_date !== undefined
        ? match_date
        : match.match_date;

    const finalStartTime =
      start_time !== undefined
        ? start_time
        : match.start_time;

    // --------------------------------------------------------
    // Date validation
    // --------------------------------------------------------

    if (finalMatchDate !== null && finalMatchDate !== undefined) {
      const parsedDate = new Date(finalMatchDate);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid match date",
        });
      }
    }

    // --------------------------------------------------------
    // Time validation
    // --------------------------------------------------------

    if (
      finalStartTime !== null &&
      finalStartTime !== undefined &&
      finalStartTime !== ""
    ) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

      if (!timeRegex.test(String(finalStartTime))) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid start_time. Expected HH:MM or HH:MM:SS",
        });
      }
    }

    // --------------------------------------------------------
    // Update schedule
    // --------------------------------------------------------

    const updateResult = await pool.query(
      `
        UPDATE matches
        SET
          match_date = $1,
          start_time = $2
        WHERE id = $3
          AND competition_id = $4
        RETURNING
          id,
          competition_id,
          match_date,
          start_time,
          home_score,
          away_score,
          status,
          home_participant_id,
          away_participant_id,
          round,
          match_number,
          home_source_match_id,
          away_source_match_id;
      `,
      [
        finalMatchDate || null,
        finalStartTime || null,
        matchId,
        competitionId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Competition match schedule updated successfully",
      match: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Update competition match error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update competition match",
    });
  }
};

// ============================================================
// CANCEL COMPETITION MATCH
// PATCH /api/owner/competitions/:competitionId/matches/:matchId/cancel
// ============================================================

const cancelCompetitionMatch = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { competitionId, matchId } = req.params;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!/^\d+$/.test(String(matchId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID",
      });
    }

    const result = await pool.query(
      `
        SELECT
          m.id,
          m.status,
          c.created_by
        FROM matches m

        INNER JOIN competitions c
          ON c.id = m.competition_id

        WHERE m.id = $1
          AND m.competition_id = $2
          AND c.created_by = $3
        LIMIT 1;
      `,
      [matchId, competitionId, ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition match not found",
      });
    }

    if (result.rows[0].status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed matches cannot be cancelled",
      });
    }

    if (result.rows[0].status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Match is already cancelled",
      });
    }

    const updateResult = await pool.query(
      `
        UPDATE matches
        SET status = 'cancelled'
        WHERE id = $1
          AND competition_id = $2
        RETURNING
          id,
          competition_id,
          match_date,
          start_time,
          home_score,
          away_score,
          status,
          home_participant_id,
          away_participant_id,
          round,
          match_number,
          home_source_match_id,
          away_source_match_id;
      `,
      [matchId, competitionId]
    );

    return res.status(200).json({
      success: true,
      message: "Competition match cancelled successfully",
      match: updateResult.rows[0],
    });
  } catch (error) {
    console.error("Cancel competition match error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel competition match",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getCompetitionMatches,
  getCompetitionMatchById,
  updateCompetitionMatch,
  cancelCompetitionMatch,
};