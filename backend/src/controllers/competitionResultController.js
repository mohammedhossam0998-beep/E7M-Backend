const pool = require("../config/db");

// ============================================================
// UPDATE COMPETITION MATCH RESULT
// PUT /api/owner/competitions/:competitionId/matches/:matchId/result
// ============================================================

const updateCompetitionMatchResult = async (req, res) => {
  const client = await pool.connect();

  try {
    const ownerId = req.user.userId;
    const { competitionId, matchId } = req.params;

    const { home_score, away_score } = req.body;

    // --------------------------------------------------------
    // 1. Validate IDs
    // --------------------------------------------------------

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
    // 2. Validate scores
    // --------------------------------------------------------

    const homeScore = Number(home_score);
    const awayScore = Number(away_score);

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore)
    ) {
      return res.status(400).json({
        success: false,
        message: "Scores must be integers",
      });
    }

    if (homeScore < 0 || awayScore < 0) {
      return res.status(400).json({
        success: false,
        message: "Scores cannot be negative",
      });
    }

    // --------------------------------------------------------
    // 3. Start transaction
    // --------------------------------------------------------

    await client.query("BEGIN");

    // --------------------------------------------------------
    // 4. Get competition + match
    // --------------------------------------------------------

    const matchResult = await client.query(
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

          c.name AS competition_name,
          c.format AS competition_format,
          c.competition_type,
          c.created_by,
          c.tournament_locked

        FROM matches m

        INNER JOIN competitions c
          ON c.id = m.competition_id

        WHERE m.id = $1
          AND m.competition_id = $2
          AND c.created_by = $3

        FOR UPDATE;
      `,
      [matchId, competitionId, ownerId]
    );

    if (matchResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition match not found",
      });
    }

    const match = matchResult.rows[0];

    // --------------------------------------------------------
    // 5. Validate match status
    // --------------------------------------------------------

    if (match.status === "cancelled") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Cancelled matches cannot receive results",
      });
    }

    if (match.status === "completed") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Match result has already been recorded",
      });
    }

    // --------------------------------------------------------
    // 6. Both participants must exist
    // --------------------------------------------------------

    if (
      !match.home_participant_id ||
      !match.away_participant_id
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Both match participants must be determined before recording the result",
      });
    }

    // --------------------------------------------------------
    // 7. Draw is not supported yet
    // --------------------------------------------------------

    if (homeScore === awayScore) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Draw results are not supported for knockout matches. A winner is required.",
      });
    }

    // --------------------------------------------------------
    // 8. Determine winner
    // --------------------------------------------------------

    const winnerParticipantId =
      homeScore > awayScore
        ? match.home_participant_id
        : match.away_participant_id;

    const loserParticipantId =
      homeScore > awayScore
        ? match.away_participant_id
        : match.home_participant_id;

    // --------------------------------------------------------
    // 9. Save result
    // --------------------------------------------------------

    const updatedMatchResult = await client.query(
      `
        UPDATE matches
        SET
          home_score = $1,
          away_score = $2,
          status = 'completed'
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
        homeScore,
        awayScore,
        matchId,
        competitionId,
      ]
    );

    // --------------------------------------------------------
    // 10. Find next match
    // --------------------------------------------------------

    const nextMatchResult = await client.query(
      `
        SELECT
          id,
          competition_id,
          match_date,
          start_time,
          home_participant_id,
          away_participant_id,
          round,
          match_number,
          home_source_match_id,
          away_source_match_id,
          status

        FROM matches

        WHERE competition_id = $1
          AND (
            home_source_match_id = $2
            OR away_source_match_id = $2
          )

        LIMIT 1

        FOR UPDATE;
      `,
      [competitionId, matchId]
    );

    let nextMatch = null;
    let tournamentCompleted = false;

    // --------------------------------------------------------
    // 11. Advance winner
    // --------------------------------------------------------

    if (nextMatchResult.rows.length > 0) {
      nextMatch = nextMatchResult.rows[0];

      if (
        Number(nextMatch.home_source_match_id) ===
        Number(matchId)
      ) {
        await client.query(
          `
            UPDATE matches
            SET home_participant_id = $1
            WHERE id = $2;
          `,
          [
            winnerParticipantId,
            nextMatch.id,
          ]
        );
      }

      if (
        Number(nextMatch.away_source_match_id) ===
        Number(matchId)
      ) {
        await client.query(
          `
            UPDATE matches
            SET away_participant_id = $1
            WHERE id = $2;
          `,
          [
            winnerParticipantId,
            nextMatch.id,
          ]
        );
      }

      const refreshedNextMatchResult = await client.query(
        `
          SELECT
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
            away_source_match_id
          FROM matches
          WHERE id = $1
          LIMIT 1;
        `,
        [nextMatch.id]
      );

      nextMatch = refreshedNextMatchResult.rows[0];
    } else {
      // ------------------------------------------------------
      // No next match = this was the final
      // ------------------------------------------------------

      if (match.round === "final") {
        tournamentCompleted = true;

        await client.query(
          `
            UPDATE competitions
            SET status = 'completed'
            WHERE id = $1;
          `,
          [competitionId]
        );
      }
    }

    // --------------------------------------------------------
    // 12. Commit
    // --------------------------------------------------------

    await client.query("COMMIT");

    // --------------------------------------------------------
    // 13. Response
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: tournamentCompleted
        ? "Match result recorded and competition completed successfully"
        : "Match result recorded successfully",

      result: {
        match: updatedMatchResult.rows[0],
        winner_participant_id: winnerParticipantId,
        loser_participant_id: loserParticipantId,
      },

      next_match: nextMatch,

      tournament_completed: tournamentCompleted,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Update competition match result error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update competition match result",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  updateCompetitionMatchResult,
};