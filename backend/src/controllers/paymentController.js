const pool = require("../config/db");
const { createNotification } = require("./notificationController");

// ========================================
// CREATE PAYMENT
// POST /api/payments/deposit
// POST /api/payments/full
// ========================================

const createPayment = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      booking_id,
      owner_payment_account_id,
    } = req.body;

    // ========================================
    // VALIDATE INPUT
    // ========================================

    if (!booking_id || !owner_payment_account_id) {
      return res.status(400).json({
        success: false,
        message:
          "booking_id and owner_payment_account_id are required",
      });
    }

    const accountId = Number(owner_payment_account_id);

    if (!Number.isInteger(accountId) || accountId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner_payment_account_id",
      });
    }

    // ========================================
    // GET PAYMENT TYPE
    // ========================================
    //
    // /deposit => deposit
    // /full    => full_payment
    //
    // ========================================

    const paymentType =
      req.path.endsWith("/full")
        ? "full_payment"
        : "deposit";

    // ========================================
    // GET BOOKING
    // ========================================

    const bookingResult = await pool.query(
      `
      SELECT
        b.id,
        b.player_id,
        b.pitch_slot_id,
        b.status,
        b.total_price,
        b.deposit_amount,
        b.remaining_amount,
        b.payment_status,
        p.owner_id
      FROM bookings b
      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id
      INNER JOIN pitches p
        ON p.id = ps.pitch_id
      WHERE b.id = $1
      LIMIT 1
      `,
      [booking_id]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = bookingResult.rows[0];

    // ========================================
    // VERIFY PLAYER
    // ========================================

    const playerResult = await pool.query(
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
      return res.status(403).json({
        success: false,
        message: "Player user not found",
      });
    }

    const playerId = playerResult.rows[0].id;

    // ========================================
    // VERIFY BOOKING BELONGS TO PLAYER
    // ========================================

    if (String(booking.player_id) !== String(playerId)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to pay for this booking",
      });
    }

    // ========================================
    // VALIDATE BOOKING STATUS
    // ========================================

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot pay for a cancelled booking",
      });
    }

    if (booking.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Cannot pay for a rejected booking",
      });
    }

    // ========================================
    // CALCULATE PAYMENT AMOUNT
    // ========================================
    //
    // IMPORTANT:
    // Player does NOT send amount.
    //
    // Deposit:
    //   booking.deposit_amount
    //
    // Full payment:
    //   total_price - (sum of CONFIRMED 'paid' payments)
    //   => 350 for a fresh booking
    //   => 250 after the deposit has been paid
    //
    // ========================================

    const totalPrice = Number(booking.total_price || 0);
    const depositAmount = Number(booking.deposit_amount || 0);

    // Amount actually paid so far (confirmed payments only)
    const paidResult = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS paid
      FROM payments
      WHERE booking_id = $1
        AND status = 'paid'
      `,
      [booking.id]
    );

    const paidAmount = Number(paidResult.rows[0].paid);
    const outstandingAmount = totalPrice - paidAmount;

    if (outstandingAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "This booking is already fully paid",
      });
    }

    let paymentAmount;

    // ========================================
    // DEPOSIT PAYMENT
    // ========================================

    if (paymentType === "deposit") {
      paymentAmount = depositAmount;

      if (paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "No deposit is required for this booking",
        });
      }
    }

    // ========================================
    // FULL PAYMENT
    // ========================================

    if (paymentType === "full_payment") {
      // Pay everything that is still outstanding:
      // total if nothing was paid, remaining if deposit was paid.
      paymentAmount = outstandingAmount;
    }

    // ========================================
    // CHECK EXISTING PAYMENT
    // ========================================
    //
    // Prevent duplicate pending/paid payments
    // for the same payment type.
    //
    // ========================================

    const existingPaymentResult = await pool.query(
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
        AND user_id = $2
        AND payment_type = $3
        AND status IN ('pending', 'paid')
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        booking.id,
        userId,
        paymentType,
      ]
    );

    if (existingPaymentResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          `A ${paymentType} payment already exists for this booking`,
        payment: existingPaymentResult.rows[0],
      });
    }

    // ========================================
    // CONFLICTING PAYMENT PROTECTION
    // ========================================
    //
    // The player can choose either:
    //   - deposit, or
    //   - full payment (paid from the start)
    //
    // Rules:
    // 1) A pending payment of the OTHER type blocks this one
    //    (no double payment at the same time).
    // 2) A PAID deposit does NOT block full payment
    //    (full payment then equals the remaining amount).
    // 3) A PAID full payment means the booking is fully paid,
    //    already rejected above by the outstanding check.
    //
    // ========================================

    const conflictingType =
      paymentType === "full_payment" ? "deposit" : "full_payment";

    const conflictResult = await pool.query(
      `
      SELECT
        id,
        amount,
        status,
        payment_type,
        transaction_reference
      FROM payments
      WHERE booking_id = $1
        AND user_id = $2
        AND payment_type = $3
        AND status IN ('pending', 'paid')
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        booking.id,
        userId,
        conflictingType,
      ]
    );

    const isConflict =
      conflictResult.rows.length > 0 &&
      !(
        paymentType === "full_payment" &&
        conflictResult.rows[0].payment_type === "deposit" &&
        conflictResult.rows[0].status === "paid"
      );

    if (isConflict) {
      return res.status(409).json({
        success: false,
        message:
          "Another payment for this booking is pending or already paid.",
        payment: conflictResult.rows[0],
      });
    }

    // ========================================
    // CHECK SELECTED OWNER PAYMENT ACCOUNT
    // ========================================
    //
    // The player selects an account by ID. We verify that:
    //   1) it exists
    //   2) it belongs to the owner of this booking
    //   3) it is active
    //
    // The payment method is taken from the account itself.
    //
    // ========================================

    const accountResult = await pool.query(
      `
      SELECT
        id,
        owner_id,
        payment_method,
        wallet_provider,
        account_name,
        account_identifier
      FROM owner_payment_accounts
      WHERE id = $1
        AND owner_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [
        accountId,
        booking.owner_id,
      ]
    );

    if (accountResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "The selected payment account is not available for this owner",
      });
    }

    const paymentAccount = accountResult.rows[0];

    const paymentMethod =
      paymentAccount.payment_method;

    // ========================================
    // CREATE PAYMENT
    // ========================================

    const paymentResult = await pool.query(
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
        booking.id,
        paymentAmount,
        paymentMethod,
        paymentType,
        paymentAccount.id,
      ]
    );

    // ========================================
    // CREATE PAYMENT NOTIFICATION
    // ========================================

    try {
      await createNotification({
        userId: userId,
        title: "تم إنشاء عملية دفع",
        message:
          paymentType === "deposit"
            ? "تم إنشاء طلب دفع العربون بنجاح."
            : "تم إنشاء طلب دفع المبلغ المتبقي بنجاح.",
        type: "payments",
        bookingId: booking.id,
      });

      console.log(
        "✅ PAYMENT: Notification created for player:",
        userId
      );
    } catch (notificationError) {
      console.error(
        "❌ PAYMENT: Failed to create notification:",
        notificationError.message
      );
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,

      message:
        paymentType === "deposit"
          ? "Deposit payment created successfully"
          : "Full payment created successfully",

      payment: paymentResult.rows[0],

      payment_account: {
        id: paymentAccount.id,
        payment_method: paymentAccount.payment_method,
        wallet_provider: paymentAccount.wallet_provider,
        account_name: paymentAccount.account_name,
        account_identifier:
          paymentAccount.account_identifier,
      },

      booking: {
        id: booking.id,
        total_price: booking.total_price,
        deposit_amount: booking.deposit_amount,
        remaining_amount: booking.remaining_amount,
        paid_amount: paidAmount,
        outstanding_amount: outstandingAmount,
      },
    });

  } catch (error) {
    console.error("CREATE PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create payment",
    });
  }
};

// ========================================
// SUBMIT TRANSACTION REFERENCE
// POST /api/payments/:id/submit
// ========================================

const submitTransactionReference = async (req, res) => {
  try {
    const userId = req.user.userId;
    const paymentId = req.params.id;

    const {
      transaction_reference,
    } = req.body;

    // ========================================
    // VALIDATE INPUT
    // ========================================

    if (
      !transaction_reference ||
      !transaction_reference.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "transaction_reference is required",
      });
    }

    // ========================================
    // GET PAYMENT + OWNER USER
    // ========================================
    //
    // LEFT JOINs so older payments without an
    // owner_payment_account_id can still be submitted.
    // In that case owner_user_id will be NULL and
    // the owner notification is skipped.
    //
    // ========================================

    const paymentResult = await pool.query(
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
        opa.owner_id,
        o.user_id AS owner_user_id
      FROM payments pay

      LEFT JOIN owner_payment_accounts opa
        ON opa.id = pay.owner_payment_account_id

      LEFT JOIN owners o
        ON o.id = opa.owner_id

      WHERE pay.id = $1

      LIMIT 1
      `,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // ========================================
    // VERIFY PAYMENT OWNER
    // ========================================

    if (String(payment.user_id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this payment",
      });
    }

    // ========================================
    // PAYMENT TYPE
    // ========================================

    if (
      !["deposit", "full_payment"].includes(
        payment.payment_type
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment type",
      });
    }

    // ========================================
    // PAYMENT STATUS
    // ========================================

    if (payment.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "This payment is no longer pending",
      });
    }

    // ========================================
    // PREVENT DUPLICATE REFERENCE
    // ========================================

    const referenceResult = await pool.query(
      `
      SELECT id
      FROM payments
      WHERE transaction_reference = $1
        AND id <> $2
      LIMIT 1
      `,
      [
        transaction_reference.trim(),
        paymentId,
      ]
    );

    if (referenceResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This transaction reference is already used",
      });
    }

    // ========================================
    // SAVE TRANSACTION REFERENCE
    // ========================================

    const updateResult = await pool.query(
      `
      UPDATE payments
      SET transaction_reference = $1
      WHERE id = $2
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
        transaction_reference.trim(),
        paymentId,
      ]
    );

    // ========================================
    // NOTIFY PLAYER
    // ========================================

    try {
      await createNotification({
        userId: userId,
        title: "تم إرسال بيانات الدفع",
        message:
          "تم إرسال رقم المعاملة بنجاح، وسيتم مراجعته.",
        type: "payments",
        bookingId: payment.booking_id,
      });

      console.log(
        "✅ PAYMENT: Transaction notification created for player:",
        userId
      );
    } catch (notificationError) {
      console.error(
        "❌ PAYMENT: Failed to notify player:",
        notificationError.message
      );
    }

    // ========================================
    // NOTIFY OWNER
    // ========================================

    if (payment.owner_user_id) {
      try {
        await createNotification({
          userId: payment.owner_user_id,
          title: "دفعة جديدة تحتاج للمراجعة",
          message:
            "تم إرسال رقم معاملة جديد لأحد الحجوزات ويحتاج إلى المراجعة.",
          type: "payments",
          bookingId: payment.booking_id,
        });

        console.log(
          "✅ PAYMENT: Owner notification created:",
          payment.owner_user_id
        );
      } catch (notificationError) {
        console.error(
          "❌ PAYMENT: Failed to notify owner:",
          notificationError.message
        );
      }
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Transaction reference submitted successfully",
      payment: updateResult.rows[0],
    });

  } catch (error) {
    console.error(
      "SUBMIT TRANSACTION REFERENCE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to submit transaction reference",
    });
  }
};

// ========================================
// GET BOOKING PAYMENT ACCOUNTS
// GET /api/payments/booking/:bookingId/accounts
// ========================================

const getBookingPaymentAccounts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const bookingId = req.params.bookingId;

    // ========================================
    // VALIDATE BOOKING ID
    // ========================================

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    // ========================================
    // GET BOOKING + OWNER
    // ========================================

    const bookingResult = await pool.query(
      `
      SELECT
        b.id,
        b.player_id,
        p.owner_id
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

    // ========================================
    // BOOKING NOT FOUND
    // ========================================

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = bookingResult.rows[0];

    // ========================================
    // VERIFY BOOKING BELONGS TO PLAYER
    // ========================================

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

    // ========================================
    // GET ACTIVE OWNER PAYMENT ACCOUNTS
    // ========================================

    const accountsResult = await pool.query(
      `
      SELECT
        id,
        payment_method,
        wallet_provider,
        account_name,
        account_identifier,
        is_active
      FROM owner_payment_accounts
      WHERE owner_id = $1
        AND is_active = true
      ORDER BY
        payment_method ASC,
        wallet_provider ASC NULLS FIRST,
        id ASC
      `,
      [booking.owner_id]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      count: accountsResult.rows.length,
      accounts: accountsResult.rows,
    });
  } catch (error) {
    console.error(
      "GET BOOKING PAYMENT ACCOUNTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get booking payment accounts",
    });
  }
};

// ========================================
// GET BOOKING PAYMENTS
// GET /api/payments/booking/:bookingId
// ========================================

const getBookingPayments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const bookingId = req.params.bookingId;

    // ========================================
    // VALIDATE BOOKING ID
    // ========================================

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required",
      });
    }

    // ========================================
    // GET BOOKING
    // ========================================

    const bookingResult = await pool.query(
      `
      SELECT
        b.id,
        b.player_id
      FROM bookings b
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

    // ========================================
    // VERIFY BOOKING BELONGS TO PLAYER
    // ========================================

    if (String(booking.player_id) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view payments for this booking",
      });
    }

    // ========================================
    // GET PAYMENTS
    // ========================================

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

        opa.payment_method AS payment_account_method,
        opa.wallet_provider AS payment_account_wallet_provider,
        opa.account_name AS payment_account_name,
        opa.account_identifier AS payment_account_identifier

      FROM payments pay

      LEFT JOIN owner_payment_accounts opa
        ON opa.id = pay.owner_payment_account_id

      WHERE pay.booking_id = $1
        AND pay.user_id = $2

      ORDER BY pay.id DESC
      `,
      [bookingId, userId]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      count: paymentsResult.rows.length,
      payments: paymentsResult.rows,
    });
  } catch (error) {
    console.error("GET BOOKING PAYMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get booking payments",
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  createPayment,
  submitTransactionReference,
  getBookingPayments,
  getBookingPaymentAccounts,
};