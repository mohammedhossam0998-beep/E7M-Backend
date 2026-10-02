const express = require("express");

const {
  getAllCoaches,
  getCoachById,
  updateCoach,
  deleteCoach,
  toggleApproveCoach,
  toggleBlockCoach,
  toggleFeaturedCoach,
} = require("../controllers/adminCoachController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const router = express.Router();

// ============================================================
// ADMIN AUTHORIZATION
// ============================================================

router.use(
  authenticateToken,
  authorizeRoles("admin")
);

// ============================================================
// GET ALL COACHES
// GET /api/admin/coaches
// ============================================================

router.get(
  "/",
  getAllCoaches
);

// ============================================================
// GET COACH BY ID
// GET /api/admin/coaches/:id
// ============================================================

router.get(
  "/:id",
  getCoachById
);

// ============================================================
// UPDATE COACH
// PUT /api/admin/coaches/:id
// ============================================================

router.put(
  "/:id",
  updateCoach
);

// ============================================================
// DELETE COACH
// DELETE /api/admin/coaches/:id
// ============================================================

router.delete(
  "/:id",
  deleteCoach
);

// ============================================================
// APPROVE / UNAPPROVE
// PATCH /api/admin/coaches/:id/approve
// ============================================================

router.patch(
  "/:id/approve",
  toggleApproveCoach
);

// ============================================================
// BLOCK / UNBLOCK
// PATCH /api/admin/coaches/:id/block
// ============================================================

router.patch(
  "/:id/block",
  toggleBlockCoach
);

// ============================================================
// FEATURE / UNFEATURE
// PATCH /api/admin/coaches/:id/featured
// ============================================================

router.patch(
  "/:id/featured",
  toggleFeaturedCoach
);

module.exports = router;