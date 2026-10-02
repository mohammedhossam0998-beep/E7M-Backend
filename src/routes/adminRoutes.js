const express = require("express");

const router = express.Router();
console.log("🔥 ADMIN ROUTES FILE LOADED");

const {
  getAllSupportTickets,
 getSupportTicketById,
 updateSupportTicketStatus,
 updateSupportTicketPriority,
 assignSupportTicket,
 replyToSupportTicket,
 deleteSupportTicket,
  getAdminSettings,
  updateAdminSettings,
  getAdminProfile,
  updateAdminProfile,
  updateAdminPassword,
  createCoach,
  verifyOwner,
  unverifyOwner,
  approveOwner,
  rejectOwner,
  activateUser,
  verifyUser,
  unverifyUser,
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  deleteUser,
  getAllPlayers,
  getPlayerById,
  deactivatePlayer,
  activatePlayer,
  createOwner,
  updateOwner,
  getAllOwners,
  getOwnerById,
  deactivateOwner,
  deleteOwner,
  activateOwner,
  getAllPitches,
  getPitchById,
  createPitch,
  updatePitch,
  activatePitch,
  approvePitch,
  rejectPitch,
  deactivatePitch,
  deletePitch,
  createAcademy,
  getAllAcademies,
  getAcademyById,
  approveAcademy,
  rejectAcademy,
  updateAcademy,
  deactivateAcademy,
  activateAcademy,
  deleteAcademy,
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  deleteBooking,
  getAllReports,
  getReportById,
  updateReportStatus,
  deleteReport,
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  deletePayment,
  getAllOffers,
  createOffer,
  getOfferById,
  updateOffer,
  updateOfferActiveStatus,
  deleteOffer,
    // Coupons
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getAdminOverviewStats,
  getBookingAnalytics,
  getRevenueAnalytics,
  getPitchAnalytics,
  getUserAnalytics,
  getAcademyAnalytics,
  getPlayerAnalytics,
  getCoachAnalytics,
  getReviewsAnalytics,
  updateCoachApprovalStatus,
  updateCoachVisibility,
  createPrivateCoach,

  // Academy Programs
  createProgram,
  getAllPrograms,
  getProgramById,
  updateProgram,
  deleteProgram,

  // Academy Coaches
  assignCoachToAcademy,
  getAcademyCoaches,
  getAcademyCoachDetails,
  updateAcademyCoach,
  removeCoachFromAcademy,

  // Academy Players / Enrollments
  getAcademyPlayers,
  getEnrollmentById,
  createEnrollment,
  approveEnrollment,
  rejectEnrollment,
  cancelEnrollment,

  // Academy Schedule
  createSchedule,
  getAcademySchedule,
  getScheduleById,
  updateSchedule,
  deleteSchedule,

  // Academy Reviews
  getAcademyReviews,
  getReviewById,
  updateReviewVisibility,
  deleteReview,
  // Complaints
  // NOTE: these were missing from this destructure before, which made
  // Express receive `undefined` as the route handler for every
  // "/complaints..." route below and throw at startup:
  //   TypeError: Route.get() requires a callback function but got a
  //   [object Undefined]
  // That crash prevented the whole admin router (including the
  // reviews routes) from ever being registered, which is why the
  // Flutter reviews screen showed "No Reviews Found" - the backend
  // call never reached a working server.
  getAllComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
  deleteComplaint,

  // Activity Logs
  getAllActivityLogs,
  getActivityLogById,
  createActivityLog,
  deleteActivityLog,

  // Admin Roles
  getAllRoles,
  createRole,
  updateRole,
  deleteRole
} = require("../controllers/adminController");

const {
  authenticateToken
} = require("../middleware/authMiddleware");

const {
  authorizeRoles
} = require("../middleware/roleMiddleware");
// ========================================
// SUPPORT TICKETS
// ========================================

router.get(
  "/support",
  authenticateToken,
  authorizeRoles("admin"),
  getAllSupportTickets
);

router.get(
  "/support/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getSupportTicketById
);

router.put(
  "/support/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateSupportTicketStatus
);

router.put(
  "/support/:id/priority",
  authenticateToken,
  authorizeRoles("admin"),
  updateSupportTicketPriority
);

router.put(
  "/support/:id/assign",
  authenticateToken,
  authorizeRoles("admin"),
  assignSupportTicket
);

router.post(
  "/support/:id/reply",
  authenticateToken,
  authorizeRoles("admin"),
  replyToSupportTicket
);

router.delete(
  "/support/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteSupportTicket
);
// ========================================
// ADMIN SETTINGS
// ========================================
router.get(
  "/settings",
  authenticateToken,
  authorizeRoles("admin"),
  getAdminSettings
);
router.put(
  "/settings",
  authenticateToken,
  authorizeRoles("admin"),
  updateAdminSettings
);
// ========================================
// ADMIN PROFILE
// ========================================
router.get(
  "/profile",
  authenticateToken,
  authorizeRoles("admin"),
  getAdminProfile
);

router.put(
  "/profile",
  authenticateToken,
  authorizeRoles("admin"),
  updateAdminProfile
);

router.put(
  "/profile/password",
  authenticateToken,
  authorizeRoles("admin"),
  updateAdminPassword
);

// ========================================
// ADMIN OVERVIEW STATISTICS
// ========================================

router.get(
  "/statistics/overview",
  authenticateToken,
  authorizeRoles("admin"),
  getAdminOverviewStats
);


// ========================================
// BOOKING ANALYTICS
// ========================================

router.get(
  "/statistics/bookings",
  authenticateToken,
  authorizeRoles("admin"),
  getBookingAnalytics
);


// ========================================
// REVENUE ANALYTICS
// ========================================

router.get(
  "/statistics/revenue",
  authenticateToken,
  authorizeRoles("admin"),
  getRevenueAnalytics
);


// ========================================
// PITCH ANALYTICS
// ========================================

router.get(
  "/statistics/pitches",
  authenticateToken,
  authorizeRoles("admin"),
  getPitchAnalytics
);


// ========================================
// USER ANALYTICS
// ========================================

router.get(
  "/statistics/users",
  authenticateToken,
  authorizeRoles("admin"),
  getUserAnalytics
);


// ========================================
// ACADEMY ANALYTICS
// ========================================

router.get(
  "/statistics/academies",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademyAnalytics
);


// ========================================
// PLAYER ANALYTICS
// ========================================

router.get(
  "/statistics/players",
  authenticateToken,
  authorizeRoles("admin"),
  getPlayerAnalytics
);


// ========================================
// COACH ANALYTICS
// ========================================

router.get(
  "/statistics/coaches",
  authenticateToken,
  authorizeRoles("admin"),
  getCoachAnalytics
);


// ========================================
// REVIEWS ANALYTICS
// ========================================

router.get(
  "/statistics/reviews",
  authenticateToken,
  authorizeRoles("admin"),
  getReviewsAnalytics
);


// ========================================
// ADMIN - CREATE COACH
// ========================================

router.post(
  "/coaches",
  authenticateToken,
  authorizeRoles("admin"),
  createCoach
);


// ========================================
// CREATE E7M PRIVATE COACH
// ========================================

router.post(
  "/coaches/private",
  authenticateToken,
  authorizeRoles("admin"),
  createPrivateCoach
);


// ========================================
// APPROVE / UNAPPROVE COACH
// ========================================

router.patch(
  "/coaches/:id/approval",
  authenticateToken,
  authorizeRoles("admin"),
  updateCoachApprovalStatus
);


// ========================================
// UPDATE COACH VISIBILITY
// ========================================

router.patch(
  "/coaches/:id/visibility",
  authenticateToken,
  authorizeRoles("admin"),
  updateCoachVisibility
);


// ========================================
// CREATE ACADEMY
// ========================================

router.post(
  "/academies",
  authenticateToken,
  authorizeRoles("admin"),
  createAcademy
);


// ========================================
// GET ALL ACADEMIES
// ========================================

router.get(
  "/academies",
  authenticateToken,
  authorizeRoles("admin"),
  getAllAcademies
);


// ========================================
// GET ACADEMY BY ID
// ========================================

router.get(
  "/academies/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademyById
);


// ========================================
// APPROVE ACADEMY
// ========================================

router.put(
  "/academies/:id/approve",
  authenticateToken,
  authorizeRoles("admin"),
  approveAcademy
);


// ========================================
// REJECT ACADEMY
// ========================================

router.put(
  "/academies/:id/reject",
  authenticateToken,
  authorizeRoles("admin"),
  rejectAcademy
);


// ========================================
// UPDATE ACADEMY
// ========================================

router.put(
  "/academies/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateAcademy
);


// ========================================
// DEACTIVATE ACADEMY
// ========================================

router.put(
  "/academies/:id/deactivate",
  authenticateToken,
  authorizeRoles("admin"),
  deactivateAcademy
);


// ========================================
// ACTIVATE ACADEMY
// ========================================

router.put(
  "/academies/:id/activate",
  authenticateToken,
  authorizeRoles("admin"),
  activateAcademy
);


// ========================================
// DELETE ACADEMY
// ========================================

router.delete(
  "/academies/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteAcademy
);


// ========================================================================
// ACADEMY PROGRAMS
// ========================================================================

// ========================================
// CREATE PROGRAM
// ========================================

router.post(
  "/academies/:academyId/programs",
  authenticateToken,
  authorizeRoles("admin"),
  createProgram
);


// ========================================
// GET ALL PROGRAMS (BY ACADEMY)
// ========================================

router.get(
  "/academies/:academyId/programs",
  authenticateToken,
  authorizeRoles("admin"),
  getAllPrograms
);


// ========================================
// GET PROGRAM BY ID
// ========================================

router.get(
  "/programs/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getProgramById
);


// ========================================
// UPDATE PROGRAM
// ========================================

router.put(
  "/programs/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateProgram
);


// ========================================
// DELETE PROGRAM
// ========================================

router.delete(
  "/programs/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteProgram
);


// ========================================================================
// ACADEMY COACHES
// ========================================================================

// ========================================
// ASSIGN / ADD COACH TO ACADEMY
// ========================================

router.post(
  "/academies/:academyId/coaches",
  authenticateToken,
  authorizeRoles("admin"),
  assignCoachToAcademy
);


// ========================================
// GET ACADEMY COACHES
// ========================================

router.get(
  "/academies/:academyId/coaches",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademyCoaches
);


// ========================================
// GET COACH DETAILS (ACADEMY COACH)
// ========================================

router.get(
  "/academy-coaches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademyCoachDetails
);


// ========================================
// UPDATE ACADEMY COACH
// ========================================

router.put(
  "/academy-coaches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateAcademyCoach
);


// ========================================
// REMOVE COACH FROM ACADEMY
// ========================================

router.delete(
  "/academy-coaches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  removeCoachFromAcademy
);


// ========================================================================
// ACADEMY PLAYERS / ENROLLMENTS
// ========================================================================

// ========================================
// GET ACADEMY PLAYERS
// ========================================

router.get(
  "/academies/:academyId/players",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademyPlayers
);


// ========================================
// CREATE ENROLLMENT
// ========================================

router.post(
  "/academies/:academyId/enrollments",
  authenticateToken,
  authorizeRoles("admin"),
  createEnrollment
);


// ========================================
// GET PLAYER ENROLLMENT DETAILS
// ========================================

router.get(
  "/enrollments/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getEnrollmentById
);


// ========================================
// APPROVE ENROLLMENT
// ========================================

router.put(
  "/enrollments/:id/approve",
  authenticateToken,
  authorizeRoles("admin"),
  approveEnrollment
);


// ========================================
// REJECT ENROLLMENT
// ========================================

router.put(
  "/enrollments/:id/reject",
  authenticateToken,
  authorizeRoles("admin"),
  rejectEnrollment
);


// ========================================
// REMOVE / CANCEL ENROLLMENT
// ========================================

router.put(
  "/enrollments/:id/cancel",
  authenticateToken,
  authorizeRoles("admin"),
  cancelEnrollment
);


// ========================================================================
// ACADEMY SCHEDULE
// ========================================================================

// ========================================
// CREATE SCHEDULE
// ========================================

router.post(
  "/academies/:academyId/schedule",
  authenticateToken,
  authorizeRoles("admin"),
  createSchedule
);


// ========================================
// GET ACADEMY SCHEDULE
// ========================================

router.get(
  "/academies/:academyId/schedule",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademySchedule
);


// ========================================
// GET SCHEDULE BY ID
// ========================================

router.get(
  "/schedule/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getScheduleById
);


// ========================================
// UPDATE SCHEDULE
// ========================================

router.put(
  "/schedule/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateSchedule
);


// ========================================
// DELETE SCHEDULE
// ========================================

router.delete(
  "/schedule/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteSchedule
);


// ========================================================================
// ACADEMY REVIEWS
// ========================================================================

// ========================================
// GET ACADEMY REVIEWS
// ========================================

router.get(
  "/academies/:academyId/reviews",
  authenticateToken,
  authorizeRoles("admin"),
  getAcademyReviews
);


// ========================================
// GET REVIEW DETAILS
// ========================================

router.get(
  "/reviews/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getReviewById
);


// ========================================
// HIDE / UNHIDE REVIEW
// ========================================

router.patch(
  "/reviews/:id/visibility",
  authenticateToken,
  authorizeRoles("admin"),
  updateReviewVisibility
);


// ========================================
// DELETE / REMOVE REVIEW
// ========================================

router.delete(
  "/reviews/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteReview
);
// ========================================================================
// COMPLAINTS
// ========================================================================

// ========================================
// GET ALL COMPLAINTS
// ========================================

router.get(
  "/complaints",
  authenticateToken,
  authorizeRoles("admin"),
  getAllComplaints
);


// ========================================
// GET COMPLAINT BY ID
// ========================================

router.get(
  "/complaints/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getComplaintById
);


// ========================================
// CREATE COMPLAINT
// ========================================

router.post(
  "/complaints",
  authenticateToken,
  authorizeRoles("admin"),
  createComplaint
);


// ========================================
// UPDATE COMPLAINT STATUS
// ========================================

router.put(
  "/complaints/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateComplaintStatus
);


// ========================================
// DELETE COMPLAINT
// ========================================

router.delete(
  "/complaints/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteComplaint
);
// ========================================================================
// COUPONS
// ========================================================================

// ========================================
// GET ALL COUPONS
// ========================================

router.get(
  "/coupons",
  authenticateToken,
  authorizeRoles("admin"),
  getAllCoupons
);


// ========================================
// GET COUPON BY ID
// ========================================

router.get(
  "/coupons/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getCouponById
);


// ========================================
// CREATE COUPON
// ========================================

router.post(
  "/coupons",
  authenticateToken,
  authorizeRoles("admin"),
  createCoupon
);


// ========================================
// UPDATE COUPON
// ========================================

router.put(
  "/coupons/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateCoupon
);


// ========================================
// DELETE COUPON
// ========================================

router.delete(
  "/coupons/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteCoupon
);


// ========================================
// TOGGLE COUPON STATUS
// ========================================

router.patch(
  "/coupons/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  toggleCouponStatus
);

// ========================================================================
// ACTIVITY LOGS
// ========================================================================

// ========================================
// GET ALL ACTIVITY LOGS
// ========================================

router.get(
  "/activity-logs",
  authenticateToken,
  authorizeRoles("admin"),
  getAllActivityLogs
);


// ========================================
// GET ACTIVITY LOG BY ID
// ========================================

router.get(
  "/activity-logs/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getActivityLogById
);


// ========================================
// DELETE ACTIVITY LOG
// ========================================

router.delete(
  "/activity-logs/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteActivityLog
);
// ========================================
// GET ALL BOOKINGS
// ========================================

router.get(
  "/bookings",
  authenticateToken,
  authorizeRoles("admin"),
  getAllBookings
);


// ========================================
// GET BOOKING BY ID
// ========================================

router.get(
  "/bookings/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getBookingById
);


// ========================================
// UPDATE BOOKING STATUS
// ========================================

router.put(
  "/bookings/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateBookingStatus
);


// ========================================
// DELETE BOOKING
// ========================================

router.delete(
  "/bookings/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteBooking
);


// ========================================
// GET ALL REPORTS
// ========================================

router.get(
  "/reports",
  authenticateToken,
  authorizeRoles("admin"),
  getAllReports
);


// ========================================
// GET REPORT BY ID
// ========================================

router.get(
  "/reports/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getReportById
);


// ========================================
// UPDATE REPORT STATUS
// ========================================

router.put(
  "/reports/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateReportStatus
);


// ========================================
// DELETE REPORT
// ========================================

router.delete(
  "/reports/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteReport
);


// ========================================
// CREATE NOTIFICATION
// ========================================

router.post(
  "/notifications",
  authenticateToken,
  authorizeRoles("admin"),
  createNotification
);


// ========================================
// GET ALL NOTIFICATIONS
// ========================================

router.get(
  "/notifications",
  authenticateToken,
  authorizeRoles("admin"),
  getAllNotifications
);


// ========================================
// GET NOTIFICATION BY ID
// ========================================

router.get(
  "/notifications/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getNotificationById
);


// ========================================
// UPDATE NOTIFICATION
// ========================================

router.put(
  "/notifications/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateNotification
);


// ========================================
// DELETE NOTIFICATION
// ========================================

router.delete(
  "/notifications/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteNotification
);


// ========================================
// GET ALL PAYMENTS
// ========================================

router.get(
  "/payments",
  authenticateToken,
  authorizeRoles("admin"),
  getAllPayments
);


// ========================================
// GET PAYMENT BY ID
// ========================================

router.get(
  "/payments/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getPaymentById
);


// ========================================
// UPDATE PAYMENT STATUS
// ========================================

router.put(
  "/payments/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updatePaymentStatus
);


// ========================================
// DELETE PAYMENT
// ========================================

router.delete(
  "/payments/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deletePayment
);


// ========================================
// CREATE OFFER
// ========================================

router.post(
  "/offers",
  authenticateToken,
  authorizeRoles("admin"),
  createOffer
);


// ========================================
// GET ALL OFFERS
// ========================================

router.get(
  "/offers",
  authenticateToken,
  authorizeRoles("admin"),
  getAllOffers
);


// ========================================
// GET OFFER BY ID
// ========================================

router.get(
  "/offers/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getOfferById
);


// ========================================
// UPDATE OFFER
// ========================================

router.put(
  "/offers/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateOffer
);


// ========================================
// ACTIVATE / DEACTIVATE OFFER
// ========================================

router.patch(
  "/offers/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateOfferActiveStatus
);


// ========================================
// DELETE OFFER
// ========================================

router.delete(
  "/offers/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteOffer
);


// ========================================
// GET ALL USERS
// ========================================

router.get(
  "/users",
  authenticateToken,
  authorizeRoles("admin"),
  getAllUsers
);


// ========================================
// CREATE USER
// ========================================

router.post(
  "/users",
  authenticateToken,
  authorizeRoles("admin"),
  createUser
);


// ========================================
// GET ALL PLAYERS
// ========================================

router.get(
  "/players",
  authenticateToken,
  authorizeRoles("admin"),
  getAllPlayers
);


// ========================================
// GET PLAYER BY ID
// ========================================

router.get(
  "/players/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getPlayerById
);


// ========================================
// DEACTIVATE PLAYER
// ========================================

router.put(
  "/players/:id/deactivate",
  authenticateToken,
  authorizeRoles("admin"),
  deactivatePlayer
);


// ========================================
// ACTIVATE PLAYER
// ========================================

router.put(
  "/players/:id/activate",
  authenticateToken,
  authorizeRoles("admin"),
  activatePlayer
);


// ========================================
// CREATE OWNER
// ========================================

router.post(
  "/owners",
  authenticateToken,
  authorizeRoles("admin"),
  createOwner
);


// ========================================
// UPDATE OWNER
// ========================================

router.put(
  "/owners/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateOwner
);


// ========================================
// VERIFY OWNER
// ========================================

router.put(
  "/owners/:id/verify",
  authenticateToken,
  authorizeRoles("admin"),
  verifyOwner
);
// ========================================
// APPROVE OWNER
// ========================================

router.put(
  "/owners/:id/approve",
  authenticateToken,
  authorizeRoles("admin"),
  approveOwner
);


// ========================================
// REJECT OWNER
// ========================================

router.put(
  "/owners/:id/reject",
  authenticateToken,
  authorizeRoles("admin"),
  rejectOwner
);


// ========================================
// UNVERIFY OWNER
// ========================================

router.put(
  "/owners/:id/unverify",
  authenticateToken,
  authorizeRoles("admin"),
  unverifyOwner
);

// ========================================
// APPROVE OWNER
// ========================================

router.put(
  "/owners/:id/approve",
  authenticateToken,
  authorizeRoles("admin"),
  approveOwner
);


// ========================================
// REJECT OWNER
// ========================================

router.put(
  "/owners/:id/reject",
  authenticateToken,
  authorizeRoles("admin"),
  rejectOwner
);
// ========================================
// GET ALL OWNERS
// ========================================

router.get(
  "/owners",
  authenticateToken,
  authorizeRoles("admin"),
  getAllOwners
);


// ========================================
// GET OWNER BY ID
// ========================================

router.get(
  "/owners/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getOwnerById
);


// ========================================
// DEACTIVATE OWNER
// ========================================

router.put(
  "/owners/:id/deactivate",
  authenticateToken,
  authorizeRoles("admin"),
  deactivateOwner
);


// ========================================
// ACTIVATE OWNER
// ========================================

router.put(
  "/owners/:id/activate",
  authenticateToken,
  authorizeRoles("admin"),
  activateOwner
);


// ========================================
// DELETE / ARCHIVE OWNER
// ========================================

router.delete(
  "/owners/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteOwner
);


// ========================================================================
// PITCHES (STADIUMS)
// ========================================================================

// ========================================
// GET ALL PITCHES
// ========================================

router.get(
  "/pitches",
  authenticateToken,
  authorizeRoles("admin"),
  getAllPitches
);


// ========================================
// GET PITCH BY ID
// ========================================

router.get(
  "/pitches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getPitchById
);


// ========================================
// CREATE PITCH
// ========================================

router.post(
  "/pitches",
  authenticateToken,
  authorizeRoles("admin"),
  createPitch
);


// ========================================
// UPDATE PITCH
// ========================================

router.put(
  "/pitches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updatePitch
);


// ========================================
// APPROVE PITCH
// ========================================

router.put(
  "/pitches/:id/approve",
  authenticateToken,
  authorizeRoles("admin"),
  approvePitch
);


// ========================================
// REJECT PITCH
// ========================================

router.put(
  "/pitches/:id/reject",
  authenticateToken,
  authorizeRoles("admin"),
  rejectPitch
);


// ========================================
// DEACTIVATE PITCH
// ========================================

router.put(
  "/pitches/:id/deactivate",
  authenticateToken,
  authorizeRoles("admin"),
  deactivatePitch
);


// ========================================
// ACTIVATE PITCH
// ========================================

router.put(
  "/pitches/:id/activate",
  authenticateToken,
  authorizeRoles("admin"),
  activatePitch
);


// ========================================
// DELETE PITCH
// ========================================

router.delete(
  "/pitches/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deletePitch
);


// ========================================
// GET USER BY ID
// ========================================

router.get(
  "/users/:id",
  authenticateToken,
  authorizeRoles("admin"),
  getUserById
);


// ========================================
// UPDATE USER
// ========================================

router.put(
  "/users/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateUser
);


// ========================================
// DEACTIVATE USER
// ========================================

router.put(
  "/users/:id/deactivate",
  authenticateToken,
  authorizeRoles("admin"),
  deactivateUser
);


// ========================================
// VERIFY USER
// ========================================

router.put(
  "/users/:id/verify",
  authenticateToken,
  authorizeRoles("admin"),
  verifyUser
);


// ========================================
// UNVERIFY USER
// ========================================

router.put(
  "/users/:id/unverify",
  authenticateToken,
  authorizeRoles("admin"),
  unverifyUser
);


// ========================================
// ACTIVATE USER
// ========================================

router.put(
  "/users/:id/activate",
  authenticateToken,
  authorizeRoles("admin"),
  activateUser
);


// ========================================
// DELETE USER
// ========================================

router.delete(
  "/users/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteUser
);


// ========================================
// ADMIN ROLES
// ========================================

router.get(
  "/roles",
  authenticateToken,
  authorizeRoles("admin"),
  getAllRoles
);

router.post(
  "/roles",
  authenticateToken,
  authorizeRoles("admin"),
  createRole
);

router.put(
  "/roles/:id",
  authenticateToken,
  authorizeRoles("admin"),
  updateRole
);

router.delete(
  "/roles/:id",
  authenticateToken,
  authorizeRoles("admin"),
  deleteRole
);


module.exports = router;