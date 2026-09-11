const pool = require("../config/db");

// ============================================================
// GET OWNER PROFILE
// ============================================================

const getOwnerProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.role,
        u.is_active,
        u.is_verified,
        u.approval_status,

        o.id AS owner_id,
        o.business_name,
        o.business_phone,
        o.business_email,
        o.created_at AS owner_created_at

      FROM users u

      INNER JOIN owners o
        ON o.user_id = u.id

      WHERE u.id = $1
        AND u.role = 'owner'
        AND o.is_deleted = false

      LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const owner = result.rows[0];

    return res.status(200).json({
      success: true,
      owner
    });

  } catch (error) {
    console.error("GET OWNER PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owner profile"
    });
  }
};


// ============================================================
// UPDATE OWNER PROFILE
// ============================================================

const updateOwnerProfile = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;

    const {
      full_name,
      email,
      phone,
      profile_image,
      business_name,
      business_phone,
      business_email
    } = req.body;

    // --------------------------------------------------------
    // BASIC VALIDATION
    // --------------------------------------------------------

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required"
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // --------------------------------------------------------
    // EMAIL FORMAT
    // --------------------------------------------------------

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
    }

    await client.query("BEGIN");

    // --------------------------------------------------------
    // CHECK OWNER
    // --------------------------------------------------------

    const ownerResult = await client.query(
      `
      SELECT
        o.id AS owner_id,
        o.user_id
      FROM owners o
      INNER JOIN users u
        ON u.id = o.user_id
      WHERE o.user_id = $1
        AND u.role = 'owner'
        AND o.is_deleted = false
      LIMIT 1
      `,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Owner profile not found"
      });
    }

    const ownerId = ownerResult.rows[0].owner_id;

    // --------------------------------------------------------
    // CHECK EMAIL BELONGS TO ANOTHER USER
    // --------------------------------------------------------

    const emailCheck = await client.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND id != $2
      LIMIT 1
      `,
      [email.trim(), userId]
    );

    if (emailCheck.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Email is already in use"
      });
    }

    // --------------------------------------------------------
    // UPDATE USERS
    // --------------------------------------------------------

    await client.query(
      `
      UPDATE users
      SET
        full_name = $1,
        email = $2,
        phone = $3,
        profile_image = $4
      WHERE id = $5
      `,
      [
        full_name.trim(),
        email.trim(),
        phone?.trim() || null,
        profile_image?.trim() || null,
        userId
      ]
    );

    // --------------------------------------------------------
    // UPDATE OWNERS
    // --------------------------------------------------------

    await client.query(
      `
      UPDATE owners
      SET
        business_name = $1,
        business_phone = $2,
        business_email = $3
      WHERE id = $4
        AND user_id = $5
        AND is_deleted = false
      `,
      [
        business_name?.trim() || null,
        business_phone?.trim() || null,
        business_email?.trim() || null,
        ownerId,
        userId
      ]
    );

    await client.query("COMMIT");

    // --------------------------------------------------------
    // RETURN UPDATED PROFILE
    // --------------------------------------------------------

    const updatedResult = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.role,
        u.is_active,
        u.is_verified,
        u.approval_status,

        o.id AS owner_id,
        o.business_name,
        o.business_phone,
        o.business_email,
        o.created_at AS owner_created_at

      FROM users u

      INNER JOIN owners o
        ON o.user_id = u.id

      WHERE u.id = $1
        AND u.role = 'owner'
        AND o.is_deleted = false

      LIMIT 1
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "Owner profile updated successfully",
      owner: updatedResult.rows[0]
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("UPDATE OWNER PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update owner profile"
    });

  } finally {
    client.release();
  }
};


// ============================================================
// UPLOAD OWNER PROFILE IMAGE
// ============================================================

const uploadOwnerProfileImage = async (req, res) => {
  try {
    const userId = req.user.userId;

    // --------------------------------------------------------
    // CHECK FILE
    // --------------------------------------------------------

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Profile image is required",
      });
    }

    // --------------------------------------------------------
    // IMAGE URL
    // --------------------------------------------------------

    const profileImage =
      `/uploads/owners/profile/${req.file.filename}`;

    // --------------------------------------------------------
    // UPDATE USER
    // --------------------------------------------------------

    const result = await pool.query(
      `
      UPDATE users
      SET profile_image = $1
      WHERE id = $2
        AND role = 'owner'
      RETURNING
        id AS user_id,
        full_name,
        email,
        phone,
        profile_image,
        role,
        is_active,
        is_verified,
        approval_status
      `,
      [
        profileImage,
        userId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner account not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Owner profile image uploaded successfully",
      profile_image: profileImage,
      user: result.rows[0],
    });

  } catch (error) {
    console.error(
      "UPLOAD OWNER PROFILE IMAGE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to upload profile image",
    });
  }
};


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getOwnerProfile,
  updateOwnerProfile,
  uploadOwnerProfileImage,
};