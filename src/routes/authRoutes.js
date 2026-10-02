const express = require("express");

const {
  register,
  login,
  verifyResetOtp,
  sendOtp,
  verifyOtp,
  resendOtp,
  setPassword,
  forgotPassword,
  resetPassword,
  changePassword,
  testDatabase,
  getMe,
} = require("../controllers/authController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const router = express.Router();

// ============================================================
// TEST DATABASE
// ============================================================

router.get(
  "/test-db",
  testDatabase
);

// ============================================================
// REGISTER
// ============================================================

router.post(
  "/register",
  register
);

// ============================================================
// LOGIN
// ============================================================

router.post(
  "/login",
  login
);

// ============================================================
// EMAIL OTP
// ============================================================

router.post(
  "/send-otp",
  sendOtp
);

router.post(
  "/verify-otp",
  verifyOtp
);

router.post(
  "/resend-otp",
  resendOtp
);

// ============================================================
// SET PASSWORD
// ============================================================

router.post(
  "/set-password",
  setPassword
);

// ============================================================
// FORGOT PASSWORD
// ============================================================

router.post(
  "/forgot-password",
  forgotPassword
);

// ============================================================
// VERIFY RESET OTP
// ============================================================

router.post(
  "/verify-reset-otp",
  verifyResetOtp
);

// ============================================================
// RESET PASSWORD
// ============================================================

router.post(
  "/reset-password",
  resetPassword
);

// ============================================================
// CURRENT USER
// ============================================================

router.get(
  "/me",
  authenticateToken,
  getMe
);

// ============================================================
// CHANGE PASSWORD
// ============================================================

router.patch(
  "/change-password",
  authenticateToken,
  changePassword
);

// ============================================================
// OWNER TEST
// ============================================================

router.get(
  "/owner-test",
  authenticateToken,
  authorizeRoles("owner"),
  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Owner authorization works!",
      user: req.user,
    });
  }
);

module.exports = router;