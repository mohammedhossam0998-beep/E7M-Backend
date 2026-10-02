const express = require("express");

const {
  createTeam,
  getMyTeams,
  getTeamDetails,
  requestToJoinTeam,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  updateTeam,
  removePlayerFromTeam,
  leaveTeam,
  transferCaptaincy,
  getNearbyTeams,
} = require("../controllers/teamController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const router = express.Router();

// ============================================================
// TEAM ROUTES
// ============================================================

// Create Team
// POST /api/player/teams
router.post(
  "/",
  authenticateToken,
  createTeam
);

// Get My Teams
// GET /api/player/teams/my
router.get(
  "/my",
  authenticateToken,
  getMyTeams
);

// Request to Join Team
// POST /api/player/teams/:id/join
router.post(
  "/:id/join",
  authenticateToken,
  requestToJoinTeam
);

// Get Team Join Requests
// GET /api/player/teams/:id/join-requests
router.get(
  "/:id/join-requests",
  authenticateToken,
  getJoinRequests
);

// Approve Team Join Request
// PATCH /api/player/teams/:id/join-requests/:requestId
router.patch(
  "/:id/join-requests/:requestId",
  authenticateToken,
  approveJoinRequest
);

// Reject Team Join Request
// PATCH /api/player/teams/:id/join-requests/:requestId/reject
router.patch(
  "/:id/join-requests/:requestId/reject",
  authenticateToken,
  rejectJoinRequest
);

// Update Team
// PATCH /api/player/teams/:id
router.patch(
  "/:id",
  authenticateToken,
  updateTeam
);

// Remove Player From Team
// DELETE /api/player/teams/:id/members/:playerId
router.delete(
  "/:id/members/:playerId",
  authenticateToken,
  removePlayerFromTeam
);

// Leave Team
// DELETE /api/player/teams/:id/leave
router.delete(
  "/:id/leave",
  authenticateToken,
  leaveTeam
);

// Transfer Team Captaincy
// PATCH /api/player/teams/:id/captain
router.patch(
  "/:id/captain",
  authenticateToken,
  transferCaptaincy
);

// Get Nearby Teams
// GET /api/player/teams/nearby
router.get(
  "/nearby",
  authenticateToken,
  getNearbyTeams
);

// Get Team Details
// GET /api/player/teams/:id
router.get(
  "/:id",
  authenticateToken,
  getTeamDetails
);

module.exports = router;