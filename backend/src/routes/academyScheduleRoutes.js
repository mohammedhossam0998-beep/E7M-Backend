const express = require("express");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const {
  createAcademySchedule,
  getOwnerAcademySchedule,
  getOwnerScheduleById,
  updateAcademySchedule,
  deleteAcademySchedule,
} = require("../controllers/academyScheduleController");

const router = express.Router();

// ========================================
// OWNER ACADEMY SCHEDULE
// ========================================

// Create schedule
// POST /api/owner/academies/:academyId/schedule

router.post(
  "/:academyId/schedule",
  authenticateToken,
  authorizeRoles("owner"),
  createAcademySchedule
);

// Get all schedules
// GET /api/owner/academies/:academyId/schedule

router.get(
  "/:academyId/schedule",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademySchedule
);

// Get schedule by ID
// GET /api/owner/academies/:academyId/schedule/:scheduleId

router.get(
  "/:academyId/schedule/:scheduleId",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerScheduleById
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

module.exports = router;