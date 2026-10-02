const pool = require("../config/db");

// ============================================================
// GET PLAYER COMPETITION MATCHES
// GET /api/player/competitions/:competitionId/matches
// ============================================================

const getPlayerCompetitionMatches = async (req, res) => {
  try {
    const playerId = req.user.userId;
    const { competitionId } = req.params;

    // ========================================================
    // 1. VALIDATE COMPETITION ID
    // ========================================================

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // 2. GET COMPETITION
    // ========================================================

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
        LIMIT 1;
      `,
      [competitionId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found",
      });
    }

    const competition = competitionResult.rows[0];

    // ========================================================
    // 3. GET PLAYER PARTICIPATION
    //
    // Supports:
    // - Individual registration
    // - Team registration where the player is a team member
    // ========================================================

    const participationResult = await pool.query(
      `
        SELECT DISTINCT
          cr.id AS registration_id,
          cr.player_id,
          cr.team_id,
          cr.status AS registration_status

        FROM competition_registrations cr

        LEFT JOIN team_members tm
          ON tm.team_id = cr.team_id
         AND tm.player_id = $2

        WHERE cr.competition_id = $1

          AND cr.status IN (
            'approved',
            'paid',
            'completed'
          )

          AND (
            cr.player_id = $2
            OR tm.player_id = $2
          )

        ORDER BY cr.id ASC;
      `,
      [competitionId, playerId]
    );

    if (participationResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not a participant in this competition",
      });
    }

    // ========================================================
    // 4. GET REGISTRATION IDS
    // ========================================================

    const registrationIds =
      participationResult.rows.map(
        (row) => row.registration_id
      );

    // ========================================================
    // 5. GET PLAYER MATCHES
    // ========================================================

    const matchesResult = await pool.query(
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

          AND (
            m.home_participant_id = ANY($2::bigint[])
            OR
            m.away_participant_id = ANY($2::bigint[])
          )

        ORDER BY
          CASE
            WHEN m.round = 'round_of_2' THEN 1
            WHEN m.round = 'round_of_4' THEN 2
            WHEN m.round = 'quarter_final' THEN 3
            WHEN m.round = 'semi_final' THEN 4
            WHEN m.round = 'final' THEN 5
            ELSE 99
          END,

          m.match_date ASC NULLS LAST,
          m.start_time ASC NULLS LAST,
          m.match_number ASC NULLS LAST,
          m.id ASC;
      `,
      [competitionId, registrationIds]
    );

    // ========================================================
    // 6. FORMAT MATCHES
    // ========================================================

    const matches = matchesResult.rows.map((match) => ({
      id: match.id,

      competition_id:
        match.competition_id,

      match_date:
        match.match_date,

      start_time:
        match.start_time,

      home_score:
        match.home_score,

      away_score:
        match.away_score,

      status:
        match.status,

      home_participant_id:
        match.home_participant_id,

      away_participant_id:
        match.away_participant_id,

      home_participant: {
        type:
          match.home_team_id !== null
            ? "team"
            : "player",

        player_id:
          match.home_player_id,

        team_id:
          match.home_team_id,
      },

      away_participant: {
        type:
          match.away_team_id !== null
            ? "team"
            : "player",

        player_id:
          match.away_player_id,

        team_id:
          match.away_team_id,
      },

      round:
        match.round,

      match_number:
        match.match_number,

      home_source_match_id:
        match.home_source_match_id,

      away_source_match_id:
        match.away_source_match_id,
    }));

    // ========================================================
    // 7. RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      competition,

      participation: participationResult.rows.map(
        (row) => ({
          registration_id:
            row.registration_id,

          status:
            row.registration_status,

          player_id:
            row.player_id,

          team_id:
            row.team_id,
        })
      ),

      count:
        matches.length,

      matches,
    });
  } catch (error) {
    console.error(
      "Get player competition matches error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get player competition matches",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getPlayerCompetitionMatches,
};