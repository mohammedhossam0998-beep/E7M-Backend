const pool = require("../config/db");

// ============================================================
// GENERATE KNOCKOUT TOURNAMENT
// ============================================================

const generateKnockoutTournament = async (req, res) => {
  const client = await pool.connect();

  try {
    const { competitionId } = req.params;
    const ownerId = req.user.userId;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    await client.query("BEGIN");

    // --------------------------------------------------------
    // 1. Get competition + ownership
    // --------------------------------------------------------

    const competitionResult = await client.query(
      `
        SELECT
          id,
          name,
          competition_type,
          format,
          seeding_method,
          seeding_confirmed,
          tournament_locked
        FROM competitions
        WHERE id = $1
          AND created_by = $2
        FOR UPDATE
      `,
      [competitionId, ownerId]
    );

    if (competitionResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition not found or access denied",
      });
    }

    const competition = competitionResult.rows[0];

    // --------------------------------------------------------
    // 2. Only knockout for this engine
    // --------------------------------------------------------

    if (competition.format !== "knockout") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Knockout tournament generation is only available for knockout competitions",
      });
    }

    // --------------------------------------------------------
    // 3. Seeding must be confirmed
    // --------------------------------------------------------

    if (!competition.seeding_confirmed) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding must be confirmed before generating tournament",
      });
    }

    // --------------------------------------------------------
    // 4. Tournament must not already be locked
    // --------------------------------------------------------

    if (competition.tournament_locked) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Tournament has already been generated and locked",
      });
    }

    // --------------------------------------------------------
    // 5. Prevent regeneration if matches already exist
    // --------------------------------------------------------

    const existingMatchesResult = await client.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM matches
        WHERE competition_id = $1
      `,
      [competitionId]
    );

    if (existingMatchesResult.rows[0].count > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Tournament matches already exist",
      });
    }

    // --------------------------------------------------------
    // 6. Get confirmed seeding
    // --------------------------------------------------------

    const seedingResult = await client.query(
      `
        SELECT
          cs.registration_id,
          cs.seed,
          cr.player_id,
          cr.team_id,
          cr.status
        FROM competition_seeding cs
        JOIN competition_registrations cr
          ON cr.id = cs.registration_id
         AND cr.competition_id = cs.competition_id
        WHERE cs.competition_id = $1
        ORDER BY cs.seed ASC
      `,
      [competitionId]
    );

    const seeding = seedingResult.rows;

    if (seeding.length < 2) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "At least 2 seeded participants are required",
      });
    }

    // --------------------------------------------------------
    // 7. Validate seeding is sequential
    // --------------------------------------------------------

    for (let i = 0; i < seeding.length; i++) {
      if (Number(seeding[i].seed) !== i + 1) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Seeding must be sequential starting from 1",
        });
      }
    }

    // --------------------------------------------------------
    // 8. Validate participants are still approved / paid
    // --------------------------------------------------------

    for (const participant of seeding) {
      if (!["approved", "paid"].includes(participant.status)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "All seeded participants must remain approved or paid before tournament generation",
          registration_id: participant.registration_id,
          status: participant.status,
        });
      }

      if (competition.competition_type === "individual") {
        if (!participant.player_id || participant.team_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Invalid participant found for individual competition",
            registration_id: participant.registration_id,
          });
        }
      }

      if (competition.competition_type === "team") {
        if (!participant.team_id || participant.player_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Invalid participant found for team competition",
            registration_id: participant.registration_id,
          });
        }
      }
    }

    // --------------------------------------------------------
    // 9. Team roster snapshot
    // --------------------------------------------------------

    if (competition.competition_type === "team") {
      for (const participant of seeding) {
        const teamResult = await client.query(
          `
            SELECT
              tm.team_id,
              tm.player_id,
              tm.role
            FROM team_members tm
            WHERE tm.team_id = $1
            ORDER BY tm.player_id ASC
          `,
          [participant.team_id]
        );

        if (teamResult.rows.length === 0) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Team has no members and cannot be snapshotted",
            team_id: participant.team_id,
          });
        }

        for (const member of teamResult.rows) {
          await client.query(
            `
              INSERT INTO team_tournament_rosters (
                competition_id,
                team_id,
                player_id,
                role
              )
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (
                competition_id,
                team_id,
                player_id
              )
              DO NOTHING
            `,
            [
              competitionId,
              member.team_id,
              member.player_id,
              member.role || null,
            ]
          );
        }
      }
    }

    // --------------------------------------------------------
    // 10. Calculate bracket size
    // --------------------------------------------------------

    const participantCount = seeding.length;

    let bracketSize = 1;

    while (bracketSize < participantCount) {
      bracketSize *= 2;
    }

    // --------------------------------------------------------
    // 11. Match helpers
    // --------------------------------------------------------

    const roundMatches = {};
    const firstRound = Math.log2(bracketSize);

    const roundName = (roundNumber) => {
      if (roundNumber === 1) return "final";
      if (roundNumber === 2) return "semi_final";
      if (roundNumber === 3) return "quarter_final";
      return `round_of_${Math.pow(2, roundNumber)}`;
    };

    const createMatch = async ({
      round,
      matchNumber,
      homeParticipantId = null,
      awayParticipantId = null,
      homeSourceMatchId = null,
      awaySourceMatchId = null,
    }) => {
      const result = await client.query(
        `
          INSERT INTO matches (
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
          )
          VALUES (
            $1, NULL, NULL, NULL, NULL, 'scheduled',
            $2, $3, $4, $5, $6, $7
          )
          RETURNING *
        `,
        [
          competitionId,
          homeParticipantId,
          awayParticipantId,
          round,
          matchNumber,
          homeSourceMatchId,
          awaySourceMatchId,
        ]
      );

      return result.rows[0];
    };

    // --------------------------------------------------------
    // 12. Build standard knockout seed positions
    //
    // Example for bracket size 8:
    // 1, 8, 4, 5, 2, 7, 3, 6
    //
    // This keeps high seeds separated and gives byes to the
    // highest seeds when participant count is not a power of 2.
    // --------------------------------------------------------

    const buildSeedPositions = (size) => {
      let positions = [1, 2];
      let currentSize = 2;

      while (currentSize < size) {
        positions = positions.flatMap((seed) => [
          seed,
          currentSize * 2 + 1 - seed,
        ]);
        currentSize *= 2;
      }

      return positions;
    };

    const seedPositions = buildSeedPositions(bracketSize);

    const participantsBySeed = new Map(
      seeding.map((participant) => [
        Number(participant.seed),
        participant.registration_id,
      ])
    );

    // A bracket node is either:
    // - null
    // - a participant registration id (including a BYE advance)
    // - a created match object
    //
    // We do not create a fake BYE match because the matches.status
    // constraint only allows scheduled/live/completed/cancelled.
    const firstRoundNodes = [];
    const firstRoundMatches = [];

    // --------------------------------------------------------
    // 13. Create first round
    // --------------------------------------------------------

    for (let i = 0; i < seedPositions.length; i += 2) {
      const homeSeed = seedPositions[i];
      const awaySeed = seedPositions[i + 1];

      const homeParticipant = participantsBySeed.get(homeSeed) || null;
      const awayParticipant = participantsBySeed.get(awaySeed) || null;

      if (!homeParticipant && !awayParticipant) {
        firstRoundNodes.push(null);
        continue;
      }

      if (homeParticipant && !awayParticipant) {
        // BYE: highest-seeded participant advances directly.
        firstRoundNodes.push(homeParticipant);
        continue;
      }

      if (!homeParticipant && awayParticipant) {
        firstRoundNodes.push(awayParticipant);
        continue;
      }

      const match = await createMatch({
        round: roundName(firstRound),
        matchNumber: firstRoundMatches.length + 1,
        homeParticipantId: homeParticipant,
        awayParticipantId: awayParticipant,
      });

      firstRoundMatches.push(match);
      firstRoundNodes.push(match);
    }

    roundMatches[firstRound] = firstRoundMatches;

    // --------------------------------------------------------
    // 14. Generate future rounds
    //
    // participant + participant -> real match
    // participant + match       -> match with participant + source
    // match + participant       -> match with source + participant
    // match + match             -> match with two sources
    // participant + null        -> participant advances
    // match + null              -> match advances to next round
    // null + null               -> empty bracket slot
    // --------------------------------------------------------

    let previousRoundNodes = firstRoundNodes;

    for (let roundNumber = firstRound - 1; roundNumber >= 1; roundNumber--) {
      const currentRoundNodes = [];
      const currentRoundMatches = [];

      for (let i = 0; i < previousRoundNodes.length; i += 2) {
        const homeNode = previousRoundNodes[i] || null;
        const awayNode = previousRoundNodes[i + 1] || null;

        if (!homeNode && !awayNode) {
          currentRoundNodes.push(null);
          continue;
        }

        // Automatic advance when a bracket side is empty.
        if (homeNode && !awayNode) {
          currentRoundNodes.push(homeNode);
          continue;
        }

        if (!homeNode && awayNode) {
          currentRoundNodes.push(awayNode);
          continue;
        }

        const homeIsParticipant = typeof homeNode !== "object";
        const awayIsParticipant = typeof awayNode !== "object";

        const match = await createMatch({
          round: roundName(roundNumber),
          matchNumber: currentRoundMatches.length + 1,
          homeParticipantId: homeIsParticipant ? homeNode : null,
          awayParticipantId: awayIsParticipant ? awayNode : null,
          homeSourceMatchId: homeIsParticipant ? null : homeNode.id,
          awaySourceMatchId: awayIsParticipant ? null : awayNode.id,
        });

        currentRoundMatches.push(match);
        currentRoundNodes.push(match);
      }

      roundMatches[roundNumber] = currentRoundMatches;
      previousRoundNodes = currentRoundNodes;
    }

    // --------------------------------------------------------
    // 15. Safety check: bracket must end in exactly one node
    // --------------------------------------------------------

    if (previousRoundNodes.length !== 1 || !previousRoundNodes[0]) {
      throw new Error("Failed to build a valid knockout bracket");
    }

    // --------------------------------------------------------
    // 15. Lock tournament
    // --------------------------------------------------------

    const lockResult = await client.query(
      `
        UPDATE competitions
        SET tournament_locked = TRUE
        WHERE id = $1
          AND tournament_locked = FALSE
        RETURNING
          id,
          name,
          competition_type,
          format,
          seeding_method,
          seeding_confirmed,
          tournament_locked
      `,
      [competitionId]
    );

    if (lockResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Tournament could not be locked",
      });
    }

    // --------------------------------------------------------
    // 16. Commit
    // --------------------------------------------------------

    await client.query("COMMIT");

    // --------------------------------------------------------
    // 17. Return complete tournament
    // --------------------------------------------------------

    const matchesResult = await pool.query(
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
        WHERE competition_id = $1
        ORDER BY
          CASE round
            WHEN 'round_of_2' THEN 1
            WHEN 'round_of_4' THEN 2
            WHEN 'quarter_final' THEN 3
            WHEN 'semi_final' THEN 4
            WHEN 'final' THEN 5
            ELSE 99
          END,
          match_number ASC,
          id ASC
      `,
      [competitionId]
    );

    return res.status(201).json({
      success: true,
      message: "Knockout tournament generated and locked successfully",
      competition: lockResult.rows[0],
      participants: seeding.length,
      bracket_size: bracketSize,
      matches_count: matchesResult.rows.length,
      matches: matchesResult.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("generateKnockoutTournament error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate knockout tournament",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  generateKnockoutTournament,
};