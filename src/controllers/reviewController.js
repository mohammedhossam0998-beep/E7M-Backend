const pool = require("../config/db");

// ============================================================
// CREATE REVIEW
// POST /api/reviews
// ============================================================

const createReview = async (req, res) => {
  try {
    const playerId = req.user.userId;

    const {
      booking_id,
      pitch_id,
      rating,
      comment,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATE REQUIRED FIELDS
    // --------------------------------------------------------

    if (
      booking_id === undefined ||
      pitch_id === undefined ||
      rating === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "booking_id, pitch_id and rating are required",
      });
    }

    const bookingId = Number(booking_id);
    const pitchId = Number(pitch_id);
    const ratingNumber = Number(rating);

    if (
      !Number.isInteger(bookingId) ||
      bookingId <= 0 ||
      !Number.isInteger(pitchId) ||
      pitchId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking_id or pitch_id",
      });
    }

    if (
      !Number.isInteger(ratingNumber) ||
      ratingNumber < 1 ||
      ratingNumber > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5",
      });
    }

    // --------------------------------------------------------
    // VERIFY BOOKING BELONGS TO PLAYER
    // AND PITCH MATCHES THE BOOKING
    // --------------------------------------------------------

    const bookingResult = await pool.query(
      `
      SELECT
        b.id AS booking_id,
        b.player_id,
        ps.pitch_id,
        b.status
      FROM bookings b
      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id
      WHERE b.id = $1
        AND b.player_id = $2
        AND ps.pitch_id = $3
      LIMIT 1
      `,
      [bookingId, playerId, pitchId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or does not belong to this player",
      });
    }

    // --------------------------------------------------------
    // PREVENT DUPLICATE REVIEW
    // --------------------------------------------------------

    const existingReview = await pool.query(
      `
      SELECT id
      FROM reviews
      WHERE booking_id = $1
      LIMIT 1
      `,
      [bookingId]
    );

    if (existingReview.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this booking",
      });
    }

    // --------------------------------------------------------
    // CREATE REVIEW
    // --------------------------------------------------------

    const result = await pool.query(
      `
      INSERT INTO reviews (
        player_id,
        pitch_id,
        booking_id,
        rating,
        comment
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        player_id,
        pitch_id,
        booking_id,
        rating,
        comment,
        created_at,
        is_hidden
      `,
      [
        playerId,
        pitchId,
        bookingId,
        ratingNumber,
        comment ?? null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      review: result.rows[0],
    });
  } catch (error) {
    console.error("Create review error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create review",
    });
  }
};

// ============================================================
// GET MY REVIEWS
// GET /api/reviews/my
// ============================================================

const getMyReviews = async (req, res) => {
  try {
    const playerId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        r.id,
        r.player_id,
        r.pitch_id,
        r.booking_id,
        r.rating,
        r.comment,
        r.created_at,
        r.is_hidden,

        p.name AS pitch_name

      FROM reviews r

      INNER JOIN pitches p
        ON p.id = r.pitch_id

      WHERE r.player_id = $1

      ORDER BY r.created_at DESC, r.id DESC
      `,
      [playerId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reviews: result.rows,
    });
  } catch (error) {
    console.error("Get my reviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get reviews",
    });
  }
};
// ============================================================
// GET PITCH REVIEWS
// GET /api/reviews/pitch/:pitchId
// ============================================================

const getPitchReviews = async (req, res) => {
  try {
    const { pitchId } = req.params;

    const pitchIdNumber = Number(pitchId);

    if (!Number.isInteger(pitchIdNumber) || pitchIdNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch ID",
      });
    }

    // --------------------------------------------------------
    // VERIFY PITCH EXISTS AND IS APPROVED
    // --------------------------------------------------------

    const pitchResult = await pool.query(
      `
      SELECT id
      FROM pitches
      WHERE id = $1
        AND status = 'approved'
      LIMIT 1
      `,
      [pitchIdNumber]
    );

    if (pitchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found or not approved",
      });
    }

    // --------------------------------------------------------
    // GET REVIEWS + PLAYER NAME
    // --------------------------------------------------------

    const reviewsResult = await pool.query(
      `
      SELECT
        r.id,
        r.player_id,
        r.pitch_id,
        r.booking_id,
        r.rating,
        r.comment,
        r.created_at,

        u.full_name AS player_name

      FROM reviews r

      INNER JOIN users u
        ON u.id = r.player_id

      WHERE r.pitch_id = $1
        AND r.is_hidden = false

      ORDER BY
        r.created_at DESC,
        r.id DESC
      `,
      [pitchIdNumber]
    );

    // --------------------------------------------------------
    // CALCULATE RATING SUMMARY
    // --------------------------------------------------------

    const summaryResult = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_reviews,
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::numeric AS average_rating
      FROM reviews
      WHERE pitch_id = $1
        AND is_hidden = false
      `,
      [pitchIdNumber]
    );

    const summary = summaryResult.rows[0];

    return res.status(200).json({
      success: true,
      average_rating: Number(summary.average_rating),
      total_reviews: Number(summary.total_reviews),
      reviews: reviewsResult.rows,
    });
  } catch (error) {
    console.error("Get pitch reviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch reviews",
    });
  }
};
module.exports = {
  createReview,
  getMyReviews,
  getPitchReviews,
};