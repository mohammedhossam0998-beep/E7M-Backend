const express = require("express");

// ========================================
// MIDDLEWARE
// ========================================

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

// ========================================
// ACADEMY CONTROLLER
// ========================================

const {
  createAcademy,
  getOwnerAcademies,
  getOwnerAcademyById,
  updateAcademy,
} = require("../controllers/academyController");

// ========================================
// ACADEMY PROGRAM CONTROLLER
// ========================================

const {
  createAcademyProgram,
  getOwnerAcademyPrograms,
  updateAcademyProgram,
  deleteAcademyProgram,
} = require("../controllers/academyProgramController");

// ========================================
// ACADEMY SCHEDULE CONTROLLER
// ========================================

const {
  createAcademySchedule,
  getOwnerAcademySchedule,
  updateAcademySchedule,
  deleteAcademySchedule,
} = require("../controllers/academyScheduleController");

// ========================================
// ACADEMY COACH CONTROLLER
// ========================================

const {
  assignCoachToAcademy,
  getAcademyCoaches,
  updateCoachAssignment,
  removeCoachFromAcademy,
  getAvailableCoaches,
} = require("../controllers/academyCoachController");

// ========================================
// ROUTER
// ========================================

const router = express.Router();

// ============================================================
// OWNER ACADEMY
// ============================================================

// Create academy
// POST /api/owner/academies

router.post(
  "/",
  authenticateToken,
  authorizeRoles("owner"),
  createAcademy
);

// Get owner's academies
// GET /api/owner/academies

router.get(
  "/",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademies
);

// Get academy by ID
// GET /api/owner/academies/:id

router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademyById
);

// Update academy
// PUT /api/owner/academies/:id

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("owner"),
  updateAcademy
);

// ============================================================
// OWNER ACADEMY PROGRAMS
// ============================================================

// Create academy program
// POST /api/owner/academies/:academyId/programs

router.post(
  "/:academyId/programs",
  authenticateToken,
  authorizeRoles("owner"),
  createAcademyProgram
);

// Get academy programs
// GET /api/owner/academies/:academyId/programs

router.get(
  "/:academyId/programs",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademyPrograms
);

// Update academy program
// PUT /api/owner/academies/:academyId/programs/:programId

router.put(
  "/:academyId/programs/:programId",
  authenticateToken,
  authorizeRoles("owner"),
  updateAcademyProgram
);

// Delete academy program
// DELETE /api/owner/academies/:academyId/programs/:programId

router.delete(
  "/:academyId/programs/:programId",
  authenticateToken,
  authorizeRoles("owner"),
  deleteAcademyProgram
);

// ============================================================
// OWNER ACADEMY SCHEDULE
// ============================================================

// Create schedule
// POST /api/owner/academies/:academyId/schedule

router.post(
  "/:academyId/schedule",
  authenticateToken,
  authorizeRoles("owner"),
  createAcademySchedule
);

// Get schedule
// GET /api/owner/academies/:academyId/schedule

router.get(
  "/:academyId/schedule",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademySchedule
);

// Update schedule
// PUT /api/owner/academies/:academyId/schedule/:scheduleId

router.put(
  "/:academyId/schedule/:scheduleId",
  authenticateToken,
  authorizeRoles("owner"),
  updateAcademySchedule
);

// Delete schedule
// DELETE /api/owner/academies/:academyId/schedule/:scheduleId

router.delete(
  "/:academyId/schedule/:scheduleId",
  authenticateToken,
  authorizeRoles("owner"),
  deleteAcademySchedule
);

// ============================================================
// OWNER ACADEMY COACHES
// ============================================================

// Get available coaches
// GET /api/owner/academies/:academyId/coaches/available

router.get(
  "/:academyId/coaches/available",
  authenticateToken,
  authorizeRoles("owner"),
  getAvailableCoaches
);

// Assign coach
// POST /api/owner/academies/:academyId/coaches

router.post(
  "/:academyId/coaches",
  authenticateToken,
  authorizeRoles("owner"),
  assignCoachToAcademy
);

// Get academy coaches
// GET /api/owner/academies/:academyId/coaches

router.get(
  "/:academyId/coaches",
  authenticateToken,
  authorizeRoles("owner"),
  getAcademyCoaches
);

// Update coach assignment
// PUT /api/owner/academies/:academyId/coaches/:coachId

router.put(
  "/:academyId/coaches/:coachId",
  authenticateToken,
  authorizeRoles("owner"),
  updateCoachAssignment
);

// Remove coach
// DELETE /api/owner/academies/:academyId/coaches/:coachId

router.delete(
  "/:academyId/coaches/:coachId",
  authenticateToken,
  authorizeRoles("owner"),
  removeCoachFromAcademy
);

// ============================================================
// OWNER ACADEMY ENROLLMENTS
// ============================================================
//
// IMPORTANT:
// Enrollment routes are intentionally NOT defined here.
//
// The single official Owner Enrollment system is:
// ownerRoutes.js
//
// Controller:
// ownerAcademyEnrollmentController.js
//
// Official endpoints:
// GET   /api/owner/academies/:academyId/players
// GET   /api/owner/enrollments/:id
// PATCH /api/owner/enrollments/:id/approve
// PATCH /api/owner/enrollments/:id/reject
//
// ============================================================

module.exports = router;