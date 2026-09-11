const express = require("express");

const {
  createReview,
  getMyReviews,
  getPitchReviews,
} = require("../controllers/reviewController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ============================================================
// PLAYER REVIEWS
// ============================================================

// Create review
// POST /api/reviews
router.post(
  "/",
  authenticateToken,
  createReview
);

// Get my reviews
// GET /api/reviews/my
router.get(
  "/my",
  authenticateToken,
  getMyReviews
);

// Get pitch reviews
// GET /api/reviews/pitch/:pitchId
router.get(
  "/pitch/:pitchId",
  getPitchReviews
);

module.exports = router;