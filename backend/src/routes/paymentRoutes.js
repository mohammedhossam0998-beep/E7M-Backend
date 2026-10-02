const express = require("express");

const {
  authenticateToken
} = require("../middleware/authMiddleware");

const {
  createPayment,
  submitTransactionReference,
  getBookingPayments,
  getBookingPaymentAccounts,
} = require("../controllers/paymentController");

const router = express.Router();

// ============================================================
// GET BOOKING PAYMENT ACCOUNTS
// GET /api/payments/booking/:bookingId/accounts
// ============================================================
//
// Returns the owner's active payment accounts for the
// pitch of this booking, so the player can choose one.
//
// Kept BEFORE "/booking/:bookingId" for clarity.
//
// ============================================================

router.get(
  "/booking/:bookingId/accounts",
  authenticateToken,
  getBookingPaymentAccounts
);

// ========================================
// GET BOOKING PAYMENTS
// ========================================

// Get all payments for a specific booking
router.get(
  "/booking/:bookingId",
  authenticateToken,
  getBookingPayments
);

// ========================================
// PLAYER PAYMENTS
// ========================================

// Create deposit payment
// The amount is taken automatically from
// booking.deposit_amount
router.post(
  "/deposit",
  authenticateToken,
  createPayment
);


// ========================================
// PLAYER FULL PAYMENT
// ========================================

// Create full payment
// The amount is taken automatically from
// booking.total_price
router.post(
  "/full",
  authenticateToken,
  createPayment
);


// ========================================
// SUBMIT TRANSACTION REFERENCE
// ========================================

// Player submits the transaction reference
// after making the transfer
router.post(
  "/:id/submit",
  authenticateToken,
  submitTransactionReference
);


module.exports = router;