const express = require("express");

const router = express.Router();

const {
  getAvailabilitySettings,
  saveAvailabilitySettings,
} = require("../controllers/availabilityController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

// ============================================================
// GET AVAILABILITY SETTINGS
// ============================================================

router.get(
  "/owner/pitches/:id/availability",
  authenticateToken,
  getAvailabilitySettings
);

// ============================================================
// SAVE / UPDATE AVAILABILITY SETTINGS
// ============================================================

router.put(
  "/owner/pitches/:id/availability",
  authenticateToken,
  saveAvailabilitySettings
);

module.exports = router;