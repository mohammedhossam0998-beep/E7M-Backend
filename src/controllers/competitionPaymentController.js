const pool = require("../config/db");
const { createNotification } = require("./notificationController");

// ============================================================
// GET OWNER COMPETITION PAYMENTS
// GET /api/owner/competition-payments
// ============================================================

const getOwnerCompetitionPayments = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
        SELECT
          cp.id,
          cp.registration_id,
          cp.competition_id,
          cp.amount,
          cp.currency,
          cp.status,
          cp.payment_method,
          cp.transaction_reference,
          cp.proof_image_url,
          cp.submitted_at,
          cp.verified_at,
          cp.verified_by,
          cp.rejected_at,
          cp.rejection_reason,
          cp.created_at,
          cp.updated_at,

          c.name AS competition_name,
          c.entry_fee,
          c.start_date,
          c.end_date,

          cr.status AS registration_status,
          cr.player_id,
          cr.team_id,
          cr.payment_deadline,
          cr.slot_locked_at,

          u.full_name AS player_name,
          u.email AS player_email,

          opa.account_name,
          opa.account_identifier

        FROM competition_payments cp

        INNER JOIN competitions c
          ON cp.competition_id = c.id

        INNER JOIN competition_registrations cr
          ON cp.registration_id = cr.id

        LEFT JOIN users u
          ON cr.player_id = u.id

        LEFT JOIN owner_payment_accounts opa
          ON cp.owner_payment_account_id = opa.id

        WHERE c.created_by = $1

        ORDER BY cp.created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      payments: result.rows,
    });
  } catch (error) {
    console.error(
      "GET OWNER COMPETITION PAYMENTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get competition payments",
    });
  }
};

// ============================================================
// APPROVE COMPETITION PAYMENT
// PATCH /api/owner/competition-payments/:id/approve
// ============================================================

const approveCompetitionPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const paymentId = req.params.id;

    await client.query("BEGIN");

    // ========================================================
    // GET PAYMENT + VERIFY OWNER
    // ========================================================

    const paymentResult = await client.query(
      `
        SELECT
          cp.id,
          cp.registration_id,
          cp.competition_id,
          cp.amount,
          cp.currency,
          cp.status,
          cp.payment_method,
          cp.transaction_reference,
          cp.proof_image_url,

          c.name AS competition_name,
          c.entry_fee,
          c.status AS competition_status,

          cr.player_id,
          cr.team_id,
          t.captain_id,
          cr.status AS registration_status,
          cr.payment_deadline,
          cr.slot_locked_at

        FROM competition_payments cp

        INNER JOIN competitions c
          ON cp.competition_id = c.id

        INNER JOIN competition_registrations cr
          ON cp.registration_id = cr.id

        LEFT JOIN teams t
          ON cr.team_id = t.id

        WHERE cp.id = $1
          AND c.created_by = $2

        FOR UPDATE OF cp, cr
      `,
      [paymentId, userId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // ========================================================
    // PAYMENT MUST BE SUBMITTED
    // ========================================================

    if (payment.status !== "submitted") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only submitted competition payments can be approved",
      });
    }

    // ========================================================
    // REGISTRATION MUST BE PAYMENT PENDING
    // ========================================================

    if (payment.registration_status !== "payment_pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "This registration is not waiting for payment verification",
      });
    }

    // ========================================================
    // VALIDATE PAYMENT AMOUNT
    // ========================================================

    const paymentAmount = Number(payment.amount);
    const entryFee = Number(payment.entry_fee);

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    if (
      !Number.isFinite(entryFee) ||
      entryFee <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid competition entry fee",
      });
    }

    if (paymentAmount !== entryFee) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Payment amount does not match the competition entry fee",
      });
    }

    // ========================================================
    // COMPETITION STATUS
    // ========================================================

    if (payment.competition_status === "cancelled") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Competition has been cancelled",
      });
    }

    // ========================================================
    // APPROVE PAYMENT
    // ========================================================

    const updatedPayment = await client.query(
      `
        UPDATE competition_payments
        SET
          status = 'paid',
          paid_at = CURRENT_TIMESTAMP,
          verified_at = CURRENT_TIMESTAMP,
          verified_by = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          registration_id,
          competition_id,
          amount,
          currency,
          status,
          payment_method,
          transaction_reference,
          proof_image_url,
          submitted_at,
          paid_at,
          verified_at,
          verified_by,
          created_at,
          updated_at
      `,
      [paymentId, userId]
    );

    // ========================================================
    // UPDATE REGISTRATION
    // ========================================================

    const updatedRegistration = await client.query(
      `
        UPDATE competition_registrations
        SET
          status = 'paid',
          slot_locked_at = NULL
        WHERE id = $1
        RETURNING
          id,
          competition_id,
          team_id,
          player_id,
          status,
          registered_at,
          reviewed_at,
          reviewed_by,
          waitlist_position,
          cancelled_at,
          payment_deadline,
          slot_locked_at
      `,
      [payment.registration_id]
    );

    await client.query("COMMIT");

    // ========================================================
    // NOTIFICATION
    // ========================================================

    const notificationUserId =
      payment.player_id || payment.captain_id;

    if (notificationUserId) {
      try {
        await createNotification({
          userId: notificationUserId,
          title: "تم قبول دفع المسابقة",
          message: `تم تأكيد دفع رسوم الاشتراك في مسابقة ${payment.competition_name}.`,
          type: "payments",
        });

        console.log(
          "✅ COMPETITION PAYMENT: Approval notification sent:",
          notificationUserId
        );
      } catch (notificationError) {
        console.error(
          "❌ COMPETITION PAYMENT: Failed to send approval notification:",
          notificationError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Competition payment approved successfully",
      payment: updatedPayment.rows[0],
      registration: updatedRegistration.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "APPROVE COMPETITION PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to approve competition payment",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// REJECT COMPETITION PAYMENT
// PATCH /api/owner/competition-payments/:id/reject
// ============================================================

const rejectCompetitionPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const paymentId = req.params.id;

    const rejectionReason =
      typeof req.body.rejection_reason === "string"
        ? req.body.rejection_reason.trim()
        : "";

    await client.query("BEGIN");

    // ========================================================
    // GET PAYMENT + VERIFY OWNER
    // ========================================================

    const paymentResult = await client.query(
      `
        SELECT
          cp.id,
          cp.registration_id,
          cp.competition_id,
          cp.amount,
          cp.status,
          cp.transaction_reference,

          c.name AS competition_name,

          cr.player_id,
          cr.team_id,
          t.captain_id,
          cr.status AS registration_status,
          cr.payment_deadline,
          cr.slot_locked_at

        FROM competition_payments cp

        INNER JOIN competitions c
          ON cp.competition_id = c.id

        INNER JOIN competition_registrations cr
          ON cp.registration_id = cr.id

        LEFT JOIN teams t
          ON cr.team_id = t.id

        WHERE cp.id = $1
          AND c.created_by = $2

        FOR UPDATE OF cp, cr
      `,
      [paymentId, userId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Competition payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // ========================================================
    // PAYMENT MUST BE SUBMITTED
    // ========================================================

    if (payment.status !== "submitted") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only submitted competition payments can be rejected",
      });
    }

    // ========================================================
    // REGISTRATION MUST BE PAYMENT PENDING
    // ========================================================

    if (payment.registration_status !== "payment_pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "This registration is not waiting for payment verification",
      });
    }

    // ========================================================
    // REJECT PAYMENT
    // ========================================================

    const updatedPayment = await client.query(
      `
        UPDATE competition_payments
        SET
          status = 'failed',
          rejected_at = CURRENT_TIMESTAMP,
          rejection_reason = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          registration_id,
          competition_id,
          amount,
          currency,
          status,
          payment_method,
          transaction_reference,
          proof_image_url,
          submitted_at,
          rejected_at,
          rejection_reason,
          created_at,
          updated_at
      `,
      [paymentId, rejectionReason || null]
    );

    // ========================================================
    // CHECK DEADLINE AFTER REJECTION
    // ========================================================

    const deadlineExpired =
      payment.payment_deadline &&
      new Date(payment.payment_deadline) <= new Date();

    let updatedRegistration;

    if (deadlineExpired) {
      updatedRegistration = await client.query(
        `
          UPDATE competition_registrations
          SET
            status = 'expired',
            slot_locked_at = NULL
          WHERE id = $1
          RETURNING
            id,
            competition_id,
            team_id,
            player_id,
            status,
            registered_at,
            reviewed_at,
            reviewed_by,
            waitlist_position,
            cancelled_at,
            payment_deadline,
            slot_locked_at
        `,
        [payment.registration_id]
      );
    } else {
      updatedRegistration = await client.query(
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
            registered_at,
            reviewed_at,
            reviewed_by,
            waitlist_position,
            cancelled_at,
            payment_deadline,
            slot_locked_at
        `,
        [payment.registration_id]
      );
    }

    await client.query("COMMIT");

    // ========================================================
    // NOTIFICATION
    // ========================================================

    const notificationUserId =
      payment.player_id || payment.captain_id;

    if (notificationUserId) {
      try {
        const message = deadlineExpired
          ? `تم رفض إثبات الدفع الخاص بمسابقة ${payment.competition_name} وانتهت مهلة الدفع، لذلك تم إلغاء حجز المقعد.`
          : rejectionReason
          ? `تم رفض إثبات الدفع الخاص بمسابقة ${payment.competition_name}. السبب: ${rejectionReason}`
          : `تم رفض إثبات الدفع الخاص بمسابقة ${payment.competition_name}. يمكنك إعادة إرسال إثبات الدفع قبل انتهاء المهلة.`;

        await createNotification({
          userId: notificationUserId,
          title: "تم رفض إثبات دفع المسابقة",
          message,
          type: "payments",
        });

        console.log(
          "✅ COMPETITION PAYMENT: Rejection notification sent:",
          notificationUserId
        );
      } catch (notificationError) {
        console.error(
          "❌ COMPETITION PAYMENT: Failed to send rejection notification:",
          notificationError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: deadlineExpired
        ? "Competition payment rejected and registration expired"
        : "Competition payment rejected successfully",
      payment: updatedPayment.rows[0],
      registration: updatedRegistration.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "REJECT COMPETITION PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reject competition payment",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getOwnerCompetitionPayments,
  approveCompetitionPayment,
  rejectCompetitionPayment,
};