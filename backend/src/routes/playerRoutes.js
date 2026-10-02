const express = require("express");

const {
  getAllPitches,
  getPitchById,
  getPlayerPitchSlots
} = require("../controllers/playerPitchController");

const {
  createPlayerProfile,
  getMyPlayerProfile,
  updateMyPlayerProfile,
  updateMyPlayerAccount,
  uploadMyProfileImage,
} = require("../controllers/playerProfileController");

const {
  getPlayerCompetitionBracket,
} = require("../controllers/playerCompetitionBracketController");

const {
  getPlayerCompetitionStandings,
} = require("../controllers/playerCompetitionStandingsController");

const { authenticateToken } = require("../middleware/authMiddleware");

const { authorizeRoles } = require("../middleware/roleMiddleware");

const {
  uploadPlayerProfileImage,
} = require("../middleware/uploadMiddleware");

const router = express.Router();


// ========================================
// PLAYER PITCHES
// ========================================

// Get all approved pitches

router.get(
  "/pitches",
  getAllPitches
);


// Get one approved pitch

router.get(
  "/pitches/:id",
  getPitchById
);


// Get available slots for pitch

router.get(
  "/pitches/:id/slots",
  getPlayerPitchSlots
);


// ========================================
// PLAYER PROFILE
// ========================================

// ----------------------------------------
// CREATE PLAYER PROFILE
// POST /api/player/profile
// ----------------------------------------

router.post(
  "/profile",
  authenticateToken,
  authorizeRoles("player"),
  createPlayerProfile
);


// ----------------------------------------
// GET MY PLAYER PROFILE
// GET /api/player/profile
// ----------------------------------------

router.get(
  "/profile",
  authenticateToken,
  authorizeRoles("player"),
  getMyPlayerProfile
);


// ----------------------------------------
// UPDATE PLAYER PROFILE
// PUT /api/player/profile
// ----------------------------------------

router.put(
  "/profile",
  authenticateToken,
  authorizeRoles("player"),
  updateMyPlayerProfile
);


// ----------------------------------------
// UPDATE PLAYER ACCOUNT INFO (name, email, phone)
// PUT /api/player/account
// ----------------------------------------

router.put(
  "/account",
  authenticateToken,
  authorizeRoles("player"),
  updateMyPlayerAccount
);


// ----------------------------------------
// UPDATE PLAYER PROFILE IMAGE
// POST /api/player/profile/image
// ----------------------------------------

router.post(
  "/profile/image",
  authenticateToken,
  authorizeRoles("player"),
  uploadPlayerProfileImage.single("image"),
  uploadMyProfileImage
);


// ========================================
// PLAYER COMPETITION STANDINGS
// ========================================

// Get competition standings
// GET /api/player/competitions/:competitionId/standings

router.get(
  "/:competitionId/standings",
  authenticateToken,
  authorizeRoles("player"),
  getPlayerCompetitionStandings
);


// ========================================
// PLAYER COMPETITION BRACKET
// ========================================

// Get my competition bracket
// GET /api/player/competitions/:competitionId/bracket

router.get(
  "/:competitionId/bracket",
  authenticateToken,
  authorizeRoles("player"),
  getPlayerCompetitionBracket
);


module.exports = router;