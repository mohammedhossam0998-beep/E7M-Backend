const pool = require("../config/db");

// ============================================================
// GET COMPETITION STANDINGS
// GET /api/owner/competitions/:competitionId/standings
// ============================================================

const getCompetitionStandings = async (req, res) => {
  try {
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
        tie_breakers,
        tournament_locked
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

    // ========================================================
    // 3. STANDINGS ONLY FOR LEAGUE
    // ========================================================

    if (competition.format !== "league") {
      return res.status(400).json({
        success: false,
        message:
          "Standings are currently available for league competitions only",
      });
    }

    // ========================================================
    // 4. GET APPROVED PARTICIPANTS
    //
    // Individual competition:
    // player_id IS NOT NULL
    // team_id IS NULL
    //
    // Team competition:
    // team_id IS NOT NULL
    // player_id IS NULL
    // ========================================================

    const participantsResult = await pool.query(
      `
      SELECT
        cr.id AS registration_id,
        cr.player_id,
        cr.team_id,

        u.full_name AS player_name,
        u.profile_image AS player_image,

        t.name AS team_name,
        t.logo AS team_logo

      FROM competition_registrations cr

      LEFT JOIN users u
        ON u.id = cr.player_id

      LEFT JOIN teams t
        ON t.id = cr.team_id

      WHERE cr.competition_id = $1
        AND cr.status IN ('approved', 'paid', 'completed')

        AND (
          (
            $2 = 'individual'
            AND cr.player_id IS NOT NULL
            AND cr.team_id IS NULL
          )
          OR
          (
            $2 = 'team'
            AND cr.team_id IS NOT NULL
            AND cr.player_id IS NULL
          )
        )

      ORDER BY cr.id ASC
      `,
      [competitionId, competition.competition_type]
    );

    // ========================================================
    // 5. INITIALIZE STANDINGS
    // ========================================================

    const standingsMap = new Map();

    for (const participant of participantsResult.rows) {
      const registrationId = String(
        participant.registration_id
      );

      const isTeam = participant.team_id !== null;

      standingsMap.set(registrationId, {
        position: 0,

        registration_id: participant.registration_id,

        participant: {
          type: isTeam ? "team" : "player",

          id: isTeam
            ? participant.team_id
            : participant.player_id,

          name: isTeam
            ? participant.team_name
            : participant.player_name,

          image: isTeam
            ? participant.team_logo
            : participant.player_image,
        },

        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,

        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,

        points: 0,
      });
    }

    // ========================================================
    // 6. GET COMPLETED LEAGUE MATCHES
    // ========================================================

    const matchesResult = await pool.query(
      `
      SELECT
        id,
        home_participant_id,
        away_participant_id,
        home_score,
        away_score,
        status,
        match_date,
        start_time

      FROM matches

      WHERE competition_id = $1
        AND status = 'completed'

      ORDER BY
        match_date ASC NULLS LAST,
        start_time ASC NULLS LAST,
        id ASC
      `,
      [competitionId]
    );

    // ========================================================
    // 7. CALCULATE MATCH RESULTS
    // ========================================================

    for (const match of matchesResult.rows) {
      const homeId = String(
        match.home_participant_id
      );

      const awayId = String(
        match.away_participant_id
      );

      const home = standingsMap.get(homeId);
      const away = standingsMap.get(awayId);

      // Ignore matches whose participants are not
      // valid standings participants.
      if (!home || !away) {
        continue;
      }

      const homeScore = Number(match.home_score);
      const awayScore = Number(match.away_score);

      // Ignore invalid scores.
      if (
        !Number.isInteger(homeScore) ||
        !Number.isInteger(awayScore) ||
        homeScore < 0 ||
        awayScore < 0
      ) {
        continue;
      }

      // ------------------------------------------------------
      // PLAYED
      // ------------------------------------------------------

      home.played += 1;
      away.played += 1;

      // ------------------------------------------------------
      // GOALS
      // ------------------------------------------------------

      home.goals_for += homeScore;
      home.goals_against += awayScore;

      away.goals_for += awayScore;
      away.goals_against += homeScore;

      // ------------------------------------------------------
      // RESULT
      // ------------------------------------------------------

      if (homeScore > awayScore) {
        home.wins += 1;
        home.points += 3;

        away.losses += 1;
      } else if (homeScore < awayScore) {
        away.wins += 1;
        away.points += 3;

        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;

        home.points += 1;
        away.points += 1;
      }
    }

    // ========================================================
    // 8. CALCULATE GOAL DIFFERENCE
    // ========================================================

    for (const row of standingsMap.values()) {
      row.goal_difference =
        row.goals_for - row.goals_against;
    }

    // ========================================================
    // 9. GET TIE BREAKERS
    // ========================================================

    const tieBreakers = Array.isArray(
      competition.tie_breakers
    )
      ? competition.tie_breakers
      : [
          "points",
          "head_to_head",
          "goal_difference",
          "goals_scored",
          "fair_play",
          "random_draw",
        ];

    // ========================================================
    // 10. BUILD HEAD-TO-HEAD DATA
    // ========================================================

    const headToHead = new Map();

    for (const match of matchesResult.rows) {
      const homeId = String(
        match.home_participant_id
      );

      const awayId = String(
        match.away_participant_id
      );

      // Only calculate H2H for valid standings participants.
      if (
        !standingsMap.has(homeId) ||
        !standingsMap.has(awayId)
      ) {
        continue;
      }

      if (!headToHead.has(homeId)) {
        headToHead.set(homeId, new Map());
      }

      if (!headToHead.has(awayId)) {
        headToHead.set(awayId, new Map());
      }

      const homeMap = headToHead.get(homeId);
      const awayMap = headToHead.get(awayId);

      if (!homeMap.has(awayId)) {
        homeMap.set(awayId, {
          points: 0,
          goal_difference: 0,
          goals_for: 0,
        });
      }

      if (!awayMap.has(homeId)) {
        awayMap.set(homeId, {
          points: 0,
          goal_difference: 0,
          goals_for: 0,
        });
      }

      const homeScore = Number(match.home_score);
      const awayScore = Number(match.away_score);

      if (
        !Number.isInteger(homeScore) ||
        !Number.isInteger(awayScore) ||
        homeScore < 0 ||
        awayScore < 0
      ) {
        continue;
      }

      const homeH2H = homeMap.get(awayId);
      const awayH2H = awayMap.get(homeId);

      homeH2H.goals_for += homeScore;

      homeH2H.goal_difference +=
        homeScore - awayScore;

      awayH2H.goals_for += awayScore;

      awayH2H.goal_difference +=
        awayScore - homeScore;

      // ------------------------------------------------------
      // H2H POINTS
      // ------------------------------------------------------

      if (homeScore > awayScore) {
        homeH2H.points += 3;
      } else if (homeScore < awayScore) {
        awayH2H.points += 3;
      } else {
        homeH2H.points += 1;
        awayH2H.points += 1;
      }
    }

    // ========================================================
    // 11. SORT STANDINGS
    // ========================================================

    let standings = Array.from(
      standingsMap.values()
    );

    standings.sort((a, b) => {
      for (const breaker of tieBreakers) {
        // ====================================================
        // POINTS
        // ====================================================

        if (breaker === "points") {
          if (b.points !== a.points) {
            return b.points - a.points;
          }
        }

        // ====================================================
        // HEAD TO HEAD
        // ====================================================

        else if (breaker === "head_to_head") {
          const aMap = headToHead.get(
            String(a.registration_id)
          );

          const bMap = headToHead.get(
            String(b.registration_id)
          );

          const aVsB =
            aMap?.get(
              String(b.registration_id)
            );

          const bVsA =
            bMap?.get(
              String(a.registration_id)
            );

          const aPoints =
            aVsB?.points || 0;

          const bPoints =
            bVsA?.points || 0;

          if (aPoints !== bPoints) {
            return bPoints - aPoints;
          }

          const aGD =
            aVsB?.goal_difference || 0;

          const bGD =
            bVsA?.goal_difference || 0;

          if (aGD !== bGD) {
            return bGD - aGD;
          }

          const aGF =
            aVsB?.goals_for || 0;

          const bGF =
            bVsA?.goals_for || 0;

          if (aGF !== bGF) {
            return bGF - aGF;
          }
        }

        // ====================================================
        // GOAL DIFFERENCE
        // ====================================================

        else if (breaker === "goal_difference") {
          if (
            b.goal_difference !==
            a.goal_difference
          ) {
            return (
              b.goal_difference -
              a.goal_difference
            );
          }
        }

        // ====================================================
        // GOALS SCORED
        // ====================================================

        else if (breaker === "goals_scored") {
          if (
            b.goals_for !==
            a.goals_for
          ) {
            return (
              b.goals_for -
              a.goals_for
            );
          }
        }

        // ====================================================
        // FAIR PLAY
        //
        // There is currently no fair-play/card
        // data in the matches schema.
        // ====================================================

        else if (breaker === "fair_play") {
          continue;
        }

        // ====================================================
        // RANDOM DRAW
        // ====================================================

        else if (breaker === "random_draw") {
          return Math.random() - 0.5;
        }
      }

      // ======================================================
      // FINAL STABLE FALLBACK
      // ======================================================

      return (
        Number(a.registration_id) -
        Number(b.registration_id)
      );
    });

    // ========================================================
    // 12. ASSIGN POSITIONS
    // ========================================================

    standings = standings.map(
      (row, index) => ({
        ...row,
        position: index + 1,
      })
    );

    // ========================================================
    // 13. RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,

      competition: {
        id: competition.id,
        name: competition.name,
        competition_type:
          competition.competition_type,
        format: competition.format,
        tournament_locked:
          competition.tournament_locked,
      },

      tie_breakers: tieBreakers,

      matches_count:
        matchesResult.rows.length,

      completed_matches:
        matchesResult.rows.length,

      standings,
    });
  } catch (error) {
    console.error(
      "GET COMPETITION STANDINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get competition standings",
    });
  }
};

module.exports = {
  getCompetitionStandings,
};