const express = require("express");

const router = express.Router();

const {
  createOffer,
  getOwnerOffers,
  updateOffer,
  deleteOffer,
} = require("../controllers/offerController");

const { authenticateToken } = require("../middleware/authMiddleware");

// ========================================
// OWNER OFFERS
// ========================================

router.post(
  "/",
  authenticateToken,
  createOffer
);

router.get(
  "/",
  authenticateToken,
  getOwnerOffers
);

router.patch(
  "/:id",
  authenticateToken,
  updateOffer
);

router.delete(
  "/:id",
  authenticateToken,
  deleteOffer
);

module.exports = router;