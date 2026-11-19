
const pool = require("../config/db");
const { createNotification } = require("./notificationController");

// Academy payments: academy_enrollments.id
// Academy owner: owners.id
// Player account: player_profiles.user_id
// Stadium payments remain separate.

const idOrNull = (value) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
};

const centsOrNull = (value) => {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const cents = Math.round(amount * 100);

  return Number.isSafeInteger(cents) && cents > 0
    ? cents
    : null;
};

const fail = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const notify = async (userId, title, message) => {
  if (!userId) return;

  try {
    await createNotification({
      userId,
      title,
      message,
      type: "payments",
    });
  } catch (error) {
    console.error(
      "ACADEMY PAYMENT NOTIFICATION ERROR:",
      error
    );
  }
};

const handleError = (res, error, operation) => {
  console.error(`${operation} ERROR:`, error);

  if (error.code === "23505") {
    return fail(
      res,
      409,
      "Duplicate academy payment or transaction reference"
    );
  }

  if (
    error.code === "40001" ||
    error.code === "40P01"
  ) {
    return fail(
      res,
      409,
      "Payment changed during processing. Please retry"
    );
  }

  return fail(
    res,
    500,
    `Failed to ${operation.toLowerCase()}`
  );
};

// ============================================================
// LOAD ENROLLMENT WITH PLAYER AND OWNER RELATIONSHIPS
// ============================================================

const loadEnrollment = async (
  db,
  enrollmentId,
  lock = false
) => {
  return db.query(
    `
    SELECT
      ae.id,
      ae.status AS enrollment_status,

      pp.user_id AS player_user_id,

      a.id AS academy_id,
      a.name AS academy_name,
      a.status AS academy_status,
      a.owner_id AS owner_profile_id,

      o.user_id AS owner_user_id,

      prog.id AS program_id,
      prog.name AS program_name,
      prog.price AS program_price

    FROM academy_enrollments ae

    JOIN player_profiles pp
      ON pp.id = ae.player_id

    JOIN academies a
      ON a.id = ae.academy_id

    JOIN owners o
      ON o.id = a.owner_id
     AND o.is_deleted = false

    JOIN academy_programs prog
      ON prog.id = ae.program_id
     AND prog.academy_id = ae.academy_id

    WHERE ae.id = $1

    ${lock ? "FOR UPDATE OF ae" : ""}
    `,
    [enrollmentId]
  );
};

// ============================================================
// GET ACADEMY PAYMENT ACCOUNTS
// GET /api/payments/academy/enrollments/:enrollmentId/accounts
// ============================================================

const getAcademyPaymentAccounts = async (req, res) => {
  try {
    const enrollmentId = idOrNull(
      req.params.enrollmentId
    );

    const userId = idOrNull(
      req.user?.userId
    );

    if (!enrollmentId || !userId) {
      return fail(
        res,
        400,
        "Invalid enrollment or user id"
      );
    }

    const result = await loadEnrollment(
      pool,
      enrollmentId
    );

    if (!result.rows.length) {
      return fail(
        res,
        404,
        "Enrollment not found"
      );
    }

    const enrollment = result.rows[0];

    if (
      String(enrollment.player_user_id) !==
      String(userId)
    ) {
      return fail(
        res,
        403,
        "This enrollment does not belong to you"
      );
    }

    if (enrollment.enrollment_status === "rejected") {
      return fail(
        res,
        409,
        "Rejected enrollment cannot be paid"
      );
    }

    const accounts = await pool.query(
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

      ORDER BY payment_method, id
      `,
      [enrollment.owner_profile_id]
    );

    return res.json({
      success: true,
      count: accounts.rows.length,
      accounts: accounts.rows,
    });

  } catch (error) {
    return handleError(
      res,
      error,
      "Get academy payment accounts"
    );
  }
};

// ============================================================
// CREATE ACADEMY PAYMENT
// POST /api/payments/academy/enrollments/:enrollmentId
//
// Body: { owner_payment_account_id }
// ============================================================

const createAcademyPayment = async (req, res) => {
  const enrollmentId = idOrNull(
    req.params.enrollmentId
  );

  const accountId = idOrNull(
    req.body?.owner_payment_account_id
  );

  const userId = idOrNull(
    req.user?.userId
  );

  if (!enrollmentId || !accountId || !userId) {
    return fail(
      res,
      400,
      "Valid enrollmentId and owner_payment_account_id are required"
    );
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Lock enrollment to serialize payment creation.
    const loaded = await loadEnrollment(
      client,
      enrollmentId,
      true
    );

    if (!loaded.rows.length) {
      await client.query("ROLLBACK");

      return fail(
        res,
        404,
        "Enrollment not found"
      );
    }

    const enrollment = loaded.rows[0];

    // Verify actual player.
    if (
      String(enrollment.player_user_id) !==
      String(userId)
    ) {
      await client.query("ROLLBACK");

      return fail(
        res,
        403,
        "This enrollment does not belong to you"
      );
    }

    // Check academy and enrollment status.
    if (
      enrollment.academy_status !== "approved" ||
      !["pending", "approved"].includes(
        enrollment.enrollment_status
      )
    ) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "Academy or enrollment is not eligible for payment"
      );
    }

    // Amount comes from academy_programs.price.
    // Never trust an amount supplied by the player.
    const amountCents = centsOrNull(
      enrollment.program_price
    );

    if (!amountCents) {
      await client.query("ROLLBACK");

      return fail(
        res,
        400,
        "This program has no valid positive payment amount"
      );
    }

    // Prevent pending or paid duplicate payments.
    const existing = await client.query(
      `
      SELECT id, status
      FROM academy_payments

      WHERE enrollment_id = $1
        AND status IN ('pending', 'paid')

      ORDER BY id DESC
      LIMIT 1
      `,
      [enrollmentId]
    );

    if (existing.rows.length) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "An active or paid payment already exists for this enrollment",
        payment: existing.rows[0],
      });
    }

    // Payment account must belong to the academy owner.
    const account = await client.query(
      `
      SELECT
        id,
        payment_method,
        wallet_provider,
        account_name,
        account_identifier

      FROM owner_payment_accounts

      WHERE id = $1
        AND owner_id = $2
        AND is_active = true
      `,
      [
        accountId,
        enrollment.owner_profile_id,
      ]
    );

    if (!account.rows.length) {
      await client.query("ROLLBACK");

      return fail(
        res,
        400,
        "Payment account is not active or does not belong to this academy"
      );
    }

    // Create pending payment.
    const payment = await client.query(
      `
      INSERT INTO academy_payments (
        enrollment_id,
        owner_payment_account_id,
        amount,
        payment_method
      )

      VALUES ($1, $2, $3, $4)

      RETURNING
        id,
        enrollment_id,
        owner_payment_account_id,
        amount,
        payment_method,
        status,
        transaction_reference,
        created_at,
        updated_at
      `,
      [
        enrollmentId,
        accountId,
        amountCents / 100,
        account.rows[0].payment_method,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,
      message:
        "Academy payment created successfully",
      payment: payment.rows[0],
      payment_account: account.rows[0],
    });

  } catch (error) {
    try {
      if (client) {
        await client.query("ROLLBACK");
      }
    } catch (rollbackError) {
      console.error(
        "ACADEMY PAYMENT CREATE ROLLBACK ERROR:",
        rollbackError
      );
    }

    return handleError(
      res,
      error,
      "Create academy payment"
    );

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// GET PLAYER ACADEMY PAYMENTS
// GET /api/payments/academy/enrollments/:enrollmentId
// ============================================================

const getPlayerAcademyPayments = async (req, res) => {
  try {
    const enrollmentId = idOrNull(
      req.params.enrollmentId
    );

    const userId = idOrNull(
      req.user?.userId
    );

    if (!enrollmentId || !userId) {
      return fail(
        res,
        400,
        "Invalid enrollment or user id"
      );
    }

    const loaded = await loadEnrollment(
      pool,
      enrollmentId
    );

    if (!loaded.rows.length) {
      return fail(
        res,
        404,
        "Enrollment not found"
      );
    }

    if (
      String(loaded.rows[0].player_user_id) !==
      String(userId)
    ) {
      return fail(
        res,
        403,
        "This enrollment does not belong to you"
      );
    }

    const result = await pool.query(
      `
      SELECT
        ap.id,
        ap.enrollment_id,
        ap.amount,
        ap.payment_method,
        ap.status,
        ap.transaction_reference,
        ap.owner_payment_account_id,
        ap.created_at,
        ap.updated_at,

        opa.wallet_provider,
        opa.account_name,
        opa.account_identifier

      FROM academy_payments ap

      LEFT JOIN owner_payment_accounts opa
        ON opa.id = ap.owner_payment_account_id

      WHERE ap.enrollment_id = $1

      ORDER BY ap.id DESC
      `,
      [enrollmentId]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows,
    });

  } catch (error) {
    return handleError(
      res,
      error,
      "Get player academy payments"
    );
  }
};

// ============================================================
// SUBMIT ACADEMY TRANSACTION REFERENCE
// POST /api/payments/academy/:paymentId/submit
//
// Body: { transaction_reference }
// ============================================================

const submitAcademyTransactionReference = async (
  req,
  res
) => {
  const paymentId = idOrNull(
    req.params.paymentId
  );

  const userId = idOrNull(
    req.user?.userId
  );

  const reference = req.body?.transaction_reference;

  if (
    !paymentId ||
    !userId ||
    typeof reference !== "string" ||
    !reference.trim()
  ) {
    return fail(
      res,
      400,
      "Valid paymentId and transaction_reference are required"
    );
  }

  const cleanedReference = reference.trim();

  if (cleanedReference.length > 255) {
    return fail(
      res,
      400,
      "Transaction reference is too long"
    );
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    const found = await client.query(
      `
      SELECT
        ap.id,
        ap.enrollment_id,
        ap.status,
        ap.transaction_reference,

        pp.user_id AS player_user_id,
        o.user_id AS owner_user_id,

        ae.status AS enrollment_status

      FROM academy_payments ap

      JOIN academy_enrollments ae
        ON ae.id = ap.enrollment_id

      JOIN player_profiles pp
        ON pp.id = ae.player_id

      JOIN academies a
        ON a.id = ae.academy_id

      JOIN owners o
        ON o.id = a.owner_id

      WHERE ap.id = $1

      FOR UPDATE OF ap
      `,
      [paymentId]
    );

    if (!found.rows.length) {
      await client.query("ROLLBACK");

      return fail(
        res,
        404,
        "Academy payment not found"
      );
    }

    const payment = found.rows[0];

    if (
      String(payment.player_user_id) !==
      String(userId)
    ) {
      await client.query("ROLLBACK");

      return fail(
        res,
        403,
        "This academy payment does not belong to you"
      );
    }

    if (
      payment.status !== "pending" ||
      payment.enrollment_status === "rejected"
    ) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "Payment is no longer eligible for submission"
      );
    }

    if (payment.transaction_reference?.trim()) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "Transaction reference was already submitted"
      );
    }

    // Serialize submissions using the same reference.
    await client.query(
      `
      SELECT pg_advisory_xact_lock(
        hashtext($1)::bigint
      )
      `,
      [cleanedReference]
    );

    // Check academy payments.
    const duplicate = await client.query(
      `
      SELECT id
      FROM academy_payments

      WHERE transaction_reference = $1
        AND id <> $2

      LIMIT 1
      `,
      [
        cleanedReference,
        paymentId,
      ]
    );

    // Check stadium payments as well.
    const stadiumDuplicate = await client.query(
      `
      SELECT id
      FROM payments

      WHERE transaction_reference = $1

      LIMIT 1
      `,
      [cleanedReference]
    );

    if (
      duplicate.rows.length ||
      stadiumDuplicate.rows.length
    ) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "This transaction reference is already used"
      );
    }

    const updated = await client.query(
      `
      UPDATE academy_payments

      SET
        transaction_reference = $1,
        updated_at = NOW()

      WHERE id = $2
        AND status = 'pending'
        AND (
          transaction_reference IS NULL
          OR BTRIM(transaction_reference) = ''
        )

      RETURNING
        id,
        enrollment_id,
        amount,
        payment_method,
        status,
        transaction_reference,
        owner_payment_account_id,
        created_at,
        updated_at
      `,
      [
        cleanedReference,
        paymentId,
      ]
    );

    if (!updated.rows.length) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "Academy payment changed. Refresh and try again"
      );
    }

    await client.query("COMMIT");

    await notify(
      payment.owner_user_id,
      "دفعة اشتراك أكاديمية للمراجعة",
      "تم إرسال رقم تحويل اشتراك أكاديمية ويحتاج إلى المراجعة."
    );

    await notify(
      userId,
      "تم إرسال بيانات دفع الأكاديمية",
      "تم استلام رقم المعاملة، وسيتم مراجعة الدفع."
    );

    return res.json({
      success: true,
      message: "Academy transfer reference submitted",
      payment: updated.rows[0],
    });

  } catch (error) {
    try {
      if (client) {
        await client.query("ROLLBACK");
      }
    } catch (rollbackError) {
      console.error(
        "ACADEMY SUBMIT ROLLBACK ERROR:",
        rollbackError
      );
    }

    return handleError(
      res,
      error,
      "Submit academy payment reference"
    );

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// GET OWNER ACADEMY PAYMENTS
// GET /api/payments/academy/owner
// ============================================================

const getOwnerAcademyPayments = async (req, res) => {
  try {
    const userId = idOrNull(req.user?.userId);

    if (!userId) {
      return fail(
        res,
        401,
        "Authentication required"
      );
    }

    const result = await pool.query(
      `
      SELECT
        ap.id,
        ap.enrollment_id,
        ap.amount,
        ap.payment_method,
        ap.status,
        ap.transaction_reference,
        ap.owner_payment_account_id,
        ap.created_at,
        ap.updated_at,

        ae.academy_id,
        ae.program_id,
        ae.status AS enrollment_status,

        a.name AS academy_name,
        prog.name AS program_name,

        u.full_name AS player_name,
        u.email AS player_email

      FROM academy_payments ap

      JOIN academy_enrollments ae
        ON ae.id = ap.enrollment_id

      JOIN academies a
        ON a.id = ae.academy_id

      JOIN owners o
        ON o.id = a.owner_id
       AND o.is_deleted = false

      JOIN academy_programs prog
        ON prog.id = ae.program_id

      JOIN player_profiles pp
        ON pp.id = ae.player_id

      JOIN users u
        ON u.id = pp.user_id

      WHERE o.user_id = $1

      ORDER BY ap.created_at DESC, ap.id DESC
      `,
      [userId]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      payments: result.rows,
    });

  } catch (error) {
    return handleError(
      res,
      error,
      "Get owner academy payments"
    );
  }
};

// ============================================================
// OWNER REVIEW: APPROVE / REJECT ACADEMY PAYMENT
// ============================================================

const reviewAcademyPayment = async (
  req,
  res,
  action
) => {
  const paymentId = idOrNull(
    req.params.paymentId
  );

  const userId = idOrNull(
    req.user?.userId
  );

  if (!paymentId || !userId) {
    return fail(
      res,
      400,
      "Invalid payment id"
    );
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Lock enrollment and payment together.
    const result = await client.query(
      `
      SELECT
        ap.id,
        ap.enrollment_id,
        ap.status,
        ap.transaction_reference,
        ap.amount,

        ae.status AS enrollment_status,

        pp.user_id AS player_user_id

      FROM academy_payments ap

      JOIN academy_enrollments ae
        ON ae.id = ap.enrollment_id

      JOIN academies a
        ON a.id = ae.academy_id

      JOIN owners o
        ON o.id = a.owner_id
       AND o.is_deleted = false

      JOIN player_profiles pp
        ON pp.id = ae.player_id

      WHERE ap.id = $1
        AND o.user_id = $2

      FOR UPDATE OF ae, ap
      `,
      [
        paymentId,
        userId,
      ]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");

      return fail(
        res,
        404,
        "Academy payment not found or does not belong to you"
      );
    }

    const payment = result.rows[0];

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "Only pending academy payments can be reviewed"
      );
    }

    // Extra checks for approval.
    if (action === "approve") {
      if (!payment.transaction_reference?.trim()) {
        await client.query("ROLLBACK");

        return fail(
          res,
          400,
          "Transaction reference has not been submitted"
        );
      }

      if (payment.enrollment_status === "rejected") {
        await client.query("ROLLBACK");

        return fail(
          res,
          409,
          "Cannot approve payment for a rejected enrollment"
        );
      }

      const amountCents = centsOrNull(
        payment.amount
      );

      if (!amountCents) {
        await client.query("ROLLBACK");

        return fail(
          res,
          409,
          "Invalid academy payment amount"
        );
      }

      const alreadyPaid = await client.query(
        `
        SELECT id
        FROM academy_payments

        WHERE enrollment_id = $1
          AND status = 'paid'
          AND id <> $2

        LIMIT 1
        `,
        [
          payment.enrollment_id,
          paymentId,
        ]
      );

      if (alreadyPaid.rows.length) {
        await client.query("ROLLBACK");

        return fail(
          res,
          409,
          "This enrollment already has an approved payment"
        );
      }
    }

    const newStatus =
      action === "approve" ? "paid" : "failed";

    const updated = await client.query(
      `
      UPDATE academy_payments

      SET
        status = $1,
        updated_at = NOW()

      WHERE id = $2
        AND status = 'pending'

      RETURNING
        id,
        enrollment_id,
        owner_payment_account_id,
        amount,
        payment_method,
        status,
        transaction_reference,
        created_at,
        updated_at
      `,
      [
        newStatus,
        paymentId,
      ]
    );

    if (!updated.rows.length) {
      await client.query("ROLLBACK");

      return fail(
        res,
        409,
        "Academy payment changed. Refresh and try again"
      );
    }

    await client.query("COMMIT");

    await notify(
      payment.player_user_id,
      action === "approve"
        ? "تم قبول دفع الأكاديمية"
        : "تم رفض دفع الأكاديمية",
      action === "approve"
        ? "تم قبول تحويل رسوم الاشتراك. حالة طلب الاشتراك تُراجع بشكل منفصل."
        : "تم رفض تحويل رسوم الاشتراك. راجع بيانات الدفع."
    );

    return res.json({
      success: true,
      message:
        action === "approve"
          ? "Academy payment approved"
          : "Academy payment rejected",
      payment: updated.rows[0],
    });

  } catch (error) {
    try {
      if (client) {
        await client.query("ROLLBACK");
      }
    } catch (rollbackError) {
      console.error(
        "ACADEMY REVIEW ROLLBACK ERROR:",
        rollbackError
      );
    }

    return handleError(
      res,
      error,
      `${action} academy payment`
    );

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// APPROVE ACADEMY PAYMENT
// ============================================================

const approveAcademyPayment = (req, res) =>
  reviewAcademyPayment(req, res, "approve");

// ============================================================
// REJECT ACADEMY PAYMENT
// ============================================================

const rejectAcademyPayment = (req, res) =>
  reviewAcademyPayment(req, res, "reject");

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getAcademyPaymentAccounts,
  createAcademyPayment,
  getPlayerAcademyPayments,
  submitAcademyTransactionReference,
  getOwnerAcademyPayments,
  approveAcademyPayment,
  rejectAcademyPayment,
};
