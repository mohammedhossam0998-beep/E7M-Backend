const pool = require("../config/db");
const fs = require("fs");

// ============================================================
// CONFIG
// ============================================================

// Statuses that count as "occupying a slot" in the competition.
// "pending" (awaiting manual approval) does NOT reserve a slot -
// capacity/payment are enforced when the owner actually approves it.
const ACTIVE_SLOT_STATUSES = [
  "approved",
  "payment_pending",
  "paid",
  "registered",
];

const DEFAULT_PAYMENT_WINDOW_MINUTES = 1440;

// ============================================================
// ACCEPT COMPETITION INVITATION
// POST /api/player/competitions/invitations/:invitationId/accept
// ============================================================

const acceptCompetitionInvitation = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const { invitationId } = req.params;

    // ========================================================
    // VALIDATE INVITATION ID
    // ========================================================

    if (!/^\d+$/.test(invitationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invitation ID",
      });
    }

    await client.query("BEGIN");

    // ========================================================
    // GET INVITATION + COMPETITION + TEAM
    // Locks BOTH the invitation row and the competition row so that
    // two invitations being accepted at the same instant can't both
    // read the same "slots remaining" count (race condition fix).
    // ========================================================

    const invitationResult = await client.query(
      `
        SELECT
          ci.id,
          ci.competition_id,
          ci.player_id,
          ci.team_id,
          ci.status,
          ci.expires_at,

          c.approval_mode,
          c.status AS competition_status,
          c.entry_fee,
          c.max_participants,
          c.payment_window_minutes,

          t.captain_id

        FROM competition_invitations ci

        INNER JOIN competitions c
          ON c.id = ci.competition_id

        LEFT JOIN teams t
          ON t.id = ci.team_id

        WHERE ci.id = $1
        FOR UPDATE OF ci, c;
      `,
      [invitationId]
    );

    if (invitationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition invitation not found",
      });
    }

    const invitation = invitationResult.rows[0];

    // ========================================================
    // CHECK INVITATION RECIPIENT
    // ========================================================

    const isPlayerInvitation =
      invitation.player_id !== null &&
      String(invitation.player_id) === String(userId);

    const isTeamCaptain =
      invitation.team_id !== null &&
      invitation.captain_id !== null &&
      String(invitation.captain_id) === String(userId);

    if (!isPlayerInvitation && !isTeamCaptain) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to accept this invitation",
      });
    }

    // ========================================================
    // CHECK STATUS
    // ========================================================

    if (invitation.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          `Invitation is already ${invitation.status}`,
      });
    }

    // ========================================================
    // CHECK EXPIRATION
    // ========================================================

    if (
      invitation.expires_at !== null &&
      new Date(invitation.expires_at) <= new Date()
    ) {
      await client.query(
        `
          UPDATE competition_invitations
          SET
            status = 'expired'
          WHERE id = $1;
        `,
        [invitationId]
      );

      await client.query("COMMIT");

      return res.status(400).json({
        success: false,
        message: "Competition invitation has expired",
      });
    }

    // ========================================================
    // CHECK COMPETITION IS ACTUALLY OPEN FOR REGISTRATION
    // ========================================================

    if (
      invitation.competition_status !== "open" &&
      invitation.competition_status !== "upcoming"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "This competition is not accepting registrations",
      });
    }

    // ========================================================
    // DETERMINE REGISTRATION PARTICIPANT
    // ========================================================

    const playerId = invitation.player_id;
    const teamId = invitation.team_id;

    // ========================================================
    // CHECK EXISTING REGISTRATION
    // ========================================================

    const existingRegistrationResult =
      await client.query(
        `
          SELECT
            id,
            status
          FROM competition_registrations
          WHERE competition_id = $1
            AND (
              ($2::bigint IS NOT NULL AND player_id = $2)
              OR
              ($3::bigint IS NOT NULL AND team_id = $3)
            )
          LIMIT 1;
        `,
        [
          invitation.competition_id,
          playerId,
          teamId,
        ]
      );

    if (
      existingRegistrationResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "Participant is already registered in this competition",
        registration:
          existingRegistrationResult.rows[0],
      });
    }

    // ========================================================
    // CHECK CAPACITY
    // Counts only registrations that actually occupy a slot
    // (approved / payment_pending / paid / registered).
    // Runs AFTER locking the competition row above, so this count
    // is safe even under concurrent accepts.
    // ========================================================

    let capacityAvailable = true;

    if (invitation.max_participants !== null) {
      const activeCountResult =
        await client.query(
          `
            SELECT COUNT(*)::int AS active_count
            FROM competition_registrations
            WHERE competition_id = $1
              AND status = ANY($2::text[]);
          `,
          [
            invitation.competition_id,
            ACTIVE_SLOT_STATUSES,
          ]
        );

      const activeCount =
        activeCountResult.rows[0].active_count;

      capacityAvailable =
        activeCount <
        invitation.max_participants;
    }

    // ========================================================
    // DETERMINE REGISTRATION STATUS
    //
    // - manual approval mode      -> "pending"
    // - auto approval + free      -> "approved"
    // - auto approval + paid      -> "payment_pending"
    // - auto approval + full      -> "waitlisted"
    // ========================================================

    const entryFee =
      Number(invitation.entry_fee) || 0;

    let registrationStatus;
    let slotLockedAt = null;
    let paymentDeadline = null;

    if (invitation.approval_mode === "auto") {
      if (!capacityAvailable) {
        registrationStatus = "waitlisted";
      } else if (entryFee > 0) {
        registrationStatus = "payment_pending";
        slotLockedAt = new Date();

        const windowMinutes =
          invitation.payment_window_minutes ||
          DEFAULT_PAYMENT_WINDOW_MINUTES;

        paymentDeadline = new Date(
          Date.now() +
            windowMinutes * 60 * 1000
        );
      } else {
        registrationStatus = "approved";
      }
    } else {
      registrationStatus = "pending";
    }

    // ========================================================
    // CREATE COMPETITION REGISTRATION
    // ========================================================

    const registrationResult =
      await client.query(
        `
          INSERT INTO competition_registrations (
            competition_id,
            team_id,
            player_id,
            status,
            slot_locked_at,
            payment_deadline
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING
            id,
            competition_id,
            team_id,
            player_id,
            status,
            slot_locked_at,
            payment_deadline,
            registered_at,
            reviewed_at,
            reviewed_by,
            waitlist_position,
            cancelled_at;
        `,
        [
          invitation.competition_id,
          teamId,
          playerId,
          registrationStatus,
          slotLockedAt,
          paymentDeadline,
        ]
      );

    // ========================================================
    // UPDATE INVITATION
    // ========================================================

    const updatedInvitationResult =
      await client.query(
        `
          UPDATE competition_invitations
          SET
            status = 'accepted',
            responded_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING
            id,
            competition_id,
            player_id,
            team_id,
            status,
            expires_at,
            responded_at,
            created_at;
        `,
        [invitationId]
      );

    await client.query("COMMIT");

    let message =
      "Competition invitation accepted successfully";

    if (
      registrationStatus ===
      "payment_pending"
    ) {
      message =
        "Invitation accepted. Payment is required to confirm your spot.";
    } else if (
      registrationStatus ===
      "waitlisted"
    ) {
      message =
        "Invitation accepted. Competition is full, you've been waitlisted.";
    }

    return res.status(200).json({
      success: true,
      message,
      invitation:
        updatedInvitationResult.rows[0],
      registration:
        registrationResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Accept competition invitation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to accept competition invitation",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// REJECT COMPETITION INVITATION
// POST /api/player/competitions/invitations/:invitationId/reject
// ============================================================

const rejectCompetitionInvitation = async (
  req,
  res
) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const { invitationId } = req.params;

    // ========================================================
    // VALIDATE INVITATION ID
    // ========================================================

    if (!/^\d+$/.test(invitationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invitation ID",
      });
    }

    await client.query("BEGIN");

    // ========================================================
    // GET INVITATION + COMPETITION + TEAM
    // ========================================================

    const invitationResult =
      await client.query(
        `
          SELECT
            ci.id,
            ci.competition_id,
            ci.player_id,
            ci.team_id,
            ci.status,
            ci.expires_at,

            c.approval_mode,
            c.status AS competition_status,

            t.captain_id

          FROM competition_invitations ci

          INNER JOIN competitions c
            ON c.id = ci.competition_id

          LEFT JOIN teams t
            ON t.id = ci.team_id

          WHERE ci.id = $1
          FOR UPDATE OF ci;
        `,
        [invitationId]
      );

    if (
      invitationResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message:
          "Competition invitation not found",
      });
    }

    const invitation =
      invitationResult.rows[0];

    // ========================================================
    // CHECK INVITATION RECIPIENT
    // ========================================================

    const isPlayerInvitation =
      invitation.player_id !== null &&
      String(invitation.player_id) ===
        String(userId);

    const isTeamCaptain =
      invitation.team_id !== null &&
      invitation.captain_id !== null &&
      String(invitation.captain_id) ===
        String(userId);

    if (
      !isPlayerInvitation &&
      !isTeamCaptain
    ) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to reject this invitation",
      });
    }

    // ========================================================
    // CHECK STATUS
    // ========================================================

    if (invitation.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          `Invitation is already ${invitation.status}`,
      });
    }

    // ========================================================
    // CHECK EXPIRATION
    // ========================================================

    if (
      invitation.expires_at !== null &&
      new Date(invitation.expires_at) <= new Date()
    ) {
      await client.query(
        `
          UPDATE competition_invitations
          SET
            status = 'expired'
          WHERE id = $1;
        `,
        [invitationId]
      );

      await client.query("COMMIT");

      return res.status(400).json({
        success: false,
        message:
          "Competition invitation has expired",
      });
    }

    // ========================================================
    // UPDATE INVITATION
    // ========================================================

    const updatedInvitationResult =
      await client.query(
        `
          UPDATE competition_invitations
          SET
            status = 'rejected',
            responded_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING
            id,
            competition_id,
            player_id,
            team_id,
            status,
            expires_at,
            responded_at,
            created_at;
        `,
        [invitationId]
      );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message:
        "Competition invitation rejected successfully",
      invitation:
        updatedInvitationResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "Reject competition invitation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to reject competition invitation",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// SUBMIT COMPETITION PAYMENT
// POST /api/player/competitions/registrations/:registrationId/payment
// ============================================================

const submitCompetitionPayment = async (
  req,
  res
) => {
  const client = await pool.connect();

  let uploadedFilePath = null;

  try {
    const userId = req.user.userId;
    const { registrationId } = req.params;

    // ========================================================
    // VALIDATE REGISTRATION ID
    // ========================================================

    if (!/^\d+$/.test(registrationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID",
      });
    }

    // ========================================================
    // FILE CHECK
    // ========================================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Payment proof is required",
      });
    }

    uploadedFilePath = req.file.path;

    // ========================================================
    // REQUEST BODY
    // ========================================================

    const {
      owner_payment_account_id,
      transaction_reference,
    } = req.body || {};

    // ========================================================
    // VALIDATE PAYMENT ACCOUNT ID
    // ========================================================

    if (
      !owner_payment_account_id ||
      !/^\d+$/.test(
        String(owner_payment_account_id)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid owner payment account ID is required",
      });
    }

    // ========================================================
    // VALIDATE TRANSACTION REFERENCE
    // ========================================================

    if (
      typeof transaction_reference !==
        "string" ||
      transaction_reference.trim().length < 3
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Transaction reference is required",
      });
    }

    const cleanTransactionReference =
      transaction_reference.trim();

    await client.query("BEGIN");

    // ========================================================
    // GET REGISTRATION + COMPETITION + TEAM
    // ========================================================

    const registrationResult =
      await client.query(
        `
          SELECT
            cr.id,
            cr.competition_id,
            cr.team_id,
            cr.player_id,
            cr.status,
            cr.payment_deadline,
            cr.slot_locked_at,

            c.name AS competition_name,
            c.entry_fee,
            c.status AS competition_status,
            c.competition_type,
            c.created_by,

            t.captain_id

          FROM competition_registrations cr

          INNER JOIN competitions c
            ON c.id = cr.competition_id

          LEFT JOIN teams t
            ON t.id = cr.team_id

          WHERE cr.id = $1
          FOR UPDATE OF cr;
        `,
        [registrationId]
      );

    // ========================================================
    // REGISTRATION NOT FOUND
    // ========================================================

    if (
      registrationResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message:
          "Competition registration not found",
      });
    }

    const registration =
      registrationResult.rows[0];

    // ========================================================
    // CHECK PARTICIPANT AUTHORIZATION
    // ========================================================

    const isIndividualPlayer =
      registration.player_id !== null &&
      String(registration.player_id) ===
        String(userId);

    const isTeamCaptain =
      registration.team_id !== null &&
      registration.captain_id !== null &&
      String(registration.captain_id) ===
        String(userId);

    if (
      !isIndividualPlayer &&
      !isTeamCaptain
    ) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message:
          "Only the registered player or team captain can submit payment",
      });
    }

    // ========================================================
    // CHECK REGISTRATION STATUS
    // ========================================================

    if (
      registration.status !==
      "payment_pending"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          `Registration is not awaiting payment. Current status: ${registration.status}`,
      });
    }

    // ========================================================
    // CHECK COMPETITION STATUS
    // ========================================================

    if (
      registration.competition_status ===
      "cancelled"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Competition has been cancelled",
      });
    }

    if (
      registration.competition_status !==
        "open" &&
      registration.competition_status !==
        "upcoming"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Competition is not accepting payments",
      });
    }

    // ========================================================
    // CHECK ENTRY FEE
    // ========================================================

    const entryFee =
      Number(registration.entry_fee);

    if (
      !Number.isFinite(entryFee) ||
      entryFee <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "This competition does not require payment",
      });
    }

    // ========================================================
    // CHECK PAYMENT DEADLINE
    // ========================================================

    if (
      registration.payment_deadline !==
        null &&
      new Date(
        registration.payment_deadline
      ) <= new Date()
    ) {
      const submittedPaymentResult =
        await client.query(
          `
            SELECT 1
            FROM competition_payments
            WHERE registration_id = $1
              AND status = 'submitted'
            LIMIT 1;
          `,
          [registrationId]
        );

      if (
        submittedPaymentResult.rows.length >
        0
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message:
            "A payment proof has already been submitted for this registration",
        });
      }

      await client.query(
        `
          UPDATE competition_registrations
          SET
            status = 'expired',
            slot_locked_at = NULL
          WHERE id = $1;
        `,
        [registrationId]
      );

      await client.query("COMMIT");

      return res.status(400).json({
        success: false,
        message:
          "Payment deadline has expired",
      });
    }

    // ========================================================
    // GET OWNER
    // ========================================================

    const ownerResult =
      await client.query(
        `
          SELECT
            o.id AS owner_id
          FROM owners o
          WHERE o.user_id = $1
          LIMIT 1;
        `,
        [registration.created_by]
      );

    if (ownerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(500).json({
        success: false,
        message:
          "Competition owner account not found",
      });
    }

    const ownerId =
      ownerResult.rows[0].owner_id;

    // ========================================================
    // CHECK PAYMENT ACCOUNT
    // ========================================================

    const paymentAccountResult =
      await client.query(
        `
          SELECT
            id,
            owner_id,
            payment_method,
            account_name,
            account_identifier,
            is_active
          FROM owner_payment_accounts
          WHERE id = $1
            AND owner_id = $2
            AND is_active = true
          LIMIT 1
          FOR SHARE;
        `,
        [
          owner_payment_account_id,
          ownerId,
        ]
      );

    if (
      paymentAccountResult.rows.length ===
      0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Selected payment account is not available for this competition",
      });
    }

    const paymentAccount =
      paymentAccountResult.rows[0];

    // ========================================================
    // CHECK EXISTING ACTIVE PAYMENT
    // ========================================================

    const existingPaymentResult =
      await client.query(
        `
          SELECT
            id,
            status
          FROM competition_payments
          WHERE registration_id = $1
            AND status IN (
              'pending',
              'submitted'
            )
          LIMIT 1
          FOR UPDATE;
        `,
        [registrationId]
      );

    if (
      existingPaymentResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "There is already an active payment for this registration",
        payment:
          existingPaymentResult.rows[0],
      });
    }

    // ========================================================
    // PAYMENT PROOF URL
    // ========================================================

    const proofImageUrl =
      `/uploads/competition-payments/${req.file.filename}`;

    // ========================================================
    // CREATE PAYMENT
    // ========================================================

    const paymentResult =
      await client.query(
        `
          INSERT INTO competition_payments (
            registration_id,
            competition_id,
            amount,
            payment_method,
            owner_payment_account_id,
            transaction_reference,
            proof_image_url,
            status,
            submitted_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'submitted',
            CURRENT_TIMESTAMP
          )
          RETURNING
            id,
            registration_id,
            competition_id,
            amount,
            payment_method,
            owner_payment_account_id,
            transaction_reference,
            proof_image_url,
            status,
            submitted_at,
            created_at;
        `,
        [
          registration.id,
          registration.competition_id,
          entryFee,
          paymentAccount.payment_method,
          paymentAccount.id,
          cleanTransactionReference,
          proofImageUrl,
        ]
      );

    // ========================================================
    // UPDATE REGISTRATION AFTER PAYMENT SUBMISSION
    // ========================================================

    const updatedRegistrationResult =
      await client.query(
        `
          UPDATE competition_registrations
          SET
            status = 'payment_pending'
          WHERE id = $1
          RETURNING
            id,
            competition_id,
            team_id,
            player_id,
            status,
            slot_locked_at,
            payment_deadline,
            registered_at,
            reviewed_at,
            reviewed_by,
            waitlist_position,
            cancelled_at;
        `,
        [registration.id]
      );

    // ========================================================
    // COMMIT
    // ========================================================

    await client.query("COMMIT");

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,
      message:
        "Competition payment submitted successfully",
      payment:
        paymentResult.rows[0],
      registration:
        updatedRegistrationResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Competition payment rollback error:",
        rollbackError
      );
    }

    // ========================================================
    // DELETE UPLOADED FILE IF DB FAILED
    // ========================================================

    if (uploadedFilePath) {
      try {
        if (
          fs.existsSync(uploadedFilePath)
        ) {
          fs.unlinkSync(uploadedFilePath);
        }
      } catch (fileError) {
        console.error(
          "Failed to delete uploaded payment proof:",
          fileError
        );
      }
    }

    console.error(
      "Submit competition payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to submit competition payment",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// RELEASE EXPIRED PAYMENT SLOTS
// Not an HTTP route - call this periodically from a scheduled job
// ============================================================

const releaseExpiredCompetitionSlots =
  async () => {
    const client = await pool.connect();

    try {
      const result = await client.query(
        `
          UPDATE competition_registrations cr
          SET
            status = 'expired',
            slot_locked_at = NULL
          WHERE cr.status = 'payment_pending'
            AND cr.payment_deadline IS NOT NULL
            AND cr.payment_deadline <= CURRENT_TIMESTAMP
            AND NOT EXISTS (
              SELECT 1
              FROM competition_payments cp
              WHERE cp.registration_id =
                    cr.id
                AND cp.status = 'submitted'
            )
          RETURNING
            cr.id,
            cr.competition_id;
        `
      );

      if (result.rows.length > 0) {
        console.log(
          `Released ${result.rows.length} expired competition slot(s):`,
          result.rows.map((r) => r.id)
        );
      }

      return result.rows;
    } catch (error) {
      console.error(
        "Release expired competition slots error:",
        error
      );

      return [];
    } finally {
      client.release();
    }
  };

// ============================================================
// REGISTER PLAYER / TEAM FOR COMPETITION
// POST /api/player/competitions/:competitionId/register
//
// Individual Competition:
// {
//   "team_id": null
// }
//
// Team Competition:
// {
//   "team_id": 1
// }
// ============================================================

const registerForCompetition = async (
  req,
  res
) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const { competitionId } = req.params;

    // ========================================================
    // REQUEST BODY
    // ========================================================

    const {
      team_id: requestedTeamId,
    } = req.body || {};

    // ========================================================
    // VALIDATE COMPETITION ID
    // ========================================================

    if (
      !/^\d+$/.test(
        String(competitionId)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid competition ID",
      });
    }

    // ========================================================
    // VALIDATE TEAM ID IF PROVIDED
    // ========================================================

    let teamId = null;

    if (
      requestedTeamId !== undefined &&
      requestedTeamId !== null &&
      requestedTeamId !== ""
    ) {
      if (
        !/^\d+$/.test(
          String(requestedTeamId)
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid team ID",
        });
      }

      teamId = Number(requestedTeamId);
    }

    await client.query("BEGIN");

    // ========================================================
    // GET PLAYER PROFILE
    // ========================================================

    const playerResult =
      await client.query(
        `
          SELECT user_id
          FROM player_profiles
          WHERE user_id = $1
          LIMIT 1
          FOR SHARE;
        `,
        [userId]
      );

    if (playerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message:
          "Player profile not found",
      });
    }

    const playerId =
      playerResult.rows[0].user_id;

    // ========================================================
    // LOCK COMPETITION
    // ========================================================

    const competitionResult =
      await client.query(
        `
          SELECT
            id,
            name,
            status,
            entry_fee,
            max_participants,
            registration_start_date,
            registration_deadline,
            approval_mode,
            payment_window_minutes,
            competition_type,
            min_players_per_team,
            max_players_per_team,
            waiting_list_enabled
          FROM competitions
          WHERE id = $1
          FOR UPDATE;
        `,
        [competitionId]
      );

    if (
      competitionResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message:
          "Competition not found",
      });
    }

    const competition =
      competitionResult.rows[0];

    // ========================================================
    // CHECK COMPETITION TYPE
    // ========================================================

    if (
      competition.competition_type ===
      "individual"
    ) {
      if (teamId !== null) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "This is an individual competition. Team registration is not allowed.",
        });
      }
    }

    if (
      competition.competition_type ===
      "team"
    ) {
      if (teamId === null) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "A team is required for this competition.",
        });
      }
    }

    // ========================================================
    // CHECK COMPETITION STATUS
    // ========================================================

    if (
      competition.status !== "open" &&
      competition.status !== "upcoming"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "This competition is not accepting registrations",
      });
    }

    // ========================================================
    // CHECK REGISTRATION START
    // ========================================================

    if (
      competition.registration_start_date &&
      new Date(
        competition.registration_start_date
      ) > new Date()
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Competition registration has not started yet",
      });
    }

    // ========================================================
    // CHECK REGISTRATION DEADLINE
    // ========================================================

    if (
      competition.registration_deadline &&
      new Date(
        competition.registration_deadline
      ) <= new Date()
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Competition registration deadline has passed",
      });
    }

    // ========================================================
    // TEAM VALIDATION
    // ========================================================

    if (teamId !== null) {
      // ------------------------------------------------------
      // LOCK TEAM ROW
      // ------------------------------------------------------

      const teamResult = await client.query(
        `
          SELECT
            t.id,
            t.name,
            t.captain_id
          FROM teams t
          WHERE t.id = $1
          FOR UPDATE;
        `,
        [teamId]
      );

      if (teamResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Team not found",
        });
      }

      const team = teamResult.rows[0];

      // ======================================================
      // CHECK TEAM CAPTAIN
      // ======================================================

      if (
        String(team.captain_id) !==
        String(userId)
      ) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          success: false,
          message:
            "Only the team captain can register the team for a competition",
        });
      }

      // ------------------------------------------------------
      // COUNT TEAM MEMBERS
      // ------------------------------------------------------

      const membersCountResult =
        await client.query(
          `
            SELECT COUNT(*)::int AS members_count
            FROM team_members
            WHERE team_id = $1;
          `,
          [teamId]
        );

      const membersCount =
        Number(
          membersCountResult.rows[0].members_count
        );

      // ======================================================
      // CHECK MIN PLAYERS PER TEAM
      // ======================================================

      if (
        competition.min_players_per_team !==
          null &&
        membersCount <
          Number(
            competition.min_players_per_team
          )
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            `Team must have at least ${competition.min_players_per_team} players`,
          team: {
            id: team.id,
            name: team.name,
            members_count: membersCount,
            min_players_required:
              Number(
                competition.min_players_per_team
              ),
          },
        });
      }

      // ======================================================
      // CHECK MAX PLAYERS PER TEAM
      // ======================================================

      if (
        competition.max_players_per_team !==
          null &&
        membersCount >
          Number(
            competition.max_players_per_team
          )
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            `Team cannot have more than ${competition.max_players_per_team} players`,
          team: {
            id: team.id,
            name: team.name,
            members_count: membersCount,
            max_players_allowed:
              Number(
                competition.max_players_per_team
              ),
          },
        });
      }
    }

    // ========================================================
    // CHECK EXISTING REGISTRATION
    // ========================================================

    const existingResult =
      await client.query(
        `
          SELECT
            id,
            competition_id,
            team_id,
            player_id,
            status,
            registered_at
          FROM competition_registrations
          WHERE competition_id = $1
            AND (
              (
                $2::bigint IS NOT NULL
                AND team_id = $2
              )
              OR
              (
                $3::bigint IS NOT NULL
                AND player_id = $3
              )
            )
            AND status NOT IN (
              'expired',
              'cancelled',
              'rejected'
            )
          LIMIT 1;
        `,
        [
          competitionId,
          teamId,
          teamId === null
            ? playerId
            : null,
        ]
      );

    if (
      existingResult.rows.length > 0
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          teamId !== null
            ? "Team is already registered in this competition"
            : "Player is already registered in this competition",
        registration:
          existingResult.rows[0],
      });
    }

    // ========================================================
    // CHECK CAPACITY
    // ========================================================

    if (
      competition.max_participants !==
      null
    ) {
      const activeCountResult =
        await client.query(
          `
            SELECT COUNT(*)::int AS active_count
            FROM competition_registrations
            WHERE competition_id = $1
              AND status = ANY($2::text[]);
          `,
          [
            competitionId,
            ACTIVE_SLOT_STATUSES,
          ]
        );

      const activeCount =
        activeCountResult.rows[0]
          .active_count;

      if (
        activeCount >=
        competition.max_participants
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Competition is full",
        });
      }
    }

    // ========================================================
    // DETERMINE REGISTRATION
    // ========================================================

    const entryFee =
      Number(competition.entry_fee) || 0;

    let registrationStatus =
      "pending";

    let slotLockedAt = null;
    let paymentDeadline = null;

    // ========================================================
    // AUTO APPROVAL
    // ========================================================

    if (
      competition.approval_mode ===
      "auto"
    ) {
      // ------------------------------------------------------
      // PAID
      // ------------------------------------------------------

      if (entryFee > 0) {
        registrationStatus =
          "payment_pending";

        slotLockedAt = new Date();

        const configuredWindowMinutes =
          Number(
            competition.payment_window_minutes
          );

        const windowMinutes =
          Number.isInteger(
            configuredWindowMinutes
          ) &&
          configuredWindowMinutes > 0
            ? configuredWindowMinutes
            : DEFAULT_PAYMENT_WINDOW_MINUTES;

        paymentDeadline =
          new Date(
            Date.now() +
              windowMinutes *
                60 *
                1000
          );
      }

      // ------------------------------------------------------
      // FREE
      // ------------------------------------------------------

      else {
        registrationStatus =
          "approved";
      }
    }

    // ========================================================
    // MANUAL APPROVAL
    // ========================================================

    else {
      registrationStatus =
        "pending";
    }

    // ========================================================
    // CREATE REGISTRATION
    // ========================================================

    const registrationResult =
      await client.query(
        `
          INSERT INTO competition_registrations (
            competition_id,
            team_id,
            player_id,
            status,
            slot_locked_at,
            payment_deadline
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING
            id,
            competition_id,
            team_id,
            player_id,
            status,
            slot_locked_at,
            payment_deadline,
            registered_at;
        `,
        [
          competitionId,
          teamId,
          teamId === null
            ? playerId
            : null,
          registrationStatus,
          slotLockedAt,
          paymentDeadline,
        ]
      );

    // ========================================================
    // COMMIT
    // ========================================================

    await client.query("COMMIT");

    // ========================================================
    // RESPONSE MESSAGE
    // ========================================================

    let message =
      teamId !== null
        ? "Team successfully registered for competition"
        : "Successfully registered for competition";

    if (
      registrationStatus ===
      "payment_pending"
    ) {
      message =
        teamId !== null
          ? "Team registration created. Payment is required to confirm the team's spot."
          : "Registration created. Payment is required to confirm your spot.";
    }

    if (
      registrationStatus ===
      "pending"
    ) {
      message =
        teamId !== null
          ? "Team registration submitted and is waiting for owner approval."
          : "Registration submitted and is waiting for owner approval.";
    }

    // ========================================================
    // SUCCESS RESPONSE
    // ========================================================

    return res.status(201).json({
      success: true,
      message,

      competition: {
        id: competition.id,
        name: competition.name,
        competition_type:
          competition.competition_type,
        entry_fee:
          competition.entry_fee,
      },

      participant: {
        type:
          teamId !== null
            ? "team"
            : "player",

        team_id: teamId,
        player_id:
          teamId === null
            ? playerId
            : null,
      },

      registration:
        registrationResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Register competition rollback error:",
        rollbackError
      );
    }

    console.error(
      "Register for competition error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to register for competition",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// GET COMPETITION PAYMENT ACCOUNTS
// GET /api/player/competitions/:competitionId/payment-accounts
// ============================================================

const getCompetitionPaymentAccounts =
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { competitionId } =
        req.params;

      // ========================================================
      // VALIDATE COMPETITION ID
      // ========================================================

      if (
        !/^\d+$/.test(
          String(competitionId)
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid competition ID",
        });
      }

      // ========================================================
      // GET COMPETITION OWNER
      // ========================================================

      const competitionResult =
        await pool.query(
          `
            SELECT
              c.id,
              c.created_by
            FROM competitions c
            WHERE c.id = $1
            LIMIT 1;
          `,
          [competitionId]
        );

      if (
        competitionResult.rows.length ===
        0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Competition not found",
        });
      }

      const competition =
        competitionResult.rows[0];

      // ========================================================
      // VERIFY PLAYER PROFILE
      // ========================================================

      const playerResult =
        await pool.query(
          `
            SELECT user_id
            FROM player_profiles
            WHERE user_id = $1
            LIMIT 1;
          `,
          [userId]
        );

      if (
        playerResult.rows.length === 0
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Player profile not found",
        });
      }

      // ========================================================
      // GET OWNER
      // ========================================================

      const ownerResult =
        await pool.query(
          `
            SELECT
              o.id AS owner_id
            FROM owners o
            WHERE o.user_id = $1
              AND o.is_deleted = false
            LIMIT 1;
          `,
          [competition.created_by]
        );

      if (
        ownerResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Competition owner not found",
        });
      }

      const ownerId =
        ownerResult.rows[0].owner_id;

      // ========================================================
      // GET ACTIVE PAYMENT ACCOUNTS
      // ========================================================

      const paymentAccountsResult =
        await pool.query(
          `
            SELECT
              id,
              owner_id,
              payment_method,
              account_name,
              account_identifier,
              is_active,
              created_at,
              updated_at
            FROM owner_payment_accounts
            WHERE owner_id = $1
              AND is_active = true
            ORDER BY
              CASE
                WHEN payment_method = 'instapay'
                  THEN 1
                WHEN payment_method = 'wallet'
                  THEN 2
                ELSE 3
              END,
              id ASC;
          `,
          [ownerId]
        );

      // ========================================================
      // RESPONSE
      // ========================================================

      return res.status(200).json({
        success: true,
        competition_id:
          Number(competitionId),
        owner_id: ownerId,
        count:
          paymentAccountsResult.rows.length,
        accounts:
          paymentAccountsResult.rows,
      });
    } catch (error) {
      console.error(
        "GET COMPETITION PAYMENT ACCOUNTS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to get competition payment accounts",
      });
    }
  };

// ============================================================
// GET AVAILABLE PLAYER COMPETITIONS
// GET /api/player/competitions
// ============================================================

const getPlayerCompetitions = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;

    // ========================================================
    // VERIFY PLAYER PROFILE
    // ========================================================

    const playerResult =
      await pool.query(
        `
          SELECT user_id
          FROM player_profiles
          WHERE user_id = $1
          LIMIT 1;
        `,
        [userId]
      );

    if (playerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Player profile not found",
      });
    }

    const playerId =
      playerResult.rows[0].user_id;

    // ========================================================
    // BUILD DYNAMIC FILTERS
    // ?search=... / ?location=... / ?date=YYYY-MM-DD
    // ?competition_type=individual|team
    // ?price=free|paid
    // ?status=available|upcoming|all
    // ========================================================

    const {
      search,
      location,
      date,
      competition_type,
      price,
      status,
    } = req.query;

    const params = [playerId, ACTIVE_SLOT_STATUSES];
    const filterClauses = [];

    if (search) {
      params.push(`%${search}%`);
      filterClauses.push(
        `c.name ILIKE $${params.length}`
      );
    }

    if (location) {
      params.push(`%${location}%`);
      filterClauses.push(
        `c.location ILIKE $${params.length}`
      );
    }

    if (date) {
      params.push(date);
      filterClauses.push(
        `c.start_date >= $${params.length}::date
         AND c.start_date < ($${params.length}::date + INTERVAL '1 day')`
      );
    }

    if (
      competition_type === "individual" ||
      competition_type === "team"
    ) {
      params.push(competition_type);
      filterClauses.push(
        `c.competition_type = $${params.length}`
      );
    }

    if (price === "free") {
      filterClauses.push(
        `(c.entry_fee IS NULL OR c.entry_fee = 0)`
      );
    } else if (price === "paid") {
      filterClauses.push(
        `(c.entry_fee IS NOT NULL AND c.entry_fee > 0)`
      );
    }

    // ========================================================
    // STATUS FILTER
    // - available (default): open/upcoming AND inside the
    //   registration window
    // - upcoming: status = 'upcoming' only
    // - all: no status restriction beyond visibility
    // ========================================================

    let statusClause = `
          AND c.status IN ('open', 'upcoming')
          AND (
            c.registration_start_date IS NULL
            OR c.registration_start_date <= CURRENT_TIMESTAMP
          )
          AND (
            c.registration_deadline IS NULL
            OR c.registration_deadline > CURRENT_TIMESTAMP
          )
    `;

    if (status === "upcoming") {
      statusClause = `AND c.status = 'upcoming'`;
    } else if (status === "all") {
      statusClause = "";
    }

    const extraFilters =
      filterClauses.length > 0
        ? `AND ${filterClauses.join(" AND ")}`
        : "";

    // ========================================================
    // GET PUBLIC COMPETITIONS AVAILABLE
    // ========================================================

    const result = await pool.query(
      `
        SELECT
          c.*,

          -- ==================================================
          -- REAL CURRENT PARTICIPANTS
          -- Only statuses that actually occupy a slot
          -- ==================================================
          (
            SELECT COUNT(*)::int
            FROM competition_registrations cr_count
            WHERE cr_count.competition_id = c.id
              AND cr_count.status = ANY($2::text[])
          ) AS current_participants,

          -- ==================================================
          -- CURRENT PLAYER REGISTRATION
          -- ==================================================
          cr.id AS registration_id,
          cr.status AS registration_status,
          cr.payment_deadline,
          cr.slot_locked_at,
          cr.registered_at

        FROM competitions c

        LEFT JOIN competition_registrations cr
          ON cr.competition_id = c.id
          AND cr.player_id = $1
          AND cr.status NOT IN (
            'expired',
            'cancelled',
            'rejected'
          )

        WHERE c.visibility = 'public'

          ${statusClause}

          ${extraFilters}

        ORDER BY
          c.start_date ASC,
          c.created_at DESC;
      `,
      params
    );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      competitions: result.rows,
    });
  } catch (error) {
    console.error(
      "GET PLAYER COMPETITIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get player competitions",
    });
  }
};
// ============================================================
// CANCEL COMPETITION REGISTRATION
// PATCH /api/player/competitions/registrations/:registrationId/cancel
// ============================================================

const cancelCompetitionRegistration = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const { registrationId } = req.params;

    // ========================================================
    // VALIDATE REGISTRATION ID
    // ========================================================

    if (!/^\d+$/.test(String(registrationId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration ID",
      });
    }

    await client.query("BEGIN");

    // ========================================================
    // GET REGISTRATION
    // ========================================================

    const registrationResult = await client.query(
      `
        SELECT
          cr.id,
          cr.competition_id,
          cr.player_id,
          cr.team_id,
          cr.status,
          cr.payment_deadline,
          cr.slot_locked_at,
          cr.registered_at,

          c.name AS competition_name,
          c.status AS competition_status,
          c.start_date,
          c.entry_fee

        FROM competition_registrations cr

        INNER JOIN competitions c
          ON c.id = cr.competition_id

        WHERE cr.id = $1

        FOR UPDATE OF cr;
      `,
      [registrationId]
    );

    // ========================================================
    // REGISTRATION NOT FOUND
    // ========================================================

    if (registrationResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition registration not found",
      });
    }

    const registration = registrationResult.rows[0];

    // ========================================================
    // CHECK PLAYER AUTHORIZATION
    // ========================================================

    if (
      registration.player_id === null ||
      String(registration.player_id) !== String(userId)
    ) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to cancel this registration",
      });
    }

    // ========================================================
    // CHECK REGISTRATION STATUS
    // ========================================================

    const cancellableStatuses = [
      "pending",
      "payment_pending",
      "approved",
    ];

    if (!cancellableStatuses.includes(registration.status)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          `Registration cannot be cancelled while its status is ${registration.status}`,
      });
    }

    // ========================================================
    // CHECK FOR ACTIVE / SUBMITTED PAYMENT
    // ========================================================

    const activePaymentResult = await client.query(
      `
        SELECT
          id,
          status
        FROM competition_payments
        WHERE registration_id = $1
          AND status IN (
            'pending',
            'submitted',
            'paid'
          )
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE;
      `,
      [registrationId]
    );

    if (activePaymentResult.rows.length > 0) {
      const payment = activePaymentResult.rows[0];

      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "This registration has an active payment and cannot be cancelled",
        payment: payment,
      });
    }

    // ========================================================
    // CHECK COMPETITION START DATE
    // ========================================================

    if (
      registration.start_date !== null &&
      new Date(registration.start_date) <= new Date()
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Competition has already started and registration cannot be cancelled",
      });
    }

    // ========================================================
    // CANCEL REGISTRATION
    // ========================================================

    const updatedRegistrationResult = await client.query(
      `
        UPDATE competition_registrations
        SET
          status = 'cancelled',
          slot_locked_at = NULL,
          cancelled_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          competition_id,
          team_id,
          player_id,
          status,
          slot_locked_at,
          payment_deadline,
          registered_at,
          reviewed_at,
          reviewed_by,
          waitlist_position,
          cancelled_at;
      `,
      [registrationId]
    );

    await client.query("COMMIT");

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      message:
        "Competition registration cancelled successfully",
      registration:
        updatedRegistrationResult.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Cancel competition registration rollback error:",
        rollbackError
      );
    }

    console.error(
      "Cancel competition registration error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to cancel competition registration",
    });
  } finally {
    client.release();
  }
};
// ============================================================
// GET PLAYER'S MY COMPETITIONS
// GET /api/player/competitions/my
//
// Returns competitions the player is registered in, either
// directly (player_id) or through a team they captain
// (team_id + teams.captain_id).
// ============================================================

const getPlayerMyCompetitions = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;

    // ========================================================
    // VERIFY PLAYER PROFILE
    // ========================================================

    const playerResult =
      await pool.query(
        `
          SELECT user_id
          FROM player_profiles
          WHERE user_id = $1
          LIMIT 1;
        `,
        [userId]
      );

    if (playerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Player profile not found",
      });
    }

    const playerId =
      playerResult.rows[0].user_id;

    // ========================================================
    // GET REGISTRATIONS (DIRECT OR VIA CAPTAINED TEAM)
    // ========================================================

    const result = await pool.query(
      `
        SELECT
          cr.id AS registration_id,
          cr.competition_id,
          cr.player_id,
          cr.team_id,
          cr.status AS registration_status,
          cr.payment_deadline,
          cr.slot_locked_at,
          cr.registered_at,
          cr.reviewed_at,
          cr.reviewed_by,
          cr.waitlist_position,
          cr.cancelled_at,

          c.name AS competition_name,
          c.status AS competition_status,
          c.competition_type,
          c.entry_fee,
          c.start_date,
          c.max_participants,

          (
            SELECT COUNT(*)::int
            FROM competition_registrations cr_count
            WHERE cr_count.competition_id = c.id
              AND cr_count.status = ANY($2::text[])
          ) AS current_participants

        FROM competition_registrations cr

        INNER JOIN competitions c
          ON c.id = cr.competition_id

        LEFT JOIN teams t
          ON t.id = cr.team_id

        WHERE
          cr.player_id = $1
          OR t.captain_id = $1

        ORDER BY
          c.start_date ASC,
          cr.registered_at DESC;
      `,
      [
        playerId,
        ACTIVE_SLOT_STATUSES,
      ]
    );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      competitions: result.rows,
    });
  } catch (error) {
    console.error(
      "GET PLAYER MY COMPETITIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get player's competitions",
    });
  }
};

// ============================================================
// GET PLAYER COMPETITION INVITATIONS
// GET /api/player/competitions/invitations
// Optional: ?status=pending|accepted|rejected|expired|all
//
// Returns invitations sent directly to the player, or to a
// team the player captains.
// ============================================================

const getPlayerCompetitionInvitations = async (
  req,
  res
) => {
  try {
    const userId = req.user.userId;
    const { status } = req.query;

    // ========================================================
    // VERIFY PLAYER PROFILE
    // ========================================================

    const playerResult =
      await pool.query(
        `
          SELECT user_id
          FROM player_profiles
          WHERE user_id = $1
          LIMIT 1;
        `,
        [userId]
      );

    if (playerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Player profile not found",
      });
    }

    const playerId =
      playerResult.rows[0].user_id;

    // ========================================================
    // BUILD STATUS FILTER
    // Defaults to "pending" when not provided; "all" removes
    // the restriction entirely.
    // ========================================================

    const params = [playerId];
    let statusClause = `AND ci.status = 'pending'`;

    if (status && status !== "all") {
      params.push(status);
      statusClause = `AND ci.status = $${params.length}`;
    } else if (status === "all") {
      statusClause = "";
    }

    // ========================================================
    // GET INVITATIONS (DIRECT OR VIA CAPTAINED TEAM)
    // ========================================================

    const result = await pool.query(
      `
        SELECT
          ci.id AS invitation_id,
          ci.competition_id,
          ci.player_id,
          ci.team_id,
          ci.status AS invitation_status,
          ci.expires_at,
          ci.created_at,

          c.name AS competition_name,
          c.status AS competition_status,
          c.competition_type,
          c.entry_fee,
          c.start_date,
          c.approval_mode,

          t.name AS team_name

        FROM competition_invitations ci

        INNER JOIN competitions c
          ON c.id = ci.competition_id

        LEFT JOIN teams t
          ON t.id = ci.team_id

        WHERE
          (
            ci.player_id = $1
            OR t.captain_id = $1
          )

          ${statusClause}

        ORDER BY
          ci.created_at DESC;
      `,
      params
    );

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      invitations: result.rows,
    });
  } catch (error) {
    console.error(
      "GET PLAYER COMPETITION INVITATIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get player competition invitations",
    });
  }
};

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  acceptCompetitionInvitation,
  rejectCompetitionInvitation,
  submitCompetitionPayment,
  releaseExpiredCompetitionSlots,
  registerForCompetition,
  getCompetitionPaymentAccounts,
  getPlayerCompetitions,
  getPlayerMyCompetitions,
  getPlayerCompetitionInvitations,
  cancelCompetitionRegistration,
};