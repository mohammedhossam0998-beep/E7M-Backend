const express = require("express");

const router = express.Router();

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const {
  getOwnerReviews,
  hideOwnerReview,
  unhideOwnerReview,
} = require("../controllers/ownerReviewController");

router.get(
  "/reviews",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerReviews
);

router.patch(
  "/reviews/:reviewId/hide",
  authenticateToken,
  authorizeRoles("owner"),
  hideOwnerReview
);

router.patch(
  "/reviews/:reviewId/unhide",
  authenticateToken,
  authorizeRoles("owner"),
  unhideOwnerReview
);

module.exports = router;