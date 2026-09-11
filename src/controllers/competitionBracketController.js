const pool = require("../config/db");

// ============================================================
// GET COMPETITION BRACKET
// GET /api/owner/competitions/:competitionId/bracket
// ============================================================

const getCompetitionBracket = async (req, res) => {
  try {
    const { competitionId } = req.params;

    // --------------------------------------------------------
    // 1. Validate competition ID
    // --------------------------------------------------------

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // --------------------------------------------------------
    // 2. Get competition
    // --------------------------------------------------------

    const competitionResult = await pool.query(
      `
        SELECT
          id,
          name,
          competition_type,
          format,
          seeding_method,
          seeding_confirmed,
          tournament_locked,
          status
        FROM competitions
        WHERE id = $1
        LIMIT 1
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

    // --------------------------------------------------------
    // 3. Bracket only for knockout competitions
    // --------------------------------------------------------

    if (
      competition.format !== "knockout" &&
      competition.format !== "groups_knockout"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Bracket is currently available for knockout competitions only",
      });
    }

    // --------------------------------------------------------
    // 4. Get bracket matches
    // --------------------------------------------------------

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

          hr.player_id AS home_player_id,
          hr.team_id AS home_team_id,

          ar.player_id AS away_player_id,
          ar.team_id AS away_team_id,

          hu.full_name AS home_player_name,
          au.full_name AS away_player_name,

          ht.name AS home_team_name,
          at.name AS away_team_name

        FROM matches m

        LEFT JOIN competition_registrations hr
          ON hr.id = m.home_participant_id

        LEFT JOIN competition_registrations ar
          ON ar.id = m.away_participant_id

        LEFT JOIN users hu
          ON hu.id = hr.player_id

        LEFT JOIN users au
          ON au.id = ar.player_id

        LEFT JOIN teams ht
          ON ht.id = hr.team_id

        LEFT JOIN teams at
          ON at.id = ar.team_id

        WHERE m.competition_id = $1

        ORDER BY
          CASE m.round
            WHEN 'round_of_16' THEN 1
            WHEN 'round_of_8' THEN 2
            WHEN 'quarter_final' THEN 3
            WHEN 'semi_final' THEN 4
            WHEN 'round_of_2' THEN 5
            WHEN 'final' THEN 6
            ELSE 99
          END,
          m.match_number ASC,
          m.id ASC
      `,
      [competitionId]
    );

    // --------------------------------------------------------
    // 5. Build bracket rounds
    // --------------------------------------------------------

    const roundsMap = new Map();

    for (const match of matchesResult.rows) {
      const round = match.round || "unknown";

      if (!roundsMap.has(round)) {
        roundsMap.set(round, []);
      }

      const homeParticipant =
        match.home_participant_id !== null
          ? {
              registration_id: match.home_participant_id,
              type:
                match.home_team_id !== null
                  ? "team"
                  : "player",
              id:
                match.home_team_id !== null
                  ? match.home_team_id
                  : match.home_player_id,
              name:
                match.home_team_id !== null
                  ? match.home_team_name
                  : match.home_player_name,
            }
          : null;

      const awayParticipant =
        match.away_participant_id !== null
          ? {
              registration_id: match.away_participant_id,
              type:
                match.away_team_id !== null
                  ? "team"
                  : "player",
              id:
                match.away_team_id !== null
                  ? match.away_team_id
                  : match.away_player_id,
              name:
                match.away_team_id !== null
                  ? match.away_team_name
                  : match.away_player_name,
            }
          : null;

      roundsMap.get(round).push({
        id: match.id,
        match_number: match.match_number,

        date: match.match_date,
        start_time: match.start_time,

        status: match.status,

        home_score: match.home_score,
        away_score: match.away_score,

        home_participant: homeParticipant,
        away_participant: awayParticipant,

        home_source_match_id:
          match.home_source_match_id,

        away_source_match_id:
          match.away_source_match_id,
      });
    }

    // --------------------------------------------------------
    // 6. Convert rounds map to response array
    // --------------------------------------------------------

    const rounds = Array.from(
      roundsMap.entries()
    ).map(([round, matches]) => ({
      round,
      matches,
    }));

    // --------------------------------------------------------
    // 7. Response
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,

      competition: {
        id: competition.id,
        name: competition.name,
        competition_type:
          competition.competition_type,
        format: competition.format,
        seeding_method:
          competition.seeding_method,
        seeding_confirmed:
          competition.seeding_confirmed,
        tournament_locked:
          competition.tournament_locked,
        status: competition.status,
      },

      generated: matchesResult.rows.length > 0,

      rounds,

      matches_count:
        matchesResult.rows.length,
    });
  } catch (error) {
    console.error(
      "GET COMPETITION BRACKET ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition bracket",
    });
  }
};

module.exports = {
  getCompetitionBracket,
};