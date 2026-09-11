const express = require("express");

const {
  getTeamMessages,
  sendTeamMessage,
} = require("../controllers/teamChatController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ============================================================
// TEAM CHAT
// ============================================================

// GET /api/player/teams/:teamId/messages
// Get team chat messages
router.get(
  "/:teamId/messages",
  authenticateToken,
  getTeamMessages
);

// POST /api/player/teams/:teamId/messages
// Send team chat message
router.post(
  "/:teamId/messages",
  authenticateToken,
  sendTeamMessage
);

module.exports = router;