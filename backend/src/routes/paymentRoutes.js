
const express = require("express");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const {
  createPayment,
  submitTransactionReference,
  getBookingPayments,
  getBookingPaymentAccounts,
} = require("../controllers/paymentController");

const {
  getAcademyPaymentAccounts,
  createAcademyPayment,
  getPlayerAcademyPayments,
  submitAcademyTransactionReference,
  getOwnerAcademyPayments,
  approveAcademyPayment,
  rejectAcademyPayment,
} = require("../controllers/academyPaymentController");

const router = express.Router();

// ============================================================
// ACADEMY PAYMENTS
// ============================================================

// Player: Get academy payment accounts.
router.get(
  "/academy/enrollments/:enrollmentId/accounts",
  authenticateToken,
  authorizeRoles("player"),
  getAcademyPaymentAccounts
);

// Player: Get enrollment payments.
router.get(
  "/academy/enrollments/:enrollmentId",
  authenticateToken,
  authorizeRoles("player"),
  getPlayerAcademyPayments
);

// Player: Create enrollment payment.
router.post(
  "/academy/enrollments/:enrollmentId",
  authenticateToken,
  authorizeRoles("player"),
  createAcademyPayment
);

// Player: Submit transfer reference.
router.post(
  "/academy/:paymentId/submit",
  authenticateToken,
  authorizeRoles("player"),
  submitAcademyTransactionReference
);

// Owner: Get academy payments.
router.get(
  "/academy/owner",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademyPayments
);

// Owner: Approve academy payment.
router.patch(
  "/academy/:paymentId/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approveAcademyPayment
);

// Owner: Reject academy payment.
router.patch(
  "/academy/:paymentId/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectAcademyPayment
);

// ============================================================
// STADIUM BOOKING PAYMENTS - UNCHANGED
// ============================================================

// Get booking payment accounts.
router.get(
  "/booking/:bookingId/accounts",
  authenticateToken,
  getBookingPaymentAccounts
);

// Get booking payments.
router.get(
  "/booking/:bookingId",
  authenticateToken,
  getBookingPayments
);

// Create deposit payment.
router.post(
  "/deposit",
  authenticateToken,
  createPayment
);

// Create full payment.
router.post(
  "/full",
  authenticateToken,
  createPayment
);

// Submit stadium payment transfer reference.
router.post(
  "/:id/submit",
  authenticateToken,
  submitTransactionReference
);

module.exports = router;
