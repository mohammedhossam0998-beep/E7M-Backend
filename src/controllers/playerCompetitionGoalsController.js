const pool = require("../config/db");

// ============================================================
// GET PLAYER COMPETITION GOALS
// GET /api/player/competitions/:competitionId/goals
// ============================================================

const getPlayerCompetitionGoals = async (req, res) => {
  try {
    const playerId = req.user.userId;
    const { competitionId } = req.params;

    // ----------------------------------------------------------
    // VALIDATE COMPETITION ID
    // ----------------------------------------------------------

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ----------------------------------------------------------
    // CHECK COMPETITION
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // CHECK PLAYER PARTICIPATION
    // ----------------------------------------------------------

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

    const registrationIds = participationResult.rows.map(
      (row) => row.registration_id
    );

    // ----------------------------------------------------------
    // GET PLAYER'S COMPETITION MATCHES
    // ----------------------------------------------------------

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
          m.match_number

        FROM matches m

        WHERE m.competition_id = $1

          AND (
            m.home_participant_id = ANY($2::bigint[])
            OR
            m.away_participant_id = ANY($2::bigint[])
          )

        ORDER BY
          m.match_date ASC NULLS LAST,
          m.start_time ASC NULLS LAST,
          m.match_number ASC NULLS LAST,
          m.id ASC;
      `,
      [competitionId, registrationIds]
    );

    // ----------------------------------------------------------
    // NO MATCHES
    // ----------------------------------------------------------

    if (matchesResult.rows.length === 0) {
      return res.status(200).json({
        success: true,

        competition,

        participation: participationResult.rows.map(
          (row) => ({
            registration_id: row.registration_id,
            status: row.registration_status,
            player_id: row.player_id,
            team_id: row.team_id,
          })
        ),

        count: 0,

        goals: [],
      });
    }

    const matchIds = matchesResult.rows.map(
      (match) => match.id
    );

    // ----------------------------------------------------------
    // GET GOALS
    // ----------------------------------------------------------

    const goalsResult = await pool.query(
      `
        SELECT
          cg.id,
          cg.match_id,
          cg.player_id,
          cg.minute,
          cg.is_own_goal,
          cg.created_at,

          u.full_name AS player_name,
          u.profile_image AS player_image

        FROM competition_goals cg

        INNER JOIN users u
          ON u.id = cg.player_id

        WHERE cg.match_id = ANY($1::bigint[])

        ORDER BY
          cg.match_id ASC,
          cg.minute ASC,
          cg.id ASC;
      `,
      [matchIds]
    );

    // ----------------------------------------------------------
    // MAP GOALS TO MATCHES
    // ----------------------------------------------------------

    const matches = matchesResult.rows.map(
      (match) => {
        const matchGoals = goalsResult.rows
          .filter(
            (goal) =>
              String(goal.match_id) ===
              String(match.id)
          )
          .map((goal) => ({
            id: goal.id,
            player_id: goal.player_id,
            player_name: goal.player_name,
            player_image: goal.player_image,
            minute: goal.minute,
            is_own_goal: goal.is_own_goal,
            created_at: goal.created_at,
          }));

        return {
          id: match.id,

          match_date: match.match_date,

          start_time: match.start_time,

          home_score: match.home_score,

          away_score: match.away_score,

          status: match.status,

          home_participant_id:
            match.home_participant_id,

          away_participant_id:
            match.away_participant_id,

          round: match.round,

          match_number: match.match_number,

          goals: matchGoals,
        };
      }
    );

    // ----------------------------------------------------------
    // FLAT GOALS LIST
    // ----------------------------------------------------------

    const goals = goalsResult.rows.map(
      (goal) => ({
        id: goal.id,

        match_id: goal.match_id,

        player_id: goal.player_id,

        player_name: goal.player_name,

        player_image: goal.player_image,

        minute: goal.minute,

        is_own_goal: goal.is_own_goal,

        created_at: goal.created_at,
      })
    );

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      competition,

      participation: participationResult.rows.map(
        (row) => ({
          registration_id: row.registration_id,
          status: row.registration_status,
          player_id: row.player_id,
          team_id: row.team_id,
        })
      ),

      matches_count: matches.length,

      goals_count: goals.length,

      matches,

      goals,
    });
  } catch (error) {
    console.error(
      "Get player competition goals error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get player competition goals",
    });
  }
};

module.exports = {
  getPlayerCompetitionGoals,
};