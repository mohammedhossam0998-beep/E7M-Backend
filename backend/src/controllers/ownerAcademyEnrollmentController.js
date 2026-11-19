
const pool = require("../config/db");

// ============================================================
// HELPERS
// ============================================================

// Academy ownership uses owners.id.
// Stadium ownership uses users.id.
// Do not mix them.

const validId = (value) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
};

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const getOwnerId = async (userId) => {
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

  return result.rows[0]?.id ?? null;
};

const getOwnerAcademy = async (
  academyId,
  ownerId
) => {
  const result = await pool.query(
    `
    SELECT id, name, status
    FROM academies
    WHERE id = $1
      AND owner_id = $2
    `,
    [academyId, ownerId]
  );

  return result.rows[0] ?? null;
};

// ============================================================
// GET OWNER ACADEMY PLAYERS / ENROLLMENTS
// GET /api/owner/academies/:academyId/players
// ============================================================

const getOwnerAcademyPlayers = async (req, res) => {
  try {
    const academyId = validId(
      req.params.academyId
    );

    if (!academyId) {
      return sendError(
        res,
        400,
        "Invalid academy ID"
      );
    }

    const ownerId = await getOwnerId(
      req.user?.userId
    );

    if (!ownerId) {
      return sendError(
        res,
        403,
        "Owner profile not found"
      );
    }

    const academy = await getOwnerAcademy(
      academyId,
      ownerId
    );

    if (!academy) {
      return sendError(
        res,
        404,
        "Academy not found or does not belong to you"
      );
    }

    const result = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,
        ae.enrolled_at,
        ae.updated_at,

        ap.name AS program_name,
        ap.description AS program_description,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks AS program_duration_weeks,

        pp.user_id AS player_user_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image

      FROM academy_enrollments ae

      JOIN academy_programs ap
        ON ap.id = ae.program_id

      JOIN player_profiles pp
        ON pp.id = ae.player_id

      JOIN users u
        ON u.id = pp.user_id

      WHERE ae.academy_id = $1

      ORDER BY ae.id DESC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,

      academy: {
        id: academy.id,
        name: academy.name,
        status: academy.status,
      },

      count: result.rows.length,

      players: result.rows,
      enrollments: result.rows,
    });

  } catch (error) {
    console.error(
      "GET OWNER ACADEMY PLAYERS ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to get academy players"
    );
  }
};

// ============================================================
// GET OWNER ENROLLMENT BY ID
// GET /api/owner/enrollments/:id
// ============================================================

const getOwnerEnrollmentById = async (
  req,
  res
) => {
  try {
    const enrollmentId = validId(
      req.params.id
    );

    if (!enrollmentId) {
      return sendError(
        res,
        400,
        "Invalid enrollment ID"
      );
    }

    const ownerId = await getOwnerId(
      req.user?.userId
    );

    if (!ownerId) {
      return sendError(
        res,
        403,
        "Owner profile not found"
      );
    }

    const result = await pool.query(
      `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,
        ae.enrolled_at,
        ae.updated_at,

        a.name AS academy_name,
        a.status AS academy_status,

        ap.name AS program_name,
        ap.description AS program_description,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks AS program_duration_weeks,

        pp.user_id AS player_user_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image

      FROM academy_enrollments ae

      JOIN academies a
        ON a.id = ae.academy_id

      JOIN academy_programs ap
        ON ap.id = ae.program_id

      JOIN player_profiles pp
        ON pp.id = ae.player_id

      JOIN users u
        ON u.id = pp.user_id

      WHERE ae.id = $1
        AND a.owner_id = $2
      `,
      [enrollmentId, ownerId]
    );

    if (!result.rows.length) {
      return sendError(
        res,
        404,
        "Enrollment not found or does not belong to you"
      );
    }

    const e = result.rows[0];

    return res.status(200).json({
      success: true,

      enrollment: {
        id: e.id,
        academy_id: e.academy_id,
        program_id: e.program_id,
        player_id: e.player_id,
        status: e.status,
        enrolled_at: e.enrolled_at,
        updated_at: e.updated_at,
      },

      academy: {
        id: e.academy_id,
        name: e.academy_name,
        status: e.academy_status,
      },

      program: {
        id: e.program_id,
        name: e.program_name,
        description: e.program_description,
        level: e.program_level,
        price: e.program_price,
        duration_weeks: e.program_duration_weeks,
      },

      player: {
        id: e.player_id,
        user_id: e.player_user_id,
        full_name: e.full_name,
        email: e.email,
        phone: e.phone,
        profile_image: e.profile_image,
        position: e.position,
        skill_level: e.skill_level,
        date_of_birth: e.date_of_birth,
        preferred_foot: e.preferred_foot,
        bio: e.bio,
      },
    });

  } catch (error) {
    console.error(
      "GET OWNER ENROLLMENT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to get enrollment"
    );
  }
};

// ============================================================
// LOCK AND VERIFY ENROLLMENT OWNERSHIP
// ============================================================

const lockOwnedEnrollment = async (
  client,
  enrollmentId,
  ownerId
) => {
  const result = await client.query(
    `
    SELECT
      ae.id,
      ae.academy_id,
      ae.program_id,
      ae.player_id,
      ae.status,

      a.name AS academy_name,
      a.status AS academy_status,

      ap.price AS program_price

    FROM academy_enrollments ae

    JOIN academies a
      ON a.id = ae.academy_id

    JOIN academy_programs ap
      ON ap.id = ae.program_id
      AND ap.academy_id = ae.academy_id

    WHERE ae.id = $1
      AND a.owner_id = $2

    FOR UPDATE OF ae
    `,
    [enrollmentId, ownerId]
  );

  return result.rows[0] ?? null;
};

// ============================================================
// ROLLBACK HELPER
// ============================================================

const rollbackAndFail = async (
  client,
  res,
  status,
  message
) => {
  await client.query("ROLLBACK");

  return sendError(
    res,
    status,
    message
  );
};

// ============================================================
// APPROVE OWNER ENROLLMENT
// PATCH /api/owner/enrollments/:id/approve
// ============================================================
//
// Rules:
//
// 1. Enrollment must be pending.
// 2. Free program (price = 0) needs no payment.
// 3. Paid program requires academy_payments.status = paid.
// 4. Stadium booking payments are NOT used.
// 5. Enrollment cannot be approved twice.
//
// ============================================================

const approveOwnerEnrollment = async (req, res) => {
  const enrollmentId = validId(
    req.params.id
  );

  if (!enrollmentId) {
    return sendError(
      res,
      400,
      "Invalid enrollment ID"
    );
  }

  let client;

  try {
    const ownerId = await getOwnerId(
      req.user?.userId
    );

    if (!ownerId) {
      return sendError(
        res,
        403,
        "Owner profile not found"
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");

    // --------------------------------------------------------
    // VERIFY OWNER AND LOCK ENROLLMENT
    // --------------------------------------------------------

    const enrollment = await lockOwnedEnrollment(
      client,
      enrollmentId,
      ownerId
    );

    if (!enrollment) {
      return await rollbackAndFail(
        client,
        res,
        404,
        "Enrollment not found or does not belong to you"
      );
    }

    // --------------------------------------------------------
    // CHECK ENROLLMENT STATUS
    // --------------------------------------------------------

    if (enrollment.status !== "pending") {
      return await rollbackAndFail(
        client,
        res,
        400,
        `Enrollment cannot be approved because its current status is '${enrollment.status}'`
      );
    }

    // --------------------------------------------------------
    // VALIDATE PROGRAM PRICE
    // --------------------------------------------------------

    const priceValue = enrollment.program_price;
    const price = Number(priceValue);

    if (
      priceValue === null ||
      priceValue === undefined ||
      String(priceValue).trim() === "" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return await rollbackAndFail(
        client,
        res,
        409,
        "Program price is invalid"
      );
    }

    // --------------------------------------------------------
    // CHECK PAYMENT FOR PAID PROGRAMS
    // --------------------------------------------------------

    if (price > 0) {
      const paid = await client.query(
        `
        SELECT id
        FROM academy_payments
        WHERE enrollment_id = $1
          AND status = 'paid'
        LIMIT 1
        `,
        [enrollmentId]
      );

      if (!paid.rows.length) {
        return await rollbackAndFail(
          client,
          res,
          409,
          "Academy payment must be approved before enrollment approval"
        );
      }
    }

    // Free programs skip the payment requirement.

    // --------------------------------------------------------
    // APPROVE ENROLLMENT
    // --------------------------------------------------------

    const updated = await client.query(
      `
      UPDATE academy_enrollments

      SET
        status = 'approved',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = $1
        AND status = 'pending'

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [enrollmentId]
    );

    if (!updated.rows.length) {
      return await rollbackAndFail(
        client,
        res,
        409,
        "Enrollment status changed before approval"
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,

      message:
        "Academy enrollment approved successfully",

      academy: {
        id: enrollment.academy_id,
        name: enrollment.academy_name,
        status: enrollment.academy_status,
      },

      enrollment: updated.rows[0],
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "APPROVE ENROLLMENT ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    console.error(
      "APPROVE OWNER ENROLLMENT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to approve enrollment"
    );

  } finally {
    if (client) {
      client.release();
    }
  }
};

// ============================================================
// REJECT OWNER ENROLLMENT
// PATCH /api/owner/enrollments/:id/reject
// ============================================================
//
// Rules:
//
// 1. Enrollment must be pending.
// 2. Cannot reject if academy payment is pending.
// 3. Cannot reject if academy payment is paid.
// 4. Reject payment first if it is still pending.
// 5. Paid payments require a separate refund process.
//
// ============================================================

const rejectOwnerEnrollment = async (req, res) => {
  const enrollmentId = validId(
    req.params.id
  );

  if (!enrollmentId) {
    return sendError(
      res,
      400,
      "Invalid enrollment ID"
    );
  }

  let client;

  try {
    const ownerId = await getOwnerId(
      req.user?.userId
    );

    if (!ownerId) {
      return sendError(
        res,
        403,
        "Owner profile not found"
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");

    // --------------------------------------------------------
    // VERIFY OWNER AND LOCK ENROLLMENT
    // --------------------------------------------------------

    const enrollment = await lockOwnedEnrollment(
      client,
      enrollmentId,
      ownerId
    );

    if (!enrollment) {
      return await rollbackAndFail(
        client,
        res,
        404,
        "Enrollment not found or does not belong to you"
      );
    }

    // --------------------------------------------------------
    // CHECK ENROLLMENT STATUS
    // --------------------------------------------------------

    if (enrollment.status !== "pending") {
      return await rollbackAndFail(
        client,
        res,
        400,
        `Enrollment cannot be rejected because its current status is '${enrollment.status}'`
      );
    }

    // --------------------------------------------------------
    // CHECK EXISTING ACADEMY PAYMENTS
    // --------------------------------------------------------

    const activePayment = await client.query(
      `
      SELECT
        id,
        status

      FROM academy_payments

      WHERE enrollment_id = $1
        AND status IN ('pending', 'paid')

      ORDER BY id DESC

      LIMIT 1
      `,
      [enrollmentId]
    );

    if (activePayment.rows.length) {
      const paymentStatus =
        activePayment.rows[0].status;

      if (paymentStatus === "paid") {
        return await rollbackAndFail(
          client,
          res,
          409,
          "Paid enrollment requires a refund review before rejection"
        );
      }

      return await rollbackAndFail(
        client,
        res,
        409,
        "Review or reject the pending academy payment first"
      );
    }

    // --------------------------------------------------------
    // REJECT ENROLLMENT
    // --------------------------------------------------------

    const updated = await client.query(
      `
      UPDATE academy_enrollments

      SET
        status = 'rejected',
        updated_at = CURRENT_TIMESTAMP

      WHERE id = $1
        AND status = 'pending'

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at,
        updated_at
      `,
      [enrollmentId]
    );

    if (!updated.rows.length) {
      return await rollbackAndFail(
        client,
        res,
        409,
        "Enrollment status changed before rejection"
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,

      message:
        "Academy enrollment rejected successfully",

      academy: {
        id: enrollment.academy_id,
        name: enrollment.academy_name,
        status: enrollment.academy_status,
      },

      enrollment: updated.rows[0],
    });

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "REJECT ENROLLMENT ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    console.error(
      "REJECT OWNER ENROLLMENT ERROR:",
      error
    );

    return sendError(
      res,
      500,
      "Failed to reject enrollment"
    );

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
  getOwnerAcademyPlayers,
  getOwnerEnrollmentById,
  approveOwnerEnrollment,
  rejectOwnerEnrollment,
};
