const express = require("express");

const {
  authenticateToken
} = require("../middleware/authMiddleware");

const {
  authorizeRoles
} = require("../middleware/roleMiddleware");

const {
  createBooking,
  getMyBookings,
  getOwnerBookings,
  getBookingById,      // جديد: لازم تضيفه في bookingController.js
  approveBooking,
  rejectBooking,
  cancelBooking
} = require("../controllers/bookingController");

const router = express.Router();


// ========================================
// PLAYER BOOKINGS
// ========================================

// CREATE BOOKING
// POST /api/bookings
router.post(
  "/",
  authenticateToken,
  authorizeRoles("player"),
  createBooking
);

// GET MY BOOKINGS
// GET /api/bookings/my
router.get(
  "/my",
  authenticateToken,
  authorizeRoles("player"),
  getMyBookings
);

// CANCEL MY BOOKING
// PATCH /api/bookings/:id/cancel
router.patch(
  "/:id/cancel",
  authenticateToken,
  authorizeRoles("player"),
  cancelBooking
);


// ========================================
// OWNER BOOKINGS
// ========================================

// GET OWNER BOOKINGS
// GET /api/bookings/owner
router.get(
  "/owner",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerBookings
);

// APPROVE / CONFIRM BOOKING
// PATCH /api/bookings/:id/approve
router.patch(
  "/:id/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approveBooking
);

// REJECT BOOKING
// PATCH /api/bookings/:id/reject
router.patch(
  "/:id/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectBooking
);


// ========================================
// SHARED (PLAYER + OWNER)
// ========================================

// GET SINGLE BOOKING BY ID
// GET /api/bookings/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles("player", "owner"), // لازم تتأكد في الـ controller إن اليوزر ده صاحب الحجز أو صاحب الملعب فعلاً
  getBookingById
);


module.exports = router;
