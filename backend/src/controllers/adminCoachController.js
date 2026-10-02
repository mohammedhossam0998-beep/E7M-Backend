const pool = require("../config/db");

// ============================================================
// GET ALL COACHES
// ============================================================

const getAllCoaches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.user_id,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image AS photo_url,
        u.is_verified,

        c.cover_url,
        c.gender,
        c.coach_type,
        c.city,
        c.address,
        c.bio,

        c.experience_years,
        c.hourly_rate,

        c.rating,
        c.reviews_count,
        c.players_count,

        c.is_approved,
        c.is_blocked,
        c.is_featured,

        COALESCE(
          CASE
            WHEN cp.certification IS NULL
              OR TRIM(cp.certification) = ''
            THEN 0
            ELSE 1
          END,
          0
        ) AS certificates_count,

        c.created_at,
        c.updated_at

      FROM coaches c

      INNER JOIN users u
        ON u.id = c.user_id

      LEFT JOIN coach_profiles cp
        ON cp.coach_id = c.id

      ORDER BY c.created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      coaches: result.rows,
    });
  } catch (error) {
    console.error("GET ALL ADMIN COACHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get coaches",
    });
  }
};

// ============================================================
// GET COACH BY ID
// ============================================================

const getCoachById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.user_id,

        u.full_name,
        u.email,
        u.phone,
        u.profile_image AS photo_url,
        u.is_verified,

        c.cover_url,
        c.gender,
        c.coach_type,
        c.city,
        c.address,
        c.bio,

        c.experience_years,
        c.hourly_rate,

        c.rating,
        c.reviews_count,
        c.players_count,

        c.is_approved,
        c.is_blocked,
        c.is_featured,

        COALESCE(
          CASE
            WHEN cp.certification IS NULL
              OR TRIM(cp.certification) = ''
            THEN 0
            ELSE 1
          END,
          0
        ) AS certificates_count,

        c.created_at,
        c.updated_at

      FROM coaches c

      INNER JOIN users u
        ON u.id = c.user_id

      LEFT JOIN coach_profiles cp
        ON cp.coach_id = c.id

      WHERE c.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    return res.status(200).json({
      success: true,
      coach: result.rows[0],
    });
  } catch (error) {
    console.error("GET ADMIN COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get coach",
    });
  }
};

// ============================================================
// UPDATE COACH
// ============================================================

const updateCoach = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      full_name,
      email,
      phone,
      photo_url,
      cover_url,
      gender,
      coach_type,
      city,
      address,
      bio,
      experience_years,
      hourly_rate,
      certification,
      achievements,
    } = req.body;

    await client.query("BEGIN");

    const coachResult = await client.query(
      `
      SELECT
        c.id,
        c.user_id
      FROM coaches c
      INNER JOIN users u
        ON u.id = c.user_id
      WHERE c.id = $1
        AND u.role = 'coach'
      FOR UPDATE
      `,
      [id]
    );

    if (coachResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    const userId = coachResult.rows[0].user_id;

    // ========================================================
    // UPDATE USER
    // ========================================================

    await client.query(
      `
      UPDATE users
      SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        profile_image = COALESCE($4, profile_image),
        updated_at = NOW()
      WHERE id = $5
      `,
      [
        full_name?.trim() || null,
        email?.trim() || null,
        phone?.trim() || null,
        photo_url?.trim() || null,
        userId,
      ]
    );

    // ========================================================
    // UPDATE COACH
    // ========================================================

    await client.query(
      `
      UPDATE coaches
      SET
        cover_url = COALESCE($1, cover_url),
        gender = COALESCE($2, gender),
        coach_type = COALESCE($3, coach_type),
        city = COALESCE($4, city),
        address = COALESCE($5, address),
        bio = COALESCE($6, bio),
        experience_years = COALESCE($7, experience_years),
        hourly_rate = COALESCE($8, hourly_rate),
        updated_at = NOW()
      WHERE id = $9
      `,
      [
        cover_url?.trim() || null,
        gender?.trim() || null,
        coach_type?.trim() || null,
        city?.trim() || null,
        address?.trim() || null,
        bio?.trim() || null,
        experience_years ?? null,
        hourly_rate ?? null,
        id,
      ]
    );

    // ========================================================
    // UPDATE COACH PROFILE
    // ========================================================

    const profileExists = await client.query(
      `
      SELECT id
      FROM coach_profiles
      WHERE coach_id = $1
      `,
      [id]
    );

    if (profileExists.rows.length === 0) {
      await client.query(
        `
        INSERT INTO coach_profiles (
          coach_id,
          certification,
          achievements,
          profile_image
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          id,
          certification?.trim() || null,
          achievements?.trim() || null,
          photo_url?.trim() || null,
        ]
      );
    } else {
      await client.query(
        `
        UPDATE coach_profiles
        SET
          certification = COALESCE($1, certification),
          achievements = COALESCE($2, achievements),
          profile_image = COALESCE($3, profile_image)
        WHERE coach_id = $4
        `,
        [
          certification?.trim() || null,
          achievements?.trim() || null,
          photo_url?.trim() || null,
          id,
        ]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Coach updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("UPDATE ADMIN COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// DELETE COACH
// ============================================================

const deleteCoach = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const coachResult = await client.query(
      `
      SELECT user_id
      FROM coaches
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (coachResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    const userId = coachResult.rows[0].user_id;

    await client.query(
      `
      DELETE FROM coach_profiles
      WHERE coach_id = $1
      `,
      [id]
    );

    await client.query(
      `
      DELETE FROM coaches
      WHERE id = $1
      `,
      [id]
    );

    /*
     * لا نحذف user هنا.
     * لأن حساب المستخدم قد يكون مرتبطًا ببيانات أخرى مستقبلًا.
     *
     * حاليًا نجعله inactive بدل الحذف الكامل.
     */

    await client.query(
      `
      UPDATE users
      SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      `,
      [userId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Coach deleted successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("DELETE ADMIN COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete coach",
    });
  } finally {
    client.release();
  }
};

// ============================================================
// TOGGLE APPROVAL
// ============================================================

const toggleApproveCoach = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE coaches
      SET
        is_approved = NOT is_approved,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        is_approved,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coach approval status updated",
      coach: result.rows[0],
    });
  } catch (error) {
    console.error("TOGGLE APPROVE COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach approval",
    });
  }
};

// ============================================================
// TOGGLE BLOCK
// ============================================================

const toggleBlockCoach = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE coaches
      SET
        is_blocked = NOT is_blocked,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        is_blocked,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coach block status updated",
      coach: result.rows[0],
    });
  } catch (error) {
    console.error("TOGGLE BLOCK COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach block status",
    });
  }
};

// ============================================================
// TOGGLE FEATURED
// ============================================================

const toggleFeaturedCoach = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE coaches
      SET
        is_featured = NOT is_featured,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        is_featured,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coach featured status updated",
      coach: result.rows[0],
    });
  } catch (error) {
    console.error("TOGGLE FEATURED COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach featured status",
    });
  }
};

module.exports = {
  getAllCoaches,
  getCoachById,
  updateCoach,
  deleteCoach,
  toggleApproveCoach,
  toggleBlockCoach,
  toggleFeaturedCoach,
};