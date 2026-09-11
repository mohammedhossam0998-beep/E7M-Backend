const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const pool = require("../config/db");

const {
  sendPasswordResetEmail,
  sendEmailVerificationOtp,
} = require("../utils/emailService");

// ============================================================
// OTP CONFIG
// ============================================================

const OTP_LENGTH = 6;

const OTP_EXPIRES_MINUTES = Number(
  process.env.EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES || 10
);

const OTP_MAX_ATTEMPTS = Number(
  process.env.EMAIL_VERIFICATION_OTP_MAX_ATTEMPTS || 5
);

const OTP_RESEND_COOLDOWN_SECONDS = Number(
  process.env.EMAIL_VERIFICATION_OTP_RESEND_COOLDOWN_SECONDS || 60
);

// ============================================================
// HELPERS
// ============================================================

const normalizeEmail = (email) => {
  return email.trim().toLowerCase();
};

const generateOtp = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

const hashOtp = (otp) => {
  return crypto
    .createHash("sha256")
    .update(otp)
    .digest("hex");
};

const createOtpExpiration = () => {
  return new Date(
    Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000
  );
};

const isValidOtp = (otp) => {
  return /^\d{6}$/.test(otp);
};

// ============================================================
// CREATE PENDING REGISTRATION OTP
// ============================================================

const createPendingEmailOtp = async (
  pendingRegistrationId,
  email
) => {
  // ----------------------------------------------------------
  // CHECK COOLDOWN
  // ----------------------------------------------------------

  const existing = await pool.query(
    `
      SELECT
        id,
        last_sent_at,
        expires_at,
        verified_at
      FROM verification_otps
      WHERE pending_registration_id = $1
        AND channel = 'email'
        AND purpose = 'registration'
        AND verified_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    [pendingRegistrationId]
  );

  if (existing.rows.length > 0) {
    const otpRecord = existing.rows[0];

    const secondsSinceLastSend =
      (Date.now() -
        new Date(otpRecord.last_sent_at).getTime()) /
      1000;

    if (
      secondsSinceLastSend <
      OTP_RESEND_COOLDOWN_SECONDS
    ) {
      const remaining = Math.ceil(
        OTP_RESEND_COOLDOWN_SECONDS -
          secondsSinceLastSend
      );

      const error = new Error(
        `Please wait ${remaining} seconds before requesting another code.`
      );

      error.status = 429;

      throw error;
    }
  }

  // ----------------------------------------------------------
  // GENERATE OTP
  // ----------------------------------------------------------

  const otp = generateOtp();

  const otpHash = hashOtp(otp);

  const expiresAt = createOtpExpiration();

  // ----------------------------------------------------------
  // DELETE OLD OTP
  // ----------------------------------------------------------

  await pool.query(
    `
      DELETE FROM verification_otps
      WHERE pending_registration_id = $1
        AND channel = 'email'
        AND purpose = 'registration'
        AND verified_at IS NULL
    `,
    [pendingRegistrationId]
  );

  // ----------------------------------------------------------
  // SAVE OTP
  // ----------------------------------------------------------

  await pool.query(
    `
      INSERT INTO verification_otps
      (
        user_id,
        pending_registration_id,
        channel,
        purpose,
        otp_hash,
        attempts,
        expires_at,
        created_at,
        last_sent_at
      )
      VALUES
      (
        NULL,
        $1,
        'email',
        'registration',
        $2,
        0,
        $3,
        NOW(),
        NOW()
      )
    `,
    [
      pendingRegistrationId,
      otpHash,
      expiresAt,
    ]
  );

  // ----------------------------------------------------------
  // SEND EMAIL
  // ----------------------------------------------------------

  await sendEmailVerificationOtp({
    to: email,
    otp,
  });

  return {
    expiresAt,
  };
};

// ============================================================
// REGISTER
// ============================================================

const register = async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      role,
      verification_channel,
    } = req.body;

    // --------------------------------------------------------
    // REQUIRED
    // --------------------------------------------------------

    if (!full_name || !email || !role) {
      return res.status(400).json({
        success: false,
        message:
          "full_name, email and role are required",
      });
    }

    // --------------------------------------------------------
    // ROLE
    // --------------------------------------------------------

    if (!["player", "owner"].includes(role)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid role. Use player or owner",
      });
    }

    // --------------------------------------------------------
    // VERIFICATION CHANNEL
    // --------------------------------------------------------

    const channel =
      verification_channel || "email";

    if (!["email", "phone"].includes(channel)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid verification channel",
      });
    }

    // --------------------------------------------------------
    // PHONE REQUIRED FOR PHONE VERIFICATION
    // --------------------------------------------------------

    if (channel === "phone" && !phone) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number is required for phone verification",
      });
    }

    // --------------------------------------------------------
    // EMAIL
    // --------------------------------------------------------

    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // CHECK EXISTING USER
    // --------------------------------------------------------

    const existingUser =
      await pool.query(
        `
          SELECT id
          FROM users
          WHERE email = $1
          LIMIT 1
        `,
        [normalizedEmail]
      );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // --------------------------------------------------------
    // CHECK PENDING REGISTRATION
    // --------------------------------------------------------

    const existingPending =
      await pool.query(
        `
          SELECT id
          FROM pending_registrations
          WHERE email = $1
          LIMIT 1
        `,
        [normalizedEmail]
      );

    if (existingPending.rows.length > 0) {
      await pool.query(
        `
          DELETE FROM pending_registrations
          WHERE id = $1
        `,
        [existingPending.rows[0].id]
      );
    }

    // --------------------------------------------------------
    // CREATE PENDING REGISTRATION
    // --------------------------------------------------------

    const pendingResult =
      await pool.query(
        `
          INSERT INTO pending_registrations
          (
            full_name,
            email,
            phone,
            role,
            verification_channel,
            password_hash
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            NULL
          )
          RETURNING
            id,
            full_name,
            email,
            phone,
            role,
            verification_channel,
            created_at
        `,
        [
          full_name.trim(),
          normalizedEmail,
          phone?.trim() || null,
          role,
          channel,
        ]
      );

    const pending =
      pendingResult.rows[0];

    // --------------------------------------------------------
    // EMAIL OTP
    // --------------------------------------------------------

    if (channel === "email") {
      try {
        await createPendingEmailOtp(
          pending.id,
          pending.email
        );
      } catch (otpError) {
        console.error(
          "REGISTER OTP ERROR:",
          otpError
        );

        await pool.query(
          `
            DELETE FROM pending_registrations
            WHERE id = $1
          `,
          [pending.id]
        );

        return res.status(
          otpError.status || 500
        ).json({
          success: false,
          message:
            otpError.status === 429
              ? otpError.message
              : "Verification email could not be sent",
        });
      }
    }

    // --------------------------------------------------------
    // PHONE OTP
    // --------------------------------------------------------

    if (channel === "phone") {
      // SMS provider will be connected here.
      //
      // IMPORTANT:
      // We do NOT pretend SMS is implemented yet.
      //

      await pool.query(
        `
          DELETE FROM pending_registrations
          WHERE id = $1
        `,
        [pending.id]
      );

      return res.status(501).json({
        success: false,
        message:
          "Phone verification is not available yet",
      });
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        "Registration started. Verification code sent to your email.",

      requiresVerification: true,

      verification: {
        email: true,
        phone: false,
        channel: "email",
      },

      registration: {
        id: pending.id,
        full_name: pending.full_name,
        email: pending.email,
        phone: pending.phone,
        role: pending.role,
      },

      expiresInMinutes:
        OTP_EXPIRES_MINUTES,
    });

  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Registration failed",
    });
  }
};

// ============================================================
// SEND / RESEND EMAIL OTP
// ============================================================

const sendOtp = async (req, res) => {
  try {
    const {
      email,
    } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // FIND PENDING REGISTRATION
    // --------------------------------------------------------

    const result =
      await pool.query(
        `
          SELECT
            id,
            email,
            verification_channel
          FROM pending_registrations
          WHERE email = $1
          LIMIT 1
        `,
        [normalizedEmail]
      );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Pending registration not found",
      });
    }

    const pending =
      result.rows[0];

    if (
      pending.verification_channel !==
      "email"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email verification is not selected",
      });
    }

    // --------------------------------------------------------
    // SEND OTP
    // --------------------------------------------------------

    await createPendingEmailOtp(
      pending.id,
      pending.email
    );

    return res.status(200).json({
      success: true,
      message:
        "Verification code sent successfully",
      expiresInMinutes:
        OTP_EXPIRES_MINUTES,
    });

  } catch (error) {
    console.error(
      "SEND OTP ERROR:",
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Failed to send verification code",
    });
  }
};

// ============================================================
// RESEND OTP
// ============================================================

const resendOtp = async (req, res) => {
  return sendOtp(req, res);
};

// ============================================================
// VERIFY OTP
// ============================================================

const verifyOtp = async (req, res) => {
  try {
    const {
      email,
      otp,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message:
          "Email and OTP are required",
      });
    }

    if (!isValidOtp(otp.trim())) {
      return res.status(400).json({
        success: false,
        message:
          "OTP must be 6 digits",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // FIND PENDING REGISTRATION
    // --------------------------------------------------------

    const pendingResult =
      await pool.query(
        `
          SELECT
            id,
            full_name,
            email,
            phone,
            role,
            verification_channel
          FROM pending_registrations
          WHERE email = $1
          LIMIT 1
        `,
        [normalizedEmail]
      );

    if (
      pendingResult.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Registration not found",
      });
    }

    const pending =
      pendingResult.rows[0];

    // --------------------------------------------------------
    // ONLY EMAIL FOR NOW
    // --------------------------------------------------------

    if (
      pending.verification_channel !==
      "email"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email verification is not selected",
      });
    }

    // --------------------------------------------------------
    // FIND OTP
    // --------------------------------------------------------

    const otpResult =
      await pool.query(
        `
          SELECT
            id,
            otp_hash,
            attempts,
            expires_at
          FROM verification_otps
          WHERE pending_registration_id = $1
            AND channel = 'email'
            AND purpose = 'registration'
            AND verified_at IS NULL
          ORDER BY id DESC
          LIMIT 1
        `,
        [pending.id]
      );

    if (
      otpResult.rows.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No active verification code found",
      });
    }

    const otpRecord =
      otpResult.rows[0];

    // --------------------------------------------------------
    // EXPIRATION
    // --------------------------------------------------------

    if (
      new Date(
        otpRecord.expires_at
      ).getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Verification code has expired",
      });
    }

    // --------------------------------------------------------
    // MAX ATTEMPTS
    // --------------------------------------------------------

    if (
      otpRecord.attempts >=
      OTP_MAX_ATTEMPTS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Please request a new code.",
      });
    }

    // --------------------------------------------------------
    // COMPARE OTP
    // --------------------------------------------------------

    const incomingHash =
      hashOtp(otp.trim());

    if (
      incomingHash !==
      otpRecord.otp_hash
    ) {
      await pool.query(
        `
          UPDATE verification_otps
          SET attempts = attempts + 1
          WHERE id = $1
        `,
        [otpRecord.id]
      );

      const remainingAttempts =
        Math.max(
          0,
          OTP_MAX_ATTEMPTS -
            (otpRecord.attempts + 1)
        );

      return res.status(400).json({
        success: false,
        message:
          "Invalid verification code",
        remainingAttempts,
      });
    }

    // --------------------------------------------------------
    // MARK OTP VERIFIED
    // --------------------------------------------------------

    await pool.query(
      `
        UPDATE verification_otps
        SET verified_at = NOW()
        WHERE id = $1
      `,
      [otpRecord.id]
    );

    // --------------------------------------------------------
    // OTP VERIFIED
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        "Email verified successfully",

      verified: true,

      registration: {
        id: pending.id,
        full_name: pending.full_name,
        email: pending.email,
        phone: pending.phone,
        role: pending.role,
      },

      requiresPassword: true,

      nextStep:
        "set-password",
    });

  } catch (error) {
    console.error(
      "VERIFY OTP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to verify code",
    });
  }
};

// ============================================================
// SET PASSWORD
// ============================================================

const setPassword = async (req, res) => {
  const client =
    await pool.connect();

  try {
    const {
      registration_id,
      password,
      confirm_password,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !registration_id ||
      !password ||
      !confirm_password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "registration_id, password and confirm_password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters",
      });
    }

    if (password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message:
          "Passwords do not match",
      });
    }

    // --------------------------------------------------------
    // TRANSACTION
    // --------------------------------------------------------

    await client.query("BEGIN");

    // --------------------------------------------------------
    // FIND VERIFIED PENDING REGISTRATION
    // --------------------------------------------------------

    const pendingResult =
      await client.query(
        `
          SELECT
            id,
            full_name,
            email,
            phone,
            role,
            verification_channel
          FROM pending_registrations
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [registration_id]
      );

    if (
      pendingResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message:
          "Registration not found",
      });
    }

    const pending =
      pendingResult.rows[0];

    // --------------------------------------------------------
    // CONFIRM OTP VERIFIED
    // --------------------------------------------------------

    const verifiedOtp =
      await client.query(
        `
          SELECT id
          FROM verification_otps
          WHERE pending_registration_id = $1
            AND channel = 'email'
            AND purpose = 'registration'
            AND verified_at IS NOT NULL
          ORDER BY id DESC
          LIMIT 1
        `,
        [pending.id]
      );

    if (
      verifiedOtp.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        success: false,
        message:
          "Email verification is required first",
      });
    }

    // --------------------------------------------------------
    // CHECK EMAIL AGAIN
    // --------------------------------------------------------

    const existingUser =
      await client.query(
        `
          SELECT id
          FROM users
          WHERE email = $1
          LIMIT 1
        `,
        [pending.email]
      );

    if (existingUser.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "Email already exists",
      });
    }

    // --------------------------------------------------------
    // HASH PASSWORD
    // --------------------------------------------------------

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    // --------------------------------------------------------
    // CREATE REAL USER
    // --------------------------------------------------------

    const userResult =
      await client.query(
        `
          INSERT INTO users
          (
            full_name,
            email,
            password_hash,
            phone,
            role,
            is_active,
            is_verified,
            phone_verified,
            approval_status
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5::varchar,
            true,
            true,
            false,
            CASE
              WHEN $5 = 'owner' THEN 'pending'
              ELSE 'approved'
            END
          )
          RETURNING
            id,
            full_name,
            email,
            phone,
            role,
            profile_image,
            is_active,
            is_verified,
            phone_verified,
            approval_status,
            created_at
        `,
        [
          pending.full_name,
          pending.email,
          passwordHash,
          pending.phone,
          pending.role,
        ]
      );

    const user =
      userResult.rows[0];

    // --------------------------------------------------------
    // CREATE OWNER PROFILE
    // --------------------------------------------------------

    if (user.role === "owner") {
      await client.query(
        `
        INSERT INTO owners (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        `,
        [user.id]
      );
    }

    // --------------------------------------------------------
    // DELETE PENDING REGISTRATION
    // --------------------------------------------------------

    await client.query(
      `
        DELETE FROM pending_registrations
        WHERE id = $1
      `,
      [pending.id]
    );

    // --------------------------------------------------------
    // COMMIT
    // --------------------------------------------------------

    await client.query("COMMIT");

    // --------------------------------------------------------
    // CREATE JWT
    // --------------------------------------------------------

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn:
          process.env.JWT_EXPIRES_IN ||
          "7d",
      }
    );

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        "Account created successfully",

      user,

      token,
    });

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "SET PASSWORD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to complete account creation",
    });

  } finally {
    client.release();
  }
};

// ============================================================
// LOGIN
// ============================================================

const login = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    const result =
      await pool.query(
        `
          SELECT
            id,
            full_name,
            email,
            password_hash,
            phone,
            role,
            profile_image,
            is_active,
            is_verified,
            phone_verified,
            approval_status,
            created_at
          FROM users
          WHERE email = $1
        `,
        [normalizedEmail]
      );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    const user =
      result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Account is inactive",
      });
    }

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password_hash
      );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password",
      });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify your email before logging in.",
        requiresVerification: true,
        email: user.email,
      });
    }

    // OWNER APPROVAL CHECK

    if (
      user.role === "owner" &&
      user.approval_status === "pending"
    ) {
      return res.status(403).json({
        success: false,
        code: "OWNER_APPROVAL_PENDING",
        message:
          "Your owner account is waiting for admin approval.",
        approvalRequired: true,
        approved: false,
        approvalStatus: "pending",
      });
    }

    if (
      user.role === "owner" &&
      user.approval_status === "rejected"
    ) {
      return res.status(403).json({
        success: false,
        code: "OWNER_APPROVAL_REJECTED",
        message:
          "Your owner account has been rejected by the administrator.",
        approvalRequired: true,
        approved: false,
        approvalStatus: "rejected",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn:
          process.env.JWT_EXPIRES_IN ||
          "7d",
      }
    );

    delete user.password_hash;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user,
      token,
    });

  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// ============================================================
// CREATE PASSWORD RESET OTP
// ============================================================

const createPasswordResetOtp = async (userId, email) => {
  // ----------------------------------------------------------
  // CHECK COOLDOWN
  // ----------------------------------------------------------

  const existing = await pool.query(
    `
      SELECT
        id,
        last_sent_at,
        expires_at,
        verified_at
      FROM verification_otps
      WHERE user_id = $1
        AND channel = 'email'
        AND purpose = 'password_reset'
        AND verified_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    [userId]
  );

  if (existing.rows.length > 0) {
    const otpRecord = existing.rows[0];

    const secondsSinceLastSend =
      (Date.now() -
        new Date(otpRecord.last_sent_at).getTime()) /
      1000;

    if (
      secondsSinceLastSend <
      OTP_RESEND_COOLDOWN_SECONDS
    ) {
      const remaining = Math.ceil(
        OTP_RESEND_COOLDOWN_SECONDS -
          secondsSinceLastSend
      );

      const error = new Error(
        `Please wait ${remaining} seconds before requesting another code.`
      );

      error.status = 429;

      throw error;
    }
  }

  // ----------------------------------------------------------
  // GENERATE OTP
  // ----------------------------------------------------------

  const otp = generateOtp();

  console.log("🔥 PASSWORD RESET OTP GENERATED:", otp);
  console.log("👤 USER ID:", userId);
  console.log("📧 EMAIL:", email);

  const otpHash = hashOtp(otp);
  const expiresAt = createOtpExpiration();

  // ----------------------------------------------------------
  // DELETE OLD PASSWORD RESET OTP
  // ----------------------------------------------------------

  await pool.query(
    `
      DELETE FROM verification_otps
      WHERE user_id = $1
        AND channel = 'email'
        AND purpose = 'password_reset'
        AND verified_at IS NULL
    `,
    [userId]
  );

  // ----------------------------------------------------------
  // SAVE OTP
  // ----------------------------------------------------------

  await pool.query(
    `
      INSERT INTO verification_otps
      (
        user_id,
        pending_registration_id,
        channel,
        purpose,
        otp_hash,
        attempts,
        expires_at,
        created_at,
        last_sent_at
      )
      VALUES
      (
        $1,
        NULL,
        'email',
        'password_reset',
        $2,
        0,
        $3,
        NOW(),
        NOW()
      )
    `,
    [
      userId,
      otpHash,
      expiresAt,
    ]
  );

  console.log("✅ PASSWORD RESET OTP INSERTED INTO DATABASE");

  // ----------------------------------------------------------
  // SEND EMAIL
  // ----------------------------------------------------------

  await sendEmailVerificationOtp({
    to: email,
    otp,
  });

  return {
    expiresAt,
  };
};

// ============================================================
// FORGOT PASSWORD - SEND OTP
// ============================================================

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    const result = await pool.query(
      `
        SELECT
          id,
          email,
          is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );

    // --------------------------------------------------------
    // SECURITY:
    // Don't reveal whether the email exists.
    // --------------------------------------------------------

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message:
          "If this email exists, a password reset code has been sent.",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(200).json({
        success: true,
        message:
          "If this email exists, a password reset code has been sent.",
      });
    }

    // --------------------------------------------------------
    // CREATE OTP
    // --------------------------------------------------------

    await createPasswordResetOtp(
      user.id,
      user.email
    );

    return res.status(200).json({
      success: true,
      message:
        "Password reset code sent successfully.",
      requiresVerification: true,
      verification: {
        email: true,
        channel: "email",
        purpose: "password_reset",
      },
      expiresInMinutes:
        OTP_EXPIRES_MINUTES,
    });

  } catch (error) {
    console.error(
      "FORGOT PASSWORD ERROR:",
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Unable to process password reset request.",
    });
  }
};

// ============================================================
// VERIFY PASSWORD RESET OTP
// ============================================================

const verifyResetOtp = async (req, res) => {
  try {
    const {
      email,
      otp,
    } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message:
          "Email and OTP are required",
      });
    }

    const cleanOtp = otp.trim();

    if (!isValidOtp(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message:
          "OTP must be 6 digits",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // FIND USER
    // --------------------------------------------------------

    const userResult = await pool.query(
      `
        SELECT
          id,
          email,
          is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired verification code",
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired verification code",
      });
    }

    // --------------------------------------------------------
    // FIND OTP
    // --------------------------------------------------------

    const otpResult = await pool.query(
      `
        SELECT
          id,
          otp_hash,
          attempts,
          expires_at
        FROM verification_otps
        WHERE user_id = $1
          AND channel = 'email'
          AND purpose = 'password_reset'
          AND verified_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `,
      [user.id]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "No active password reset code found",
      });
    }

    const otpRecord =
      otpResult.rows[0];

    // --------------------------------------------------------
    // EXPIRATION
    // --------------------------------------------------------

    if (
      new Date(
        otpRecord.expires_at
      ).getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Verification code has expired",
      });
    }

    // --------------------------------------------------------
    // MAX ATTEMPTS
    // --------------------------------------------------------

    if (
      otpRecord.attempts >=
      OTP_MAX_ATTEMPTS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Please request a new code.",
      });
    }

    // --------------------------------------------------------
    // COMPARE OTP
    // --------------------------------------------------------

    const incomingHash =
      hashOtp(cleanOtp);

    if (
      incomingHash !==
      otpRecord.otp_hash
    ) {
      await pool.query(
        `
          UPDATE verification_otps
          SET attempts = attempts + 1
          WHERE id = $1
        `,
        [otpRecord.id]
      );

      return res.status(400).json({
        success: false,
        message:
          "Invalid verification code",
      });
    }

    // --------------------------------------------------------
    // MARK VERIFIED
    // --------------------------------------------------------

    await pool.query(
      `
        UPDATE verification_otps
        SET verified_at = NOW()
        WHERE id = $1
      `,
      [otpRecord.id]
    );

    return res.status(200).json({
      success: true,
      message:
        "Verification code verified successfully",
      verified: true,
      email: user.email,
      nextStep:
        "reset-password",
    });

  } catch (error) {
    console.error(
      "VERIFY RESET OTP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to verify reset code",
    });
  }
};

// ============================================================
// RESET PASSWORD WITH OTP
// ============================================================

const resetPassword = async (req, res) => {
  try {
    const {
      email,
      otp,
      new_password,
    } = req.body;

    if (
      !email ||
      !otp ||
      !new_password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email, OTP and new password are required",
      });
    }

    const cleanOtp = otp.trim();

    if (!isValidOtp(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message:
          "OTP must be 6 digits",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    // --------------------------------------------------------
    // FIND USER
    // --------------------------------------------------------

    const userResult = await pool.query(
      `
        SELECT
          id,
          email,
          is_active
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid password reset request",
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid password reset request",
      });
    }

    // --------------------------------------------------------
    // FIND VERIFIED OTP
    // --------------------------------------------------------

    const otpResult = await pool.query(
      `
        SELECT
          id,
          otp_hash,
          expires_at,
          verified_at
        FROM verification_otps
        WHERE user_id = $1
          AND channel = 'email'
          AND purpose = 'password_reset'
          AND verified_at IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
      `,
      [user.id]
    );

    if (otpResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Please verify the reset code first",
      });
    }

    const otpRecord =
      otpResult.rows[0];

    // --------------------------------------------------------
    // EXPIRATION
    // --------------------------------------------------------

    if (
      new Date(
        otpRecord.expires_at
      ).getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Verification code has expired",
      });
    }

    // --------------------------------------------------------
    // VERIFY OTP AGAIN
    // --------------------------------------------------------

    const incomingHash =
      hashOtp(cleanOtp);

    if (
      incomingHash !==
      otpRecord.otp_hash
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid verification code",
      });
    }

    // --------------------------------------------------------
    // HASH NEW PASSWORD
    // --------------------------------------------------------

    const passwordHash =
      await bcrypt.hash(
        new_password,
        12
      );

    // --------------------------------------------------------
    // UPDATE PASSWORD
    // --------------------------------------------------------

    await pool.query(
      `
        UPDATE users
        SET
          password_hash = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [
        passwordHash,
        user.id,
      ]
    );

    // --------------------------------------------------------
    // DELETE USED OTP
    // --------------------------------------------------------

    await pool.query(
      `
        DELETE FROM verification_otps
        WHERE id = $1
      `,
      [otpRecord.id]
    );

    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully",
    });

  } catch (error) {
    console.error(
      "RESET PASSWORD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to reset password",
    });
  }
};
// ============================================================
// CHANGE PASSWORD
// ============================================================

const changePassword = async (req, res) => {
  try {
    const {
      current_password,
      new_password,
      confirm_password,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !current_password ||
      !new_password ||
      !confirm_password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Current password, new password and confirm password are required",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters",
      });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({
        success: false,
        message:
          "Passwords do not match",
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from current password",
      });
    }

    // --------------------------------------------------------
    // USER ID FROM JWT
    // --------------------------------------------------------

    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    // --------------------------------------------------------
    // GET CURRENT USER PASSWORD
    // --------------------------------------------------------

    const result = await pool.query(
      `
        SELECT
          id,
          password_hash,
          is_active
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "User not found",
      });
    }

    const user = result.rows[0];

    // --------------------------------------------------------
    // ACCOUNT STATUS
    // --------------------------------------------------------

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Account is inactive",
      });
    }

    // --------------------------------------------------------
    // VERIFY CURRENT PASSWORD
    // --------------------------------------------------------

    const currentPasswordMatch =
      await bcrypt.compare(
        current_password,
        user.password_hash
      );

    if (!currentPasswordMatch) {
      return res.status(401).json({
        success: false,
        message:
          "Current password is incorrect",
      });
    }

    // --------------------------------------------------------
    // HASH NEW PASSWORD
    // --------------------------------------------------------

    const passwordHash =
      await bcrypt.hash(
        new_password,
        12
      );

    // --------------------------------------------------------
    // UPDATE PASSWORD
    // --------------------------------------------------------

    const updateResult =
      await pool.query(
        `
          UPDATE users
          SET
            password_hash = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING id
        `,
        [
          passwordHash,
          userId,
        ]
      );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "User not found",
      });
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Password changed successfully",
    });

  } catch (error) {
    console.error(
      "CHANGE PASSWORD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to change password",
    });
  }
};

// ============================================================
// TEST DATABASE
// ============================================================

const testDatabase = async (req, res) => {
  try {
    const result =
      await pool.query(
        "SELECT NOW() AS time"
      );

    return res.status(200).json({
      success: true,
      message:
        "Database connected successfully",
      time: result.rows[0].time,
    });

  } catch (error) {
    console.error(
      "DATABASE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Database connection failed",
    });
  }
};

// ============================================================
// GET CURRENT USER
// ============================================================

const getMe = async (req, res) => {
  try {
    const result =
      await pool.query(
        `
          SELECT
            id,
            full_name,
            email,
            phone,
            role,
            profile_image,
            is_active,
            is_verified,
            phone_verified,
            approval_status,
            created_at,
            updated_at
          FROM users
          WHERE id = $1
        `,
        [req.user.userId]
      );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });

  } catch (error) {
    console.error(
      "GET ME ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get user data",
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  register,
  login,

  sendOtp,
  resendOtp,
  verifyOtp,
  setPassword,

  forgotPassword,
  verifyResetOtp,
  resetPassword,
  changePassword,
  testDatabase,
  getMe,
};