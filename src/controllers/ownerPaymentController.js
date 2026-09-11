const pool = require("../config/db");
const { createNotification } = require("./notificationController");


// ========================================
// ADD OWNER PAYMENT ACCOUNT
// POST /api/owner/payment-accounts
// ========================================

const addPaymentAccount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      payment_method,
      account_name,
      account_identifier,
    } = req.body;

    // ========================================
    // VALIDATE REQUIRED DATA
    // ========================================

    if (!payment_method || !account_name || !account_identifier) {
      return res.status(400).json({
        success: false,
        message:
          "payment_method, account_name and account_identifier are required",
      });
    }

    // ========================================
    // VALIDATE PAYMENT METHOD
    // ========================================

    const allowedMethods = ["wallet", "instapay"];

    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // ========================================
    // GET OWNER ID
    // ========================================

    const ownerResult = await pool.query(
      `
      SELECT id
      FROM owners
      WHERE user_id = $1
        AND is_deleted = false
      LIMIT 1
      `,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const ownerId = ownerResult.rows[0].id;

    // ========================================
    // CHECK EXISTING ACCOUNT
    // ========================================

    const existingAccount = await pool.query(
      `
      SELECT id
      FROM owner_payment_accounts
      WHERE owner_id = $1
        AND payment_method = $2
      LIMIT 1
      `,
      [ownerId, payment_method]
    );

    if (existingAccount.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This payment method is already registered",
      });
    }

    // ========================================
    // CREATE PAYMENT ACCOUNT
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO owner_payment_accounts (
        owner_id,
        payment_method,
        account_name,
        account_identifier
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        owner_id,
        payment_method,
        account_name,
        account_identifier,
        is_active,
        created_at,
        updated_at
      `,
      [
        ownerId,
        payment_method,
        account_name.trim(),
        account_identifier.trim(),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Payment account added successfully",
      account: result.rows[0],
    });

  } catch (error) {
    console.error("ADD OWNER PAYMENT ACCOUNT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add payment account",
    });
  }
};


// ========================================
// GET OWNER PAYMENTS
// GET /api/owner/payments
// ========================================

const getOwnerPayments = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        pay.id,
        pay.booking_id,
        pay.user_id,
        pay.amount,
        pay.payment_method,
        pay.status,
        pay.transaction_reference,
        pay.payment_type,
        pay.owner_payment_account_id,
        pay.created_at,

        b.status AS booking_status,
        b.total_price,
        b.deposit_amount,
        b.remaining_amount,
        b.payment_status,

        ps.id AS slot_id,
        ps.slot_date,
        ps.start_time,
        ps.end_time,

        p.id AS pitch_id,
        p.name AS pitch_name,

        u.full_name AS player_name,
        u.email AS player_email

      FROM payments pay

      INNER JOIN bookings b
        ON pay.booking_id = b.id

      INNER JOIN pitch_slots ps
        ON b.pitch_slot_id = ps.id

      INNER JOIN pitches p
        ON ps.pitch_id = p.id

      INNER JOIN owners o
        ON p.owner_id = o.id

      INNER JOIN users u
        ON pay.user_id = u.id

      WHERE o.user_id = $1

      ORDER BY pay.created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      payments: result.rows,
    });

  } catch (error) {
    console.error("GET OWNER PAYMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owner payments",
    });
  }
};


// ========================================
// APPROVE OWNER PAYMENT
// PATCH /api/owner/payments/:id/approve
// ========================================

const approvePayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const paymentId = req.params.id;

    await client.query("BEGIN");

    // ========================================
    // GET PAYMENT + VERIFY OWNER
    // ========================================

    const paymentResult = await client.query(
      `
      SELECT
        pay.id,
        pay.booking_id,
        pay.user_id,
        pay.amount,
        pay.status,
        pay.payment_type,
        pay.transaction_reference,

        b.deposit_amount,
        b.total_price,
        b.remaining_amount,

        o.id AS owner_id

      FROM payments pay

      INNER JOIN bookings b
        ON pay.booking_id = b.id

      INNER JOIN pitch_slots ps
        ON b.pitch_slot_id = ps.id

      INNER JOIN pitches p
        ON ps.pitch_id = p.id

      INNER JOIN owners o
        ON p.owner_id = o.id

      WHERE pay.id = $1
        AND o.user_id = $2

      FOR UPDATE
      `,
      [paymentId, userId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // ========================================
    // PAYMENT MUST BE PENDING
    // ========================================

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only pending payments can be approved",
      });
    }

    // ========================================
    // TRANSACTION REFERENCE REQUIRED
    // ========================================

    if (
      !payment.transaction_reference ||
      !payment.transaction_reference.trim()
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Transaction reference has not been submitted",
      });
    }

    // ========================================
    // VALIDATE PAYMENT TYPE
    // ========================================

    if (
      !["deposit", "full_payment"].includes(
        payment.payment_type
      )
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid payment type",
      });
    }

    // ========================================
    // VALIDATE PAYMENT AMOUNT
    // ========================================

    const paymentAmount = Number(payment.amount);
    const depositAmount = Number(payment.deposit_amount);
    const totalPrice = Number(payment.total_price);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    // ========================================
    // APPROVE DEPOSIT
    // ========================================

    if (payment.payment_type === "deposit") {

      // Payment must equal owner's deposit amount
      if (paymentAmount !== depositAmount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Payment amount does not match the booking deposit amount",
        });
      }

      // ========================================
      // APPROVE PAYMENT
      // ========================================

      const updatedPayment = await client.query(
        `
        UPDATE payments
        SET status = 'paid'
        WHERE id = $1
        RETURNING
          id,
          booking_id,
          user_id,
          amount,
          payment_method,
          status,
          transaction_reference,
          payment_type,
          owner_payment_account_id,
          created_at
        `,
        [paymentId]
      );

      // ========================================
      // UPDATE BOOKING
      // ========================================

      const updatedBooking = await client.query(
        `
        UPDATE bookings
        SET
          payment_status = 'paid',
          deposit_paid_at = NOW(),
          remaining_amount = total_price - deposit_amount
        WHERE id = $1
        RETURNING
          id,
          total_price,
          deposit_amount,
          remaining_amount,
          payment_status,
          deposit_paid_at
        `,
        [payment.booking_id]
      );

      await client.query("COMMIT");

      try {
        await createNotification({
          userId: paymentResult.rows[0].user_id,
          title: "تم قبول دفع العربون",
          message: "تم قبول دفع العربون الخاص بحجزك.",
          type: "payments",
          bookingId: payment.booking_id,
        });

        console.log(
          "✅ PAYMENT: Deposit approval notification sent to player:",
          paymentResult.rows[0].user_id
        );
      } catch (notificationError) {
        console.error(
          "❌ PAYMENT: Failed to send deposit approval notification:",
          notificationError.message
        );
      }

      return res.status(200).json({
        success: true,
        message: "Deposit payment approved successfully",
        payment: updatedPayment.rows[0],
        booking: updatedBooking.rows[0],
      });
    }


    // ========================================
    // APPROVE FULL PAYMENT
    // ========================================

    if (payment.payment_type === "full_payment") {

      // Payment must equal the current remaining amount
      const currentRemainingAmount = Number(
        payment.remaining_amount
      );

      if (
        !Number.isFinite(currentRemainingAmount) ||
        currentRemainingAmount <= 0
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "This booking has no remaining amount to pay",
        });
      }

      if (paymentAmount !== currentRemainingAmount) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Payment amount does not match the booking remaining amount",
        });
      }

      // ========================================
      // APPROVE PAYMENT
      // ========================================

      const updatedPayment = await client.query(
        `
        UPDATE payments
        SET status = 'paid'
        WHERE id = $1
        RETURNING
          id,
          booking_id,
          user_id,
          amount,
          payment_method,
          status,
          transaction_reference,
          payment_type,
          owner_payment_account_id,
          created_at
        `,
        [paymentId]
      );

      // ========================================
      // UPDATE BOOKING
      // ========================================

      const updatedBooking = await client.query(
        `
        UPDATE bookings
        SET
          payment_status = 'paid',
          deposit_paid_at = NOW(),
          remaining_amount = 0
        WHERE id = $1
        RETURNING
          id,
          total_price,
          deposit_amount,
          remaining_amount,
          payment_status,
          deposit_paid_at
        `,
        [payment.booking_id]
      );

      await client.query("COMMIT");

      try {
        await createNotification({
          userId: paymentResult.rows[0].user_id,
          title: "تم قبول الدفع بالكامل",
          message: "تم قبول عملية الدفع بالكامل الخاصة بحجزك.",
          type: "payments",
          bookingId: payment.booking_id,
        });

        console.log(
          "✅ PAYMENT: Full payment approval notification sent to player:",
          paymentResult.rows[0].user_id
        );
      } catch (notificationError) {
        console.error(
          "❌ PAYMENT: Failed to send full payment approval notification:",
          notificationError.message
        );
      }

      return res.status(200).json({
        success: true,
        message: "Full payment approved successfully",
        payment: updatedPayment.rows[0],
        booking: updatedBooking.rows[0],
      });
    }

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("APPROVE OWNER PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve payment",
    });

  } finally {
    client.release();
  }
};


// ========================================
// REJECT OWNER PAYMENT
// PATCH /api/owner/payments/:id/reject
// ========================================

const rejectPayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const paymentId = req.params.id;

    await client.query("BEGIN");

    // ========================================
    // GET PAYMENT + VERIFY OWNER
    // ========================================

    const paymentResult = await client.query(
      `
      SELECT
        pay.id,
        pay.booking_id,
        pay.status,
        pay.payment_type,
        pay.transaction_reference

      FROM payments pay

      INNER JOIN bookings b
        ON pay.booking_id = b.id

      INNER JOIN pitch_slots ps
        ON b.pitch_slot_id = ps.id

      INNER JOIN pitches p
        ON ps.pitch_id = p.id

      INNER JOIN owners o
        ON p.owner_id = o.id

      WHERE pay.id = $1
        AND o.user_id = $2

      FOR UPDATE
      `,
      [paymentId, userId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // ========================================
    // PAYMENT MUST BE PENDING
    // ========================================

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only pending payments can be rejected",
      });
    }

    // ========================================
    // VALIDATE PAYMENT TYPE
    // ========================================

    if (
      !["deposit", "full_payment"].includes(
        payment.payment_type
      )
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid payment type",
      });
    }

    // ========================================
    // REJECT PAYMENT
    // ========================================

    const updatedPayment = await client.query(
      `
      UPDATE payments
      SET status = 'failed'
      WHERE id = $1
      RETURNING
        id,
        booking_id,
        user_id,
        amount,
        payment_method,
        status,
        transaction_reference,
        payment_type,
        owner_payment_account_id,
        created_at
      `,
      [paymentId]
    );

    await client.query("COMMIT");

    try {
      const isDeposit = payment.payment_type === "deposit";

      await createNotification({
        userId: updatedPayment.rows[0].user_id,
        title: isDeposit
          ? "تم رفض دفع العربون"
          : "تم رفض الدفع بالكامل",
        message: isDeposit
          ? "تم رفض دفع العربون الخاص بحجزك."
          : "تم رفض عملية الدفع بالكامل الخاصة بحجزك.",
        type: "payments",
        bookingId: payment.booking_id,
      });

      console.log(
        "✅ PAYMENT: Rejection notification sent to player:",
        updatedPayment.rows[0].user_id
      );
    } catch (notificationError) {
      console.error(
        "❌ PAYMENT: Failed to send rejection notification:",
        notificationError.message
      );
    }

    return res.status(200).json({
      success: true,
      message:
        payment.payment_type === "deposit"
          ? "Deposit payment rejected successfully"
          : "Full payment rejected successfully",
      payment: updatedPayment.rows[0],
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("REJECT OWNER PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject payment",
    });

  } finally {
    client.release();
  }
};


// ========================================
// EXPORT
// ========================================

module.exports = {
  addPaymentAccount,
  getOwnerPayments,
  approvePayment,
  rejectPayment,
};