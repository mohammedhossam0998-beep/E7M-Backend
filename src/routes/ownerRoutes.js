const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ========================================
// MIDDLEWARE
// ========================================

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

// ========================================
// SLOT CONTROLLER
// ========================================

const {
  createSlot,
  getPitchSlots,
  updateSlot,
  deleteSlot,
  updateSlotStatus,
} = require("../controllers/slotController");

// ========================================
// PITCH CONTROLLER
// ========================================

const {
  createPitch,
  getOwnerPitches,
  getOwnerPitchById,
  updatePitch,
  deletePitch,
} = require("../controllers/pitchController");

// ========================================
// BOOKING CONTROLLER
// ========================================

const {
  getOwnerBookings,
  approveBooking,
  rejectBooking,
} = require("../controllers/bookingController");

// ========================================
// OWNER ACADEMY ENROLLMENT CONTROLLER
// ========================================

const {
  getOwnerAcademyPlayers,
  getOwnerEnrollmentById,
  approveOwnerEnrollment,
  rejectOwnerEnrollment,
} = require("../controllers/ownerAcademyEnrollmentController");

// ========================================
// OWNER PAYMENT CONTROLLER
// ========================================

const {
  addPaymentAccount,
  getOwnerPayments,
  approvePayment,
  rejectPayment,
} = require("../controllers/ownerPaymentController");

// ========================================
// OWNER PROFILE CONTROLLER
// ========================================

const {
  getOwnerProfile,
  updateOwnerProfile,
  uploadOwnerProfileImage,
} = require("../controllers/ownerProfileController");

// ========================================
// OWNER COMPETITION CONTROLLER
// ========================================

const {
  createCompetition,
  getOwnerCompetitions,
  getOwnerCompetitionById,
  updateCompetition,
  updateCompetitionStatus,
  deleteCompetition,

  createCompetitionPrize,
  getOwnerCompetitionPrizes,
  getOwnerCompetitionPrizeById,
  updateCompetitionPrize,
  deleteCompetitionPrize,

  getOwnerCompetitionRegistrations,
  approveCompetitionRegistration,
  rejectCompetitionRegistration,
  moveCompetitionRegistrationToWaitlist,
  sendCompetitionInvitation,
  getOwnerCompetitionInvitations,
} = require("../controllers/competitionController");

// ========================================
// COMPETITION SEEDING CONTROLLER
// ========================================

const {
  generateRandomSeeding,
  getCompetitionSeeding,
  updateManualSeeding,
  confirmCompetitionSeeding,
} = require("../controllers/competitionSeedingController");

// ========================================
// COMPETITION TOURNAMENT CONTROLLER
// ========================================

const {
  generateKnockoutTournament,
} = require("../controllers/competitionTournamentController");

// ========================================
// COMPETITION MATCH CONTROLLER
// ========================================

const {
  getCompetitionMatches,
  getCompetitionMatchById,
  updateCompetitionMatch,
  cancelCompetitionMatch,
} = require("../controllers/competitionMatchController");

// ========================================
// COMPETITION RESULT CONTROLLER
// ========================================

const {
  updateCompetitionMatchResult,
} = require("../controllers/competitionResultController");

// ========================================
// COMPETITION GOAL CONTROLLER
// ========================================

const {
  addCompetitionGoal,
} = require("../controllers/competitionGoalController");

// ========================================
// COMPETITION STANDINGS CONTROLLER
// ========================================

const {
  getCompetitionStandings,
} = require("../controllers/competitionStandingsController");

// ========================================
// COMPETITION BRACKET CONTROLLER
// ========================================

const {
  getCompetitionBracket,
} = require("../controllers/competitionBracketController");

// ========================================
// OWNER COMPETITION PAYMENT CONTROLLER
// ========================================

const {
  getOwnerCompetitionPayments,
  approveCompetitionPayment,
  rejectCompetitionPayment,
} = require("../controllers/competitionPaymentController");

// ========================================
// OWNER REVIEW CONTROLLER
// ========================================

const {
  getOwnerReviews,
  hideOwnerReview,
  unhideOwnerReview,
} = require("../controllers/ownerReviewController");

// ========================================
// ROUTER
// ========================================

const router = express.Router();

// ============================================================
// OWNER PROFILE IMAGE UPLOAD
// ============================================================

const profileUploadDirectory = path.join(
  __dirname,
  "../../uploads/owners/profile"
);

if (!fs.existsSync(profileUploadDirectory)) {
  fs.mkdirSync(profileUploadDirectory, {
    recursive: true,
  });
}

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileUploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(
      file.originalname
    );

    const filename =
      `owner-${req.user.userId}-${Date.now()}${extension}`;

    cb(null, filename);
  },
});

const profileFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (
    allowedMimeTypes.includes(
      file.mimetype
    )
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed"
      )
    );
  }
};

const profileUpload = multer({
  storage: profileStorage,
  fileFilter: profileFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// ============================================================
// OWNER PITCHES
// ============================================================

// Create pitch
// POST /api/owner/pitches

router.post(
  "/pitches",
  authenticateToken,
  authorizeRoles("owner"),
  createPitch
);

// Get owner's pitches
// GET /api/owner/pitches

router.get(
  "/pitches",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerPitches
);

// Get one pitch
// GET /api/owner/pitches/:id

router.get(
  "/pitches/:id",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerPitchById
);

// Update pitch
// PUT /api/owner/pitches/:id

router.put(
  "/pitches/:id",
  authenticateToken,
  authorizeRoles("owner"),
  updatePitch
);

// Delete pitch
// DELETE /api/owner/pitches/:id

router.delete(
  "/pitches/:id",
  authenticateToken,
  authorizeRoles("owner"),
  deletePitch
);

// ============================================================
// OWNER COMPETITIONS
// ============================================================

// Create competition
// POST /api/owner/competitions

router.post(
  "/competitions",
  authenticateToken,
  authorizeRoles("owner"),
  createCompetition
);

// Get owner's competitions
// GET /api/owner/competitions

router.get(
  "/competitions",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitions
);

// Get one competition
// GET /api/owner/competitions/:id

router.get(
  "/competitions/:id",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitionById
);

// Update competition
// PUT /api/owner/competitions/:id

router.put(
  "/competitions/:id",
  authenticateToken,
  authorizeRoles("owner"),
  updateCompetition
);

// Update competition status
// PATCH /api/owner/competitions/:id/status

router.patch(
  "/competitions/:id/status",
  authenticateToken,
  authorizeRoles("owner"),
  updateCompetitionStatus
);

// Delete competition
// DELETE /api/owner/competitions/:id

router.delete(
  "/competitions/:id",
  authenticateToken,
  authorizeRoles("owner"),
  deleteCompetition
);

// Create competition prize
// POST /api/owner/competitions/:competitionId/prizes

router.post(
  "/competitions/:competitionId/prizes",
  authenticateToken,
  authorizeRoles("owner"),
  createCompetitionPrize
);

// ============================================================
// OWNER COMPETITION PRIZES
// ============================================================

// Get competition prizes
// GET /api/owner/competitions/:competitionId/prizes

router.get(
  "/competitions/:competitionId/prizes",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitionPrizes
);

// Get one competition prize
// GET /api/owner/competitions/:competitionId/prizes/:prizeId

router.get(
  "/competitions/:competitionId/prizes/:prizeId",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitionPrizeById
);

// Update competition prize
// PUT /api/owner/competitions/:competitionId/prizes/:prizeId

router.put(
  "/competitions/:competitionId/prizes/:prizeId",
  authenticateToken,
  authorizeRoles("owner"),
  updateCompetitionPrize
);

// Delete competition prize
// DELETE /api/owner/competitions/:competitionId/prizes/:prizeId

router.delete(
  "/competitions/:competitionId/prizes/:prizeId",
  authenticateToken,
  authorizeRoles("owner"),
  deleteCompetitionPrize
);

// ============================================================
// GET COMPETITION REGISTRATIONS
// GET /api/owner/competitions/:competitionId/registrations
// ============================================================

router.get(
  "/competitions/:competitionId/registrations",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitionRegistrations
);

// ============================================================
// APPROVAL / REJECTION
// ============================================================

// Approve competition registration
// PATCH /api/owner/competitions/:competitionId/registrations/:registrationId/approve

router.patch(
  "/competitions/:competitionId/registrations/:registrationId/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approveCompetitionRegistration
);

// Reject competition registration
// PATCH /api/owner/competitions/:competitionId/registrations/:registrationId/reject

router.patch(
  "/competitions/:competitionId/registrations/:registrationId/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectCompetitionRegistration
);

// ============================================================
// MOVE REGISTRATION TO WAITING LIST
// ============================================================

router.patch(
  "/competitions/:competitionId/registrations/:registrationId/waitlist",
  authenticateToken,
  authorizeRoles("owner"),
  moveCompetitionRegistrationToWaitlist
);

// ============================================================
// SEND PRIVATE COMPETITION INVITATION
// POST /api/owner/competitions/:competitionId/invitations
// ============================================================

router.post(
  "/competitions/:competitionId/invitations",
  authenticateToken,
  authorizeRoles("owner"),
  sendCompetitionInvitation
);

// Get competition invitations
// GET /api/owner/competitions/:competitionId/invitations

router.get(
  "/competitions/:competitionId/invitations",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitionInvitations
);

// ============================================================
// COMPETITION SEEDING
// ============================================================

// Generate random seeding
// POST /api/owner/competitions/:competitionId/seeding/generate

router.post(
  "/competitions/:competitionId/seeding/generate",
  authenticateToken,
  authorizeRoles("owner"),
  generateRandomSeeding
);

// Get competition seeding
// GET /api/owner/competitions/:competitionId/seeding

router.get(
  "/competitions/:competitionId/seeding",
  authenticateToken,
  authorizeRoles("owner"),
  getCompetitionSeeding
);

// Update manual seeding
// PUT /api/owner/competitions/:competitionId/seeding/manual

router.put(
  "/competitions/:competitionId/seeding/manual",
  authenticateToken,
  authorizeRoles("owner"),
  updateManualSeeding
);

// Confirm competition seeding
// POST /api/owner/competitions/:competitionId/seeding/confirm

router.post(
  "/competitions/:competitionId/seeding/confirm",
  authenticateToken,
  authorizeRoles("owner"),
  confirmCompetitionSeeding
);

// ============================================================
// COMPETITION TOURNAMENT
// ============================================================

// Generate knockout tournament
// POST /api/owner/competitions/:competitionId/tournament/generate

router.post(
  "/competitions/:competitionId/tournament/generate",
  authenticateToken,
  authorizeRoles("owner"),
  generateKnockoutTournament
);

// ============================================================
// COMPETITION MATCHES
// ============================================================

// Get all competition matches
// GET /api/owner/competitions/:competitionId/matches

router.get(
  "/competitions/:competitionId/matches",
  authenticateToken,
  authorizeRoles("owner"),
  getCompetitionMatches
);

// Get single competition match
// GET /api/owner/competitions/:competitionId/matches/:matchId

router.get(
  "/competitions/:competitionId/matches/:matchId",
  authenticateToken,
  authorizeRoles("owner"),
  getCompetitionMatchById
);

// Update competition match schedule
// PUT /api/owner/competitions/:competitionId/matches/:matchId

router.put(
  "/competitions/:competitionId/matches/:matchId",
  authenticateToken,
  authorizeRoles("owner"),
  updateCompetitionMatch
);

// Cancel competition match
// PATCH /api/owner/competitions/:competitionId/matches/:matchId/cancel

router.patch(
  "/competitions/:competitionId/matches/:matchId/cancel",
  authenticateToken,
  authorizeRoles("owner"),
  cancelCompetitionMatch
);

// ============================================================
// COMPETITION RESULTS
// ============================================================

// Update competition match result
// PUT /api/owner/competitions/:competitionId/matches/:matchId/result

router.put(
  "/competitions/:competitionId/matches/:matchId/result",
  authenticateToken,
  authorizeRoles("owner"),
  updateCompetitionMatchResult
);

// ============================================================
// COMPETITION GOALS
// POST /api/owner/competitions/:competitionId/matches/:matchId/goals
// ============================================================

router.post(
  "/competitions/:competitionId/matches/:matchId/goals",
  authenticateToken,
  authorizeRoles("owner"),
  addCompetitionGoal
);

// ============================================================
// COMPETITION STANDINGS
// GET /api/owner/competitions/:competitionId/standings
// ============================================================

router.get(
  "/competitions/:competitionId/standings",
  authenticateToken,
  authorizeRoles("owner"),
  getCompetitionStandings
);

// ============================================================
// COMPETITION BRACKET
// GET /api/owner/competitions/:competitionId/bracket
// ============================================================

router.get(
  "/competitions/:competitionId/bracket",
  authenticateToken,
  authorizeRoles("owner"),
  getCompetitionBracket
);

// ============================================================
// OWNER COMPETITION PAYMENTS
// ============================================================

// Get competition payments
// GET /api/owner/competition-payments

router.get(
  "/competition-payments",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerCompetitionPayments
);

// Approve competition payment
// PATCH /api/owner/competition-payments/:id/approve

router.patch(
  "/competition-payments/:id/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approveCompetitionPayment
);

// Reject competition payment
// PATCH /api/owner/competition-payments/:id/reject

router.patch(
  "/competition-payments/:id/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectCompetitionPayment
);

// ============================================================
// OWNER ACADEMY PLAYERS / ENROLLMENTS
// ============================================================
//
// This is the SINGLE official Owner Enrollment system.
//
// Controller:
// ownerAcademyEnrollmentController.js
//
// Endpoints:
//
// GET   /api/owner/academies/:academyId/players
// GET   /api/owner/enrollments/:id
// PATCH /api/owner/enrollments/:id/approve
// PATCH /api/owner/enrollments/:id/reject
//
// ============================================================

// Get academy players / enrollments
// GET /api/owner/academies/:academyId/players

router.get(
  "/academies/:academyId/players",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerAcademyPlayers
);

// Get enrollment details
// GET /api/owner/enrollments/:id

router.get(
  "/enrollments/:id",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerEnrollmentById
);

// Approve enrollment
// PATCH /api/owner/enrollments/:id/approve

router.patch(
  "/enrollments/:id/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approveOwnerEnrollment
);

// Reject enrollment
// PATCH /api/owner/enrollments/:id/reject

router.patch(
  "/enrollments/:id/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectOwnerEnrollment
);

// ============================================================
// OWNER PITCH SLOTS
// ============================================================

// Create slot
// POST /api/owner/pitches/:id/slots

router.post(
  "/pitches/:id/slots",
  authenticateToken,
  authorizeRoles("owner"),
  createSlot
);

// Get pitch slots
// GET /api/owner/pitches/:id/slots

router.get(
  "/pitches/:id/slots",
  authenticateToken,
  authorizeRoles("owner"),
  getPitchSlots
);

// Update slot
// PUT /api/owner/pitches/:id/slots/:slotId

router.put(
  "/pitches/:id/slots/:slotId",
  authenticateToken,
  authorizeRoles("owner"),
  updateSlot
);

// Delete slot
// DELETE /api/owner/pitches/:id/slots/:slotId

router.delete(
  "/pitches/:id/slots/:slotId",
  authenticateToken,
  authorizeRoles("owner"),
  deleteSlot
);

// Update slot status
// PATCH /api/owner/pitches/:id/slots/:slotId/status

router.patch(
  "/pitches/:id/slots/:slotId/status",
  authenticateToken,
  authorizeRoles("owner"),
  updateSlotStatus
);

// ============================================================
// OWNER BOOKINGS
// ============================================================

// Get owner bookings
// GET /api/owner/bookings

router.get(
  "/bookings",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerBookings
);

// Approve booking
// PATCH /api/owner/bookings/:id/approve

router.patch(
  "/bookings/:id/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approveBooking
);

// Reject booking
// PATCH /api/owner/bookings/:id/reject

router.patch(
  "/bookings/:id/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectBooking
);

// ============================================================
// OWNER PAYMENT ACCOUNTS
// ============================================================

// Add payment account
// POST /api/owner/payment-accounts

router.post(
  "/payment-accounts",
  authenticateToken,
  authorizeRoles("owner"),
  addPaymentAccount
);

// ============================================================
// OWNER PAYMENTS
// ============================================================

// Get owner payments
// GET /api/owner/payments

router.get(
  "/payments",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerPayments
);

// Approve payment
// PATCH /api/owner/payments/:id/approve

router.patch(
  "/payments/:id/approve",
  authenticateToken,
  authorizeRoles("owner"),
  approvePayment
);

// Reject payment
// PATCH /api/owner/payments/:id/reject

router.patch(
  "/payments/:id/reject",
  authenticateToken,
  authorizeRoles("owner"),
  rejectPayment
);

// ============================================================
// OWNER PROFILE
// ============================================================

// Upload owner profile image
// POST /api/owner/profile/image

router.post(
  "/profile/image",
  authenticateToken,
  authorizeRoles("owner"),
  profileUpload.single("image"),
  uploadOwnerProfileImage
);

// Get owner profile
// GET /api/owner/profile

router.get(
  "/profile",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerProfile
);

// Update owner profile
// PUT /api/owner/profile

router.put(
  "/profile",
  authenticateToken,
  authorizeRoles("owner"),
  updateOwnerProfile
);

// ============================================================
// OWNER REVIEWS
// ============================================================

// Get owner's reviews
// GET /api/owner/reviews

router.get(
  "/reviews",
  authenticateToken,
  authorizeRoles("owner"),
  getOwnerReviews
);

// Hide review
// PATCH /api/owner/reviews/:reviewId/hide

router.patch(
  "/reviews/:reviewId/hide",
  authenticateToken,
  authorizeRoles("owner"),
  hideOwnerReview
);

// Unhide review
// PATCH /api/owner/reviews/:reviewId/unhide

router.patch(
  "/reviews/:reviewId/unhide",
  authenticateToken,
  authorizeRoles("owner"),
  unhideOwnerReview
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;