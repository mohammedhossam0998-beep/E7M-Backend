const pool = require("../config/db");

// ============================================================
// CREATE SUPPORT TICKET
// POST /api/support/tickets
// PLAYER + OWNER
// ============================================================

const createSupportTicket = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      subject,
      message,
      priority = "medium",
    } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject is required",
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const allowedPriorities = [
      "low",
      "medium",
      "high",
    ];

    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message:
          "Priority must be low, medium, or high",
      });
    }

    // --------------------------------------------------------
    // CREATE TICKET
    // --------------------------------------------------------

    const result = await pool.query(
      `
        INSERT INTO support_tickets (
          user_id,
          subject,
          message,
          status,
          priority
        )
        VALUES ($1, $2, $3, 'open', $4)
        RETURNING
          id,
          user_id,
          subject,
          message,
          status,
          priority,
          assigned_admin_id,
          created_at,
          updated_at
      `,
      [
        userId,
        subject.trim(),
        message.trim(),
        priority,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      ticket: result.rows[0],
    });
  } catch (error) {
    console.error(
      "❌ CREATE SUPPORT TICKET ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create support ticket",
    });
  }
};

// ============================================================
// GET MY SUPPORT TICKETS
// GET /api/support/tickets
// PLAYER + OWNER
// ============================================================

const getMySupportTickets = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
        SELECT
          id,
          user_id,
          subject,
          message,
          status,
          priority,
          assigned_admin_id,
          created_at,
          updated_at
        FROM support_tickets
        WHERE user_id = $1
        ORDER BY updated_at DESC, created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      tickets: result.rows,
    });
  } catch (error) {
    console.error(
      "❌ GET MY SUPPORT TICKETS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get support tickets",
    });
  }
};

// ============================================================
// GET SUPPORT TICKET BY ID
// GET /api/support/tickets/:id
// PLAYER + OWNER
// ============================================================

const getSupportTicketById = async (req, res) => {
  try {
    const userId = req.user.userId;
    const ticketId = req.params.id;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required",
      });
    }

    // --------------------------------------------------------
    // GET TICKET
    // --------------------------------------------------------

    const ticketResult = await pool.query(
      `
        SELECT
          id,
          user_id,
          subject,
          message,
          status,
          priority,
          assigned_admin_id,
          created_at,
          updated_at
        FROM support_tickets
        WHERE id = $1
          AND user_id = $2
      `,
      [
        ticketId,
        userId,
      ]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    // --------------------------------------------------------
    // GET ADMIN REPLIES
    // --------------------------------------------------------

    const repliesResult = await pool.query(
      `
        SELECT
          id,
          ticket_id,
          admin_id,
          message,
          created_at
        FROM support_ticket_replies
        WHERE ticket_id = $1
        ORDER BY created_at ASC
      `,
      [ticketId]
    );

    return res.status(200).json({
      success: true,
      ticket: ticketResult.rows[0],
      replies: repliesResult.rows,
    });
  } catch (error) {
    console.error(
      "❌ GET SUPPORT TICKET ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get support ticket",
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createSupportTicket,
  getMySupportTickets,
  getSupportTicketById,
};