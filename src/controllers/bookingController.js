const pool = require("../config/db");

const {
  createNotification,
} = require("./notificationController");

// ========================================
// AUTO COMPLETE EXPIRED BOOKINGS
// ========================================
// Converts confirmed bookings to completed
// after the related pitch slot has ended.
//
// The slot status is NOT changed.
// Only the booking status is updated.
// ========================================

const updateCompletedBookings = async () => {
  try {
    const result = await pool.query(`
      UPDATE bookings b
      SET
        status = 'completed',
        updated_at = NOW()
      FROM pitch_slots ps
      WHERE b.pitch_slot_id = ps.id
        AND b.status = 'confirmed'
        AND (
          ps.slot_date + ps.end_time
        ) <= (
          CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo'
        )
      RETURNING b.id
    `);

    if (result.rowCount > 0) {
      console.log(
        `AUTO COMPLETE: ${result.rowCount} booking(s) marked as completed`
      );
    }

    return result.rowCount;
  } catch (error) {
    console.error("AUTO COMPLETE BOOKINGS ERROR:", error);
    throw error;
  }
};

// ========================================
// CREATE BOOKING
// POST /api/bookings
// ========================================

const createBooking = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;

    const {
      pitch_slot_id,
      coach_id,
      payment_method,
      notes
    } = req.body;

    // ========================================
    // VALIDATE REQUIRED DATA
    // ========================================

    if (!pitch_slot_id) {
      return res.status(400).json({
        success: false,
        message: "pitch_slot_id is required"
      });
    }

    // ========================================
    // VALIDATE PAYMENT METHOD
    // ========================================

    const allowedPaymentMethods = [
      "cash",
      "card",
      "online"
    ];

    if (
      payment_method &&
      !allowedPaymentMethods.includes(payment_method)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method"
      });
    }

    await client.query("BEGIN");

    // ========================================
    // CHECK PLAYER
    // ========================================

    const playerResult = await client.query(
      `
        SELECT id
        FROM users
        WHERE id = $1
        AND role = 'player'
      `,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message: "Player not found"
      });
    }

    // ========================================
    // GET SLOT + PITCH + OWNER DEPOSIT
    // FOR UPDATE PREVENTS DOUBLE BOOKING
    // ========================================

    const slotResult = await client.query(
      `
        SELECT
          ps.id,
          ps.pitch_id,
          ps.price,
          ps.status,

          p.owner_id,
          p.deposit_amount

        FROM pitch_slots ps

        INNER JOIN pitches p
          ON ps.pitch_id = p.id

        WHERE ps.id = $1

        FOR UPDATE
      `,
      [pitch_slot_id]
    );

    if (slotResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Pitch slot not found"
      });
    }

    const slot = slotResult.rows[0];

    // ========================================
    // CHECK SLOT STATUS
    // ========================================

    if (slot.status !== "available") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "This slot is not available"
      });
    }

    // ========================================
    // VALIDATE PRICE
    // ========================================

    const totalPrice = Number(slot.price);
    const depositAmount = Number(
      slot.deposit_amount || 0
    );

    if (
      !Number.isFinite(totalPrice) ||
      totalPrice < 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid slot price"
      });
    }

    // ========================================
    // VALIDATE OWNER DEPOSIT
    // ========================================

    if (
      !Number.isFinite(depositAmount) ||
      depositAmount < 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Invalid owner deposit amount"
      });
    }

    if (depositAmount > totalPrice) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Deposit amount cannot be greater than slot price"
      });
    }

    // ========================================
    // CALCULATE REMAINING AMOUNT
    // ========================================

    const remainingAmount =
      totalPrice - depositAmount;

    // ========================================
    // CHECK EXISTING BOOKING
    // ========================================

    const existingBooking = await client.query(
      `
        SELECT id
        FROM bookings
        WHERE pitch_slot_id = $1
        AND status IN ('pending', 'confirmed')
        LIMIT 1
      `,
      [pitch_slot_id]
    );

    if (existingBooking.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "This slot is already booked"
      });
    }

    // ========================================
    // CHECK COACH
    // ========================================

    if (coach_id) {
      const coachResult = await client.query(
        `
          SELECT id
          FROM coaches
          WHERE id = $1
        `,
        [coach_id]
      );

      if (coachResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Coach not found"
        });
      }
    }

    // ========================================
    // CREATE BOOKING
    // ========================================

    const result = await client.query(
      `
        INSERT INTO bookings (
          player_id,
          pitch_slot_id,
          coach_id,
          status,
          total_price,
          notes,

          deposit_amount,
          remaining_amount,
          payment_method,
          payment_status,
          deposit_paid_at,

          booked_at,
          updated_at
        )

        VALUES (
          $1,
          $2,
          $3,
          'pending',
          $4,
          $5,

          $6,
          $7,
          $8,
          'unpaid',
          NULL,

          NOW(),
          NOW()
        )

        RETURNING
          id,
          player_id,
          pitch_slot_id,
          coach_id,
          status,
          total_price,
          deposit_amount,
          remaining_amount,
          payment_method,
          payment_status,
          deposit_paid_at,
          notes,
          booked_at,
          updated_at,
          cancelled_at
      `,
      [
        userId,
        pitch_slot_id,
        coach_id || null,
        totalPrice,
        notes || null,

        depositAmount,
        remainingAmount,
        payment_method || null
      ]
    );

    // ========================================
    // CHANGE SLOT STATUS
    // ========================================

    await client.query(
      `
        UPDATE pitch_slots
        SET status = 'booked'
        WHERE id = $1
      `,
      [pitch_slot_id]
    );

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: result.rows[0]
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(
      "CREATE BOOKING ERROR:",
      error
    );

    // Unique constraint
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "This slot is already booked"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create booking"
    });

  } finally {

    client.release();
  }
};

// ========================================
// GET OWNER BOOKINGS
// GET /api/bookings/owner
// ========================================

const getOwnerBookings = async (req, res) => {
  try {

    // ========================================
    // UPDATE EXPIRED BOOKINGS FIRST
    // ========================================

    await updateCompletedBookings();

    const userId = req.user.userId;

    // ========================================
    // GET OWNER ID
    // ========================================

    const ownerResult = await pool.query(
      `
        SELECT id
        FROM owners
        WHERE user_id = $1
      `,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const ownerId = ownerResult.rows[0].id;

    // ========================================
    // GET OWNER BOOKINGS
    // ========================================

    const result = await pool.query(
      `
        SELECT
          b.id,
          b.player_id,
          b.pitch_slot_id,
          b.coach_id,
          b.status,
          b.total_price,
          b.deposit_amount,
          b.remaining_amount,
          b.payment_method,
          b.payment_status,
          b.deposit_paid_at,
          b.notes,
          b.booked_at,
          b.updated_at,
          b.cancelled_at,

          -- PLAYER DATA
          u.full_name AS player_name,
          u.email AS player_email,

          -- SLOT DATA
          TO_CHAR(
            ps.slot_date,
            'YYYY-MM-DD'
          ) AS slot_date,
          ps.start_time,
          ps.end_time,
          ps.price AS slot_price,

          -- PITCH DATA
          p.id AS pitch_id,
          p.name AS pitch_name,
          p.address AS pitch_address

        FROM bookings b

        INNER JOIN users u
          ON b.player_id = u.id

        INNER JOIN pitch_slots ps
          ON b.pitch_slot_id = ps.id

        INNER JOIN pitches p
          ON ps.pitch_id = p.id

        WHERE p.owner_id = $1

        ORDER BY b.booked_at DESC
      `,
      [ownerId]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      bookings: result.rows
    });

  } catch (error) {

    console.error(
      "GET OWNER BOOKINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get owner bookings"
    });
  }
};

// ========================================
// APPROVE / CONFIRM BOOKING
// PATCH /api/owner/bookings/:id/approve
// ========================================

const approveBooking = async (req, res) => {
  try {

    console.log("🔥 APPROVE BOOKING FUNCTION CALLED");

    const userId = req.user.userId;
    const { id } = req.params;

    // ========================================
    // GET OWNER ID
    // ========================================

    const ownerResult = await pool.query(
      `
        SELECT id
        FROM owners
        WHERE user_id = $1
      `,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const ownerId = ownerResult.rows[0].id;

    // ========================================
    // APPROVE BOOKING
    // ========================================

    const result = await pool.query(
      `
        UPDATE bookings b

        SET
          status = 'confirmed',
          updated_at = NOW()

        FROM pitch_slots ps

        INNER JOIN pitches p
          ON ps.pitch_id = p.id

        WHERE b.id = $1
          AND b.pitch_slot_id = ps.id
          AND p.owner_id = $2
          AND b.status = 'pending'

        RETURNING
          b.id,
          b.player_id,
          b.pitch_slot_id,
          b.coach_id,

          b.status,

          b.total_price,
          b.deposit_amount,
          b.remaining_amount,

          b.payment_method,
          b.payment_status,
          b.deposit_paid_at,

          b.notes,

          b.booked_at,
          b.updated_at,
          b.cancelled_at
      `,
      [id, ownerId]
    );

    // ========================================
    // BOOKING NOT FOUND
    // ========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending booking not found"
      });
    }

    console.log("🔔 APPROVE BOOKING: Creating notification...");

    await createNotification({
      userId: result.rows[0].player_id,
      title: "تم تأكيد الحجز",
      message: "تم تأكيد حجزك بنجاح.",
      type: "booking_confirmed",
      bookingId: result.rows[0].id,
    });

    console.log(
      "✅ APPROVE BOOKING: Notification created for player:",
      result.rows[0].player_id
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Booking confirmed successfully",
      booking: result.rows[0]
    });

  } catch (error) {

    console.error(
      "APPROVE BOOKING ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to approve booking"
    });
  }
};

// ========================================
// REJECT BOOKING
// PATCH /api/owner/bookings/:id/reject
// ========================================

const rejectBooking = async (req, res) => {
  try {

    const userId = req.user.userId;
    const { id } = req.params;

    // ========================================
    // GET OWNER ID
    // ========================================

    const ownerResult = await pool.query(
      `
        SELECT id
        FROM owners
        WHERE user_id = $1
      `,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const ownerId = ownerResult.rows[0].id;

    // ========================================
    // GET BOOKING + VERIFY OWNER
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
          b.payment_method,
          b.payment_status,
          b.deposit_paid_at,
          b.notes,
          b.booked_at,
          b.updated_at,
          b.cancelled_at

        FROM bookings b

        INNER JOIN pitch_slots ps
          ON b.pitch_slot_id = ps.id

        INNER JOIN pitches p
          ON ps.pitch_id = p.id

        WHERE b.id = $1
          AND p.owner_id = $2
      `,
      [id, ownerId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookingResult.rows[0];

    // ========================================
    // ONLY PENDING BOOKINGS CAN BE REJECTED
    // ========================================

    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          `Booking cannot be rejected because its current status is ${booking.status}`
      });
    }

    // ========================================
    // REJECT BOOKING + RELEASE SLOT
    // ========================================

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      // Reject booking
      const rejectedBookingResult =
        await client.query(
          `
            UPDATE bookings

            SET
              status = 'rejected',
              updated_at = NOW()

            WHERE id = $1

            RETURNING
              id,
              player_id,
              pitch_slot_id,
              coach_id,
              status,
              total_price,
              deposit_amount,
              remaining_amount,
              payment_method,
              payment_status,
              deposit_paid_at,
              notes,
              booked_at,
              updated_at,
              cancelled_at
          `,
          [id]
        );

      // Make slot available again
      await client.query(
        `
          UPDATE pitch_slots
          SET status = 'available'
          WHERE id = $1
        `,
        [booking.pitch_slot_id]
      );

      await client.query("COMMIT");

      await createNotification({
        userId: rejectedBookingResult.rows[0].player_id,
        title: "تم رفض الحجز",
        message: "تم رفض حجزك.",
        type: "booking_rejected",
        bookingId: rejectedBookingResult.rows[0].id,
      });

      return res.status(200).json({
        success: true,
        message: "Booking rejected successfully",
        booking: rejectedBookingResult.rows[0]
      });

    } catch (transactionError) {

      await client.query("ROLLBACK");

      throw transactionError;

    } finally {

      client.release();
    }

  } catch (error) {

    console.error(
      "REJECT BOOKING ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reject booking"
    });
  }
};

// ========================================
// GET PLAYER BOOKINGS
// GET /api/bookings/my
// ========================================

const getMyBookings = async (req, res) => {
  try {

    // ========================================
    // UPDATE EXPIRED BOOKINGS FIRST
    // ========================================

    await updateCompletedBookings();

    const userId = req.user.userId;

    const result = await pool.query(
      `
        SELECT
          b.id,
          b.player_id,
          b.pitch_slot_id,
          b.coach_id,

          b.status,

          -- PAYMENT DATA
          b.total_price,
          b.deposit_amount,
          b.remaining_amount,
          b.payment_method,
          b.payment_status,
          b.deposit_paid_at,

          b.notes,
          b.booked_at,
          b.updated_at,
          b.cancelled_at,

          -- SLOT DATA
          ps.slot_date,
          ps.start_time,
          ps.end_time,
          ps.price,

          -- PITCH DATA
          p.id AS pitch_id,
          p.name AS pitch_name,
          p.address AS pitch_address

        FROM bookings b

        INNER JOIN pitch_slots ps
          ON b.pitch_slot_id = ps.id

        INNER JOIN pitches p
          ON ps.pitch_id = p.id

        WHERE b.player_id = $1

        ORDER BY b.booked_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      bookings: result.rows
    });

  } catch (error) {

    console.error(
      "GET MY BOOKINGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get my bookings"
    });
  }
};

// ========================================
// CANCEL BOOKING
// PATCH /api/bookings/:id/cancel
// ========================================

const cancelBooking = async (req, res) => {
  try {

    const userId = req.user.userId;
    const { id } = req.params;

    // ========================================
    // UPDATE EXPIRED BOOKINGS FIRST
    // ========================================

    await updateCompletedBookings();

    // ========================================
    // CANCEL BOOKING
    // ========================================

    const result = await pool.query(
      `
        UPDATE bookings

        SET
          status = 'cancelled',
          updated_at = NOW()

        WHERE id = $1
          AND player_id = $2
          AND status IN ('pending', 'confirmed')

        RETURNING
          id,
          player_id,
          pitch_slot_id,
          coach_id,
          status,
          total_price,
          notes,
          booked_at,
          updated_at,
          cancelled_at
      `,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or cannot be cancelled"
      });
    }

    // ========================================
    // MAKE SLOT AVAILABLE AGAIN
    // ========================================

    await pool.query(
      `
        UPDATE pitch_slots
        SET status = 'available'
        WHERE id = $1
      `,
      [result.rows[0].pitch_slot_id]
    );

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
      booking: result.rows[0]
    });

  } catch (error) {

    console.error(
      "CANCEL BOOKING ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking"
    });
  }
};

// ========================================
// GET SINGLE BOOKING BY ID
// GET /api/bookings/:id
//
// PLAYER CAN VIEW HIS OWN BOOKING
// OWNER CAN VIEW BOOKINGS ON HIS PITCHES
// ========================================

const getBookingById = async (req, res) => {
  try {

    // ========================================
    // UPDATE EXPIRED BOOKINGS FIRST
    // ========================================

    await updateCompletedBookings();

    const userId = req.user.userId;
    const { id } = req.params;

    // ========================================
    // GET BOOKING WITH PAYMENT + SLOT + PITCH
    // ========================================

    const result = await pool.query(
      `
        SELECT
          b.id,
          b.player_id,
          b.pitch_slot_id,
          b.coach_id,

          b.status,

          -- PAYMENT DATA
          b.total_price,
          b.deposit_amount,
          b.remaining_amount,
          b.payment_method,
          b.payment_status,
          b.deposit_paid_at,

          b.notes,
          b.booked_at,
          b.updated_at,
          b.cancelled_at,

          -- SLOT DATA
          ps.slot_date,
          ps.start_time,
          ps.end_time,
          ps.price,

          -- PITCH DATA
          p.id AS pitch_id,
          p.name AS pitch_name,
          p.address AS pitch_address,
          p.owner_id

        FROM bookings b

        INNER JOIN pitch_slots ps
          ON b.pitch_slot_id = ps.id

        INNER JOIN pitches p
          ON ps.pitch_id = p.id

        WHERE b.id = $1
      `,
      [id]
    );

    // ========================================
    // BOOKING NOT FOUND
    // ========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = result.rows[0];

    // ========================================
    // CHECK ACCESS
    //
    // PLAYER:
    // Can view his own booking
    //
    // OWNER:
    // Can view booking belonging to his pitch
    // ========================================

    if (booking.player_id !== userId) {

      const ownerResult = await pool.query(
        `
          SELECT id
          FROM owners
          WHERE user_id = $1
        `,
        [userId]
      );

      const owner_id =
        ownerResult.rows[0]
          ? ownerResult.rows[0].id
          : null;

      if (
        !owner_id ||
        owner_id !== booking.owner_id
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to view this booking"
        });
      }
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      booking
    });

  } catch (error) {

    console.error(
      "GET BOOKING BY ID ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get booking"
    });
  }
};

// ========================================
// EXPORT
// ========================================

module.exports = {
  createBooking,
  getOwnerBookings,
  approveBooking,
  rejectBooking,
  getMyBookings,
  cancelBooking,
  getBookingById
};