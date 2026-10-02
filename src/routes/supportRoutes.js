const express = require("express");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const {
  createSupportTicket,
  getMySupportTickets,
  getSupportTicketById,
} = require("../controllers/supportController");

const router = express.Router();

// ============================================================
// PLAYER + OWNER SUPPORT
// ============================================================

// CREATE SUPPORT TICKET
// POST /api/support/tickets

router.post(
  "/tickets",
  authenticateToken,
  authorizeRoles("player", "owner"),
  createSupportTicket
);

// GET MY SUPPORT TICKETS
// GET /api/support/tickets

router.get(
  "/tickets",
  authenticateToken,
  authorizeRoles("player", "owner"),
  getMySupportTickets
);

// GET SINGLE SUPPORT TICKET
// GET /api/support/tickets/:id

router.get(
  "/tickets/:id",
  authenticateToken,
  authorizeRoles("player", "owner"),
  getSupportTicketById
);

module.exports = router;