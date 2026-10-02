const pool = require("../config/db");

// ============================================================
// GET OWNER REVIEWS
// GET /api/owner/reviews
// ============================================================

const getOwnerReviews = async (req, res) => {
  try {
    const userId = req.user.userId;

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

        u.full_name AS player_name,
        u.email AS player_email,
        u.profile_image AS player_profile_image,

        p.name AS pitch_name

      FROM reviews r

      INNER JOIN pitches p
        ON p.id = r.pitch_id

      INNER JOIN owners o
        ON o.id = p.owner_id

      LEFT JOIN users u
        ON u.id = r.player_id

      WHERE o.user_id = $1

      ORDER BY r.created_at DESC, r.id DESC;
      `,
      [userId]
    );

    // ========================================================
    // CALCULATE REVIEW STATISTICS
    // ========================================================

    const visibleReviews = result.rows.filter(
      (review) => review.is_hidden !== true
    );

    const totalReviews = result.rows.length;

    const averageRating =
      totalReviews === 0
        ? 0
        : result.rows.reduce(
            (sum, review) =>
              sum + Number(review.rating || 0),
            0
          ) / totalReviews;

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      count: totalReviews,
      visible_count: visibleReviews.length,
      hidden_count:
        totalReviews - visibleReviews.length,
      average_rating:
        Number(averageRating.toFixed(2)),
      reviews: result.rows,
    });

  } catch (error) {
    console.error(
      "Get owner reviews error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get owner reviews",
    });
  }
};


// ============================================================
// HIDE OWNER REVIEW
// PATCH /api/owner/reviews/:reviewId/hide
// ============================================================

const hideOwnerReview = async (req, res) => {
  try {
    const userId = req.user.userId;
    const reviewId = req.params.reviewId;

    // ========================================================
    // VALIDATE REVIEW ID
    // ========================================================

    if (!/^\d+$/.test(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    // ========================================================
    // HIDE REVIEW
    // IMPORTANT:
    // users.id != owners.id
    // We use owners.user_id = req.user.userId
    // ========================================================

    const result = await pool.query(
      `
      UPDATE reviews r

      SET is_hidden = true

      FROM pitches p

      INNER JOIN owners o
        ON o.id = p.owner_id

      WHERE r.id = $1
        AND r.pitch_id = p.id
        AND o.user_id = $2

      RETURNING
        r.id,
        r.player_id,
        r.pitch_id,
        r.booking_id,
        r.rating,
        r.comment,
        r.created_at,
        r.is_hidden;
      `,
      [reviewId, userId]
    );

    // ========================================================
    // REVIEW NOT FOUND
    // ========================================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found or does not belong to this owner",
      });
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Review hidden successfully",
      review: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Hide owner review error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to hide review",
    });
  }
};


// ============================================================
// UNHIDE OWNER REVIEW
// PATCH /api/owner/reviews/:reviewId/unhide
// ============================================================

const unhideOwnerReview = async (req, res) => {
  try {
    const userId = req.user.userId;
    const reviewId = req.params.reviewId;

    // ========================================================
    // VALIDATE REVIEW ID
    // ========================================================

    if (!/^\d+$/.test(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID",
      });
    }

    // ========================================================
    // UNHIDE REVIEW
    // ========================================================

    const result = await pool.query(
      `
      UPDATE reviews r

      SET is_hidden = false

      FROM pitches p

      INNER JOIN owners o
        ON o.id = p.owner_id

      WHERE r.id = $1
        AND r.pitch_id = p.id
        AND o.user_id = $2

      RETURNING
        r.id,
        r.player_id,
        r.pitch_id,
        r.booking_id,
        r.rating,
        r.comment,
        r.created_at,
        r.is_hidden;
      `,
      [reviewId, userId]
    );

    // ========================================================
    // REVIEW NOT FOUND
    // ========================================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Review not found or does not belong to this owner",
      });
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Review unhidden successfully",
      review: result.rows[0],
    });

  } catch (error) {
    console.error(
      "Unhide owner review error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to unhide review",
    });
  }
};


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getOwnerReviews,
  hideOwnerReview,
  unhideOwnerReview,
};