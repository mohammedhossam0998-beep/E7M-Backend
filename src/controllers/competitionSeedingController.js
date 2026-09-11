const pool = require("../config/db");

// ============================================================
// GENERATE RANDOM SEEDING
// ============================================================

const generateRandomSeeding = async (req, res) => {
  const client = await pool.connect();

  try {
    const { competitionId } = req.params;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    const ownerId = req.user.userId;

    await client.query("BEGIN");

    // --------------------------------------------------------
    // 1. Verify competition + ownership
    // --------------------------------------------------------

    const competitionResult = await client.query(
      `
      SELECT
        id,
        name,
        competition_type,
        format,
        seeding_method,
        seeding_confirmed
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
    // 2. Only knockout / groups_knockout need seeding
    // --------------------------------------------------------

    if (
      competition.format !== "knockout" &&
      competition.format !== "groups_knockout"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding is only available for knockout competitions",
      });
    }

    // --------------------------------------------------------
    // 3. Ranking is not implemented yet
    // --------------------------------------------------------

    if (competition.seeding_method === "ranking") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Ranking-based seeding is not available yet",
      });
    }

    // --------------------------------------------------------
    // 4. Do not regenerate after confirmation
    // --------------------------------------------------------

    if (competition.seeding_confirmed) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding has already been confirmed",
      });
    }

    // --------------------------------------------------------
    // 5. Get eligible participants
    //
    // Individual:
    //   player registrations
    //
    // Team:
    //   team registrations
    //
    // Only approved / paid participants are eligible.
    // --------------------------------------------------------

    const participantsResult = await client.query(
      `
      SELECT
        cr.id AS registration_id,
        cr.player_id,
        cr.team_id,
        cr.status
      FROM competition_registrations cr
      WHERE cr.competition_id = $1
        AND cr.status IN ('approved', 'paid')
      ORDER BY cr.id ASC
      `,
      [competitionId]
    );

    const participants = participantsResult.rows;

    if (participants.length < 2) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "At least 2 approved participants are required for seeding",
      });
    }

    // --------------------------------------------------------
    // 6. Validate participant type
    // --------------------------------------------------------

    for (const participant of participants) {
      if (competition.competition_type === "individual") {
        if (!participant.player_id || participant.team_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Invalid participant found for individual competition",
          });
        }
      }

      if (competition.competition_type === "team") {
        if (!participant.team_id || participant.player_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Invalid participant found for team competition",
          });
        }
      }
    }

    // --------------------------------------------------------
    // 7. Remove previous unconfirmed seeding
    // --------------------------------------------------------

    await client.query(
      `
      DELETE FROM competition_seeding
      WHERE competition_id = $1
      `,
      [competitionId]
    );

    // --------------------------------------------------------
    // 8. Random shuffle
    // --------------------------------------------------------

    const shuffled = [...participants];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // --------------------------------------------------------
    // 9. Insert seeds
    // --------------------------------------------------------

    for (let i = 0; i < shuffled.length; i++) {
      await client.query(
        `
        INSERT INTO competition_seeding (
          competition_id,
          registration_id,
          seed
        )
        VALUES ($1, $2, $3)
        `,
        [competitionId, shuffled[i].registration_id, i + 1]
      );
    }

    // --------------------------------------------------------
    // 10. Return generated seeding
    // --------------------------------------------------------

    const seedingResult = await client.query(
      `
      SELECT
        cs.id,
        cs.competition_id,
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

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Random seeding generated successfully",
      competition: {
        id: competition.id,
        name: competition.name,
        format: competition.format,
        competition_type: competition.competition_type,
        seeding_method: competition.seeding_method,
        seeding_confirmed: competition.seeding_confirmed,
      },
      count: seedingResult.rows.length,
      seeding: seedingResult.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("generateRandomSeeding error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate random seeding",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// ============================================================
// GET COMPETITION SEEDING
// ============================================================

const getCompetitionSeeding = async (req, res) => {
  try {
    const { competitionId } = req.params;
    const ownerId = req.user.userId;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    const competitionResult = await pool.query(
      `
      SELECT
        id,
        name,
        competition_type,
        format,
        seeding_method,
        seeding_confirmed
      FROM competitions
      WHERE id = $1
        AND created_by = $2
      `,
      [competitionId, ownerId]
    );

    if (competitionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Competition not found or access denied",
      });
    }

    const result = await pool.query(
      `
      SELECT
        cs.id,
        cs.competition_id,
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

    return res.status(200).json({
      success: true,
      competition: competitionResult.rows[0],
      count: result.rows.length,
      seeding: result.rows,
    });
  } catch (error) {
    console.error("getCompetitionSeeding error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get competition seeding",
      error: error.message,
    });
  }
};
// ============================================================
// UPDATE MANUAL SEEDING
// ============================================================

const updateManualSeeding = async (req, res) => {
  const client = await pool.connect();

  try {
    const { competitionId } = req.params;
    const { seeding } = req.body;
    const ownerId = req.user.userId;

    if (!/^\d+$/.test(String(competitionId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    if (!Array.isArray(seeding) || seeding.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Seeding must contain at least 2 participants",
      });
    }

    await client.query("BEGIN");

    // --------------------------------------------------------
    // 1. Verify competition + ownership
    // --------------------------------------------------------

    const competitionResult = await client.query(
      `
      SELECT
        id,
        name,
        competition_type,
        format,
        seeding_method,
        seeding_confirmed
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
    // 2. Validate format
    // --------------------------------------------------------

    if (
      competition.format !== "knockout" &&
      competition.format !== "groups_knockout"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding is only available for knockout competitions",
      });
    }

    // --------------------------------------------------------
    // 3. Manual method only
    // --------------------------------------------------------

    if (competition.seeding_method !== "manual") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Competition seeding method is not manual",
      });
    }

    // --------------------------------------------------------
    // 4. Cannot modify confirmed seeding
    // --------------------------------------------------------

    if (competition.seeding_confirmed) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding has already been confirmed",
      });
    }

    // --------------------------------------------------------
    // 5. Validate payload structure
    // --------------------------------------------------------

    const registrationIds = [];
    const seeds = [];

    for (const item of seeding) {
      const registrationId = Number(item.registration_id);
      const seed = Number(item.seed);

      if (
        !Number.isInteger(registrationId) ||
        registrationId <= 0 ||
        !Number.isInteger(seed) ||
        seed <= 0
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Each seeding item must contain a valid registration_id and seed",
        });
      }

      registrationIds.push(registrationId);
      seeds.push(seed);
    }

    // --------------------------------------------------------
    // 6. Prevent duplicate registrations / seeds
    // --------------------------------------------------------

    if (new Set(registrationIds).size !== registrationIds.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Duplicate registration_id found in seeding",
      });
    }

    if (new Set(seeds).size !== seeds.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Duplicate seed found in seeding",
      });
    }

    // Seeds must be exactly 1..N
    const sortedSeeds = [...seeds].sort((a, b) => a - b);

    for (let i = 0; i < sortedSeeds.length; i++) {
      if (sortedSeeds[i] !== i + 1) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "Seeds must be sequential starting from 1",
        });
      }
    }

    // --------------------------------------------------------
    // 7. Get eligible registrations
    // --------------------------------------------------------

    const registrationsResult = await client.query(
      `
      SELECT
        id,
        player_id,
        team_id,
        status
      FROM competition_registrations
      WHERE competition_id = $1
        AND status IN ('approved', 'paid')
      `,
      [competitionId]
    );

    const registrations = registrationsResult.rows;

    if (registrations.length !== seeding.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Seeding must contain every approved or paid participant exactly once",
        eligible_participants: registrations.length,
        submitted_participants: seeding.length,
      });
    }

    const eligibleIds = new Set(
      registrations.map((registration) => Number(registration.id))
    );

    for (const registrationId of registrationIds) {
      if (!eligibleIds.has(registrationId)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Seeding contains a registration that is not an eligible participant",
          registration_id: registrationId,
        });
      }
    }

    // --------------------------------------------------------
    // 8. Validate participant type
    // --------------------------------------------------------

    for (const registration of registrations) {
      if (competition.competition_type === "individual") {
        if (!registration.player_id || registration.team_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Invalid participant found for individual competition",
          });
        }
      }

      if (competition.competition_type === "team") {
        if (!registration.team_id || registration.player_id) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            success: false,
            message: "Invalid participant found for team competition",
          });
        }
      }
    }

    // --------------------------------------------------------
    // 9. Temporarily move existing seeds
    //
    // Prevent UNIQUE(competition_id, seed) conflicts.
    // --------------------------------------------------------

    await client.query(
      `
      UPDATE competition_seeding
      SET seed = seed + 1000000
      WHERE competition_id = $1
      `,
      [competitionId]
    );

    // --------------------------------------------------------
    // 10. Update manual seeds
    // --------------------------------------------------------

    for (const item of seeding) {
      await client.query(
        `
        UPDATE competition_seeding
        SET seed = $1
        WHERE competition_id = $2
          AND registration_id = $3
        `,
        [
          Number(item.seed),
          competitionId,
          Number(item.registration_id),
        ]
      );
    }

    // --------------------------------------------------------
    // 11. Make sure all participants exist in seeding
    // --------------------------------------------------------

    const finalResult = await client.query(
      `
      SELECT
        cs.id,
        cs.competition_id,
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

    if (finalResult.rows.length !== seeding.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Failed to update complete competition seeding",
      });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Manual seeding updated successfully",
      competition: {
        id: competition.id,
        name: competition.name,
        format: competition.format,
        competition_type: competition.competition_type,
        seeding_method: competition.seeding_method,
        seeding_confirmed: competition.seeding_confirmed,
      },
      count: finalResult.rows.length,
      seeding: finalResult.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("updateManualSeeding error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update manual seeding",
      error: error.message,
    });
  } finally {
    client.release();
  }
};
// ============================================================
// CONFIRM COMPETITION SEEDING
// ============================================================

const confirmCompetitionSeeding = async (req, res) => {
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
    // 1. Verify competition + ownership
    // --------------------------------------------------------

    const competitionResult = await client.query(
      `
        SELECT
          id,
          name,
          competition_type,
          format,
          seeding_method,
          seeding_confirmed
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
    // 2. Validate format
    // --------------------------------------------------------

    if (
      competition.format !== "knockout" &&
      competition.format !== "groups_knockout"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding confirmation is only available for knockout competitions",
      });
    }

    // --------------------------------------------------------
    // 3. Already confirmed
    // --------------------------------------------------------

    if (competition.seeding_confirmed) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Seeding has already been confirmed",
      });
    }

    // --------------------------------------------------------
    // 4. Get current seeding
    // --------------------------------------------------------

    const seedingResult = await client.query(
      `
        SELECT
          cs.id,
          cs.competition_id,
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

    // --------------------------------------------------------
    // 5. Minimum participants
    // --------------------------------------------------------

    if (seeding.length < 2) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "At least 2 participants are required before confirming seeding",
      });
    }

    // --------------------------------------------------------
    // 6. Validate seeds are sequential 1..N
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
    // 7. Validate all participants are still eligible
    // --------------------------------------------------------

    const eligibleResult = await client.query(
      `
        SELECT id
        FROM competition_registrations
        WHERE competition_id = $1
          AND status IN ('approved', 'paid')
      `,
      [competitionId]
    );

    if (eligibleResult.rows.length !== seeding.length) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Seeding cannot be confirmed because the eligible participant count has changed",
        eligible_participants: eligibleResult.rows.length,
        seeded_participants: seeding.length,
      });
    }

    const eligibleIds = new Set(
      eligibleResult.rows.map((row) => Number(row.id))
    );

    for (const participant of seeding) {
      if (!eligibleIds.has(Number(participant.registration_id))) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Seeding contains a participant who is no longer eligible",
          registration_id: participant.registration_id,
        });
      }
    }

    // --------------------------------------------------------
    // 8. Confirm seeding
    // --------------------------------------------------------

    const updateResult = await client.query(
      `
        UPDATE competitions
        SET seeding_confirmed = TRUE
        WHERE id = $1
        RETURNING
          id,
          name,
          competition_type,
          format,
          seeding_method,
          seeding_confirmed
      `,
      [competitionId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Competition seeding confirmed successfully",
      competition: updateResult.rows[0],
      count: seeding.length,
      seeding,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("confirmCompetitionSeeding error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to confirm competition seeding",
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
  generateRandomSeeding,
  getCompetitionSeeding,
  updateManualSeeding,
  confirmCompetitionSeeding,
};