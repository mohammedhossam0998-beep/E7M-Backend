const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// ============================================================
// SOCKET AUTHENTICATION
// ============================================================

const authenticateSocket = async (socket, next) => {
  try {
    // ========================================================
    // GET TOKEN
    // ========================================================

    const token =
      socket.handshake.auth?.token;

    if (!token) {
      return next(
        new Error("Access token is required")
      );
    }

    // ========================================================
    // VERIFY JWT
    // ========================================================

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // ========================================================
    // GET USER ID
    // ========================================================

    const userId =
      decoded.userId ??
      decoded.user_id ??
      decoded.id ??
      decoded.sub;

    if (!userId) {
      return next(
        new Error("Invalid token payload")
      );
    }

    // ========================================================
    // GET CURRENT USER
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
    // USER NOT FOUND
    // ========================================================

    if (userResult.rows.length === 0) {
      return next(
        new Error(
          "User account no longer exists"
        )
      );
    }

    const user = userResult.rows[0];

    // ========================================================
    // ACCOUNT BLOCKED
    // ========================================================

    if (user.is_active !== true) {
      return next(
        new Error(
          "Your account has been blocked by the administrator."
        )
      );
    }

    // ========================================================
    // OWNER DELETED
    // ========================================================

    if (
      user.role === "owner" &&
      user.owner_is_deleted === true
    ) {
      return next(
        new Error(
          "Your owner account has been deleted."
        )
      );
    }

    // ========================================================
    // OWNER APPROVAL
    // ========================================================

    if (user.role === "owner") {
      if (user.approval_status === "pending") {
        return next(
          new Error(
            "Your owner account is waiting for admin approval."
          )
        );
      }

      if (user.approval_status === "rejected") {
        return next(
          new Error(
            "Your owner account has been rejected by the administrator."
          )
        );
      }

      if (user.approval_status !== "approved") {
        return next(
          new Error(
            "Your owner account is not approved."
          )
        );
      }
    }

    // ========================================================
    // STORE USER ON SOCKET
    // ========================================================

    socket.user = {
      userId: user.id,
      role: user.role,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      profile_image: user.profile_image,
      is_active: user.is_active,
      is_verified: user.is_verified,
      approval_status: user.approval_status,
    };

    // ========================================================
    // AUTHENTICATED
    // ========================================================

    next();

  } catch (error) {
    console.error(
      "SOCKET AUTH ERROR:",
      error.message
    );

    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError"
    ) {
      return next(
        new Error(
          "Invalid or expired token"
        )
      );
    }

    return next(
      new Error(
        "Authentication service error"
      )
    );
  }
};

module.exports = {
  authenticateSocket,
};