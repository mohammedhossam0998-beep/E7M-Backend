const express = require("express");

const router = express.Router();

// ========================================
// MIDDLEWARE
// ========================================

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const {
  uploadPlayerProfileImage,
} = require("../middleware/uploadMiddleware");

// ========================================
// CONTROLLER
// ========================================

const {
  createPlayerProfile,
  getMyPlayerProfile,
  updateMyPlayerProfile,
  updateMyPlayerAccount,
  uploadMyProfileImage,
} = require("../controllers/playerProfileController");

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
// UPDATE MY PLAYER PROFILE
// PUT /api/player/profile
// ----------------------------------------

router.put(
  "/profile",
  authenticateToken,
  authorizeRoles("player"),
  updateMyPlayerProfile
);

// ----------------------------------------
// UPDATE MY PLAYER ACCOUNT
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
// EXPORT
// ========================================

module.exports = router;