const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// ============================================================
// AUTHENTICATE TOKEN
// ============================================================

const authenticateToken = async (req, res, next) => {
  try {
    // ========================================================
    // GET AUTHORIZATION HEADER
    // ========================================================

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access token is required"
      });
    }

    // ========================================================
    // CHECK BEARER FORMAT
    // ========================================================

    const parts = authHeader.split(" ");

    if (
      parts.length !== 2 ||
      parts[0] !== "Bearer" ||
      !parts[1]
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format"
      });
    }

    const token = parts[1];

    // ========================================================
    // VERIFY JWT
    // ========================================================

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // ========================================================
    // GET USER ID FROM TOKEN
    // ========================================================

    const userId =
      decoded.userId ??
      decoded.user_id ??
      decoded.id ??
      decoded.sub;

    console.log("🔐 JWT DECODED:", decoded);
    console.log("👤 AUTH USER ID:", userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload"
      });
    }

    // ========================================================
    // GET CURRENT USER FROM DATABASE
    // ========================================================

    const userResult = await pool.query(
      `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.role,
        u.is_active,
        u.is_verified,
        u.approval_status,

        o.is_deleted AS owner_is_deleted

      FROM users u

      LEFT JOIN owners o
        ON o.user_id = u.id
        AND u.role = 'owner'

      WHERE u.id = $1

      LIMIT 1
      `,
      [userId]
    );

    // ========================================================
    // USER DOES NOT EXIST
    // ========================================================

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists"
      });
    }

    const user = userResult.rows[0];

    // ========================================================
    // ACCOUNT BLOCKED / DEACTIVATED
    // ========================================================

    if (user.is_active !== true) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "Your account has been blocked by the administrator.",
        blocked: true
      });
    }

    // ========================================================
    // OWNER DELETED
    // ========================================================

    if (
      user.role === "owner" &&
      user.owner_is_deleted === true
    ) {
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DELETED",
        message: "Your owner account has been deleted.",
        deleted: true
      });
    }

    // ========================================================
    // OWNER APPROVAL
    // ========================================================

    if (user.role === "owner") {

      // ------------------------------------------------------
      // PENDING
      // ------------------------------------------------------

      if (user.approval_status === "pending") {
        return res.status(403).json({
          success: false,
          code: "OWNER_APPROVAL_PENDING",
          message: "Your owner account is waiting for admin approval.",
          approvalRequired: true,
          approved: false,
          approvalStatus: "pending"
        });
      }

      // ------------------------------------------------------
      // REJECTED
      // ------------------------------------------------------

      if (user.approval_status === "rejected") {
        return res.status(403).json({
          success: false,
          code: "OWNER_APPROVAL_REJECTED",
          message: "Your owner account has been rejected by the administrator.",
          approvalRequired: true,
          approved: false,
          approvalStatus: "rejected"
        });
      }

      // ------------------------------------------------------
      // INVALID APPROVAL STATUS
      // ------------------------------------------------------

      if (user.approval_status !== "approved") {
        return res.status(403).json({
          success: false,
          code: "OWNER_APPROVAL_REQUIRED",
          message: "Your owner account is not approved.",
          approvalRequired: true,
          approved: false,
          approvalStatus: user.approval_status
        });
      }
    }

    // ========================================================
    // STORE CURRENT USER INFORMATION
    // ========================================================

    req.user = {
      userId: user.id,
      role: user.role,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      profile_image: user.profile_image,
      is_active: user.is_active,
      is_verified: user.is_verified,
      approval_status: user.approval_status
    };

    // ========================================================
    // CONTINUE
    // ========================================================

    next();

  } catch (error) {

    console.error(
      "AUTH MIDDLEWARE ERROR:",
      error.message
    );

    // ========================================================
    // JWT EXPIRED / INVALID
    // ========================================================

    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    // ========================================================
    // DATABASE / SERVER ERROR
    // ========================================================

    return res.status(500).json({
      success: false,
      message: "Authentication service error"
    });
  }
};

module.exports = {
  authenticateToken
};