const express = require("express");

const {
  getAllPitches,
  getPitchById,
  getPlayerPitchSlots,
  getPitchImages,
} = require("../controllers/playerPitchController");

const router = express.Router();

// ========================================
// GET ALL APPROVED PITCHES
// GET /api/pitches
// ========================================

router.get("/", getAllPitches);

// ========================================
// GET PITCH IMAGES
// GET /api/pitches/:id/images
// ========================================

router.get("/:id/images", getPitchImages);

// ========================================
// GET AVAILABLE SLOTS
// GET /api/pitches/:id/slots
// ========================================

router.get("/:id/slots", getPlayerPitchSlots);

// ========================================
// GET ONE APPROVED PITCH
// GET /api/pitches/:id
// ========================================

router.get("/:id", getPitchById);

module.exports = router;