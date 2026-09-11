const pool = require("../config/db");

// ============================================================
// ADD COMPETITION GOAL
// POST /api/owner/competitions/:competitionId/matches/:matchId/goals
// ============================================================

const addCompetitionGoal = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { competitionId, matchId } = req.params;

    const {
      player_id,
      minute,
      is_own_goal = false,
    } = req.body;

    // ----------------------------------------------------------
    // VALIDATE IDS
    // ----------------------------------------------------------

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

    if (
      player_id === undefined ||
      player_id === null ||
      !/^\d+$/.test(String(player_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid player ID",
      });
    }

    if (
      minute === undefined ||
      minute === null ||
      !Number.isInteger(Number(minute)) ||
      Number(minute) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Minute must be a non-negative integer",
      });
    }

    if (typeof is_own_goal !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_own_goal must be a boolean",
      });
    }

    // ----------------------------------------------------------
    // CHECK COMPETITION OWNERSHIP
    // ----------------------------------------------------------

    const competitionResult = await pool.query(
      `
        SELECT
          id,
          name,
          competition_type,
          format,
          created_by,
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

    if (String(competition.created_by) !== String(ownerId)) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to manage this competition",
      });
    }

    // ----------------------------------------------------------
    // CHECK MATCH
    // ----------------------------------------------------------

    const matchResult = await pool.query(
      `
        SELECT
          m.id,
          m.competition_id,
          m.home_score,
          m.away_score,
          m.status,
          m.home_participant_id,
          m.away_participant_id
        FROM matches m
        WHERE m.id = $1
          AND m.competition_id = $2
        LIMIT 1;
      `,
      [matchId, competitionId]
    );

    if (matchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Match not found in this competition",
      });
    }

    const match = matchResult.rows[0];

    // ----------------------------------------------------------
    // MATCH PARTICIPANTS
    // ----------------------------------------------------------

    if (
      match.home_participant_id === null ||
      match.away_participant_id === null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Match participants are not complete",
      });
    }

    // ----------------------------------------------------------
    // MATCH SCORE MUST EXIST
    // ----------------------------------------------------------

    const homeScore =
      match.home_score === null
        ? null
        : Number(match.home_score);

    const awayScore =
      match.away_score === null
        ? null
        : Number(match.away_score);

    if (
      homeScore === null ||
      awayScore === null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Match score must be entered before adding goals",
      });
    }

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Match score is invalid",
      });
    }

    // ----------------------------------------------------------
    // CHECK PLAYER
    // ----------------------------------------------------------

    const playerResult = await pool.query(
      `
        SELECT
          id,
          full_name,
          profile_image,
          role
        FROM users
        WHERE id = $1
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

    const player = playerResult.rows[0];

    if (player.role !== "player") {
      return res.status(400).json({
        success: false,
        message:
          "Selected user is not a player",
      });
    }

    // ----------------------------------------------------------
    // LOAD MATCH PARTICIPANTS
    // ----------------------------------------------------------

    const participantResult = await pool.query(
      `
        SELECT
          cr.id AS registration_id,
          cr.player_id,
          cr.team_id
        FROM competition_registrations cr
        WHERE cr.competition_id = $1
          AND cr.id IN ($2, $3)
          AND cr.status IN (
            'approved',
            'paid',
            'completed'
          );
      `,
      [
        competitionId,
        match.home_participant_id,
        match.away_participant_id,
      ]
    );

    if (participantResult.rows.length !== 2) {
      return res.status(400).json({
        success: false,
        message:
          "Match participants are not valid competition registrations",
      });
    }

    const homeParticipant =
      participantResult.rows.find(
        (participant) =>
          String(participant.registration_id) ===
          String(match.home_participant_id)
      );

    const awayParticipant =
      participantResult.rows.find(
        (participant) =>
          String(participant.registration_id) ===
          String(match.away_participant_id)
      );

    if (!homeParticipant || !awayParticipant) {
      return res.status(400).json({
        success: false,
        message:
          "Match participants could not be resolved",
      });
    }

    // ----------------------------------------------------------
    // RESOLVE PLAYER SIDE
    // ----------------------------------------------------------

    let playerSide = null;

    // Direct individual registration
    if (
      homeParticipant.player_id !== null &&
      String(homeParticipant.player_id) ===
        String(player_id)
    ) {
      playerSide = "home";
    }

    if (
      awayParticipant.player_id !== null &&
      String(awayParticipant.player_id) ===
        String(player_id)
    ) {
      if (playerSide !== null) {
        return res.status(400).json({
          success: false,
          message:
            "Player participation is ambiguous",
        });
      }

      playerSide = "away";
    }

    // Team registration
    if (playerSide === null) {
      const teamIds = [
        homeParticipant.team_id,
        awayParticipant.team_id,
      ].filter(
        (teamId) => teamId !== null
      );

      if (teamIds.length > 0) {
        const rosterResult = await pool.query(
          `
            SELECT
              team_id,
              player_id
            FROM team_tournament_rosters
            WHERE competition_id = $1
              AND team_id = ANY($2::bigint[])
              AND player_id = $3;
          `,
          [
            competitionId,
            teamIds,
            player_id,
          ]
        );

        for (const roster of rosterResult.rows) {
          if (
            homeParticipant.team_id !== null &&
            String(homeParticipant.team_id) ===
              String(roster.team_id)
          ) {
            if (playerSide !== null) {
              return res.status(400).json({
                success: false,
                message:
                  "Player participation is ambiguous",
              });
            }

            playerSide = "home";
          }

          if (
            awayParticipant.team_id !== null &&
            String(awayParticipant.team_id) ===
              String(roster.team_id)
          ) {
            if (playerSide !== null) {
              return res.status(400).json({
                success: false,
                message:
                  "Player participation is ambiguous",
              });
            }

            playerSide = "away";
          }
        }
      }
    }

    // ----------------------------------------------------------
    // PLAYER MUST BELONG TO ONE MATCH SIDE
    // ----------------------------------------------------------

    if (playerSide === null) {
      return res.status(400).json({
        success: false,
        message:
          "Player is not a participant in this match",
      });
    }

    // ----------------------------------------------------------
    // DETERMINE WHICH SIDE RECEIVES THE GOAL
    // ----------------------------------------------------------

    const scoringSide =
      is_own_goal
        ? playerSide === "home"
          ? "away"
          : "home"
        : playerSide;

    const currentScore =
      scoringSide === "home"
        ? homeScore
        : awayScore;

    // ----------------------------------------------------------
    // COUNT ALREADY REGISTERED GOALS
    // ----------------------------------------------------------

    const existingGoalsResult =
      await pool.query(
        `
          SELECT
            cg.id,
            cg.player_id,
            cg.is_own_goal
          FROM competition_goals cg
          WHERE cg.match_id = $1;
        `,
        [matchId]
      );

    let registeredHomeGoals = 0;
    let registeredAwayGoals = 0;

    for (
      const existingGoal of
        existingGoalsResult.rows
    ) {
      let existingPlayerSide = null;

      // Direct player participant
      if (
        homeParticipant.player_id !== null &&
        String(homeParticipant.player_id) ===
          String(existingGoal.player_id)
      ) {
        existingPlayerSide = "home";
      }

      if (
        awayParticipant.player_id !== null &&
        String(awayParticipant.player_id) ===
          String(existingGoal.player_id)
      ) {
        if (existingPlayerSide === null) {
          existingPlayerSide = "away";
        }
      }

      // Team participant
      if (existingPlayerSide === null) {
        const rosterResult =
          await pool.query(
            `
              SELECT
                team_id
              FROM team_tournament_rosters
              WHERE competition_id = $1
                AND player_id = $2
                AND team_id IN ($3, $4)
              LIMIT 2;
            `,
            [
              competitionId,
              existingGoal.player_id,
              homeParticipant.team_id,
              awayParticipant.team_id,
            ]
          );

        for (
          const roster
            of rosterResult.rows
        ) {
          if (
            homeParticipant.team_id !== null &&
            String(homeParticipant.team_id) ===
              String(roster.team_id)
          ) {
            existingPlayerSide = "home";
            break;
          }

          if (
            awayParticipant.team_id !== null &&
            String(awayParticipant.team_id) ===
              String(roster.team_id)
          ) {
            existingPlayerSide = "away";
            break;
          }
        }
      }

      if (existingPlayerSide === null) {
        continue;
      }

      const existingScoringSide =
        existingGoal.is_own_goal
          ? existingPlayerSide === "home"
            ? "away"
            : "home"
          : existingPlayerSide;

      if (existingScoringSide === "home") {
        registeredHomeGoals++;
      } else {
        registeredAwayGoals++;
      }
    }

    // ----------------------------------------------------------
    // PREVENT GOALS FROM EXCEEDING MATCH SCORE
    // ----------------------------------------------------------

    if (
      scoringSide === "home" &&
      registeredHomeGoals >= homeScore
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Registered home goals already match the home score",
      });
    }

    if (
      scoringSide === "away" &&
      registeredAwayGoals >= awayScore
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Registered away goals already match the away score",
      });
    }

    // ----------------------------------------------------------
    // INSERT GOAL
    // ----------------------------------------------------------

    const goalResult = await pool.query(
      `
        INSERT INTO competition_goals (
          match_id,
          player_id,
          minute,
          is_own_goal
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          match_id,
          player_id,
          minute,
          is_own_goal,
          created_at;
      `,
      [
        matchId,
        player_id,
        Number(minute),
        is_own_goal,
      ]
    );

    const goal = goalResult.rows[0];

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(201).json({
      success: true,
      message:
        "Competition goal added successfully",

      goal: {
        id: goal.id,
        match_id: goal.match_id,
        player_id: goal.player_id,
        player_name: player.full_name,
        player_image: player.profile_image,
        minute: goal.minute,
        is_own_goal: goal.is_own_goal,
        scoring_side: scoringSide,
        created_at: goal.created_at,
      },
    });
  } catch (error) {
    console.error(
      "Add competition goal error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to add competition goal",
    });
  }
};

module.exports = {
  addCompetitionGoal,
};