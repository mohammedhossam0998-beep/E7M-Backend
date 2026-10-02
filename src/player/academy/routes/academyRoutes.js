
const express = require("express");

// ========================================
// MIDDLEWARE
// ========================================

const {
  authenticateToken,
} = require("../../../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../../../middleware/roleMiddleware");

// ========================================
// PLAYER ACADEMY CONTROLLER
// ========================================

const {
  getAcademies,
  getAcademyById,
  getAcademyPrograms,
} = require("../controllers/academyController");

// ========================================
// PLAYER ACADEMY ENROLLMENT CONTROLLER
// ========================================

const {
  enrollInAcademyProgram,
  getPlayerAcademyEnrollments,
} = require("../controllers/playerAcademyEnrollmentController");

// ========================================
// ROUTER
// ========================================

const router = express.Router();

// ============================================================
// PLAYER ACADEMIES
// ============================================================

// Get all academies
// GET /api/player/academies

router.get(
  "/",
  authenticateToken,
  authorizeRoles("player"),
  getAcademies
);

// ============================================================
// PLAYER ACADEMY ENROLLMENTS
// ============================================================

// Get my academy enrollments
// GET /api/player/academies/enrollments

router.get(
  "/enrollments",
  authenticateToken,
  authorizeRoles("player"),
  getPlayerAcademyEnrollments
);

// ============================================================
// PLAYER ACADEMY DETAILS
// ============================================================

// Get academy by ID
// GET /api/player/academies/:academyId

router.get(
  "/:academyId",
  authenticateToken,
  authorizeRoles("player"),
  getAcademyById
);

// Get academy programs
// GET /api/player/academies/:academyId/programs

router.get(
  "/:academyId/programs",
  authenticateToken,
  authorizeRoles("player"),
  getAcademyPrograms
);

// ============================================================
// PLAYER ACADEMY ENROLLMENT
// ============================================================

// Enroll in academy program
// POST /api/player/academies/:academyId/programs/:programId/enroll

router.post(
  "/:academyId/programs/:programId/enroll",
  authenticateToken,
  authorizeRoles("player"),
  enrollInAcademyProgram
);

// ============================================================

module.exports = router;