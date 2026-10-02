const pool = require("../config/db");
const { createNotification } = require("./notificationController");


// ============================================================
// ADD OWNER PAYMENT ACCOUNT
// POST /api/owner/payment-accounts
// ============================================================

const addPaymentAccount = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      payment_method,
      wallet_provider,
      account_name,
      account_identifier,
    } = req.body;

    // --------------------------------------------------------
    // REQUIRED FIELDS
    // --------------------------------------------------------

    if (
      !payment_method ||
      !account_name ||
      !account_identifier
    ) {
      return res.status(400).json({
        success: false,
        message:
          "payment_method, account_name and account_identifier are required",
      });
    }

    // --------------------------------------------------------
    // PAYMENT METHOD
    // --------------------------------------------------------

    const allowedMethods = [
      "wallet",
      "instapay",
    ];

    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // --------------------------------------------------------
    // WALLET PROVIDERS
    // --------------------------------------------------------

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
      return res.status(400).json({
        success: false,
        message: "A valid wallet provider is required",
      });
    }

    // InstaPay must not have wallet provider
    if (
      payment_method === "instapay" &&
      wallet_provider != null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "wallet_provider must be null for InstaPay",
      });
    }

    // --------------------------------------------------------
    // CLEAN DATA
    // --------------------------------------------------------

    const cleanName = account_name.trim();
    const cleanIdentifier = account_identifier.trim();

    if (!cleanName || !cleanIdentifier) {
      return res.status(400).json({
        success: false,
        message:
          "Account name and account identifier cannot be empty",
      });
    }

    // --------------------------------------------------------
    // WALLET PHONE VALIDATION
    // Egyptian mobile number
    // 010 / 011 / 012 / 015
    // --------------------------------------------------------

    if (
      payment_method === "wallet" &&
      !/^01[0125][0-9]{8}$/.test(cleanIdentifier)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid Egyptian wallet mobile number",
      });
    }

    // --------------------------------------------------------
    // GET OWNER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // CHECK DUPLICATE ACTIVE ACCOUNT
    // --------------------------------------------------------

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
        payment_method,
        wallet_provider ?? null,
      ]
    );

    if (existingAccount.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This payment account type is already active",
      });
    }

    // --------------------------------------------------------
    // CREATE ACCOUNT
    // --------------------------------------------------------

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
        payment_method,
        payment_method === "wallet"
          ? wallet_provider
          : null,
        cleanName,
        cleanIdentifier,
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

    const {
      payment_method,
      wallet_provider,
      account_name,
      account_identifier,
    } = req.body;

    if (
      !Number.isInteger(accountId) ||
      accountId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment account id",
      });
    }

    if (
      !payment_method ||
      !account_name ||
      !account_identifier
    ) {
      return res.status(400).json({
        success: false,
        message:
          "payment_method, account_name and account_identifier are required",
      });
    }

    const allowedMethods = [
      "wallet",
      "instapay",
    ];

    const allowedWalletProviders = [
      "vodafone_cash",
      "orange_cash",
      "etisalat_cash",
      "we_pay",
      "other_wallet",
    ];

    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    if (
      payment_method === "wallet" &&
      !allowedWalletProviders.includes(wallet_provider)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid wallet provider is required",
      });
    }

    if (
      payment_method === "instapay" &&
      wallet_provider != null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "wallet_provider must be null for InstaPay",
      });
    }

    const cleanName = account_name.trim();
    const cleanIdentifier = account_identifier.trim();

    if (!cleanName || !cleanIdentifier) {
      return res.status(400).json({
        success: false,
        message:
          "Account name and account identifier cannot be empty",
      });
    }

    if (
      payment_method === "wallet" &&
      !/^01[0125][0-9]{8}$/.test(cleanIdentifier)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid Egyptian wallet mobile number",
      });
    }

    // --------------------------------------------------------
    // GET OWNER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // VERIFY ACCOUNT BELONGS TO OWNER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // DUPLICATE CHECK
    // --------------------------------------------------------

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
        payment_method,
        wallet_provider ?? null,
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

    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------

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
        payment_method,
        payment_method === "wallet"
          ? wallet_provider
          : null,
        cleanName,
        cleanIdentifier,
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

    return res.status(500).json({
      success: false,
      message:
        "Failed to update payment account",
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

    if (
      !Number.isInteger(accountId) ||
      accountId <= 0
    ) {
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
      message:
        "Failed to deactivate payment account",
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
//
// حط الثابت ده فوق في الملف (جنب require) أو سيبه فوق الدالة.
// لو عندك قيمة تانية في الـ DB زي 'partially_paid' غيّرها هنا بس.
const PARTIAL_PAYMENT_STATUS = "pending";

// تحويل أي مبلغ لقروش (أرقام صحيحة) عشان نتفادى مشاكل الكسور العشرية
const toCents = (value) => Math.round(Number(value) * 100);

const approvePayment = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const paymentId = req.params.id;

    await client.query("BEGIN");

    // ========================================
    // GET PAYMENT + VERIFY OWNER
    // ========================================
    //
    // FOR UPDATE OF pay, b:
    // بنقفل الدفعة والحجز بس (مش الـ owner والـ pitch)،
    // وقفل الحجز بيضمن إن موافقتين لنفس الحجز
    // مش هيحسبوا الـ SUM في نفس الوقت.
    //
    // ========================================

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
        ON p.owner_id = o.id

      WHERE pay.id = $1
        AND o.user_id = $2

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
    // VALIDATE AMOUNTS (كلها بالقروش)
    // ========================================

    const paymentCents = toCents(payment.amount);
    const depositCents = toCents(payment.deposit_amount);
    const totalCents = toCents(payment.total_price);

    if (!Number.isFinite(paymentCents) || paymentCents <= 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    if (!Number.isFinite(totalCents) || totalCents <= 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid booking total price",
      });
    }

    // ========================================
    // APPROVE DEPOSIT
    // ========================================

    if (payment.payment_type === "deposit") {
      if (
        !Number.isFinite(depositCents) ||
        depositCents <= 0 ||
        depositCents > totalCents
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: "No valid deposit amount exists for this booking",
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

      // ========================================
      // APPROVE DEPOSIT PAYMENT
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
      // CALCULATE REMAINING AMOUNT
      // FROM CONFIRMED PAYMENTS
      // ========================================

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

      const remainingAmount =
        Math.max(totalCents - paidCents, 0) / 100;

      // ========================================
      // UPDATE BOOKING
      // ========================================
      //
      // IMPORTANT:
      // Deposit approval does NOT mean the
      // booking is fully paid.
      //
      // ========================================

      const updatedBooking = await client.query(
        `
        UPDATE bookings
        SET
          payment_status =
            CASE
              WHEN $2::numeric <= 0 THEN 'paid'
              ELSE $3
            END,

          deposit_paid_at = COALESCE(deposit_paid_at, NOW()),

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

      await client.query("COMMIT");

      // ========================================
      // NOTIFY PLAYER
      // ========================================

      try {
        await createNotification({
          userId: payment.user_id,
          title: "تم قبول دفع العربون",
          message:
            "تم قبول دفع العربون الخاص بحجزك.",
          type: "payments",
          bookingId: payment.booking_id,
        });

        console.log(
          "✅ PAYMENT: Deposit approval notification sent to player:",
          payment.user_id
        );
      } catch (notificationError) {
        console.error(
          "❌ PAYMENT: Failed to send deposit approval notification:",
          notificationError.message
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Deposit payment approved successfully",

        payment: updatedPayment.rows[0],

        booking: updatedBooking.rows[0],
      });
    }

    // ========================================
    // APPROVE FULL PAYMENT
    // ========================================

    if (payment.payment_type === "full_payment") {
      // ========================================
      // CALCULATE ACTUAL PAID AMOUNT
      // ========================================
      //
      // We DO NOT trust bookings.remaining_amount
      // here because the full-payment amount can be:
      //
      // Fresh booking:
      // total_price
      //
      // After approved deposit:
      // total_price - paid deposit
      //
      // ========================================

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

      const expectedCents = Math.max(
        totalCents - paidCents,
        0
      );

      // ========================================
      // NO REMAINING AMOUNT
      // ========================================

      if (expectedCents <= 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "This booking has no remaining amount to pay",
        });
      }

      // ========================================
      // PAYMENT AMOUNT MUST MATCH
      // ACTUAL OUTSTANDING AMOUNT
      // ========================================

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

      // ========================================
      // APPROVE FULL PAYMENT
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
      //
      // deposit_paid_at مش بنلمسه هنا:
      // لو العربون اتدفع قبل كده يفضل تاريخه زي ما هو،
      // ولو الدفع كامل من البداية مفيش عربون أصلاً.
      //
      // ========================================

      const updatedBooking = await client.query(
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

      await client.query("COMMIT");

      // ========================================
      // NOTIFY PLAYER
      // ========================================

      try {
        await createNotification({
          userId: payment.user_id,
          title: "تم قبول الدفع بالكامل",
          message:
            "تم قبول عملية الدفع بالكامل الخاصة بحجزك.",
          type: "payments",
          bookingId: payment.booking_id,
        });

        console.log(
          "✅ PAYMENT: Full payment approval notification sent to player:",
          payment.user_id
        );
      } catch (notificationError) {
        console.error(
          "❌ PAYMENT: Failed to send full payment approval notification:",
          notificationError.message
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Full payment approved successfully",

        payment: updatedPayment.rows[0],

        booking: updatedBooking.rows[0],
      });
    }

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "❌ PAYMENT ROLLBACK ERROR:",
        rollbackError.message
      );
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
  getOwnerPaymentAccounts,
  updatePaymentAccount,
  deactivatePaymentAccount,

  getOwnerPayments,
  approvePayment,
  rejectPayment,
};