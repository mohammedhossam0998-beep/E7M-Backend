const pool = require("../config/db");
const fs = require("fs");
const path = require("path");
// ========================================
// CREATE PLAYER PROFILE
// POST /api/player/profile
// ========================================

const createPlayerProfile = async (req, res) => {
  try {
    // Get user ID from JWT
    const userId = req.user.userId;

    // ========================================
    // VERIFY PLAYER ROLE
    // ========================================

    if (req.user.role !== "player") {
      return res.status(403).json({
        success: false,
        message: "Only players can create a player profile",
      });
    }

    // ========================================
    // CHECK EXISTING PROFILE
    // ========================================

    const existingProfile = await pool.query(
      `
      SELECT
        id,
        user_id,
        position,
        skill_level,
        date_of_birth,
        preferred_foot,
        bio,
        height,
        weight,
        city,
        experience,
        playing_style,
        created_at
      FROM player_profiles
      WHERE user_id = $1
      `,
      [userId]
    );

    if (existingProfile.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Player profile already exists",
        profile: existingProfile.rows[0],
      });
    }

    // ========================================
    // REQUEST BODY
    // ========================================

    const {
      position,
      skill_level,
      date_of_birth,
      preferred_foot,
      bio,
      height,
      weight,
      city,
      experience,
      playing_style,
    } = req.body || {};

    // ========================================
    // CREATE PROFILE
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO player_profiles (
        user_id,
        position,
        skill_level,
        date_of_birth,
        preferred_foot,
        bio,
        height,
        weight,
        city,
        experience,
        playing_style
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        user_id,
        position,
        skill_level,
        date_of_birth,
        preferred_foot,
        bio,
        height,
        weight,
        city,
        experience,
        playing_style,
        created_at
      `,
      [
        userId,
        position || null,
        skill_level || null,
        date_of_birth || null,
        preferred_foot || null,
        bio || null,
        height ?? null,
        weight ?? null,
        city || null,
        experience ?? null,
        playing_style || null,
      ]
    );

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,
      message: "Player profile created successfully",
      profile: result.rows[0],
    });

  } catch (error) {
    console.error(
      "CREATE PLAYER PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create player profile",
    });
  }
};

// ========================================
// GET MY PLAYER PROFILE
// GET /api/player/profile
// ========================================

const getMyPlayerProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        pp.id,
        pp.user_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,
        pp.height,
        pp.weight,
        pp.city,
        pp.experience,
        pp.playing_style,
        pp.created_at,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image

      FROM player_profiles pp

      INNER JOIN users u
        ON u.id = pp.user_id

      WHERE pp.user_id = $1
      `,
      [userId]
    );

    // ========================================
    // PROFILE NOT FOUND
    // ========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player profile not found",
      });
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      profile: result.rows[0],
    });

  } catch (error) {
    console.error(
      "GET PLAYER PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get player profile",
    });
  }
};

// ========================================
// UPDATE MY PLAYER PROFILE
// PUT /api/player/profile
// ========================================

const updateMyPlayerProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    // ========================================
    // REQUEST BODY
    // ========================================

    const {
      position,
      skill_level,
      date_of_birth,
      preferred_foot,
      bio,
      height,
      weight,
      city,
      experience,
      playing_style,
    } = req.body || {};

    // ========================================
    // UPDATE PROFILE
    // ========================================

    const result = await pool.query(
      `
      UPDATE player_profiles

      SET
        position = $1,
        skill_level = $2,
        date_of_birth = $3,
        preferred_foot = $4,
        bio = $5,
        height = $6,
        weight = $7,
        city = $8,
        experience = $9,
        playing_style = $10

      WHERE user_id = $11

      RETURNING
        id,
        user_id,
        position,
        skill_level,
        date_of_birth,
        preferred_foot,
        bio,
        height,
        weight,
        city,
        experience,
        playing_style,
        created_at
      `,
      [
        position || null,
        skill_level || null,
        date_of_birth || null,
        preferred_foot || null,
        bio || null,
        height ?? null,
        weight ?? null,
        city || null,
        experience ?? null,
        playing_style || null,
        userId,
      ]
    );

    // ========================================
    // PROFILE NOT FOUND
    // ========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player profile not found",
      });
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Player profile updated successfully",
      profile: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPDATE PLAYER PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update player profile",
    });
  }
};
// ========================================
// UPLOAD / UPDATE PLAYER PROFILE IMAGE
// ========================================

const uploadMyProfileImage = async (req, res) => {
  try {
    // ========================================
    // AUTH CHECK
    // ========================================

    if (!req.user || req.user.role !== "player") {
      return res.status(403).json({
        message: "Only players can update their profile image.",
      });
    }

    // ========================================
    // FILE CHECK
    // ========================================

    if (!req.file) {
      return res.status(400).json({
        message: "Profile image is required.",
      });
    }

    const userId = req.user.userId;

    // ========================================
    // GET OLD IMAGE
    // ========================================

    const oldImageResult = await pool.query(
      `
      SELECT profile_image
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (oldImageResult.rows.length === 0) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const oldImage = oldImageResult.rows[0].profile_image;

    // ========================================
    // NEW IMAGE PATH
    // ========================================

    const profileImage =
      `/uploads/profile/${req.file.filename}`;

    // ========================================
    // UPDATE DATABASE
    // ========================================

    const result = await pool.query(
      `
      UPDATE users
      SET
        profile_image = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING
        id,
        full_name,
        email,
        phone,
        profile_image
      `,
      [profileImage, userId]
    );

    // ========================================
    // DELETE OLD LOCAL IMAGE
    // ========================================

    if (
      oldImage &&
      oldImage.startsWith("/uploads/profile/")
    ) {
      const oldImagePath = path.join(
        __dirname,
        "../../",
        oldImage.replace(/^\/+/, "")
      );

      if (fs.existsSync(oldImagePath)) {
        fs.unlink(oldImagePath, (error) => {
          if (error) {
            console.error(
              "Failed to delete old profile image:",
              error
            );
          }
        });
      }
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      message: "Profile image updated successfully.",
      profile_image: result.rows[0].profile_image,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(
      "Upload player profile image error:",
      error
    );

    // Delete newly uploaded file if DB update fails
    if (req.file) {
      const uploadedFilePath = path.join(
        __dirname,
        "../../uploads/profile",
        req.file.filename
      );

      if (fs.existsSync(uploadedFilePath)) {
        fs.unlink(uploadedFilePath, () => {});
      }
    }

    return res.status(500).json({
      message: "Failed to update profile image.",
    });
  }
};
// ========================================
// UPDATE PLAYER ACCOUNT INFO
// PUT /api/player/account
// ========================================

const updateMyPlayerAccount = async (req, res) => {
  try {
    // ========================================
    // AUTH CHECK
    // ========================================

    if (!req.user || req.user.role !== "player") {
      return res.status(403).json({
        success: false,
        message: "Only players can update account information",
      });
    }

    const userId = req.user.userId;

    // ========================================
    // REQUEST BODY
    // ========================================

    const {
      full_name,
      email,
      phone,
    } = req.body || {};

    // ========================================
    // VALIDATION
    // ========================================

    if (
      typeof full_name !== "string" ||
      full_name.trim().length < 2
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name must contain at least 2 characters",
      });
    }

    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    if (
      phone !== undefined &&
      phone !== null &&
      typeof phone !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be a string",
      });
    }

    const cleanName = full_name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone =
      typeof phone === "string" && phone.trim().length > 0
        ? phone.trim()
        : null;

    // ========================================
    // CHECK EMAIL
    // ========================================

    const existingEmail = await pool.query(
      `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
          AND id <> $2
        LIMIT 1
      `,
      [cleanEmail, userId]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email is already in use",
      });
    }

    // ========================================
    // UPDATE USER
    // ========================================

    const result = await pool.query(
      `
        UPDATE users
        SET
          full_name = $1,
          email = $2,
          phone = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
          AND role = 'player'
        RETURNING
          id,
          full_name,
          email,
          phone,
          profile_image,
          role,
          is_active,
          is_verified,
          approval_status,
          updated_at
      `,
      [
        cleanName,
        cleanEmail,
        cleanPhone,
        userId,
      ]
    );

    // ========================================
    // USER NOT FOUND
    // ========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player account not found",
      });
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "Account information updated successfully",
      user: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPDATE PLAYER ACCOUNT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update account information",
    });
  }
};

// ========================================
// EXPORT
// ========================================
module.exports = {
  createPlayerProfile,
  getMyPlayerProfile,
  uploadMyProfileImage,
  updateMyPlayerProfile,
  updateMyPlayerAccount,
};