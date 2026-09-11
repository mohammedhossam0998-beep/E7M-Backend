const express = require("express");

const {
  acceptCompetitionInvitation,
  rejectCompetitionInvitation,
  submitCompetitionPayment,
  registerForCompetition,
  getCompetitionPaymentAccounts,
  getPlayerCompetitions,
  getPlayerMyCompetitions,
  getPlayerCompetitionInvitations,
  cancelCompetitionRegistration,
} = require("../controllers/playerCompetitionController");

const {
  getPlayerCompetitionBracket,
} = require("../controllers/playerCompetitionBracketController");

const {
  getPlayerCompetitionMatches,
} = require("../controllers/playerCompetitionMatchController");

const {
  getPlayerCompetitionStandings,
} = require("../controllers/playerCompetitionStandingsController");

const {
  getPlayerCompetitionGoals,
} = require("../controllers/playerCompetitionGoalsController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  uploadCompetitionPaymentProof,
} = require("../middleware/uploadMiddleware");

const router = express.Router();

// ============================================================
// PLAYER COMPETITIONS
// ============================================================

// Get available public competitions
// GET /api/player/competitions

// Optional filters:
// ?search=...
// ?location=...
// ?date=YYYY-MM-DD
// ?competition_type=individual|team
// ?price=free|paid
// ?status=available|upcoming|all

router.get(
  "/",
  authenticateToken,
  getPlayerCompetitions
);


// Get competitions the player is registered in
// GET /api/player/competitions/my

router.get(
  "/my",
  authenticateToken,
  getPlayerMyCompetitions
);


// Get my competition bracket
// GET /api/player/competitions/:competitionId/bracket

router.get(
  "/:competitionId/bracket",
  authenticateToken,
  getPlayerCompetitionBracket
);

// Get player competition matches
// GET /api/player/competitions/:competitionId/matches

router.get(
  "/:competitionId/matches",
  authenticateToken,
  getPlayerCompetitionMatches
);

// ============================================================
// PLAYER COMPETITION GOALS
// ============================================================

// Get goals from player's competition matches
// GET /api/player/competitions/:competitionId/goals

router.get(
  "/:competitionId/goals",
  authenticateToken,
  getPlayerCompetitionGoals
);


// Get competition standings
// GET /api/player/competitions/:competitionId/standings

router.get(
  "/:competitionId/standings",
  authenticateToken,
  getPlayerCompetitionStandings
);


// Get player's competition invitations
// GET /api/player/competitions/invitations

// Optional:
// ?status=pending|accepted|rejected|expired|all

router.get(
  "/invitations",
  authenticateToken,
  getPlayerCompetitionInvitations
);

// ============================================================
// PLAYER COMPETITION REGISTRATION
// ============================================================

// Register player for competition
// POST /api/player/competitions/:competitionId/register

router.post(
  "/:competitionId/register",
  authenticateToken,
  registerForCompetition
);

// ============================================================
// PLAYER COMPETITION REGISTRATION CANCELLATION
// ============================================================

// Cancel competition registration
// PATCH /api/player/competitions/registrations/:registrationId/cancel

router.patch(
  "/registrations/:registrationId/cancel",
  authenticateToken,
  cancelCompetitionRegistration
);

// ============================================================
// PLAYER COMPETITION PAYMENT ACCOUNTS
// ============================================================

// Get active payment accounts of competition owner
// GET /api/player/competitions/:competitionId/payment-accounts

router.get(
  "/:competitionId/payment-accounts",
  authenticateToken,
  getCompetitionPaymentAccounts
);

// ============================================================
// PLAYER COMPETITION INVITATIONS
// ============================================================

// Accept competition invitation
// POST /api/player/competitions/invitations/:invitationId/accept

router.post(
  "/invitations/:invitationId/accept",
  authenticateToken,
  acceptCompetitionInvitation
);


// Reject competition invitation
// POST /api/player/competitions/invitations/:invitationId/reject

router.post(
  "/invitations/:invitationId/reject",
  authenticateToken,
  rejectCompetitionInvitation
);

// ============================================================
// PLAYER COMPETITION PAYMENTS
// ============================================================

// Submit competition payment
// POST /api/player/competitions/registrations/:registrationId/payment

router.post(
  "/registrations/:registrationId/payment",
  authenticateToken,
  uploadCompetitionPaymentProof.single("proof_image"),
  submitCompetitionPayment
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;