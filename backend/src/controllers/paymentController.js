
const pool = require("../config/db");
const { createNotification } = require("./notificationController");

// ============================================================
// HELPERS
// ============================================================

// pitches.owner_id references users.id.
// owner_payment_accounts.owner_id references owners.id.

const toId = (value) => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
};

const toCents = (value) =>
  Math.round(Number(value) * 100);

const rollbackResponse = async (
  client,
  res,
  status,
  message,
  extra = {}
) => {
  await client.query("ROLLBACK");

  return res.status(status).json({
    success: false,
    message,
    ...extra,
  });
};

const notify = async (data) => {
  try {
    await createNotification(data);
  } catch (error) {
    console.error(
      "PAYMENT NOTIFICATION ERROR:",
      error
    );
  }
};

const handleError = (res, error, message) => {
  console.error(message, error);

  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message:
        "This payment or transaction reference already exists",
    });
  }

  if (
    error.code === "40P01" ||
    error.code === "40001"
  ) {
    return res.status(409).json({
      success: false,
      message:
        "Payment changed while processing. Please retry",
    });
  }

  return res.status(500).json({
    success: false,
    message,
  });
};

// ============================================================
// CREATE PAYMENT
// POST /api/payments/deposit
// POST /api/payments/full
// ============================================================

const createPayment = async (req, res) => {
  let client;
  let inTransaction = false;

  try {
    const userId = toId(req.user?.userId);

    const bookingId = toId(
      req.body?.booking_id
    );

    const accountId = toId(
      req.body?.owner_payment_account_id
    );

    // --------------------------------------------------------
    // VALIDATE INPUT
    // --------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!bookingId || !accountId) {
      return res.status(400).json({
        success: false,
        message:
          "Valid booking_id and owner_payment_account_id are required",
      });
    }

    // --------------------------------------------------------
    // DETERMINE PAYMENT TYPE
    // --------------------------------------------------------

    const paymentType =
      req.path.endsWith("/full")
        ? "full_payment"
        : "deposit";

    client = await pool.connect();

    await client.query("BEGIN");
    inTransaction = true;

    // --------------------------------------------------------
    // LOCK BOOKING
    // --------------------------------------------------------
    // Prevent simultaneous requests from creating
    // duplicate pending payments for one booking.
    // --------------------------------------------------------

    const bookingResult = await client.query(
      `
      SELECT
        b.id,
        b.player_id,
        b.status,
        b.total_price,
        b.deposit_amount,
        b.remaining_amount,
        b.payment_status,
        p.owner_id AS owner_user_id

      FROM bookings b

      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id

      INNER JOIN pitches p
        ON p.id = ps.pitch_id

      WHERE b.id = $1

      FOR UPDATE OF b
      `,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        404,
        "Booking not found"
      );
    }

    const booking = bookingResult.rows[0];

    // --------------------------------------------------------
    // VERIFY PLAYER
    // --------------------------------------------------------

    const playerResult = await client.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND role = 'player'
        AND is_active = true
      LIMIT 1
      `,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        403,
        "Player user not found"
      );
    }

    // --------------------------------------------------------
    // VERIFY BOOKING OWNERSHIP
    // --------------------------------------------------------

    if (
      String(booking.player_id) !==
      String(userId)
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        403,
        "You are not allowed to pay for this booking"
      );
    }

    // --------------------------------------------------------
    // VALIDATE BOOKING STATUS
    // --------------------------------------------------------

    if (
      ["cancelled", "rejected"].includes(
        booking.status
      )
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "Cannot pay for a cancelled or rejected booking"
      );
    }

    // --------------------------------------------------------
    // CALCULATE AMOUNTS IN CENTS
    // --------------------------------------------------------

    const totalCents = toCents(
      booking.total_price
    );

    const depositCents = toCents(
      booking.deposit_amount
    );

    if (
      !Number.isSafeInteger(totalCents) ||
      totalCents <= 0
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "Invalid booking total price"
      );
    }

    // --------------------------------------------------------
    // GET EXISTING PAYMENTS
    // --------------------------------------------------------

    const paymentsResult = await client.query(
      `
      SELECT
        id,
        amount,
        payment_method,
        payment_type,
        status,
        transaction_reference,
        owner_payment_account_id,
        created_at

      FROM payments

      WHERE booking_id = $1
        AND status IN ('pending', 'paid')

      ORDER BY id DESC
      `,
      [bookingId]
    );

    const previousPayments =
      paymentsResult.rows;

    // --------------------------------------------------------
    // PREVENT DUPLICATE PENDING PAYMENTS
    // --------------------------------------------------------

    const pending = previousPayments.find(
      (payment) => payment.status === "pending"
    );

    if (pending) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        409,
        "A pending payment already exists for this booking",
        { payment: pending }
      );
    }

    // --------------------------------------------------------
    // CALCULATE CONFIRMED PAYMENTS
    // --------------------------------------------------------

    const paidCents = previousPayments
      .filter(
        (payment) => payment.status === "paid"
      )
      .reduce(
        (sum, payment) =>
          sum + toCents(payment.amount),
        0
      );

    if (
      !Number.isSafeInteger(paidCents) ||
      paidCents < 0 ||
      paidCents > totalCents
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        409,
        "Booking payment totals are inconsistent"
      );
    }

    const outstandingCents =
      totalCents - paidCents;

    if (outstandingCents <= 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "This booking is already fully paid"
      );
    }

    // --------------------------------------------------------
    // CALCULATE NEW PAYMENT AMOUNT
    // --------------------------------------------------------

    let paymentCents;

    if (paymentType === "deposit") {
      if (
        !Number.isSafeInteger(depositCents) ||
        depositCents <= 0 ||
        depositCents > totalCents
      ) {
        inTransaction = false;

        return await rollbackResponse(
          client,
          res,
          400,
          "No valid deposit amount exists for this booking"
        );
      }

      // Prevent a second deposit after any
      // confirmed payment for this booking.

      if (paidCents > 0) {
        inTransaction = false;

        return await rollbackResponse(
          client,
          res,
          409,
          "A payment was already approved for this booking"
        );
      }

      paymentCents = depositCents;
    } else {
      // Fresh booking: total amount.
      // After deposit: remaining amount.

      paymentCents = outstandingCents;
    }

    // --------------------------------------------------------
    // VERIFY OWNER PAYMENT ACCOUNT
    // --------------------------------------------------------
    // Pitches store users.id.
    // Payment accounts store owners.id.
    // Join through owners.user_id.
    // --------------------------------------------------------

    const accountResult = await client.query(
      `
      SELECT
        opa.id,
        opa.owner_id,
        opa.payment_method,
        opa.wallet_provider,
        opa.account_name,
        opa.account_identifier

      FROM owner_payment_accounts opa

      INNER JOIN owners o
        ON o.id = opa.owner_id

      WHERE opa.id = $1
        AND o.user_id = $2
        AND o.is_deleted = false
        AND opa.is_active = true

      LIMIT 1
      `,
      [
        accountId,
        booking.owner_user_id,
      ]
    );

    if (accountResult.rows.length === 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "The selected payment account is not available for this owner"
      );
    }

    const paymentAccount =
      accountResult.rows[0];

    // --------------------------------------------------------
    // CREATE PAYMENT
    // --------------------------------------------------------

    const paymentResult = await client.query(
      `
      INSERT INTO payments (
        user_id,
        booking_id,
        amount,
        payment_method,
        payment_type,
        status,
        owner_payment_account_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'pending',
        $6
      )

      RETURNING
        id,
        user_id,
        booking_id,
        amount,
        payment_method,
        payment_type,
        status,
        owner_payment_account_id,
        transaction_reference,
        created_at
      `,
      [
        userId,
        bookingId,
        paymentCents / 100,
        paymentAccount.payment_method,
        paymentType,
        paymentAccount.id,
      ]
    );

    // --------------------------------------------------------
    // COMMIT
    // --------------------------------------------------------

    await client.query("COMMIT");

    inTransaction = false;

    client.release();
    client = null;

    // --------------------------------------------------------
    // NOTIFY PLAYER
    // --------------------------------------------------------

    await notify({
      userId,
      title: "تم إنشاء عملية دفع",
      message:
        paymentType === "deposit"
          ? "تم إنشاء طلب دفع العربون بنجاح."
          : "تم إنشاء طلب دفع المبلغ المتبقي بنجاح.",
      type: "payments",
      bookingId,
    });

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        paymentType === "deposit"
          ? "Deposit payment created successfully"
          : "Full payment created successfully",

      payment: paymentResult.rows[0],

      payment_account: {
        id: paymentAccount.id,
        payment_method:
          paymentAccount.payment_method,
        wallet_provider:
          paymentAccount.wallet_provider,
        account_name:
          paymentAccount.account_name,
        account_identifier:
          paymentAccount.account_identifier,
      },

      booking: {
        id: bookingId,
        total_price: booking.total_price,
        deposit_amount: booking.deposit_amount,
        remaining_amount: booking.remaining_amount,
        paid_amount: paidCents / 100,
        outstanding_amount:
          outstandingCents / 100,
      },
    });

  } catch (error) {
    if (client && inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "CREATE PAYMENT ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    return handleError(
      res,
      error,
      "Failed to create payment"
    );

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// SUBMIT TRANSACTION REFERENCE
// POST /api/payments/:id/submit
// ============================================================

const submitTransactionReference = async (
  req,
  res
) => {
  let client;
  let inTransaction = false;

  try {
    const userId = toId(req.user?.userId);
    const paymentId = toId(req.params.id);

    const rawReference =
      req.body?.transaction_reference;

    // --------------------------------------------------------
    // VALIDATE INPUT
    // --------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment id",
      });
    }

    if (
      typeof rawReference !== "string" ||
      !rawReference.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "transaction_reference is required",
      });
    }

    const reference =
      rawReference.trim();

    client = await pool.connect();

    await client.query("BEGIN");
    inTransaction = true;

    // --------------------------------------------------------
    // LOCK PAYMENT AND GET ACTUAL PITCH OWNER
    // --------------------------------------------------------

    const paymentResult = await client.query(
      `
      SELECT
        pay.id,
        pay.user_id,
        pay.booking_id,
        pay.amount,
        pay.payment_method,
        pay.payment_type,
        pay.status,
        pay.transaction_reference,
        pay.owner_payment_account_id,

        p.owner_id AS owner_user_id,

        b.status AS booking_status

      FROM payments pay

      INNER JOIN bookings b
        ON b.id = pay.booking_id

      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id

      INNER JOIN pitches p
        ON p.id = ps.pitch_id

      WHERE pay.id = $1

      FOR UPDATE OF pay
      `,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        404,
        "Payment not found"
      );
    }

    const payment = paymentResult.rows[0];

    // --------------------------------------------------------
    // VERIFY PAYMENT OWNER
    // --------------------------------------------------------

    if (
      String(payment.user_id) !==
      String(userId)
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        403,
        "You are not allowed to update this payment"
      );
    }

    if (
      !["deposit", "full_payment"].includes(
        payment.payment_type
      )
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "Invalid payment type"
      );
    }

    if (payment.status !== "pending") {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "This payment is no longer pending"
      );
    }

    if (
      ["cancelled", "rejected"].includes(
        payment.booking_status
      )
    ) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        400,
        "Booking is cancelled or rejected"
      );
    }

    // --------------------------------------------------------
    // PREVENT CHANGING A SUBMITTED REFERENCE
    // --------------------------------------------------------

    if (
      payment.transaction_reference?.trim()
    ) {
      if (
        payment.transaction_reference.trim() ===
        reference
      ) {
        await client.query("COMMIT");

        inTransaction = false;

        return res.status(200).json({
          success: true,
          message:
            "Transaction reference already submitted",
          payment,
        });
      }

      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        409,
        "This payment already has a transaction reference"
      );
    }

    // --------------------------------------------------------
    // PREVENT CONCURRENT DUPLICATE REFERENCES
    // --------------------------------------------------------
    // PostgreSQL advisory transaction lock:
    // requests using the same reference are serialized.
    // --------------------------------------------------------

    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext($1)::bigint
      )
      `,
      [reference]
    );

    const duplicateResult = await client.query(
      `
      SELECT id
      FROM payments
      WHERE transaction_reference = $1
        AND id <> $2
      LIMIT 1
      `,
      [
        reference,
        paymentId,
      ]
    );

    if (duplicateResult.rows.length > 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        409,
        "This transaction reference is already used"
      );
    }

    // --------------------------------------------------------
    // SAVE TRANSACTION REFERENCE
    // --------------------------------------------------------

    const updateResult = await client.query(
      `
      UPDATE payments

      SET transaction_reference = $1

      WHERE id = $2
        AND user_id = $3
        AND status = 'pending'
        AND (
          transaction_reference IS NULL
          OR BTRIM(transaction_reference) = ''
        )

      RETURNING
        id,
        user_id,
        booking_id,
        amount,
        payment_method,
        payment_type,
        status,
        transaction_reference,
        owner_payment_account_id,
        created_at
      `,
      [
        reference,
        paymentId,
        userId,
      ]
    );

    if (updateResult.rows.length === 0) {
      inTransaction = false;

      return await rollbackResponse(
        client,
        res,
        409,
        "Payment was changed. Refresh and try again"
      );
    }

    // --------------------------------------------------------
    // COMMIT
    // --------------------------------------------------------

    await client.query("COMMIT");

    inTransaction = false;

    client.release();
    client = null;

    // --------------------------------------------------------
    // NOTIFY PLAYER
    // --------------------------------------------------------

    await notify({
      userId,
      title: "تم إرسال بيانات الدفع",
      message:
        "تم إرسال رقم المعاملة بنجاح، وسيتم مراجعته.",
      type: "payments",
      bookingId: payment.booking_id,
    });

    // --------------------------------------------------------
    // NOTIFY PITCH OWNER
    // --------------------------------------------------------

    if (payment.owner_user_id) {
      await notify({
        userId: payment.owner_user_id,
        title: "دفعة جديدة تحتاج للمراجعة",
        message:
          "تم إرسال رقم معاملة جديد لأحد الحجوزات ويحتاج إلى المراجعة.",
        type: "payments",
        bookingId: payment.booking_id,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Transaction reference submitted successfully",
      payment: updateResult.rows[0],
    });

  } catch (error) {
    if (client && inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "SUBMIT REFERENCE ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    return handleError(
      res,
      error,
      "Failed to submit transaction reference"
    );

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// GET BOOKING PAYMENT ACCOUNTS
// GET /api/payments/booking/:bookingId/accounts
// ============================================================

const getBookingPaymentAccounts = async (
  req,
  res
) => {
  try {
    const userId = toId(req.user?.userId);

    const bookingId = toId(
      req.params.bookingId
    );

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Invalid bookingId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // --------------------------------------------------------
    // GET BOOKING
    // --------------------------------------------------------

    const bookingResult = await pool.query(
      `
      SELECT
        b.id,
        b.player_id,
        p.owner_id AS owner_user_id

      FROM bookings b

      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id

      INNER JOIN pitches p
        ON p.id = ps.pitch_id

      WHERE b.id = $1

      LIMIT 1
      `,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = bookingResult.rows[0];

    // --------------------------------------------------------
    // VERIFY PLAYER OWNS BOOKING
    // --------------------------------------------------------

    if (
      String(booking.player_id) !==
      String(userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to view payment accounts for this booking",
      });
    }

    // --------------------------------------------------------
    // GET OWNER ACTIVE PAYMENT ACCOUNTS
    // --------------------------------------------------------

    const accountsResult = await pool.query(
      `
      SELECT
        opa.id,
        opa.payment_method,
        opa.wallet_provider,
        opa.account_name,
        opa.account_identifier,
        opa.is_active

      FROM owner_payment_accounts opa

      INNER JOIN owners o
        ON o.id = opa.owner_id

      WHERE o.user_id = $1
        AND o.is_deleted = false
        AND opa.is_active = true

      ORDER BY
        opa.payment_method ASC,
        opa.wallet_provider ASC NULLS FIRST,
        opa.id ASC
      `,
      [booking.owner_user_id]
    );

    return res.status(200).json({
      success: true,
      count: accountsResult.rows.length,
      accounts: accountsResult.rows,
    });

  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to get booking payment accounts"
    );
  }
};

// ============================================================
// GET BOOKING PAYMENTS
// GET /api/payments/booking/:bookingId
// ============================================================

const getBookingPayments = async (req, res) => {
  try {
    const userId = toId(req.user?.userId);

    const bookingId = toId(
      req.params.bookingId
    );

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Invalid bookingId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // --------------------------------------------------------
    // VERIFY BOOKING OWNERSHIP
    // --------------------------------------------------------

    const bookingResult = await pool.query(
      `
      SELECT
        id,
        player_id
      FROM bookings
      WHERE id = $1
      LIMIT 1
      `,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (
      String(bookingResult.rows[0].player_id) !==
      String(userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to view payments for this booking",
      });
    }

    // --------------------------------------------------------
    // GET ALL BOOKING PAYMENTS
    // --------------------------------------------------------

    const paymentsResult = await pool.query(
      `
      SELECT
        pay.id,
        pay.user_id,
        pay.booking_id,
        pay.amount,
        pay.payment_method,
        pay.payment_type,
        pay.status,
        pay.owner_payment_account_id,
        pay.transaction_reference,
        pay.created_at,

        opa.payment_method
          AS payment_account_method,

        opa.wallet_provider
          AS payment_account_wallet_provider,

        opa.account_name
          AS payment_account_name,

        opa.account_identifier
          AS payment_account_identifier

      FROM payments pay

      LEFT JOIN owner_payment_accounts opa
        ON opa.id = pay.owner_payment_account_id

      WHERE pay.booking_id = $1
        AND pay.user_id = $2

      ORDER BY pay.id DESC
      `,
      [
        bookingId,
        userId,
      ]
    );

    return res.status(200).json({
      success: true,
      count: paymentsResult.rows.length,
      payments: paymentsResult.rows,
    });

  } catch (error) {
    return handleError(
      res,
      error,
      "Failed to get booking payments"
    );
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createPayment,
  submitTransactionReference,
  getBookingPayments,
  getBookingPaymentAccounts,
};
