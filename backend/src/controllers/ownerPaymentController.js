
const pool = require("../config/db");
const { createNotification } = require("./notificationController");

// ============================================================
// HELPERS
// ============================================================

// pitches.owner_id = users.id
// owner_payment_accounts.owner_id = owners.id

const PARTIAL_PAYMENT_STATUS = "pending";

const toCents = (value) =>
  Math.round(Number(value) * 100);

const isValidId = (value) =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;

const getOwnerProfile = async (userId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM owners
    WHERE user_id = $1
      AND is_deleted = false
    LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
};

const validatePaymentAccount = (body) => {
  const {
    payment_method,
    wallet_provider,
    account_name,
    account_identifier,
  } = body || {};

  if (
    !payment_method ||
    typeof account_name !== "string" ||
    typeof account_identifier !== "string"
  ) {
    return {
      error:
        "payment_method, account_name and account_identifier are required",
    };
  }

  if (!["wallet", "instapay"].includes(payment_method)) {
    return {
      error: "Invalid payment method",
    };
  }

  const allowedWalletProviders = [
    "vodafone_cash",
    "orange_cash",
    "etisalat_cash",
    "we_pay",
    "other_wallet",
  ];

  if (
    payment_method === "wallet" &&
    !allowedWalletProviders.includes(wallet_provider)
  ) {
    return {
      error: "A valid wallet provider is required",
    };
  }

  if (
    payment_method === "instapay" &&
    wallet_provider != null
  ) {
    return {
      error: "wallet_provider must be null for InstaPay",
    };
  }

  const cleanName = account_name.trim();
  const cleanIdentifier = account_identifier.trim();

  if (!cleanName || !cleanIdentifier) {
    return {
      error:
        "Account name and account identifier cannot be empty",
    };
  }

  if (
    payment_method === "wallet" &&
    !/^01[0125][0-9]{8}$/.test(cleanIdentifier)
  ) {
    return {
      error: "Invalid Egyptian wallet mobile number",
    };
  }

  return {
    data: {
      payment_method,
      wallet_provider:
        payment_method === "wallet"
          ? wallet_provider
          : null,
      account_name: cleanName,
      account_identifier: cleanIdentifier,
    },
  };
};

const sendPaymentNotification = async ({
  userId,
  bookingId,
  title,
  message,
}) => {
  try {
    await createNotification({
      userId,
      title,
      message,
      type: "payments",
      bookingId,
    });
  } catch (error) {
    console.error(
      "PAYMENT NOTIFICATION ERROR:",
      error
    );
  }
};

// ============================================================
// ADD OWNER PAYMENT ACCOUNT
// POST /api/owner/payment-accounts
// ============================================================

const addPaymentAccount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const validation = validatePaymentAccount(req.body);

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    const data = validation.data;

    const owner = await getOwnerProfile(userId);

    if (!owner) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const ownerId = owner.id;

    const existingAccount = await pool.query(
      `
      SELECT id
      FROM owner_payment_accounts
      WHERE owner_id = $1
        AND payment_method = $2
        AND COALESCE(wallet_provider, '') =
            COALESCE($3, '')
        AND is_active = true
      LIMIT 1
      `,
      [
        ownerId,
        data.payment_method,
        data.wallet_provider,
      ]
    );

    if (existingAccount.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This payment account type is already active",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO owner_payment_accounts (
        owner_id,
        payment_method,
        wallet_provider,
        account_name,
        account_identifier
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        owner_id,
        payment_method,
        wallet_provider,
        account_name,
        account_identifier,
        is_active,
        created_at,
        updated_at
      `,
      [
        ownerId,
        data.payment_method,
        data.wallet_provider,
        data.account_name,
        data.account_identifier,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Payment account added successfully",
      account: result.rows[0],
    });

  } catch (error) {
    console.error(
      "ADD OWNER PAYMENT ACCOUNT ERROR:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Payment account already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to add payment account",
    });
  }
};

// ============================================================
// GET OWNER PAYMENT ACCOUNTS
// GET /api/owner/payment-accounts
// ============================================================

const getOwnerPaymentAccounts = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        opa.id,
        opa.owner_id,
        opa.payment_method,
        opa.wallet_provider,
        opa.account_name,
        opa.account_identifier,
        opa.is_active,
        opa.created_at,
        opa.updated_at
      FROM owner_payment_accounts opa
      INNER JOIN owners o
        ON o.id = opa.owner_id
      WHERE o.user_id = $1
        AND o.is_deleted = false
        AND opa.is_active = true
      ORDER BY
        opa.created_at DESC,
        opa.id DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      accounts: result.rows,
    });

  } catch (error) {
    console.error(
      "GET OWNER PAYMENT ACCOUNTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get payment accounts",
    });
  }
};

// ============================================================
// UPDATE OWNER PAYMENT ACCOUNT
// PUT /api/owner/payment-accounts/:id
// ============================================================

const updatePaymentAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const accountId = Number(req.params.id);

    if (!isValidId(accountId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment account id",
      });
    }

    const validation = validatePaymentAccount(req.body);

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    const data = validation.data;

    const owner = await getOwnerProfile(userId);

    if (!owner) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const ownerId = owner.id;

    const accountResult = await pool.query(
      `
      SELECT id
      FROM owner_payment_accounts
      WHERE id = $1
        AND owner_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [accountId, ownerId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment account not found",
      });
    }

    const duplicateResult = await pool.query(
      `
      SELECT id
      FROM owner_payment_accounts
      WHERE owner_id = $1
        AND payment_method = $2
        AND COALESCE(wallet_provider, '') =
            COALESCE($3, '')
        AND is_active = true
        AND id <> $4
      LIMIT 1
      `,
      [
        ownerId,
        data.payment_method,
        data.wallet_provider,
        accountId,
      ]
    );

    if (duplicateResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This payment account type is already active",
      });
    }

    const result = await pool.query(
      `
      UPDATE owner_payment_accounts
      SET
        payment_method = $1,
        wallet_provider = $2,
        account_name = $3,
        account_identifier = $4,
        updated_at = NOW()
      WHERE id = $5
        AND owner_id = $6
        AND is_active = true
      RETURNING
        id,
        owner_id,
        payment_method,
        wallet_provider,
        account_name,
        account_identifier,
        is_active,
        created_at,
        updated_at
      `,
      [
        data.payment_method,
        data.wallet_provider,
        data.account_name,
        data.account_identifier,
        accountId,
        ownerId,
      ]
    );

    return res.status(200).json({
      success: true,
      message:
        "Payment account updated successfully",
      account: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPDATE OWNER PAYMENT ACCOUNT ERROR:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Payment account already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update payment account",
    });
  }
};

// ============================================================
// DEACTIVATE OWNER PAYMENT ACCOUNT
// DELETE /api/owner/payment-accounts/:id
// ============================================================

const deactivatePaymentAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const accountId = Number(req.params.id);

    if (!isValidId(accountId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment account id",
      });
    }

    const result = await pool.query(
      `
      UPDATE owner_payment_accounts opa
      SET
        is_active = false,
        updated_at = NOW()
      FROM owners o
      WHERE opa.id = $1
        AND opa.owner_id = o.id
        AND o.user_id = $2
        AND o.is_deleted = false
        AND opa.is_active = true
      RETURNING
        opa.id,
        opa.owner_id,
        opa.payment_method,
        opa.wallet_provider,
        opa.account_name,
        opa.account_identifier,
        opa.is_active,
        opa.created_at,
        opa.updated_at
      `,
      [accountId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment account not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Payment account deactivated successfully",
      account: result.rows[0],
    });

  } catch (error) {
    console.error(
      "DEACTIVATE OWNER PAYMENT ACCOUNT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate payment account",
    });
  }
};

// ============================================================
// GET OWNER PAYMENTS
// GET /api/owner/payments
// ============================================================

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
        ON p.owner_id = o.user_id

      INNER JOIN users u
        ON pay.user_id = u.id

      WHERE o.user_id = $1
        AND o.is_deleted = false

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
    console.error(
      "GET OWNER PAYMENTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get owner payments",
    });
  }
};

// ============================================================
// APPROVE OWNER PAYMENT
// PATCH /api/owner/payments/:id/approve
// ============================================================

const approvePayment = async (req, res) => {
  let client;

  try {
    const userId = req.user.userId;
    const paymentId = Number(req.params.id);

    if (!isValidId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment id",
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");

    // Lock payment and booking to prevent
    // concurrent approval of the same booking.

    const paymentResult = await client.query(
      `
      SELECT
        pay.id,
        pay.booking_id,
        pay.user_id,
        pay.amount,
        pay.payment_method,
        pay.status,
        pay.payment_type,
        pay.transaction_reference,
        pay.owner_payment_account_id,

        b.deposit_amount,
        b.total_price,
        b.remaining_amount,
        b.payment_status,

        o.id AS owner_id

      FROM payments pay

      INNER JOIN bookings b
        ON pay.booking_id = b.id

      INNER JOIN pitch_slots ps
        ON b.pitch_slot_id = ps.id

      INNER JOIN pitches p
        ON ps.pitch_id = p.id

      INNER JOIN owners o
        ON p.owner_id = o.user_id

      WHERE pay.id = $1
        AND o.user_id = $2
        AND o.is_deleted = false

      FOR UPDATE OF pay, b
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

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only pending payments can be approved",
      });
    }

    if (
      typeof payment.transaction_reference !== "string" ||
      !payment.transaction_reference.trim()
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message:
          "Transaction reference has not been submitted",
      });
    }

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

    const paymentCents = toCents(payment.amount);
    const depositCents = toCents(payment.deposit_amount);
    const totalCents = toCents(payment.total_price);

    if (
      !Number.isFinite(paymentCents) ||
      paymentCents <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    if (
      !Number.isFinite(totalCents) ||
      totalCents <= 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid booking total price",
      });
    }

    // Get previously approved payments.
    // This also prevents overpayment.

    const paidResult = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid
      FROM payments
      WHERE booking_id = $1
        AND status = 'paid'
      `,
      [payment.booking_id]
    );

    const paidCents = toCents(paidResult.rows[0].paid);

    if (
      !Number.isFinite(paidCents) ||
      paidCents < 0 ||
      paidCents > totalCents
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Booking payment totals are inconsistent",
      });
    }

    let remainingAmount;
    let updatedPayment;
    let updatedBooking;
    let notificationTitle;
    let notificationMessage;
    let successMessage;

    // ========================================================
    // APPROVE DEPOSIT
    // ========================================================

    if (payment.payment_type === "deposit") {
      if (
        !Number.isFinite(depositCents) ||
        depositCents <= 0 ||
        depositCents > totalCents
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "No valid deposit amount exists for this booking",
        });
      }

      if (paymentCents !== depositCents) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Payment amount does not match the booking deposit amount",
        });
      }

      // Prevent approving a duplicate deposit.
      if (paidCents > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message:
            "A payment has already been approved for this booking",
        });
      }

      remainingAmount =
        Math.max(totalCents - paymentCents, 0) / 100;

      updatedPayment = await client.query(
        `
        UPDATE payments
        SET status = 'paid'
        WHERE id = $1
          AND status = 'pending'
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

      if (updatedPayment.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Payment status has changed",
        });
      }

      updatedBooking = await client.query(
        `
        UPDATE bookings
        SET
          payment_status =
            CASE
              WHEN $2::numeric <= 0 THEN 'paid'
              ELSE $3
            END,
          deposit_paid_at = COALESCE(
            deposit_paid_at,
            NOW()
          ),
          remaining_amount = $2::numeric
        WHERE id = $1
        RETURNING
          id,
          total_price,
          deposit_amount,
          remaining_amount,
          payment_status,
          deposit_paid_at
        `,
        [
          payment.booking_id,
          remainingAmount,
          PARTIAL_PAYMENT_STATUS,
        ]
      );

      notificationTitle = "تم قبول دفع العربون";
      notificationMessage =
        "تم قبول دفع العربون الخاص بحجزك.";

      successMessage =
        "Deposit payment approved successfully";
    }

    // ========================================================
    // APPROVE FULL PAYMENT
    // ========================================================

    if (payment.payment_type === "full_payment") {
      const expectedCents = totalCents - paidCents;

      if (expectedCents <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "This booking has no remaining amount to pay",
        });
      }

      if (paymentCents !== expectedCents) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Payment amount does not match the actual outstanding amount",
          expected_amount: expectedCents / 100,
          submitted_amount: paymentCents / 100,
        });
      }

      updatedPayment = await client.query(
        `
        UPDATE payments
        SET status = 'paid'
        WHERE id = $1
          AND status = 'pending'
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

      if (updatedPayment.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Payment status has changed",
        });
      }

      updatedBooking = await client.query(
        `
        UPDATE bookings
        SET
          payment_status = 'paid',
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

      notificationTitle = "تم قبول الدفع بالكامل";
      notificationMessage =
        "تم قبول عملية الدفع بالكامل الخاصة بحجزك.";

      successMessage =
        "Full payment approved successfully";
    }

    await client.query("COMMIT");

    await sendPaymentNotification({
      userId: payment.user_id,
      bookingId: payment.booking_id,
      title: notificationTitle,
      message: notificationMessage,
    });

    return res.status(200).json({
      success: true,
      message: successMessage,
      payment: updatedPayment.rows[0],
      booking: updatedBooking.rows[0],
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "APPROVE PAYMENT ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    console.error(
      "APPROVE OWNER PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to approve payment",
    });

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// REJECT OWNER PAYMENT
// PATCH /api/owner/payments/:id/reject
// ============================================================

const rejectPayment = async (req, res) => {
  let client;

  try {
    const userId = req.user.userId;
    const paymentId = Number(req.params.id);

    if (!isValidId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment id",
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");

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
        ON p.owner_id = o.user_id

      WHERE pay.id = $1
        AND o.user_id = $2
        AND o.is_deleted = false

      FOR UPDATE OF pay, b
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

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only pending payments can be rejected",
      });
    }

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

    const updatedPayment = await client.query(
      `
      UPDATE payments
      SET status = 'failed'
      WHERE id = $1
        AND status = 'pending'
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

    if (updatedPayment.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Payment status has changed",
      });
    }

    await client.query("COMMIT");

    const isDeposit =
      payment.payment_type === "deposit";

    await sendPaymentNotification({
      userId: updatedPayment.rows[0].user_id,
      bookingId: payment.booking_id,
      title: isDeposit
        ? "تم رفض دفع العربون"
        : "تم رفض الدفع بالكامل",
      message: isDeposit
        ? "تم رفض دفع العربون الخاص بحجزك."
        : "تم رفض عملية الدفع بالكامل الخاصة بحجزك.",
    });

    return res.status(200).json({
      success: true,
      message: isDeposit
        ? "Deposit payment rejected successfully"
        : "Full payment rejected successfully",
      payment: updatedPayment.rows[0],
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "REJECT PAYMENT ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    console.error(
      "REJECT OWNER PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reject payment",
    });

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  addPaymentAccount,
  getOwnerPaymentAccounts,
  updatePaymentAccount,
  deactivatePaymentAccount,
  getOwnerPayments,
  approvePayment,
  rejectPayment,
};
