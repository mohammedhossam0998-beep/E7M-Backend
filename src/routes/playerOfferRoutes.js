const express = require("express");

const router = express.Router();

const {
  getPlayerOffers,
} = require("../controllers/playerOfferController");

const { authenticateToken } = require("../middleware/authMiddleware");

// ========================================
// PLAYER OFFERS
// ========================================

// GET /api/player/offers
router.get(
  "/",
  authenticateToken,
  getPlayerOffers
);

module.exports = router;