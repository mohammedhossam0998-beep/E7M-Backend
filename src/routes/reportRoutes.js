const express = require("express");

const {
  authenticateToken
} = require("../middleware/authMiddleware");

const {
  authorizeRoles
} = require("../middleware/roleMiddleware");

const {
  createReport
} = require("../controllers/reportController");

const router = express.Router();

// ========================================
// CREATE REPORT
// ========================================

router.post(
  "/",
  authenticateToken,
  authorizeRoles("player", "owner"),
  createReport
);

module.exports = router;