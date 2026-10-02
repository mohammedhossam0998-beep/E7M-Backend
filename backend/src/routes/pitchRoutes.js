const express = require("express");

const router = express.Router();

const {
  createPitch,
  getOwnerPitches,
  getOwnerPitchById,
  updatePitch,
  deletePitch
} = require("../controllers/pitchController");

const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");


// ========================================
// OWNER PITCH ROUTES
// ========================================

// Create Pitch
router.post(
  "/",
  authenticateToken,
  authorizeRoles("owner"),
  createPitch
);


// Get My Pitches
router.get(
  "/my",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerPitches
);


// Get One Pitch
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerPitchById
);


// Update Pitch
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("owner"),
  updatePitch
);


// Delete Pitch
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("owner"),
  deletePitch
);


module.exports = router;