const bcrypt = require("bcryptjs");
const pool = require("../config/db");


// ========================================
// VALIDATION HELPERS
// ========================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const VALID_DAYS_OF_WEEK = [
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday"
];

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isValidEmail = (value) =>
  isNonEmptyString(value) && EMAIL_REGEX.test(value.trim());

const isNonNegativeNumber = (value) =>
  typeof value === "number" && !Number.isNaN(value) && value >= 0;

const isPositiveNumber = (value) =>
  typeof value === "number" && !Number.isNaN(value) && value > 0;

const isValidDateString = (value) => {
  if (!isNonEmptyString(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const isValidTimeString = (value) =>
  isNonEmptyString(value) && TIME_REGEX.test(value.trim());


// ========================================
// CREATE COACH
// ========================================

const createCoach = async (req, res) => {
  const client = await pool.connect();

  try {

    const {
      full_name,
      email,
      password,
      phone,

      experience_years,
      hourly_rate,
      bio,
      is_private,

      certification,
      achievements,
      profile_image
    } = req.body;


    // ========================================
    // VALIDATION
    // ========================================

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "full_name, email and password are required"
      });
    }

    if (!isNonEmptyString(full_name)) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a non-empty string"
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required"
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "password must be at least 8 characters long"
      });
    }

    if (
      experience_years !== undefined &&
      experience_years !== null &&
      !isNonNegativeNumber(experience_years)
    ) {
      return res.status(400).json({
        success: false,
        message: "experience_years must be a non-negative number"
      });
    }

    if (
      hourly_rate !== undefined &&
      hourly_rate !== null &&
      !isNonNegativeNumber(hourly_rate)
    ) {
      return res.status(400).json({
        success: false,
        message: "hourly_rate must be a non-negative number"
      });
    }

    if (
      is_private !== undefined &&
      is_private !== null &&
      typeof is_private !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_private must be a boolean"
      });
    }


    // ========================================
    // CHECK EMAIL
    // ========================================

    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [email]
    );


    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists"
      });
    }


    // ========================================
    // HASH PASSWORD
    // ========================================

    const passwordHash = await bcrypt.hash(
      password,
      10
    );


    // ========================================
    // START TRANSACTION
    // ========================================

    await client.query("BEGIN");


    // ========================================
    // CREATE USER
    // ========================================

    const userResult = await client.query(
      `
      INSERT INTO users
      (
        full_name,
        email,
        password_hash,
        phone,
        role,
        is_active
      )
      VALUES
      ($1, $2, $3, $4, $5, true)
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        is_active,
        created_at
      `,
      [
        full_name,
        email,
        passwordHash,
        phone || null,
        "coach"
      ]
    );


    const user = userResult.rows[0];


    // ========================================
    // CREATE COACH
    // ========================================

    const coachResult = await client.query(
      `
      INSERT INTO coaches
      (
        user_id,
        created_by,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        user_id,
        created_by,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved,
        created_at
      `,
      [
        user.id,
        req.user.userId,
        experience_years || 0,
        hourly_rate || null,
        bio || null,
        is_private !== undefined ? is_private : true,
        false
      ]
    );


    const coach = coachResult.rows[0];


    // ========================================
    // CREATE COACH PROFILE
    // ========================================

    const profileResult = await client.query(
      `
      INSERT INTO coach_profiles
      (
        coach_id,
        certification,
        achievements,
        profile_image
      )
      VALUES
      ($1, $2, $3, $4)
      RETURNING
        id,
        coach_id,
        certification,
        achievements,
        profile_image,
        created_at
      `,
      [
        coach.id,
        certification || null,
        achievements || null,
        profile_image || null
      ]
    );


    const profile = profileResult.rows[0];


    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");


    // ========================================
    // RESPONSE
    // ========================================

    return res.status(201).json({
      success: true,
      message: "Coach created successfully",

      coach: {
        user,
        coach,
        profile
      }
    });


  } catch (error) {

    // ========================================
    // ROLLBACK
    // ========================================

    await client.query("ROLLBACK");

    console.error("CREATE COACH ERROR:", error);


    return res.status(500).json({
      success: false,
      message: "Failed to create coach"
    });


  } finally {

    client.release();

  }
};


// ========================================
// CREATE PRIVATE COACH (E7M)
// ========================================
const createPrivateCoach = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      full_name,
      email,
      password,
      phone,
      gender,
      coach_type,
      city,
      address,
      experience_years,
      hourly_rate,
      bio,
    } = req.body;
    // ========================================
    // VALIDATION
    // ========================================
    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "full_name, email and password are required",
      });
    }
    if (!isNonEmptyString(full_name)) {
      return res.status(400).json({
        success: false,
        message:
          "full_name must be a non-empty string",
      });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }
    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "password must be at least 8 characters long",
      });
    }
    if (
      experience_years !== undefined &&
      experience_years !== null &&
      !isNonNegativeNumber(experience_years)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "experience_years must be a non-negative number",
      });
    }
    if (
      hourly_rate !== undefined &&
      hourly_rate !== null &&
      !isNonNegativeNumber(hourly_rate)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "hourly_rate must be a non-negative number",
      });
    }
    // ========================================
    // CHECK EMAIL
    // ========================================
    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }
    // ========================================
    // HASH PASSWORD
    // ========================================
    const passwordHash =
      await bcrypt.hash(password, 10);
    // ========================================
    // START TRANSACTION
    // ========================================
    await client.query("BEGIN");
    // ========================================
    // CREATE USER
    // ========================================
    const userResult = await client.query(
      `
      INSERT INTO users
      (
        full_name,
        email,
        password_hash,
        phone,
        role,
        is_active
      )
      VALUES
      ($1, $2, $3, $4, $5, true)
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        is_active,
        created_at
      `,
      [
        full_name,
        email,
        passwordHash,
        phone || null,
        "coach",
      ]
    );
    const user = userResult.rows[0];
    // ========================================
    // CREATE PRIVATE COACH
    // ========================================
    const coachResult = await client.query(
      `
      INSERT INTO coaches
      (
        user_id,
        created_by,
        experience_years,
        hourly_rate,
        bio,
        gender,
        coach_type,
        city,
        address,
        is_private,
        is_approved
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        true,
        false
      )
      RETURNING
        id,
        user_id,
        created_by,
        experience_years,
        hourly_rate,
        bio,
        gender,
        coach_type,
        city,
        address,
        is_private,
        is_approved,
        created_at
      `,
      [
        user.id,
        req.user.userId,
        experience_years || 0,
        hourly_rate || null,
        bio || null,
        gender || null,
        coach_type || null,
        city || null,
        address || null,
      ]
    );
    const coach = coachResult.rows[0];
    // ========================================
    // COMMIT
    // ========================================
    await client.query("COMMIT");
    // ========================================
    // RESPONSE
    // ========================================
    return res.status(201).json({
      success: true,
      message:
        "E7M private coach created successfully",
      coach: {
        ...coach,
        user,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(
      "CREATE PRIVATE COACH ERROR:",
      error
    );
    return res.status(500).json({
      success: false,
      message:
        "Failed to create private coach",
    });
  } finally {
    client.release();
  }
};


// ========================================
// GET ALL COACHES (E7M)
// ========================================

const getAllCoaches = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        c.id AS coach_id,
        c.user_id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.is_active,
        c.experience_years,
        c.hourly_rate,
        c.bio,
        c.is_private,
        c.is_approved,
        c.created_by,
        c.created_at,
        cp.id AS profile_id,
        cp.certification,
        cp.achievements,
        cp.profile_image AS coach_profile_image
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
      coaches: result.rows
    });

  } catch (error) {

    console.error("GET ALL COACHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get coaches"
    });
  }
};


// ========================================
// GET COACH BY ID (E7M)
// ========================================

const getCoachById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        c.id AS coach_id,
        c.user_id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.is_active,
        c.experience_years,
        c.hourly_rate,
        c.bio,
        c.is_private,
        c.is_approved,
        c.created_by,
        c.created_at,
        cp.id AS profile_id,
        cp.certification,
        cp.achievements,
        cp.profile_image AS coach_profile_image
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
        message: "Coach not found"
      });
    }

    return res.status(200).json({
      success: true,
      coach: result.rows[0]
    });

  } catch (error) {

    console.error("GET COACH BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get coach"
    });
  }
};


// ========================================
// UPDATE COACH (E7M - ADMIN FULL MANAGEMENT)
// ========================================

const updateCoach = async (req, res) => {
  const client = await pool.connect();

  try {

    const { id } = req.params;

    const {
      // user fields
      full_name,
      phone,
      email,
      profile_image,

      // coach professional fields
      experience_years,
      hourly_rate,
      bio,
      certification,
      achievements,

      // control fields
      is_private,
      is_approved,
      is_active
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (full_name !== undefined && full_name !== null && !isNonEmptyString(full_name)) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a non-empty string"
      });
    }

    if (email !== undefined && email !== null && !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required"
      });
    }

    if (
      experience_years !== undefined &&
      experience_years !== null &&
      !isNonNegativeNumber(experience_years)
    ) {
      return res.status(400).json({
        success: false,
        message: "experience_years must be a non-negative number"
      });
    }

    if (
      hourly_rate !== undefined &&
      hourly_rate !== null &&
      !isNonNegativeNumber(hourly_rate)
    ) {
      return res.status(400).json({
        success: false,
        message: "hourly_rate must be a non-negative number"
      });
    }

    if (
      is_private !== undefined &&
      is_private !== null &&
      typeof is_private !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_private must be a boolean"
      });
    }

    if (
      is_approved !== undefined &&
      is_approved !== null &&
      typeof is_approved !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_approved must be a boolean"
      });
    }

    if (
      is_active !== undefined &&
      is_active !== null &&
      typeof is_active !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_active must be a boolean"
      });
    }

    await client.query("BEGIN");

    // ========================================
    // GET COACH + USER_ID
    // ========================================

    const coachCheck = await client.query(
      `
      SELECT id, user_id
      FROM coaches
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (coachCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    const user_id = coachCheck.rows[0].user_id;

    // ========================================
    // CHECK EMAIL (IF CHANGED)
    // ========================================

    if (email) {
      const emailCheck = await client.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        AND id != $2
        `,
        [email, user_id]
      );

      if (emailCheck.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Email already exists"
        });
      }
    }

    // ========================================
    // UPDATE USER (BASIC INFO)
    // ========================================

    const userResult = await client.query(
      `
      UPDATE users
      SET
        full_name = COALESCE($1, full_name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        profile_image = COALESCE($4, profile_image),
        is_active = COALESCE($5, is_active),
        updated_at = NOW()
      WHERE id = $6
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [
        full_name !== undefined ? full_name : null,
        phone !== undefined ? phone : null,
        email !== undefined ? email : null,
        profile_image !== undefined ? profile_image : null,
        is_active !== undefined ? is_active : null,
        user_id
      ]
    );

    // ========================================
    // UPDATE COACH (PROFESSIONAL + CONTROL)
    // ========================================

    const coachResult = await client.query(
      `
      UPDATE coaches
      SET
        experience_years = COALESCE($1, experience_years),
        hourly_rate = COALESCE($2, hourly_rate),
        bio = COALESCE($3, bio),
        is_private = COALESCE($4, is_private),
        is_approved = COALESCE($5, is_approved)
      WHERE id = $6
      RETURNING
        id,
        user_id,
        created_by,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved,
        created_at
      `,
      [
        experience_years !== undefined ? experience_years : null,
        hourly_rate !== undefined ? hourly_rate : null,
        bio !== undefined ? bio : null,
        is_private !== undefined ? is_private : null,
        is_approved !== undefined ? is_approved : null,
        id
      ]
    );

    // ========================================
    // CHECK COACH PROFILE
    // ========================================

    const existingProfile = await client.query(
      `
      SELECT id
      FROM coach_profiles
      WHERE coach_id = $1
      `,
      [id]
    );

    let profileResult;

    if (existingProfile.rows.length === 0) {

      // Create profile if it doesn't exist
      profileResult = await client.query(
        `
        INSERT INTO coach_profiles
        (
          coach_id,
          certification,
          achievements,
          profile_image
        )
        VALUES
        ($1, $2, $3, $4)
        RETURNING
          id,
          coach_id,
          certification,
          achievements,
          profile_image,
          created_at
        `,
        [
          id,
          certification || null,
          achievements || null,
          profile_image || null
        ]
      );

    } else {

      // Update existing profile
      profileResult = await client.query(
        `
        UPDATE coach_profiles
        SET
          certification = COALESCE($1, certification),
          achievements = COALESCE($2, achievements),
          profile_image = COALESCE($3, profile_image)
        WHERE coach_id = $4
        RETURNING
          id,
          coach_id,
          certification,
          achievements,
          profile_image,
          created_at
        `,
        [
          certification !== undefined ? certification : null,
          achievements !== undefined ? achievements : null,
          profile_image !== undefined ? profile_image : null,
          id
        ]
      );
    }

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Coach updated successfully",
      coach: {
        user: userResult.rows[0],
        coach: coachResult.rows[0],
        profile: profileResult.rows[0]
      }
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("UPDATE COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach"
    });

  } finally {
    client.release();
  }
};


// ========================================
// DEACTIVATE COACH (E7M)
// ========================================

const deactivateCoach = async (req, res) => {
  try {

    const { id } = req.params;

    const coachCheck = await pool.query(
      `
      SELECT user_id
      FROM coaches
      WHERE id = $1
      `,
      [id]
    );

    if (coachCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    const user_id = coachCheck.rows[0].user_id;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [user_id]
    );

    return res.status(200).json({
      success: true,
      message: "Coach deactivated successfully",
      user: result.rows[0]
    });

  } catch (error) {

    console.error("DEACTIVATE COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate coach"
    });
  }
};


// ========================================
// ACTIVATE COACH (E7M)
// ========================================

const activateCoach = async (req, res) => {
  try {

    const { id } = req.params;

    const coachCheck = await pool.query(
      `
      SELECT user_id
      FROM coaches
      WHERE id = $1
      `,
      [id]
    );

    if (coachCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    const user_id = coachCheck.rows[0].user_id;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [user_id]
    );

    return res.status(200).json({
      success: true,
      message: "Coach activated successfully",
      user: result.rows[0]
    });

  } catch (error) {

    console.error("ACTIVATE COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to activate coach"
    });
  }
};


// ========================================
// DELETE COACH (E7M)
// ========================================

const deleteCoach = async (req, res) => {
  const client = await pool.connect();

  try {

    const { id } = req.params;

    // ========================================
    // CHECK BOOKINGS
    // ========================================

    const bookingsResult = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE coach_id = $1
      `,
      [id]
    );

    if (Number(bookingsResult.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        message: "Coach cannot be deleted because it has bookings"
      });
    }

    // ========================================
    // DELETE COACH + PROFILE
    // ========================================

    await client.query("BEGIN");

    await client.query(
      `
      DELETE FROM coach_profiles
      WHERE coach_id = $1
      `,
      [id]
    );

    const deleteResult = await client.query(
      `
      DELETE FROM coaches
      WHERE id = $1
      RETURNING
        id,
        user_id,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved,
        created_at
      `,
      [id]
    );

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Coach deleted successfully",
      coach: deleteResult.rows[0]
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("DELETE COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete coach"
    });

  } finally {
    client.release();
  }
};
// ========================================
// CREATE USER
// ========================================

const createUser = async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      role,
      profile_image,
      is_active,
    } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "full_name, email and password are required",
      });
    }

    if (!isNonEmptyString(full_name)) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a non-empty string",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "password must be at least 8 characters long",
      });
    }

    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      `,
      [email.trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users
      (
        full_name,
        email,
        password_hash,
        phone,
        role,
        profile_image,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        phone?.trim() || null,
        role || "player",
        profile_image || null,
        is_active !== undefined ? is_active : true,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
};
// ========================================
// CREATE OWNER
// ========================================

const createOwner = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      full_name,
      email,
      password,
      phone,
      profile_image,
      business_name,
      business_phone,
      business_email,
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "full_name, email and password are required",
      });
    }

    if (!isNonEmptyString(full_name)) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a non-empty string",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message: "password must be at least 8 characters long",
      });
    }

    // ========================================
    // CHECK EMAIL
    // ========================================

    const existingUser = await client.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      `,
      [email.trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // ========================================
    // PASSWORD HASH
    // ========================================

    const passwordHash = await bcrypt.hash(
      password,
      10
    );

    // ========================================
    // START TRANSACTION
    // ========================================

    await client.query("BEGIN");

    // ========================================
    // CREATE USER
    // ========================================

    const userResult = await client.query(
      `
      INSERT INTO users
      (
        full_name,
        email,
        password_hash,
        phone,
        role,
        profile_image,
        is_active,
        is_verified
      )
      VALUES
      ($1, $2, $3, $4, 'owner', $5, true, false)
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [
        full_name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        phone?.trim() || null,
        profile_image?.trim() || null,
      ]
    );

    const user = userResult.rows[0];

    // ========================================
    // CREATE OWNER PROFILE
    // ========================================

    const ownerResult = await client.query(
      `
      INSERT INTO owners
      (
        user_id,
        business_name,
        business_phone,
        business_email
      )
      VALUES
      ($1, $2, $3, $4)
      RETURNING
        id AS owner_id,
        user_id,
        business_name,
        business_phone,
        business_email,
        created_at AS owner_created_at
      `,
      [
        user.id,
        business_name?.trim() || null,
        business_phone?.trim() || null,
        business_email?.trim().toLowerCase() || null,
      ]
    );

    const owner = ownerResult.rows[0];

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "create",
      entityType: "owner",
      entityId: user.id,
      description: `Created owner: ${user.full_name}`,
      metadata: {
        operation: "create_owner",
        owner_id: user.id,
        owner_name: user.full_name,
        owner_email: user.email,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Owner created successfully",

      owner: {
        ...user,
        ...owner,
        pitches_count: 0,
      },
    });
  } catch (error) {
    // ========================================
    // ROLLBACK
    // ========================================

    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "CREATE OWNER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create owner",
    });
  } finally {
    client.release();
  }
};

// ========================================
// GET ALL USERS
// ========================================

const getAllUsers = async (req, res) => {
  try {

    const result = await pool.query(
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
   created_at,
   updated_at
   FROM users
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      users: result.rows
    });

  } catch (error) {

    console.error("GET ALL USERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get users"
    });
  }
};


// ========================================
// GET USER BY ID
// ========================================

const getUserById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
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
  created_at,
  updated_at
FROM users
WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {

    console.error("GET USER BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get user"
    });
  }
};


// ========================================
// UPDATE USER
// ========================================

const updateUser = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      full_name,
      email,
      phone,
      is_active
    } = req.body;
    // ========================================
    // VALIDATION
    // ========================================

    if (
      full_name !== undefined &&
      full_name !== null &&
      !isNonEmptyString(full_name)
    ) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a non-empty string"
      });
    }

    if (
      email !== undefined &&
      email !== null &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required"
      });
    }

    if (
      is_active !== undefined &&
      is_active !== null &&
      typeof is_active !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_active must be a boolean"
      });
    }

    // ========================================
    // CHECK USER EXISTS
    // ========================================

    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // ========================================
    // CHECK EMAIL (IF CHANGED)
    // ========================================

    if (email) {
      const emailCheck = await pool.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        AND id != $2
        `,
        [email.trim().toLowerCase(), id]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already exists"
        });
      }
    }
    // ========================================
    // VALIDATION
    // ========================================

    if (
      full_name !== undefined &&
      full_name !== null &&
      typeof full_name !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a string"
      });
    }

    if (
      email !== undefined &&
      email !== null &&
      typeof email !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "email must be a string"
      });
    }

    if (
      phone !== undefined &&
      phone !== null &&
      typeof phone !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "phone must be a string"
      });
    }

    if (
      is_active !== undefined &&
      typeof is_active !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_active must be a boolean"
      });
    }
    // ========================================
    // CHECK EMAIL
    // ========================================

    if (email !== undefined && email !== null) {
      const emailCheck = await pool.query(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
        AND id != $2
        `,
        [
          email.trim(),
          id
        ]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already exists"
        });
      }
    }

    // ========================================
    // UPDATE USER
    // ========================================

    const result = await pool.query(
      `
      UPDATE users
      SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
      WHERE id = $5
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [
        full_name !== undefined
          ? full_name.trim()
          : null,

        email !== undefined
          ? email.trim().toLowerCase()
          : null,

        phone !== undefined
          ? phone.trim()
          : null,

        is_active !== undefined
          ? is_active
          : null,

        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: result.rows[0]
    });

  } catch (error) {
    console.error("UPDATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user"
    });
  }
};


// ========================================
// DEACTIVATE USER
// ========================================

const deactivateUser = async (req, res) => {
  try {

    const { id } = req.params;

    // Prevent admin from deactivating himself
    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account"
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deactivated successfully",
      user: result.rows[0]
    });

  } catch (error) {

    console.error("DEACTIVATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate user"
    });
  }
};


// ========================================
// ACTIVATE USER
// ========================================

const activateUser = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "User activated successfully",
      user: result.rows[0]
    });

  } catch (error) {

    console.error("ACTIVATE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to activate user"
    });
  }
};
// ========================================
// VERIFY USER
// ========================================

const verifyUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_verified = true,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
      
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User verified successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("VERIFY USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify user",
    });
  }
};


// ========================================
// UNVERIFY USER
// ========================================

const unverifyUser = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_verified = false,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User unverified successfully",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("UNVERIFY USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to unverify user",
    });
  }
};

// ========================================
// DELETE USER
// ========================================

const deleteUser = async (req, res) => {
  const client = await pool.connect();

  try {

    const { id } = req.params;

    // Prevent admin from deleting himself
    if (String(id) === String(req.user.userId)) {
      client.release();

      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account"
      });
    }

    await client.query("BEGIN");

    // ========================================
    // CHECK RELATED DATA ACROSS TABLES
    // ========================================

    const checks = [
      { table: "coaches", column: "user_id", message: "User has a coach profile" },
      { table: "owners", column: "user_id", message: "User has an owner profile" },
      { table: "bookings", column: "player_id", message: "User has bookings" },
      { table: "reviews", column: "player_id", message: "User has reviews" },
      { table: "reports", column: "reporter_id", message: "User has submitted reports" },
      { table: "payments", column: "user_id", message: "User has payments" },
      { table: "academy_enrollment", column: "player_id", message: "User has academy enrollments" }
    ];

    for (const check of checks) {

      const result = await client.query(
        `
        SELECT 1
        FROM ${check.table}
        WHERE ${check.column} = $1
        LIMIT 1
        `,
        [id]
      );

      if (result.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "User cannot be deleted because related data exists",
          reason: check.message
        });
      }
    }

    // ========================================
    // DELETE SAFE CHILD DATA
    // ========================================

    await client.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM user_sessions WHERE user_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM notifications WHERE user_id = $1`,
      [id]
    );

    // ========================================
    // DELETE USER
    // ========================================

    const deleteResult = await client.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        role
      `,
      [id]
    );

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      user: deleteResult.rows[0]
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("DELETE USER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete user"
    });

  } finally {
    client.release();
  }
};


// ========================================
// GET ALL PLAYERS
// ========================================

const getAllPlayers = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        phone,
        profile_image,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE role = 'player'
      ORDER BY created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      players: result.rows
    });

  } catch (error) {

    console.error("GET ALL PLAYERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get players"
    });
  }
};


// ========================================
// GET PLAYER BY ID
// ========================================

const getPlayerById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.is_active,
        u.created_at,
        u.updated_at,

        pp.id AS player_profile_id,
        pp.position,
        pp.skill_level,
        pp.date_of_birth,
        pp.preferred_foot,
        pp.bio,
        pp.created_at AS profile_created_at

      FROM users u

      LEFT JOIN player_profiles pp
        ON pp.user_id = u.id

      WHERE u.id = $1
      AND u.role = 'player'
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    return res.status(200).json({
      success: true,
      player: result.rows[0]
    });

  } catch (error) {

    console.error("GET PLAYER BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get player"
    });
  }
};


// ========================================
// DEACTIVATE PLAYER
// ========================================

const deactivatePlayer = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      AND role = 'player'
      RETURNING
        id,
        full_name,
        email,
        phone,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Player deactivated successfully",
      player: result.rows[0]
    });

  } catch (error) {

    console.error("DEACTIVATE PLAYER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate player"
    });
  }
};


// ========================================
// ACTIVATE PLAYER
// ========================================

const activatePlayer = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = true,
        updated_at = NOW()
      WHERE id = $1
      AND role = 'player'
      RETURNING
        id,
        full_name,
        email,
        phone,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Player activated successfully",
      player: result.rows[0]
    });

  } catch (error) {

    console.error("ACTIVATE PLAYER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to activate player"
    });
  }
};
// ========================================
// UPDATE OWNER
// ========================================

const updateOwner = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      full_name,
      email,
      phone,
      profile_image,
      business_name,
      business_phone,
      business_email,
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      full_name !== undefined &&
      !isNonEmptyString(full_name)
    ) {
      return res.status(400).json({
        success: false,
        message: "full_name must be a non-empty string",
      });
    }

    if (
      email !== undefined &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    if (
      business_email !== undefined &&
      business_email !== null &&
      business_email !== "" &&
      !isValidEmail(business_email)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid business email is required",
      });
    }

    // ========================================
    // CHECK OWNER EXISTS
    // ========================================

    const ownerCheck = await client.query(
      `
      SELECT
        u.id,
        o.id AS owner_id
      FROM users u
      INNER JOIN owners o
        ON o.user_id = u.id
      WHERE u.id = $1
      AND u.role = 'owner'
      `,
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    const ownerId = ownerCheck.rows[0].owner_id;

    // ========================================
    // CHECK EMAIL IF CHANGED
    // ========================================

    if (email !== undefined) {
      const emailCheck = await client.query(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
        AND id != $2
        `,
        [
          email.trim().toLowerCase(),
          id,
        ]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    // ========================================
    // START TRANSACTION
    // ========================================

    await client.query("BEGIN");

    // ========================================
    // UPDATE USER
    // ========================================

    const userResult = await client.query(
      `
      UPDATE users
      SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        profile_image = COALESCE($4, profile_image),
        updated_at = NOW()
      WHERE id = $5
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [
        full_name !== undefined
            ? full_name.trim()
            : null,

        email !== undefined
            ? email.trim().toLowerCase()
            : null,

        phone !== undefined
            ? phone.trim()
            : null,

        profile_image !== undefined
            ? profile_image
            : null,

        id,
      ]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    // ========================================
    // UPDATE OWNER PROFILE
    // ========================================

    const ownerResult = await client.query(
      `
      UPDATE owners
      SET
        business_name = COALESCE($1, business_name),
        business_phone = COALESCE($2, business_phone),
        business_email = COALESCE($3, business_email)
      WHERE id = $4
      RETURNING
        id AS owner_id,
        user_id,
        business_name,
        business_phone,
        business_email,
        created_at AS owner_created_at
      `,
      [
        business_name !== undefined
            ? business_name.trim()
            : null,

        business_phone !== undefined
            ? business_phone.trim()
            : null,

        business_email !== undefined
            ? business_email.trim().toLowerCase()
            : null,

        ownerId,
      ]
    );

    if (ownerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");

    const user = userResult.rows[0];
    const owner = ownerResult.rows[0];

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "owner",
      entityId: id,
      description: `Updated owner: ${user.full_name}`,
      metadata: {
        operation: "update_owner",
        owner_id: Number(id),
        owner_name: user.full_name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Owner updated successfully",

      owner: {
        ...user,
        ...owner,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    console.error(
      "UPDATE OWNER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update owner",
    });
  } finally {
    client.release();
  }
};
// ========================================
// VERIFY OWNER
// ========================================

const verifyOwner = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("VERIFY OWNER CALLED:", id);

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_verified = true,
        updated_at = NOW()
      WHERE id = $1
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    console.log(
      "VERIFY OWNER DB RESULT:",
      result.rows
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }
    await safeCreateActivityLog({
  adminId: req.user.userId,
  action: "update",
  entityType: "owner",
  entityId: id,
  description: `Verified owner: ${result.rows[0].full_name}`,
  metadata: {
    operation: "verify_owner",
    owner_id: Number(id),
    owner_name: result.rows[0].full_name,
    owner_email: result.rows[0].email,
  },
});
    return res.status(200).json({
      success: true,
      message: "Owner verified successfully",
      owner: result.rows[0],
    });
  } catch (error) {
    console.error(
      "VERIFY OWNER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to verify owner",
    });
  }
};


// ========================================
// UNVERIFY OWNER
// ========================================

const unverifyOwner = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("UNVERIFY OWNER CALLED:", id);

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_verified = false,
        updated_at = NOW()
      WHERE id = $1
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        profile_image,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    console.log(
      "UNVERIFY OWNER DB RESULT:",
      result.rows
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "owner",
      entityId: id,
      description: `Unverified owner: ${result.rows[0].full_name}`,
      metadata: {
        operation: "unverify_owner",
        owner_id: Number(id),
        owner_name: result.rows[0].full_name,
        owner_email: result.rows[0].email,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Owner unverified successfully",
      owner: result.rows[0],
    });
  } catch (error) {
    console.error(
      "UNVERIFY OWNER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to unverify owner",
    });
  }
};
// ========================================
// APPROVE OWNER
// ========================================

const approveOwner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        approval_status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        approval_status,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "owner",
      entityId: id,
      description: `Approved owner: ${result.rows[0].full_name}`,
      metadata: {
        operation: "approve_owner",
        owner_id: Number(id),
        owner_name: result.rows[0].full_name,
        owner_email: result.rows[0].email,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Owner approved successfully",
      owner: result.rows[0],
    });

  } catch (error) {
    console.error("APPROVE OWNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve owner",
    });
  }
};


// ========================================
// REJECT OWNER
// ========================================

const rejectOwner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        approval_status = 'rejected',
        updated_at = NOW()
      WHERE id = $1
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        approval_status,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "owner",
      entityId: id,
      description: `Rejected owner: ${result.rows[0].full_name}`,
      metadata: {
        operation: "reject_owner",
        owner_id: Number(id),
        owner_name: result.rows[0].full_name,
        owner_email: result.rows[0].email,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Owner rejected successfully",
      owner: result.rows[0],
    });

  } catch (error) {
    console.error("REJECT OWNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject owner",
    });
  }
};
// ========================================
// GET ALL OWNERS
// ========================================

const getAllOwners = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.is_active,
        u.is_verified,
        u.approval_status,
        u.created_at,
        u.updated_at,

        o.id AS owner_id,
        o.user_id,
        o.business_name,
        o.business_phone,
        o.business_email,
        o.is_deleted,
        o.created_at AS owner_created_at

      FROM users u

      INNER JOIN owners o
        ON o.user_id = u.id

      WHERE u.role = 'owner'
      AND o.is_deleted = FALSE

      ORDER BY u.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      owners: result.rows
    });

  } catch (error) {

    console.error("GET ALL OWNERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owners"
    });
  }
};


// ========================================
// GET OWNER BY ID
// ========================================

const getOwnerById = async (req, res) => {
  try {

    const { id } = req.params;

    // ========================================
    // GET OWNER + USER DATA
    // ========================================

    const ownerResult = await pool.query(
      `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image,
        u.is_active,
        u.created_at,
        u.updated_at,

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
      `,
      [id]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    const owner = ownerResult.rows[0];
    // ========================================
// APPROVE OWNER
// ========================================

const approveOwner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        approval_status = 'approved',
        updated_at = NOW()
      WHERE id = $1
        AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        approval_status,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Owner approved successfully",
      owner: result.rows[0]
    });

  } catch (error) {
    console.error("APPROVE OWNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve owner"
    });
  }
};


// ========================================
// REJECT OWNER
// ========================================

const rejectOwner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        approval_status = 'rejected',
        updated_at = NOW()
      WHERE id = $1
        AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        role,
        approval_status,
        is_active,
        is_verified,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Owner rejected successfully",
      owner: result.rows[0]
    });

  } catch (error) {
    console.error("REJECT OWNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject owner"
    });
  }
};

    // ========================================
    // GET OWNER PITCHES
    // ========================================

    const pitchesResult = await pool.query(
      `
      SELECT
        id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      FROM pitches
      WHERE owner_id = $1
      ORDER BY created_at DESC
      `,
      [owner.owner_id]
    );


    // ========================================
    // RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,

      owner: {
        id: owner.id,
        full_name: owner.full_name,
        email: owner.email,
        phone: owner.phone,
        profile_image: owner.profile_image,
        is_active: owner.is_active,
        created_at: owner.created_at,
        updated_at: owner.updated_at,

        owner_id: owner.owner_id,
        business_name: owner.business_name,
        business_phone: owner.business_phone,
        business_email: owner.business_email,
        owner_created_at: owner.owner_created_at,

        pitches_count: pitchesResult.rows.length,
        pitches: pitchesResult.rows
      }
    });

  } catch (error) {

    console.error("GET OWNER BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owner"
    });
  }
};


// ========================================
// DEACTIVATE OWNER
// ========================================

const deactivateOwner = async (req, res) => {
  try {

    const { id } = req.params;

    // Prevent admin from deactivating himself
    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account"
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = false,
        updated_at = NOW()
      WHERE id = $1
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "owner",
      entityId: id,
      description: `Deactivated owner: ${result.rows[0].full_name}`,
      metadata: {
        operation: "deactivate_owner",
        owner_id: Number(id),
        owner_name: result.rows[0].full_name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Owner deactivated successfully",
      owner: result.rows[0]
    });

  } catch (error) {

    console.error("DEACTIVATE OWNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate owner"
    });
  }
};


// ========================================
// ACTIVATE OWNER
// ========================================

const activateOwner = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        is_active = true,
        updated_at = NOW()
      WHERE id = $1
      AND role = 'owner'
      RETURNING
        id,
        full_name,
        email,
        phone,
        profile_image,
        is_active,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "owner",
      entityId: id,
      description: `Activated owner: ${result.rows[0].full_name}`,
      metadata: {
        operation: "activate_owner",
        owner_id: Number(id),
        owner_name: result.rows[0].full_name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Owner activated successfully",
      owner: result.rows[0]
    });

  } catch (error) {

    console.error("ACTIVATE OWNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to activate owner"
    });
  }
};

// ========================================
// DELETE OWNER
// ========================================
const deleteOwner = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("DELETE OWNER CALLED:", id);
    // ========================================
    // PREVENT ADMIN FROM DELETING HIMSELF
    // ========================================
    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }
    // ========================================
    // DELETE / DEACTIVATE OWNER ACCOUNT
    // ========================================
    const result = await pool.query(
      `
      UPDATE users u
      SET
        is_active = false,
        updated_at = NOW()
      FROM owners o
      WHERE o.user_id = u.id
        AND u.id = $1
        AND u.role = 'owner'
        AND o.is_deleted = FALSE
      RETURNING
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.role,
        u.profile_image,
        u.is_active,
        u.is_verified,
        u.approval_status,
        u.created_at,
        u.updated_at,
        o.id AS owner_id,
        o.business_name,
        o.business_phone,
        o.business_email
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found or already deleted",
      });
    }
    // ========================================
    // MARK OWNER PROFILE AS DELETED
    // ========================================
    await pool.query(
      `
      UPDATE owners
      SET
        is_deleted = TRUE
      WHERE user_id = $1
      `,
      [id]
    );
    // ========================================
    // ACTIVITY LOG
    // ========================================
    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "delete",
      entityType: "owner",
      entityId: id,
      description:
        `Deleted owner: ${result.rows[0].full_name}`,
      metadata: {
        operation: "delete_owner",
        owner_id: Number(id),
        owner_name: result.rows[0].full_name,
        delete_type: "soft_delete",
      },
    });
    // ========================================
    // RESPONSE
    // ========================================
    return res.status(200).json({
      success: true,
      message: "Owner deleted successfully",
      owner: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE OWNER ERROR:",
      error
    );
    return res.status(500).json({
      success: false,
      message: "Failed to delete owner",
    });
  }
};


// ========================================
// GET ALL PITCHES
// ========================================

const getAllPitches = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.owner_id,
        u.full_name AS owner_name,
        u.email AS owner_email,
        p.city_id,
        c.name AS city_name,
        p.name,
        p.description,
        p.address,
        p.latitude,
        p.longitude,
        p.pitch_type,
        p.capacity,
        p.base_price,
        p.status,
        p.created_at,
        p.updated_at
      FROM pitches p
      INNER JOIN owners o
        ON o.id = p.owner_id
      INNER JOIN users u
        ON u.id = o.user_id
      LEFT JOIN cities c
        ON c.id = p.city_id
      ORDER BY p.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      pitches: result.rows
    });

  } catch (error) {

    console.error("GET ALL PITCHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitches"
    });
  }
};
// ========================================
// CREATE PITCH
// ========================================

const createPitch = async (req, res) => {
  try {
    const {
      owner_id,
      city_id,
      name,
      description,
      address,
      latitude,
      longitude,
      pitch_type,
      capacity,
      base_price,
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      owner_id === undefined ||
      city_id === undefined ||
      !name ||
      !address ||
      latitude === undefined ||
      longitude === undefined ||
      !pitch_type ||
      capacity === undefined ||
      base_price === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "owner_id, city_id, name, address, latitude, longitude, pitch_type, capacity and base_price are required",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name must be a non-empty string",
      });
    }

    if (typeof pitch_type !== "string" || !pitch_type.trim()) {
      return res.status(400).json({
        success: false,
        message: "pitch_type must be a non-empty string",
      });
    }

    const latitudeNumber = Number(latitude);
    const longitudeNumber = Number(longitude);
    const capacityNumber = Number(capacity);
    const basePriceNumber = Number(base_price);

    if (!Number.isFinite(latitudeNumber)) {
      return res.status(400).json({
        success: false,
        message: "latitude must be a valid number",
      });
    }

    if (!Number.isFinite(longitudeNumber)) {
      return res.status(400).json({
        success: false,
        message: "longitude must be a valid number",
      });
    }

    if (!Number.isInteger(capacityNumber) || capacityNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: "capacity must be a positive integer",
      });
    }

    if (!Number.isFinite(basePriceNumber) || basePriceNumber < 0) {
      return res.status(400).json({
        success: false,
        message: "base_price must be a valid positive number",
      });
    }

    // ========================================
    // CHECK OWNER
    // ========================================

    const ownerResult = await pool.query(
      `
      SELECT
        o.id,
        u.id AS user_id,
        u.full_name,
        u.is_active
      FROM owners o
      INNER JOIN users u
        ON u.id = o.user_id
      WHERE o.id = $1
      AND u.role = 'owner'
      `,
      [owner_id]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    if (!ownerResult.rows[0].is_active) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a pitch for an inactive owner",
      });
    }

    // ========================================
    // CREATE PITCH
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO pitches
      (
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        'pending',
        NOW(),
        NOW()
      )
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      `,
      [
        owner_id,
        city_id,
        name.trim(),
        description?.trim() || null,
        address.trim(),
        latitudeNumber,
        longitudeNumber,
        pitch_type.trim(),
        capacityNumber,
        basePriceNumber,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Pitch created successfully",
      pitch: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create pitch",
    });
  }
};


// ========================================
// UPDATE PITCH
// ========================================

const updatePitch = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      owner_id,
      city_id,
      name,
      description,
      address,
      latitude,
      longitude,
      pitch_type,
      capacity,
      base_price,
    } = req.body;

    // ========================================
    // CHECK PITCH
    // ========================================

    const existingPitch = await pool.query(
      `
      SELECT id
      FROM pitches
      WHERE id = $1
      `,
      [id]
    );

    if (existingPitch.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found",
      });
    }

    // ========================================
    // VALIDATION
    // ========================================

    if (
      name !== undefined &&
      (typeof name !== "string" || !name.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "name must be a non-empty string",
      });
    }

    if (
      pitch_type !== undefined &&
      (typeof pitch_type !== "string" ||
        !pitch_type.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "pitch_type must be a non-empty string",
      });
    }

    if (latitude !== undefined) {
      const value = Number(latitude);

      if (!Number.isFinite(value)) {
        return res.status(400).json({
          success: false,
          message: "latitude must be a valid number",
        });
      }
    }

    if (longitude !== undefined) {
      const value = Number(longitude);

      if (!Number.isFinite(value)) {
        return res.status(400).json({
          success: false,
          message: "longitude must be a valid number",
        });
      }
    }

    if (capacity !== undefined) {
      const value = Number(capacity);

      if (!Number.isInteger(value) || value <= 0) {
        return res.status(400).json({
          success: false,
          message:
            "capacity must be a positive integer",
        });
      }
    }

    if (base_price !== undefined) {
      const value = Number(base_price);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message:
            "base_price must be a valid positive number",
        });
      }
    }

    // ========================================
    // CHECK OWNER IF PROVIDED
    // ========================================

    if (owner_id !== undefined) {
      const ownerResult = await pool.query(
        `
        SELECT
          o.id,
          u.is_active
        FROM owners o
        INNER JOIN users u
          ON u.id = o.user_id
        WHERE o.id = $1
        AND u.role = 'owner'
        `,
        [owner_id]
      );

      if (ownerResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Owner not found",
        });
      }

      if (!ownerResult.rows[0].is_active) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot assign pitch to an inactive owner",
        });
      }
    }

    // ========================================
    // UPDATE
    // ========================================

    const result = await pool.query(
      `
      UPDATE pitches
      SET
        owner_id = COALESCE($1, owner_id),
        city_id = COALESCE($2, city_id),
        name = COALESCE($3, name),
        description = COALESCE($4, description),
        address = COALESCE($5, address),
        latitude = COALESCE($6, latitude),
        longitude = COALESCE($7, longitude),
        pitch_type = COALESCE($8, pitch_type),
        capacity = COALESCE($9, capacity),
        base_price = COALESCE($10, base_price),
        updated_at = NOW()
      WHERE id = $11
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      `,
      [
        owner_id ?? null,
        city_id ?? null,
        name?.trim() ?? null,
        description !== undefined
          ? description?.trim() || null
          : null,
        address?.trim() ?? null,
        latitude !== undefined
          ? Number(latitude)
          : null,
        longitude !== undefined
          ? Number(longitude)
          : null,
        pitch_type?.trim() ?? null,
        capacity !== undefined
          ? Number(capacity)
          : null,
        base_price !== undefined
          ? Number(base_price)
          : null,
        id,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Pitch updated successfully",
      pitch: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update pitch",
    });
  }
};


// ========================================
// ACTIVATE PITCH
// ========================================

const activatePitch = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE pitches
      SET
        status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'inactive'
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      const pitchCheck = await pool.query(
        `
        SELECT id, status
        FROM pitches
        WHERE id = $1
        `,
        [id]
      );

      if (pitchCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pitch not found",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          `Cannot activate pitch with status '${pitchCheck.rows[0].status}'`,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch activated successfully",
      pitch: result.rows[0],
    });
  } catch (error) {
    console.error("ACTIVATE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to activate pitch",
    });
  }
};

// ========================================
// GET PITCH BY ID
// ========================================

const getPitchById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.owner_id,
        u.full_name AS owner_name,
        u.email AS owner_email,
        u.phone AS owner_phone,
        p.city_id,
        c.name AS city_name,
        p.name,
        p.description,
        p.address,
        p.latitude,
        p.longitude,
        p.pitch_type,
        p.capacity,
        p.base_price,
        p.status,
        p.created_at,
        p.updated_at
      FROM pitches p
      INNER JOIN owners o
        ON o.id = p.owner_id
      INNER JOIN users u
        ON u.id = o.user_id
      LEFT JOIN cities c
        ON c.id = p.city_id
      WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      pitch: result.rows[0]
    });

  } catch (error) {

    console.error("GET PITCH BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch"
    });
  }
};


// ========================================
// APPROVE PITCH
// ========================================

const approvePitch = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE pitches
      SET
        status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'pending'
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch approved successfully",
      pitch: result.rows[0]
    });

  } catch (error) {

    console.error("APPROVE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve pitch"
    });
  }
};


// ========================================
// REJECT PITCH
// ========================================

const rejectPitch = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE pitches
      SET
        status = 'rejected',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'pending'
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch rejected successfully",
      pitch: result.rows[0]
    });

  } catch (error) {

    console.error("REJECT PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject pitch"
    });
  }
};


// ========================================
// DEACTIVATE PITCH
// ========================================

const deactivatePitch = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE pitches
      SET
        status = 'inactive',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'approved'
      RETURNING
        id,
        owner_id,
        city_id,
        name,
        description,
        address,
        latitude,
        longitude,
        pitch_type,
        capacity,
        base_price,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Approved pitch not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch deactivated successfully",
      pitch: result.rows[0]
    });

  } catch (error) {

    console.error("DEACTIVATE PITCH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate pitch"
    });
  }
};


// ========================================
// DELETE PITCH
// ========================================

const deletePitch = async (req, res) => {
  const client = await pool.connect();

  let transactionStarted = false;

  try {
    const { id } = req.params;

    // ========================================
    // VALIDATE ID
    // ========================================

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Pitch ID is required",
      });
    }

    // ========================================
    // CHECK PITCH EXISTS
    // ========================================

    const pitchResult = await client.query(
      `
      SELECT
        id,
        name,
        status
      FROM pitches
      WHERE id = $1
      `,
      [id]
    );

    if (pitchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found",
      });
    }

    const pitch = pitchResult.rows[0];

    // ========================================
    // CHECK BOOKINGS
    // ========================================

    const bookingsResult = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM bookings b
      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id
      WHERE ps.pitch_id = $1
      `,
      [id]
    );

    const bookingsCount = Number(
      bookingsResult.rows[0].count
    );

    // ========================================
    // DO NOT DELETE IF BOOKINGS EXIST
    // ========================================

    if (bookingsCount > 0) {
      return res.status(409).json({
        success: false,
        code: "PITCH_HAS_BOOKINGS",
        message:
          "This stadium cannot be deleted because it has existing bookings. Deactivate it instead.",
        pitch: {
          id: pitch.id,
          name: pitch.name,
          status: pitch.status,
        },
        bookingsCount,
        suggestion:
          "Use the deactivate action to stop new bookings while preserving booking history.",
      });
    }

    // ========================================
    // START TRANSACTION
    // ========================================

    await client.query("BEGIN");
    transactionStarted = true;

    // ========================================
    // DELETE FAVORITES
    // ========================================

    await client.query(
      `
      DELETE FROM favorites
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ========================================
    // DELETE OFFERS
    // ========================================

    await client.query(
      `
      DELETE FROM offers
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ========================================
    // DELETE PITCH IMAGES
    // ========================================

    await client.query(
      `
      DELETE FROM pitch_images
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ========================================
    // DELETE REPORTS
    // ========================================

    await client.query(
      `
      DELETE FROM reports
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ========================================
    // DELETE REVIEWS
    // ========================================

    await client.query(
      `
      DELETE FROM reviews
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ========================================
    // DELETE PITCH SLOTS
    // ========================================

    await client.query(
      `
      DELETE FROM pitch_slots
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ========================================
    // DELETE PITCH
    // ========================================

    const deleteResult = await client.query(
      `
      DELETE FROM pitches
      WHERE id = $1
      RETURNING
        id,
        name,
        status
      `,
      [id]
    );

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Pitch not found",
      });
    }

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");
    transactionStarted = false;

    console.log(
      "DELETE PITCH SUCCESS:",
      deleteResult.rows[0]
    );

    return res.status(200).json({
      success: true,
      message: "Pitch deleted successfully",
      pitch: deleteResult.rows[0],
    });

  } catch (error) {

    // ========================================
    // ROLLBACK ONLY IF TRANSACTION STARTED
    // ========================================

    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "DELETE PITCH ROLLBACK ERROR:",
          rollbackError
        );
      }
    }

    console.error(
      "DELETE PITCH ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete pitch",
    });

  } finally {
    client.release();
  }
};


// ========================================
// CREATE ACADEMY
// ========================================

const createAcademy = async (req, res) => {
  try {

    const {
      name,
      description,
      address,
      city_id,
      image_url,
      phone_number
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!name || !isNonEmptyString(name)) {
      return res.status(400).json({
        success: false,
        message: "name is required and must be a non-empty string"
      });
    }

    if (
      description !== undefined &&
      description !== null &&
      typeof description !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "description must be a string"
      });
    }

    if (
      address !== undefined &&
      address !== null &&
      typeof address !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "address must be a string"
      });
    }

    if (
      city_id !== undefined &&
      city_id !== null &&
      !isPositiveNumber(Number(city_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "city_id must be a valid positive number"
      });
    }

    if (
      phone_number !== undefined &&
      phone_number !== null &&
      (
        typeof phone_number !== "string" ||
        !/^01[0125][0-9]{8}$/.test(phone_number.trim())
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "phone_number must be a valid Egyptian mobile number"
      });
    }

    // Admin ID comes from JWT

    const created_by = req.user.userId;

    const result = await pool.query(
      `
      INSERT INTO academies
      (
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'pending',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING
        id,
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      `,
      [
        name,
        description || null,
        address || null,
        city_id || null,
        image_url || null,
        phone_number?.trim() || null,
        created_by
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Academy created successfully",
      academy: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create academy"
    });
  }
};


// ========================================
// GET ALL ACADEMIES
// ========================================

const getAllAcademies = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.description,
        a.address,
        a.city_id,
        c.name AS city_name,
        a.image_url,
        a.phone_number,
        a.created_by,
        u.full_name AS created_by_name,
        a.status,
        a.created_at,
        a.updated_at
      FROM academies a
      LEFT JOIN cities c
        ON c.id = a.city_id
      LEFT JOIN users u
        ON u.id = a.created_by
      ORDER BY a.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      academies: result.rows
    });

  } catch (error) {

    console.error("GET ALL ACADEMIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academies"
    });
  }
};


// ========================================
// GET ACADEMY BY ID
// ========================================

const getAcademyById = async (req, res) => {
  try {

    const { id } = req.params;

    // ========================================
    // GET ACADEMY
    // ========================================

    const academyResult = await pool.query(
      `
      SELECT
        a.id,
        a.name,
        a.description,
        a.address,
        a.city_id,
        c.name AS city_name,
        a.image_url,
        a.phone_number,
        a.created_by,
        u.full_name AS created_by_name,
        a.status,
        a.created_at,
        a.updated_at
      FROM academies a
      LEFT JOIN cities c
        ON c.id = a.city_id
      LEFT JOIN users u
        ON u.id = a.created_by
      WHERE a.id = $1
      `,
      [id]
    );

    if (academyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    const academy = academyResult.rows[0];

    // ========================================
    // GET PROGRAMS
    // ========================================

    const programsResult = await pool.query(
      `
      SELECT
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      FROM academy_programs
      WHERE academy_id = $1
      ORDER BY id ASC
      `,
      [id]
    );

    // ========================================
    // GET ENROLLMENT COUNT
    // ========================================

    const enrollmentResult = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM academy_enrollment
      WHERE academy_id = $1
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      academy: {
        ...academy,
        programs_count: programsResult.rows.length,
        programs: programsResult.rows,
        enrollments_count: Number(
          enrollmentResult.rows[0].count
        )
      }
    });

  } catch (error) {

    console.error("GET ACADEMY BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy"
    });
  }
};


// ========================================
// APPROVE ACADEMY
// ========================================

const approveAcademy = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academies
      SET
        status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'pending'
      RETURNING
        id,
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending academy not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Academy approved successfully",
      academy: result.rows[0]
    });

  } catch (error) {

    console.error("APPROVE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve academy"
    });
  }
};


// ========================================
// REJECT ACADEMY
// ========================================

const rejectAcademy = async (req, res) => {

  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academies
      SET
        status = 'rejected',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'pending'
      RETURNING
        id,
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending academy not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Academy rejected successfully",
      academy: result.rows[0]
    });

  } catch (error) {

    console.error("REJECT ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject academy"
    });
  }
};


// ========================================
// UPDATE ACADEMY
// ========================================

const updateAcademy = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      name,
      description,
      address,
      city_id,
      image_url,
      phone_number
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!name || !isNonEmptyString(name)) {
      return res.status(400).json({
        success: false,
        message: "name is required and must be a non-empty string"
      });
    }

    if (
      description !== undefined &&
      description !== null &&
      typeof description !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "description must be a string"
      });
    }

    if (
      address !== undefined &&
      address !== null &&
      typeof address !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "address must be a string"
      });
    }

    if (
      city_id !== undefined &&
      city_id !== null &&
      !isPositiveNumber(Number(city_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "city_id must be a valid positive number"
      });
    }

    if (
      phone_number !== undefined &&
      phone_number !== null &&
      (
        typeof phone_number !== "string" ||
        !/^01[0125][0-9]{8}$/.test(phone_number.trim())
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "phone_number must be a valid Egyptian mobile number"
      });
    }

    const result = await pool.query(
      `
      UPDATE academies
      SET
        name = $1,
        description = $2,
        address = $3,
        city_id = $4,
        image_url = $5,
        phone_number = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING
        id,
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      `,
      [
        name,
        description || null,
        address || null,
        city_id || null,
        image_url || null,
        phone_number?.trim() || null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Academy updated successfully",
      academy: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update academy"
    });
  }
};


// ========================================
// DEACTIVATE ACADEMY
// ========================================

const deactivateAcademy = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academies
      SET
        status = 'inactive',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'approved'
      RETURNING
        id,
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Approved academy not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Academy deactivated successfully",
      academy: result.rows[0]
    });

  } catch (error) {

    console.error("DEACTIVATE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate academy"
    });
  }
};


// ========================================
// ACTIVATE ACADEMY
// ========================================

const activateAcademy = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academies
      SET
        status = 'approved',
        updated_at = NOW()
      WHERE id = $1
      AND status = 'inactive'
      RETURNING
        id,
        name,
        description,
        address,
        city_id,
        image_url,
        phone_number,
        created_by,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Inactive academy not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Academy activated successfully",
      academy: result.rows[0]
    });

  } catch (error) {

    console.error("ACTIVATE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to activate academy"
    });
  }
};


// ========================================
// DELETE ACADEMY
// ========================================

const deleteAcademy = async (req, res) => {
  const client = await pool.connect();

  try {

    const { id } = req.params;

    // ========================================
    // CHECK PROGRAMS
    // ========================================

    const programsResult = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM academy_programs
      WHERE academy_id = $1
      `,
      [id]
    );

    if (Number(programsResult.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        message: "Academy cannot be deleted because it has programs"
      });
    }

    // ========================================
    // DELETE ACADEMY
    // ========================================

    await client.query("BEGIN");

    const deleteResult = await client.query(
      `
      DELETE FROM academies
      WHERE id = $1
      RETURNING
        id,
        name,
        status
      `,
      [id]
    );

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Academy deleted successfully",
      academy: deleteResult.rows[0]
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("DELETE ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete academy"
    });

  } finally {
    client.release();
  }
};


// ========================================
// GET ALL BOOKINGS
// ========================================

const getAllBookings = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        b.id,
        -- Player
        b.player_id,
        player.full_name AS player_name,
        player.email AS player_email,
        -- Pitch Slot
        b.pitch_slot_id,
        ps.slot_date,
        ps.start_time,
        ps.end_time,
        ps.price AS slot_price,
        ps.status AS slot_status,
        -- Pitch
        p.id AS pitch_id,
        p.name AS pitch_name,
        -- Owner
        o.id AS owner_id,
        owner.full_name AS owner_name,
        owner.email AS owner_email,
        -- Coach
        b.coach_id,
        coach_user.full_name AS coach_name,
        coach_user.email AS coach_email,
        -- Booking
        b.status,
        b.total_price,
        b.notes,
        b.booked_at
      FROM bookings b
      INNER JOIN users player
        ON player.id = b.player_id
      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id
      INNER JOIN pitches p
        ON p.id = ps.pitch_id
      INNER JOIN owners o
        ON o.id = p.owner_id
      INNER JOIN users owner
        ON owner.id = o.user_id
      LEFT JOIN coaches coach
        ON coach.id = b.coach_id
      LEFT JOIN users coach_user
        ON coach_user.id = coach.user_id
      ORDER BY b.booked_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      bookings: result.rows
    });

  } catch (error) {

    console.error("GET ALL BOOKINGS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get bookings"
    });
  }
};


// ========================================
// GET BOOKING BY ID
// ========================================

const getBookingById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        b.id,
        -- Player
        b.player_id,
        player.full_name AS player_name,
        player.email AS player_email,
        player.phone AS player_phone,
        -- Pitch Slot
        b.pitch_slot_id,
        ps.slot_date,
        ps.start_time,
        ps.end_time,
        ps.price AS slot_price,
        ps.status AS slot_status,
        -- Pitch
        p.id AS pitch_id,
        p.name AS pitch_name,
        p.address AS pitch_address,
        -- Owner
        o.id AS owner_id,
        owner.full_name AS owner_name,
        owner.email AS owner_email,
        owner.phone AS owner_phone,
        -- Coach
        b.coach_id,
        coach_user.full_name AS coach_name,
        coach_user.email AS coach_email,
        -- Booking
        b.status,
        b.total_price,
        b.notes,
        b.booked_at
      FROM bookings b
      INNER JOIN users player
        ON player.id = b.player_id
      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id
      INNER JOIN pitches p
        ON p.id = ps.pitch_id
      INNER JOIN owners o
        ON o.id = p.owner_id
      INNER JOIN users owner
        ON owner.id = o.user_id
      LEFT JOIN coaches coach
        ON coach.id = b.coach_id
      LEFT JOIN users coach_user
        ON coach_user.id = coach.user_id
      WHERE b.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    return res.status(200).json({
      success: true,
      booking: result.rows[0]
    });

  } catch (error) {

    console.error("GET BOOKING BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get booking"
    });
  }
};


// ========================================
// UPDATE BOOKING STATUS
// ========================================

const updateBookingStatus = async (req, res) => {
  const client = await pool.connect();

  try {

    const { id } = req.params;
    const { status } = req.body;

    // Allowed statuses

    const allowedStatuses = [
      "pending",
      "confirmed",
      "rejected",
      "cancelled",
      "completed"
    ];

    // Validate status

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking status",
        allowed_statuses: allowedStatuses
      });
    }

    await client.query("BEGIN");

    // ========================================
    // GET BOOKING + SLOT STATUS
    // ========================================

    const bookingResult = await client.query(
      `
      SELECT
        b.id,
        b.player_id,
        b.pitch_slot_id,
        b.coach_id,
        b.status,
        b.total_price,
        b.notes,
        b.booked_at,
        ps.status AS slot_status
      FROM bookings b
      INNER JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id
      WHERE b.id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookingResult.rows[0];

    // ========================================
    // UPDATE BOOKING STATUS
    // ========================================

    const updatedBooking = await client.query(
      `
      UPDATE bookings
      SET status = $1
      WHERE id = $2
      RETURNING
        id,
        player_id,
        pitch_slot_id,
        coach_id,
        status,
        total_price,
        notes,
        booked_at
      `,
      [status, id]
    );

    // ========================================
    // DETERMINE NEW SLOT STATUS
    // ========================================

    let newSlotStatus = booking.slot_status;

    if (status === "confirmed") {
      newSlotStatus = "booked";
    }

    if (status === "rejected" || status === "cancelled") {
      newSlotStatus = "available";
    }

    // completed → keep slot booked

    if (status === "completed") {
      newSlotStatus = "booked";
    }

    // pending → keep current slot status

    if (status === "pending") {
      newSlotStatus = booking.slot_status;
    }

    await client.query(
      `
      UPDATE pitch_slots
      SET status = $1
      WHERE id = $2
      `,
      [newSlotStatus, booking.pitch_slot_id]
    );

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Booking status updated successfully",
      booking: updatedBooking.rows[0],
      slot_status: newSlotStatus
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("UPDATE BOOKING STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update booking status"
    });

  } finally {
    client.release();
  }
};


// ========================================
// DELETE BOOKING
// ========================================

const deleteBooking = async (req, res) => {
  const client = await pool.connect();

  try {

    const { id } = req.params;

    // ========================================
    // GET BOOKING
    // ========================================

    const bookingResult = await client.query(
      `
      SELECT
        id,
        player_id,
        pitch_slot_id,
        coach_id,
        status,
        total_price,
        notes,
        booked_at
      FROM bookings
      WHERE id = $1
      `,
      [id]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const booking = bookingResult.rows[0];

    // ========================================
    // START TRANSACTION
    // ========================================

    await client.query("BEGIN");

    // ========================================
    // DELETE BOOKING
    // ========================================

    const deleteResult = await client.query(
      `
      DELETE FROM bookings
      WHERE id = $1
      RETURNING
        id,
        player_id,
        pitch_slot_id,
        coach_id,
        status,
        total_price,
        notes,
        booked_at
      `,
      [id]
    );

    // ========================================
    // FREE SLOT
    // ========================================

    await client.query(
      `
      UPDATE pitch_slots
      SET status = 'available'
      WHERE id = $1
      `,
      [booking.pitch_slot_id]
    );

    // ========================================
    // COMMIT
    // ========================================

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully",
      booking: deleteResult.rows[0]
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("DELETE BOOKING ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete booking"
    });

  } finally {
    client.release();
  }
};


// ========================================
// GET ALL REPORTS
// ========================================

const getAllReports = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        r.id,
        -- Reporter
        r.reporter_id,
        reporter.full_name AS reporter_name,
        reporter.email AS reporter_email,
        -- Reported User
        r.reported_user_id,
        reported.full_name AS reported_user_name,
        reported.email AS reported_user_email,
        -- Pitch
        r.pitch_id,
        p.name AS pitch_name,
        -- Booking
        r.booking_id,
        b.status AS booking_status,
        -- Report
        r.reason,
        r.description,
        r.status,
        r.created_at
      FROM reports r
      INNER JOIN users reporter
        ON reporter.id = r.reporter_id
      LEFT JOIN users reported
        ON reported.id = r.reported_user_id
      LEFT JOIN pitches p
        ON p.id = r.pitch_id
      LEFT JOIN bookings b
        ON b.id = r.booking_id
      ORDER BY r.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reports: result.rows
    });

  } catch (error) {

    console.error("GET ALL REPORTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get reports"
    });
  }
};


// ========================================
// GET REPORT BY ID
// ========================================

const getReportById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        r.id,
        -- Reporter
        r.reporter_id,
        reporter.full_name AS reporter_name,
        reporter.email AS reporter_email,
        reporter.phone AS reporter_phone,
        -- Reported User
        r.reported_user_id,
        reported.full_name AS reported_user_name,
        reported.email AS reported_user_email,
        reported.phone AS reported_user_phone,
        -- Pitch
        r.pitch_id,
        p.name AS pitch_name,
        p.address AS pitch_address,
        -- Booking
        r.booking_id,
        b.status AS booking_status,
        b.total_price AS booking_total_price,
        -- Report
        r.reason,
        r.description,
        r.status,
        r.created_at
      FROM reports r
      LEFT JOIN users reporter
        ON reporter.id = r.reporter_id
      LEFT JOIN users reported
        ON reported.id = r.reported_user_id
      LEFT JOIN pitches p
        ON p.id = r.pitch_id
      LEFT JOIN bookings b
        ON b.id = r.booking_id
      WHERE r.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    return res.status(200).json({
      success: true,
      report: result.rows[0]
    });

  } catch (error) {

    console.error("GET REPORT BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get report"
    });
  }
};


// ========================================
// UPDATE REPORT STATUS
// ========================================

const updateReportStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "reviewing",
      "resolved",
      "rejected"
    ];

    // ========================================
    // VALIDATE STATUS
    // ========================================

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report status",
        allowed_statuses: allowedStatuses
      });
    }

    // ========================================
    // UPDATE STATUS
    // ========================================

    const result = await pool.query(
      `
      UPDATE reports
      SET status = $1
      WHERE id = $2
      RETURNING
        id,
        reporter_id,
        reported_user_id,
        pitch_id,
        booking_id,
        reason,
        description,
        status,
        created_at
      `,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Report status updated successfully",
      report: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE REPORT STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update report status"
    });
  }
};


// ========================================
// DELETE REPORT
// ========================================

const deleteReport = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM reports
      WHERE id = $1
      RETURNING
        id,
        reporter_id,
        reported_user_id,
        pitch_id,
        booking_id,
        reason,
        description,
        status,
        created_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Report deleted successfully",
      report: result.rows[0]
    });

  } catch (error) {

    console.error("DELETE REPORT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete report"
    });
  }
};


// ========================================
// GET ALL NOTIFICATIONS
// ========================================

const getAllNotifications = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        n.id,
        n.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        n.title,
        n.message,
        n.type,
        n.is_read,
        n.created_at
      FROM notifications n
      INNER JOIN users u
        ON u.id = n.user_id
      ORDER BY n.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      notifications: result.rows
    });

  } catch (error) {

    console.error("GET ALL NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get notifications"
    });
  }
};


// ========================================
// CREATE NOTIFICATION
// ========================================

const createNotification = async (req, res) => {
  try {

    const {
      user_id,
      title,
      message,
      type
    } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({
        success: false,
        message: "user_id, title and message are required"
      });
    }

    if (!isPositiveNumber(Number(user_id))) {
      return res.status(400).json({
        success: false,
        message: "user_id must be a valid positive number"
      });
    }

    if (!isNonEmptyString(title)) {
      return res.status(400).json({
        success: false,
        message: "title must be a non-empty string"
      });
    }

    if (!isNonEmptyString(message)) {
      return res.status(400).json({
        success: false,
        message: "message must be a non-empty string"
      });
    }

    if (
      type !== undefined &&
      type !== null &&
      !isNonEmptyString(type)
    ) {
      return res.status(400).json({
        success: false,
        message: "type must be a non-empty string"
      });
    }

    const userResult = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at
      `,
      [
        user_id,
        title.trim(),
        message.trim(),
        type || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Notification created successfully",
      notification: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE NOTIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create notification"
    });
  }
};


// ========================================
// GET NOTIFICATION BY ID
// ========================================

const getNotificationById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        n.id,
        n.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        n.title,
        n.message,
        n.type,
        n.is_read,
        n.created_at
      FROM notifications n
      INNER JOIN users u
        ON u.id = n.user_id
      WHERE n.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    return res.status(200).json({
      success: true,
      notification: result.rows[0]
    });

  } catch (error) {

    console.error("GET NOTIFICATION BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get notification"
    });
  }
};


// ========================================
// UPDATE NOTIFICATION
// ========================================

const updateNotification = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      title,
      message,
      type,
      is_read
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      title !== undefined &&
      title !== null &&
      !isNonEmptyString(title)
    ) {
      return res.status(400).json({
        success: false,
        message: "title must be a non-empty string"
      });
    }

    if (
      message !== undefined &&
      message !== null &&
      !isNonEmptyString(message)
    ) {
      return res.status(400).json({
        success: false,
        message: "message must be a non-empty string"
      });
    }

    if (
      type !== undefined &&
      type !== null &&
      !isNonEmptyString(type)
    ) {
      return res.status(400).json({
        success: false,
        message: "type must be a non-empty string"
      });
    }

    if (
      is_read !== undefined &&
      is_read !== null &&
      typeof is_read !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "is_read must be a boolean"
      });
    }

    // ========================================
    // CHECK NOTIFICATION
    // ========================================

    const existingResult = await pool.query(
      `
      SELECT id
      FROM notifications
      WHERE id = $1
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    // ========================================
    // UPDATE
    // ========================================

    const result = await pool.query(
      `
      UPDATE notifications
      SET
        title = COALESCE($1, title),
        message = COALESCE($2, message),
        type = COALESCE($3, type),
        is_read = COALESCE($4, is_read)
      WHERE id = $5
      RETURNING
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at
      `,
      [
        title !== undefined ? title.trim() : null,
        message !== undefined ? message.trim() : null,
        type !== undefined ? type : null,
        is_read !== undefined ? is_read : null,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Notification updated successfully",
      notification: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE NOTIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update notification"
    });
  }
};


// ========================================
// DELETE NOTIFICATION
// ========================================

const deleteNotification = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM notifications
      WHERE id = $1
      RETURNING
        id,
        user_id,
        title,
        message,
        type,
        is_read,
        created_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      notification: result.rows[0]
    });

  } catch (error) {

    console.error("DELETE NOTIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete notification"
    });
  }
};


// ========================================
// GET ALL PAYMENTS
// ========================================

const getAllPayments = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,

        -- User
        p.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,

        -- Booking
        p.booking_id,
        b.status AS booking_status,
        b.total_price AS booking_total_price,

        -- Stadium / Pitch
        ps.pitch_id,
        pitch.name AS stadium_name,

        -- Payment
        p.amount,
        p.payment_method,
        p.status AS payment_status,
        p.transaction_reference AS transaction_id,
        p.created_at AS payment_date

      FROM payments p

      INNER JOIN users u
        ON u.id = p.user_id

      LEFT JOIN bookings b
        ON b.id = p.booking_id

      LEFT JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id

      LEFT JOIN pitches pitch
        ON pitch.id = ps.pitch_id

      ORDER BY p.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      payments: result.rows,
    });

  } catch (error) {
    console.error(
      "GET ALL PAYMENTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get payments",
    });
  }
};


// ========================================
// GET PAYMENT BY ID
// ========================================

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        p.id,

        -- User
        p.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,

        -- Booking
        p.booking_id,
        b.status AS booking_status,
        b.total_price AS booking_total_price,

        -- Stadium / Pitch
        ps.pitch_id,
        pitch.name AS stadium_name,

        -- Payment
        p.amount,
        p.payment_method,
        p.status AS payment_status,
        p.transaction_reference AS transaction_id,
        p.created_at AS payment_date

      FROM payments p

      INNER JOIN users u
        ON u.id = p.user_id

      LEFT JOIN bookings b
        ON b.id = p.booking_id

      LEFT JOIN pitch_slots ps
        ON ps.id = b.pitch_slot_id

      LEFT JOIN pitches pitch
        ON pitch.id = ps.pitch_id

      WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment: result.rows[0],
    });

  } catch (error) {
    console.error(
      "GET PAYMENT BY ID ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get payment",
    });
  }
};


// ========================================
// UPDATE PAYMENT STATUS
// ========================================

const updatePaymentStatus = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "paid",
      "failed",
      "refunded",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        allowed_statuses: allowedStatuses,
      });
    }

    await client.query("BEGIN");

    // ========================================
    // GET PAYMENT
    // ========================================

    const paymentResult = await client.query(
      `
      SELECT
        id,
        user_id,
        booking_id,
        amount,
        payment_method,
        payment_type,
        status,
        transaction_reference
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const payment = paymentResult.rows[0];

    // ========================================
    // PAYMENT MUST BE PENDING
    // ========================================

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Only pending payments can be updated",
        current_status: payment.status,
      });
    }

    // ========================================
    // DEPOSIT PAYMENT
    // ========================================

    if (
      payment.payment_type === "deposit" &&
      status === "paid"
    ) {
      // ========================================
      // TRANSACTION REFERENCE REQUIRED
      // ========================================

      if (
        !payment.transaction_reference ||
        !payment.transaction_reference.trim()
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Cannot confirm deposit payment without transaction reference",
        });
      }

      // ========================================
      // UPDATE PAYMENT
      // ========================================

      const paymentUpdateResult = await client.query(
        `
        UPDATE payments
        SET status = 'paid'
        WHERE id = $1
        RETURNING
          id,
          user_id,
          booking_id,
          amount,
          payment_method,
          payment_type,
          status AS payment_status,
          transaction_reference,
          created_at
        `,
        [id]
      );

      // ========================================
      // UPDATE BOOKING
      // ========================================

      const bookingUpdateResult = await client.query(
        `
        UPDATE bookings
        SET
          payment_status = 'paid',
          deposit_paid_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          player_id,
          pitch_slot_id,
          status,
          total_price,
          deposit_amount,
          remaining_amount,
          payment_method,
          payment_status,
          deposit_paid_at,
          updated_at
        `,
        [payment.booking_id]
      );

      if (bookingUpdateResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Booking not found",
        });
      }

      await client.query("COMMIT");

      // ========================================
      // ACTIVITY LOG
      // ========================================

      await safeCreateActivityLog({
        adminId: req.user.userId,
        action: "update",
        entityType: "payment",
        entityId: id,
        description: "Confirmed deposit payment",
        metadata: {
          operation: "confirm_deposit_payment",
          payment_id: id,
          booking_id: payment.booking_id,
          amount: payment.amount,
          transaction_reference:
            payment.transaction_reference,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Deposit payment confirmed successfully",
        payment: paymentUpdateResult.rows[0],
        booking: bookingUpdateResult.rows[0],
      });
    }

    // ========================================
    // OTHER PAYMENT STATUS UPDATES
    // ========================================

    const result = await client.query(
      `
      UPDATE payments
      SET status = $1
      WHERE id = $2
      RETURNING
        id,
        user_id,
        booking_id,
        amount,
        payment_method,
        payment_type,
        status AS payment_status,
        transaction_reference AS transaction_id,
        created_at AS payment_date
      `,
      [status, id]
    );

    await client.query("COMMIT");

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "payment",
      entityId: id,
      description:
        `Updated payment status to ${status}`,
      metadata: {
        operation: "update_payment_status",
        payment_id: id,
        status,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      payment: result.rows[0],
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "UPDATE PAYMENT STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update payment status",
    });

  } finally {
    client.release();
  }
};


// ========================================
// DELETE PAYMENT
// ========================================

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM payments
      WHERE id = $1
      RETURNING
        id,
        user_id,
        booking_id,
        amount,
        payment_method,
        status AS payment_status,
        transaction_reference AS transaction_id,
        created_at AS payment_date
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "delete",
      entityType: "payment",
      entityId: id,
      description: "Deleted payment",
      metadata: {
        operation:
          "delete_payment",
        payment_id: Number(id),
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Payment deleted successfully",
      payment: result.rows[0],
    });

  } catch (error) {
    console.error(
      "DELETE PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete payment",
    });
  }
};

// ========================================
// GET ALL OFFERS
// ========================================

const getAllOffers = async (req, res) => {
  try {

    const result = await pool.query(
      `
      SELECT
        o.id,
        -- Owner
        o.owner_id,
        owner_user.full_name AS owner_name,
        owner_user.email AS owner_email,
        -- Pitch
        o.pitch_id,
        p.name AS pitch_name,
        -- Offer
        o.title,
        o.description,
        o.discount_percentage,
        o.start_date,
        o.end_date,
        o.is_active
      FROM offers o
      INNER JOIN owners owner
        ON owner.id = o.owner_id
      INNER JOIN users owner_user
        ON owner_user.id = owner.user_id
      LEFT JOIN pitches p
        ON p.id = o.pitch_id
      ORDER BY o.id DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      offers: result.rows
    });

  } catch (error) {

    console.error("GET ALL OFFERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get offers"
    });
  }
};


// ========================================
// CREATE OFFER
// ========================================

const createOffer = async (req, res) => {
  try {

    const {
      owner_id,
      pitch_id,
      title,
      description,
      discount_percentage,
      start_date,
      end_date
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!owner_id || !title) {
      return res.status(400).json({
        success: false,
        message: "owner_id and title are required"
      });
    }

    if (!isPositiveNumber(Number(owner_id))) {
      return res.status(400).json({
        success: false,
        message: "owner_id must be a valid positive number"
      });
    }

    if (!isNonEmptyString(title)) {
      return res.status(400).json({
        success: false,
        message: "title must be a non-empty string"
      });
    }

    if (
      pitch_id !== undefined &&
      pitch_id !== null &&
      !isPositiveNumber(Number(pitch_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "pitch_id must be a valid positive number"
      });
    }

    if (
      discount_percentage !== undefined &&
      discount_percentage !== null
    ) {
      const discountValue = Number(discount_percentage);

      if (
        Number.isNaN(discountValue) ||
        discountValue < 0 ||
        discountValue > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "discount_percentage must be a number between 0 and 100"
        });
      }
    }

    if (
      start_date !== undefined &&
      start_date !== null &&
      !isValidDateString(start_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "start_date must be a valid date"
      });
    }

    if (
      end_date !== undefined &&
      end_date !== null &&
      !isValidDateString(end_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "end_date must be a valid date"
      });
    }

    if (
      start_date &&
      end_date &&
      isValidDateString(start_date) &&
      isValidDateString(end_date) &&
      new Date(start_date) > new Date(end_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "start_date must be before or equal to end_date"
      });
    }

    // ========================================
    // CHECK OWNER
    // ========================================

    const ownerResult = await pool.query(
      `
      SELECT id
      FROM owners
      WHERE id = $1
      `,
      [owner_id]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found"
      });
    }

    // ========================================
    // CHECK PITCH (IF PROVIDED)
    // ========================================

    if (pitch_id) {
      const pitchResult = await pool.query(
        `
        SELECT id
        FROM pitches
        WHERE id = $1
        `,
        [pitch_id]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pitch not found"
        });
      }
    }

    // ========================================
    // CREATE OFFER
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO offers (
        owner_id,
        pitch_id,
        title,
        description,
        discount_percentage,
        start_date,
        end_date,
        is_active
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        true
      )
      RETURNING
        id,
        owner_id,
        pitch_id,
        title,
        description,
        discount_percentage,
        start_date,
        end_date,
        is_active
      `,
      [
        owner_id,
        pitch_id || null,
        title.trim(),
        description || null,
        discount_percentage || null,
        start_date || null,
        end_date || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Offer created successfully",
      offer: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE OFFER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create offer"
    });
  }
};


// ========================================
// GET OFFER BY ID
// ========================================

const getOfferById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        o.id,
        -- Owner
        o.owner_id,
        owner_user.full_name AS owner_name,
        owner_user.email AS owner_email,
        -- Pitch
        o.pitch_id,
        p.name AS pitch_name,
        p.address AS pitch_address,
        -- Offer
        o.title,
        o.description,
        o.discount_percentage,
        o.start_date,
        o.end_date,
        o.is_active
      FROM offers o
      INNER JOIN owners owner
        ON owner.id = o.owner_id
      INNER JOIN users owner_user
        ON owner_user.id = owner.user_id
      LEFT JOIN pitches p
        ON p.id = o.pitch_id
      WHERE o.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    return res.status(200).json({
      success: true,
      offer: result.rows[0]
    });

  } catch (error) {

    console.error("GET OFFER BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get offer"
    });
  }
};


// ========================================
// UPDATE OFFER
// ========================================

const updateOffer = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      pitch_id,
      title,
      description,
      discount_percentage,
      start_date,
      end_date
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      title !== undefined &&
      title !== null &&
      !isNonEmptyString(title)
    ) {
      return res.status(400).json({
        success: false,
        message: "title must be a non-empty string"
      });
    }

    if (
      pitch_id !== undefined &&
      pitch_id !== null &&
      !isPositiveNumber(Number(pitch_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "pitch_id must be a valid positive number"
      });
    }

    if (
      discount_percentage !== undefined &&
      discount_percentage !== null
    ) {
      const discountValue = Number(discount_percentage);

      if (
        Number.isNaN(discountValue) ||
        discountValue < 0 ||
        discountValue > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "discount_percentage must be a number between 0 and 100"
        });
      }
    }

    if (
      start_date !== undefined &&
      start_date !== null &&
      !isValidDateString(start_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "start_date must be a valid date"
      });
    }

    if (
      end_date !== undefined &&
      end_date !== null &&
      !isValidDateString(end_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "end_date must be a valid date"
      });
    }

    if (
      start_date &&
      end_date &&
      isValidDateString(start_date) &&
      isValidDateString(end_date) &&
      new Date(start_date) > new Date(end_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "start_date must be before or equal to end_date"
      });
    }

    // ========================================
    // CHECK OFFER
    // ========================================

    const existingResult = await pool.query(
      `
      SELECT id, start_date, end_date
      FROM offers
      WHERE id = $1
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    // Cross-check against existing stored dates when only one side is provided

    const existingOffer = existingResult.rows[0];
    const effectiveStartDate = start_date || existingOffer.start_date;
    const effectiveEndDate = end_date || existingOffer.end_date;

    if (
      effectiveStartDate &&
      effectiveEndDate &&
      new Date(effectiveStartDate) > new Date(effectiveEndDate)
    ) {
      return res.status(400).json({
        success: false,
        message: "start_date must be before or equal to end_date"
      });
    }

    // ========================================
    // CHECK PITCH (IF PROVIDED)
    // ========================================

    if (pitch_id) {
      const pitchResult = await pool.query(
        `
        SELECT id
        FROM pitches
        WHERE id = $1
        `,
        [pitch_id]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Pitch not found"
        });
      }
    }

    // ========================================
    // UPDATE
    // ========================================

    const result = await pool.query(
      `
      UPDATE offers
      SET
        pitch_id = COALESCE($1, pitch_id),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        discount_percentage = COALESCE($4, discount_percentage),
        start_date = COALESCE($5, start_date),
        end_date = COALESCE($6, end_date)
      WHERE id = $7
      RETURNING
        id,
        owner_id,
        pitch_id,
        title,
        description,
        discount_percentage,
        start_date,
        end_date,
        is_active
      `,
      [
        pitch_id !== undefined ? pitch_id : null,
        title !== undefined ? title.trim() : null,
        description !== undefined ? description : null,
        discount_percentage !== undefined ? discount_percentage : null,
        start_date !== undefined ? start_date : null,
        end_date !== undefined ? end_date : null,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Offer updated successfully",
      offer: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE OFFER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update offer"
    });
  }
};


// ========================================
// UPDATE OFFER ACTIVE STATUS
// ========================================

const updateOfferActiveStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active must be a boolean"
      });
    }

    const result = await pool.query(
      `
      UPDATE offers
      SET is_active = $1
      WHERE id = $2
      RETURNING
        id,
        owner_id,
        pitch_id,
        title,
        description,
        discount_percentage,
        start_date,
        end_date,
        is_active
      `,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: is_active
        ? "Offer activated successfully"
        : "Offer deactivated successfully",
      offer: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE OFFER ACTIVE STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update offer status"
    });
  }
};


// ========================================
// DELETE OFFER
// ========================================

const deleteOffer = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM offers
      WHERE id = $1
      RETURNING
        id,
        owner_id,
        pitch_id,
        title,
        description,
        discount_percentage,
        start_date,
        end_date,
        is_active
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Offer deleted successfully",
      offer: result.rows[0]
    });

  } catch (error) {

    console.error("DELETE OFFER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete offer"
    });
  }
};


// ========================================
// GET ADMIN OVERVIEW STATISTICS
// ========================================

const getAdminOverviewStats = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*)
         FROM users
         WHERE role = 'player') AS total_players,
        (SELECT COUNT(*)
         FROM users
         WHERE role = 'owner') AS total_owners,
        (SELECT COUNT(*) FROM pitches) AS total_pitches,
        (SELECT COUNT(*)
         FROM pitches
         WHERE status = 'approved') AS approved_pitches,
        (SELECT COUNT(*)
         FROM academies) AS total_academies,
        (SELECT COUNT(*)
         FROM academies
         WHERE status = 'approved') AS approved_academies,
        (SELECT COUNT(*) FROM bookings) AS total_bookings,
        (SELECT COUNT(*)
         FROM bookings
         WHERE status = 'pending') AS pending_bookings,
        (SELECT COUNT(*)
         FROM bookings
         WHERE status = 'confirmed') AS confirmed_bookings,
        (SELECT COUNT(*)
         FROM bookings
         WHERE status = 'completed') AS completed_bookings,
        (SELECT COUNT(*)
         FROM payments) AS total_payments,
        (SELECT COALESCE(SUM(amount), 0)
         FROM payments
         WHERE status = 'paid') AS total_revenue,
        (SELECT COUNT(*)
         FROM reports
         WHERE status = 'pending') AS pending_reports,
        (SELECT COUNT(*)
         FROM offers
         WHERE is_active = true) AS active_offers
    `);

    return res.status(200).json({
      success: true,
      statistics: result.rows[0]
    });

  } catch (error) {

    console.error("GET ADMIN OVERVIEW STATS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get admin statistics"
    });
  }
};


// ========================================
// GET BOOKING ANALYTICS
// ========================================

const getBookingAnalytics = async (req, res) => {
  try {
    // ============================================================
    // OVERALL BOOKING ANALYTICS
    // ============================================================
    const totalsResult = await pool.query(`
      SELECT
        COUNT(*) AS total_bookings,
        COUNT(*) FILTER (
          WHERE status = 'pending'
        ) AS pending_bookings,
        COUNT(*) FILTER (
          WHERE status = 'confirmed'
        ) AS confirmed_bookings,
        COUNT(*) FILTER (
          WHERE status = 'rejected'
        ) AS rejected_bookings,
        COUNT(*) FILTER (
          WHERE status = 'cancelled'
        ) AS cancelled_bookings,
        COUNT(*) FILTER (
          WHERE status = 'completed'
        ) AS completed_bookings
      FROM bookings
    `);

    // ============================================================
    // DAILY BOOKINGS - LAST 7 DAYS
    // ============================================================
    const dailyResult = await pool.query(`
      SELECT
        day::date AS date,
        COUNT(b.id) AS bookings
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day
      LEFT JOIN bookings b
        ON b.booked_at::date = day::date
      GROUP BY day::date
      ORDER BY day::date ASC
    `);

    // ============================================================
    // RESPONSE
    // ============================================================
    return res.status(200).json({
      success: true,
      analytics: {
        ...totalsResult.rows[0],
        daily_bookings: dailyResult.rows.map((row) => ({
          date: row.date,
          bookings: Number(row.bookings) || 0,
        })),
      },
    });
  } catch (error) {
    console.error(
      "GET BOOKING ANALYTICS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get booking analytics",
    });
  }
};

// ========================================
// GET REVENUE ANALYTICS
// ========================================

const getRevenueAnalytics = async (req, res) => {
  try {
    // ============================================================
    // TOTALS
    // ============================================================
    const totalsResult = await pool.query(`
      SELECT
        COUNT(*) AS total_payments,
        COUNT(*) FILTER (
          WHERE status = 'paid'
        ) AS paid_payments,
        COUNT(*) FILTER (
          WHERE status = 'pending'
        ) AS pending_payments,
        COUNT(*) FILTER (
          WHERE status = 'failed'
        ) AS failed_payments,
        COUNT(*) FILTER (
          WHERE status = 'refunded'
        ) AS refunded_payments,
        COALESCE(
          SUM(amount) FILTER (
            WHERE status = 'paid'
          ),
          0
        ) AS total_revenue,
        COALESCE(
          SUM(amount) FILTER (
            WHERE status = 'refunded'
          ),
          0
        ) AS total_refunded
      FROM payments
    `);

    // ============================================================
    // DAILY REVENUE - LAST 7 DAYS
    // ============================================================
    const dailyResult = await pool.query(`
      SELECT
        day::date AS date,
        COALESCE(
          SUM(
            CASE
              WHEN p.status = 'paid'
              THEN p.amount
              ELSE 0
            END
          ),
          0
        ) AS revenue
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS day
      LEFT JOIN payments p
        ON p.created_at::date = day::date
      GROUP BY day::date
      ORDER BY day::date ASC
    `);

    // ============================================================
    // RESPONSE
    // ============================================================
    return res.status(200).json({
      success: true,
      analytics: {
        ...totalsResult.rows[0],
        daily_revenue: dailyResult.rows.map((row) => ({
          date: row.date,
          revenue: Number(row.revenue) || 0,
        })),
      },
    });
  } catch (error) {
    console.error(
      "GET REVENUE ANALYTICS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get revenue analytics",
    });
  }
};


// ========================================
// GET PITCH ANALYTICS
// ========================================

const getPitchAnalytics = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        p.id AS pitch_id,
        p.name AS pitch_name,
        u.full_name AS owner_name,
        COUNT(DISTINCT b.id) AS total_bookings,
        COUNT(DISTINCT b.id) FILTER (
          WHERE b.status = 'confirmed'
        ) AS confirmed_bookings,
        COUNT(DISTINCT b.id) FILTER (
          WHERE b.status = 'completed'
        ) AS completed_bookings,
        COALESCE(
          SUM(pay.amount) FILTER (
            WHERE pay.status = 'paid'
          ),
          0
        ) AS total_revenue
      FROM pitches p
      LEFT JOIN owners o
        ON o.id = p.owner_id
      LEFT JOIN users u
        ON u.id = o.user_id
      LEFT JOIN pitch_slots ps
        ON ps.pitch_id = p.id
      LEFT JOIN bookings b
        ON b.pitch_slot_id = ps.id
      LEFT JOIN payments pay
        ON pay.booking_id = b.id
      GROUP BY
        p.id,
        p.name,
        u.full_name
      ORDER BY total_bookings DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      analytics: result.rows
    });

  } catch (error) {

    console.error("GET PITCH ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get pitch analytics"
    });
  }
};


// ========================================
// GET USER ANALYTICS
// ========================================

const getUserAnalytics = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (
          WHERE role = 'admin'
        ) AS total_admins,
        COUNT(*) FILTER (
          WHERE role = 'player'
        ) AS total_players,
        COUNT(*) FILTER (
          WHERE role = 'owner'
        ) AS total_owners,
        COUNT(*) FILTER (
          WHERE role = 'coach'
        ) AS total_coaches,
        COUNT(*) FILTER (
          WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
        ) AS new_users_last_7_days,
        COUNT(*) FILTER (
          WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        ) AS new_users_last_30_days
      FROM users
    `);

    return res.status(200).json({
      success: true,
      analytics: result.rows[0]
    });

  } catch (error) {

    console.error("GET USER ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get user analytics"
    });
  }
};


// ========================================
// GET ACADEMY ANALYTICS
// ========================================

const getAcademyAnalytics = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT a.id) AS total_academies,
        COUNT(DISTINCT a.id) FILTER (
          WHERE a.status = 'approved'
        ) AS approved_academies,
        COUNT(DISTINCT a.id) FILTER (
          WHERE a.status = 'inactive'
        ) AS inactive_academies,
        COUNT(DISTINCT ap.id) AS total_programs,
        COUNT(DISTINCT ae.id) AS total_enrollments
      FROM academies a
      LEFT JOIN academy_programs ap
        ON ap.academy_id = a.id
      LEFT JOIN academy_enrollment ae
        ON ae.academy_id = a.id
    `);

    return res.status(200).json({
      success: true,
      analytics: result.rows[0]
    });

  } catch (error) {

    console.error("GET ACADEMY ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy analytics"
    });
  }
};


// ========================================
// GET PLAYER ANALYTICS
// ========================================

const getPlayerAnalytics = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT u.id) AS total_players,
        COUNT(DISTINCT pp.id) AS players_with_profile,
        COALESCE(SUM(ps.matches_played), 0) AS total_matches_played,
        COALESCE(SUM(ps.goals), 0) AS total_goals,
        COALESCE(SUM(ps.assists), 0) AS total_assists,
        COALESCE(SUM(ps.wins), 0) AS total_wins,
        COALESCE(SUM(ps.losses), 0) AS total_losses
      FROM users u
      LEFT JOIN player_profiles pp
        ON pp.user_id = u.id
      LEFT JOIN player_statistics ps
        ON ps.player_id = u.id
      WHERE u.role = 'player'
    `);

    return res.status(200).json({
      success: true,
      analytics: result.rows[0]
    });

  } catch (error) {

    console.error("GET PLAYER ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get player analytics"
    });
  }
};


// ========================================
// GET COACH ANALYTICS
// ========================================

const getCoachAnalytics = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT c.id) AS total_coaches,

        COUNT(DISTINCT c.id) FILTER (
          WHERE c.is_approved = true
        ) AS approved_coaches,

        COUNT(DISTINCT c.id) FILTER (
          WHERE c.is_private = true
        ) AS private_coaches,

        COUNT(DISTINCT c.id) FILTER (
          WHERE c.is_private = false
        ) AS public_coaches,

        COUNT(DISTINCT cp.id) AS coaches_with_profile,

        COALESCE(
          ROUND(AVG(c.experience_years), 2),
          0
        ) AS average_experience_years,

        COALESCE(
          ROUND(AVG(c.hourly_rate), 2),
          0
        ) AS average_hourly_rate

      FROM coaches c

      LEFT JOIN coach_profiles cp
        ON cp.coach_id = c.id
    `);

    return res.status(200).json({
      success: true,
      analytics: result.rows[0]
    });

  } catch (error) {

    console.error("GET COACH ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get coach analytics"
    });
  }
};


// ========================================
// GET REVIEWS ANALYTICS
// ========================================

const getReviewsAnalytics = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_reviews,
        COALESCE(
          ROUND(AVG(rating), 2),
          0
        ) AS average_rating,
        COUNT(*) FILTER (
          WHERE rating = 5
        ) AS five_star_reviews,
        COUNT(*) FILTER (
          WHERE rating = 4
        ) AS four_star_reviews,
        COUNT(*) FILTER (
          WHERE rating = 3
        ) AS three_star_reviews,
        COUNT(*) FILTER (
          WHERE rating = 2
        ) AS two_star_reviews,
        COUNT(*) FILTER (
          WHERE rating = 1
        ) AS one_star_reviews
      FROM reviews
    `);

    return res.status(200).json({
      success: true,
      analytics: result.rows[0]
    });

  } catch (error) {

    console.error("GET REVIEWS ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get reviews analytics"
    });
  }
};


// ========================================
// UPDATE COACH APPROVAL STATUS
// ========================================

const updateCoachApprovalStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { is_approved } = req.body;

    if (typeof is_approved !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_approved must be a boolean"
      });
    }

    const result = await pool.query(
      `
      UPDATE coaches
      SET is_approved = $1
      WHERE id = $2
      RETURNING
        id,
        user_id,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved,
        created_at
      `,
      [is_approved, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: is_approved
        ? "Coach approved successfully"
        : "Coach unapproved successfully",
      coach: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE COACH APPROVAL STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach approval status"
    });
  }
};


// ========================================
// UPDATE COACH VISIBILITY
// ========================================

const updateCoachVisibility = async (req, res) => {
  try {

    const { id } = req.params;
    const { is_private } = req.body;

    if (typeof is_private !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_private must be a boolean"
      });
    }

    const result = await pool.query(
      `
      UPDATE coaches
      SET is_private = $1
      WHERE id = $2
      RETURNING
        id,
        user_id,
        experience_years,
        hourly_rate,
        bio,
        is_private,
        is_approved,
        created_at
      `,
      [is_private, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: is_private
        ? "Coach set to private successfully"
        : "Coach set to public successfully",
      coach: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE COACH VISIBILITY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update coach visibility"
    });
  }
};


// ========================================================================
// ACADEMY PROGRAMS
// ========================================================================

const VALID_PROGRAM_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "professional"
];

// ========================================
// CREATE PROGRAM
// ========================================

const createProgram = async (req, res) => {
  try {

    const { academyId } = req.params;

    const {
      name,
      description,
      level,
      price,
      duration_weeks
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!name || !isNonEmptyString(name)) {
      return res.status(400).json({
        success: false,
        message: "name is required and must be a non-empty string"
      });
    }

    if (
      level !== undefined &&
      level !== null &&
      !VALID_PROGRAM_LEVELS.includes(String(level).toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid program level",
        allowed_levels: VALID_PROGRAM_LEVELS
      });
    }

    if (
      price !== undefined &&
      price !== null &&
      !isNonNegativeNumber(Number(price))
    ) {
      return res.status(400).json({
        success: false,
        message: "price must be a non-negative number"
      });
    }

    if (
      duration_weeks !== undefined &&
      duration_weeks !== null &&
      !isPositiveNumber(Number(duration_weeks))
    ) {
      return res.status(400).json({
        success: false,
        message: "duration_weeks must be a positive number"
      });
    }

    // ========================================
    // CHECK ACADEMY
    // ========================================

    const academyCheck = await pool.query(
      `
      SELECT id
      FROM academies
      WHERE id = $1
      `,
      [academyId]
    );

    if (academyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO academy_programs
      (
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      )
      VALUES
      ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      `,
      [
        academyId,
        name.trim(),
        description || null,
        level || null,
        price || null,
        duration_weeks || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Program created successfully",
      program: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE PROGRAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create program"
    });
  }
};


// ========================================
// GET ALL PROGRAMS (BY ACADEMY)
// ========================================

const getAllPrograms = async (req, res) => {
  try {

    const { academyId } = req.params;

    const result = await pool.query(
      `
      SELECT
        ap.id,
        ap.academy_id,
        a.name AS academy_name,
        ap.name,
        ap.description,
        ap.level,
        ap.price,
        ap.duration_weeks
      FROM academy_programs ap
      INNER JOIN academies a
        ON a.id = ap.academy_id
      WHERE ap.academy_id = $1
      ORDER BY ap.id ASC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      programs: result.rows
    });

  } catch (error) {

    console.error("GET ALL PROGRAMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get programs"
    });
  }
};


// ========================================
// GET PROGRAM BY ID
// ========================================

const getProgramById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        ap.id,
        ap.academy_id,
        a.name AS academy_name,
        ap.name,
        ap.description,
        ap.level,
        ap.price,
        ap.duration_weeks
      FROM academy_programs ap
      INNER JOIN academies a
        ON a.id = ap.academy_id
      WHERE ap.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found"
      });
    }

    return res.status(200).json({
      success: true,
      program: result.rows[0]
    });

  } catch (error) {

    console.error("GET PROGRAM BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get program"
    });
  }
};


// ========================================
// UPDATE PROGRAM
// ========================================

const updateProgram = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      name,
      description,
      level,
      price,
      duration_weeks
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      name !== undefined &&
      name !== null &&
      !isNonEmptyString(name)
    ) {
      return res.status(400).json({
        success: false,
        message: "name must be a non-empty string"
      });
    }

    if (
      level !== undefined &&
      level !== null &&
      !VALID_PROGRAM_LEVELS.includes(String(level).toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid program level",
        allowed_levels: VALID_PROGRAM_LEVELS
      });
    }

    if (
      price !== undefined &&
      price !== null &&
      !isNonNegativeNumber(Number(price))
    ) {
      return res.status(400).json({
        success: false,
        message: "price must be a non-negative number"
      });
    }

    if (
      duration_weeks !== undefined &&
      duration_weeks !== null &&
      !isPositiveNumber(Number(duration_weeks))
    ) {
      return res.status(400).json({
        success: false,
        message: "duration_weeks must be a positive number"
      });
    }

    const result = await pool.query(
      `
      UPDATE academy_programs
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        level = COALESCE($3, level),
        price = COALESCE($4, price),
        duration_weeks = COALESCE($5, duration_weeks)
      WHERE id = $6
      RETURNING
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      `,
      [
        name !== undefined ? name.trim() : null,
        description !== undefined ? description : null,
        level !== undefined ? level : null,
        price !== undefined ? price : null,
        duration_weeks !== undefined ? duration_weeks : null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Program updated successfully",
      program: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE PROGRAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update program"
    });
  }
};


// ========================================
// DELETE PROGRAM
// ========================================

const deleteProgram = async (req, res) => {
  try {

    const { id } = req.params;

    // ========================================
    // CHECK ENROLLMENTS
    // ========================================

    const enrollmentsResult = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM academy_enrollment
      WHERE program_id = $1
      `,
      [id]
    );

    if (Number(enrollmentsResult.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        message: "Program cannot be deleted because it has enrollments"
      });
    }

    const result = await pool.query(
      `
      DELETE FROM academy_programs
      WHERE id = $1
      RETURNING
        id,
        academy_id,
        name
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Program not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Program deleted successfully",
      program: result.rows[0]
    });

  } catch (error) {

    console.error("DELETE PROGRAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete program"
    });
  }
};


// ========================================================================
// ACADEMY COACHES
// ========================================================================

// ========================================
// ASSIGN COACH TO ACADEMY
// ========================================

const assignCoachToAcademy = async (req, res) => {
  try {

    const { academyId } = req.params;
    const { coach_id, role } = req.body;

    if (!coach_id) {
      return res.status(400).json({
        success: false,
        message: "coach_id is required"
      });
    }

    if (!isPositiveNumber(Number(coach_id))) {
      return res.status(400).json({
        success: false,
        message: "coach_id must be a valid positive number"
      });
    }

    if (
      role !== undefined &&
      role !== null &&
      !isNonEmptyString(role)
    ) {
      return res.status(400).json({
        success: false,
        message: "role must be a non-empty string"
      });
    }

    // ========================================
    // CHECK ACADEMY
    // ========================================

    const academyCheck = await pool.query(
      `SELECT id FROM academies WHERE id = $1`,
      [academyId]
    );

    if (academyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    // ========================================
    // CHECK COACH
    // ========================================

    const coachCheck = await pool.query(
      `SELECT id FROM coaches WHERE id = $1`,
      [coach_id]
    );

    if (coachCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coach not found"
      });
    }

    // ========================================
    // CHECK EXISTING ASSIGNMENT
    // ========================================

    const existingResult = await pool.query(
      `
      SELECT id
      FROM academy_coaches
      WHERE academy_id = $1
      AND coach_id = $2
      `,
      [academyId, coach_id]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Coach is already assigned to this academy"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO academy_coaches
      (
        academy_id,
        coach_id,
        role,
        assigned_at
      )
      VALUES
      ($1, $2, $3, NOW())
      RETURNING
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      `,
      [academyId, coach_id, role || null]
    );

    return res.status(201).json({
      success: true,
      message: "Coach assigned to academy successfully",
      academy_coach: result.rows[0]
    });

  } catch (error) {

    console.error("ASSIGN COACH TO ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to assign coach to academy"
    });
  }
};


// ========================================
// GET ACADEMY COACHES
// ========================================

const getAcademyCoaches = async (req, res) => {
  try {

    const { academyId } = req.params;

    const result = await pool.query(
      `
      SELECT
        ac.id,
        ac.academy_id,
        ac.coach_id,
        u.full_name AS coach_name,
        u.email AS coach_email,
        u.phone AS coach_phone,
        c.experience_years,
        c.hourly_rate,
        c.is_approved,
        ac.role,
        ac.assigned_at
      FROM academy_coaches ac
      INNER JOIN coaches c
        ON c.id = ac.coach_id
      INNER JOIN users u
        ON u.id = c.user_id
      WHERE ac.academy_id = $1
      ORDER BY ac.assigned_at DESC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      coaches: result.rows
    });

  } catch (error) {

    console.error("GET ACADEMY COACHES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy coaches"
    });
  }
};


// ========================================
// GET ACADEMY COACH DETAILS
// ========================================

const getAcademyCoachDetails = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        ac.id,
        ac.academy_id,
        a.name AS academy_name,
        ac.coach_id,
        u.full_name AS coach_name,
        u.email AS coach_email,
        u.phone AS coach_phone,
        c.experience_years,
        c.hourly_rate,
        c.bio,
        c.is_approved,
        c.is_private,
        ac.role,
        ac.assigned_at
      FROM academy_coaches ac
      INNER JOIN academies a
        ON a.id = ac.academy_id
      INNER JOIN coaches c
        ON c.id = ac.coach_id
      INNER JOIN users u
        ON u.id = c.user_id
      WHERE ac.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy coach not found"
      });
    }

    return res.status(200).json({
      success: true,
      coach: result.rows[0]
    });

  } catch (error) {

    console.error("GET ACADEMY COACH DETAILS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy coach details"
    });
  }
};


// ========================================
// UPDATE ACADEMY COACH
// ========================================

const updateAcademyCoach = async (req, res) => {
  try {

    const { id } = req.params;
    const { role } = req.body;

    if (
      role !== undefined &&
      role !== null &&
      !isNonEmptyString(role)
    ) {
      return res.status(400).json({
        success: false,
        message: "role must be a non-empty string"
      });
    }

    const result = await pool.query(
      `
      UPDATE academy_coaches
      SET role = COALESCE($1, role)
      WHERE id = $2
      RETURNING
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      `,
      [role !== undefined ? role : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy coach not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Academy coach updated successfully",
      academy_coach: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE ACADEMY COACH ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update academy coach"
    });
  }
};


// ========================================
// REMOVE COACH FROM ACADEMY
// ========================================

const removeCoachFromAcademy = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM academy_coaches
      WHERE id = $1
      RETURNING
        id,
        academy_id,
        coach_id,
        role,
        assigned_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy coach not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coach removed from academy successfully",
      academy_coach: result.rows[0]
    });

  } catch (error) {

    console.error("REMOVE COACH FROM ACADEMY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove coach from academy"
    });
  }
};


// ========================================================================
// ACADEMY PLAYERS / ENROLLMENTS
// ========================================================================

// ========================================
// GET ACADEMY PLAYERS (ENROLLMENTS)
// ========================================

const getAcademyPlayers = async (req, res) => {
  try {

    const { academyId } = req.params;

    const result = await pool.query(
      `
      SELECT
        ae.id AS enrollment_id,
        ae.academy_id,
        ae.program_id,
        ap.name AS program_name,
        ae.player_id,
        u.full_name AS player_name,
        u.email AS player_email,
        u.phone AS player_phone,
        ae.status,
        ae.enrolled_at
      FROM academy_enrollment ae
      INNER JOIN users u
        ON u.id = ae.player_id
      LEFT JOIN academy_programs ap
        ON ap.id = ae.program_id
      WHERE ae.academy_id = $1
      ORDER BY ae.enrolled_at DESC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      players: result.rows
    });

  } catch (error) {

    console.error("GET ACADEMY PLAYERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy players"
    });
  }
};


// ========================================
// GET PLAYER ENROLLMENT DETAILS
// ========================================

const getEnrollmentById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        ae.id AS enrollment_id,
        ae.academy_id,
        a.name AS academy_name,
        ae.program_id,
        ap.name AS program_name,
        ap.price AS program_price,
        ap.duration_weeks,
        ae.player_id,
        u.full_name AS player_name,
        u.email AS player_email,
        u.phone AS player_phone,
        ae.status,
        ae.enrolled_at
      FROM academy_enrollment ae
      INNER JOIN academies a
        ON a.id = ae.academy_id
      INNER JOIN users u
        ON u.id = ae.player_id
      LEFT JOIN academy_programs ap
        ON ap.id = ae.program_id
      WHERE ae.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found"
      });
    }

    return res.status(200).json({
      success: true,
      enrollment: result.rows[0]
    });

  } catch (error) {

    console.error("GET ENROLLMENT BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get enrollment"
    });
  }
};


// ========================================
// CREATE ENROLLMENT
// ========================================

const createEnrollment = async (req, res) => {
  try {

    const { academyId } = req.params;
    const { program_id, player_id } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!player_id) {
      return res.status(400).json({
        success: false,
        message: "player_id is required"
      });
    }

    if (!isPositiveNumber(Number(player_id))) {
      return res.status(400).json({
        success: false,
        message: "player_id must be a valid positive number"
      });
    }

    if (
      program_id !== undefined &&
      program_id !== null &&
      !isPositiveNumber(Number(program_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "program_id must be a valid positive number"
      });
    }

    // ========================================
    // CHECK ACADEMY
    // ========================================

    const academyCheck = await pool.query(
      `SELECT id FROM academies WHERE id = $1`,
      [academyId]
    );

    if (academyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    // ========================================
    // CHECK PLAYER
    // ========================================

    const playerCheck = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      AND role = 'player'
      `,
      [player_id]
    );

    if (playerCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    // ========================================
    // CHECK PROGRAM (IF PROVIDED)
    // ========================================

    if (program_id) {
      const programCheck = await pool.query(
        `
        SELECT id
        FROM academy_programs
        WHERE id = $1
        AND academy_id = $2
        `,
        [program_id, academyId]
      );

      if (programCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Program not found for this academy"
        });
      }
    }

    // ========================================
    // PREVENT DUPLICATE ENROLLMENT
    // ========================================

    const duplicateCheck = await pool.query(
      `
      SELECT id
      FROM academy_enrollment
      WHERE academy_id = $1
      AND player_id = $2
      AND status IN ('pending', 'approved')
      `,
      [academyId, player_id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Player already has a pending or approved enrollment in this academy"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO academy_enrollment
      (
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at
      )
      VALUES
      ($1, $2, $3, 'pending', NOW())
      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at
      `,
      [academyId, program_id || null, player_id]
    );

    return res.status(201).json({
      success: true,
      message: "Enrollment created successfully",
      enrollment: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create enrollment"
    });
  }
};


// ========================================
// APPROVE ENROLLMENT
// ========================================

const approveEnrollment = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academy_enrollment
      SET status = 'approved'
      WHERE id = $1
      AND status = 'pending'
      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending enrollment not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Enrollment approved successfully",
      enrollment: result.rows[0]
    });

  } catch (error) {

    console.error("APPROVE ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve enrollment"
    });
  }
};


// ========================================
// REJECT ENROLLMENT
// ========================================

const rejectEnrollment = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academy_enrollment
      SET status = 'rejected'
      WHERE id = $1
      AND status = 'pending'
      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pending enrollment not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Enrollment rejected successfully",
      enrollment: result.rows[0]
    });

  } catch (error) {

    console.error("REJECT ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject enrollment"
    });
  }
};


// ========================================
// REMOVE / CANCEL ENROLLMENT
// ========================================

const cancelEnrollment = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE academy_enrollment
      SET status = 'cancelled'
      WHERE id = $1
      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Enrollment cancelled successfully",
      enrollment: result.rows[0]
    });

  } catch (error) {

    console.error("CANCEL ENROLLMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel enrollment"
    });
  }
};


// ========================================================================
// ACADEMY SCHEDULE
// ========================================================================

// ========================================
// CREATE SCHEDULE
// ========================================

const createSchedule = async (req, res) => {
  try {

    const { academyId } = req.params;

    const {
      program_id,
      day_of_week,
      start_time,
      end_time,
      location
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (!day_of_week || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "day_of_week, start_time and end_time are required"
      });
    }

    if (!VALID_DAYS_OF_WEEK.includes(String(day_of_week).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid day_of_week",
        allowed_days: VALID_DAYS_OF_WEEK
      });
    }

    if (!isValidTimeString(start_time)) {
      return res.status(400).json({
        success: false,
        message: "start_time must be a valid time (HH:MM)"
      });
    }

    if (!isValidTimeString(end_time)) {
      return res.status(400).json({
        success: false,
        message: "end_time must be a valid time (HH:MM)"
      });
    }

    if (start_time >= end_time) {
      return res.status(400).json({
        success: false,
        message: "start_time must be earlier than end_time"
      });
    }

    if (
      program_id !== undefined &&
      program_id !== null &&
      !isPositiveNumber(Number(program_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "program_id must be a valid positive number"
      });
    }

    // ========================================
    // CHECK ACADEMY
    // ========================================

    const academyCheck = await pool.query(
      `SELECT id FROM academies WHERE id = $1`,
      [academyId]
    );

    if (academyCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Academy not found"
      });
    }

    const result = await pool.query(
      `
      INSERT INTO academy_schedule
      (
        academy_id,
        program_id,
        day_of_week,
        start_time,
        end_time,
        location,
        created_at
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING
        id,
        academy_id,
        program_id,
        day_of_week,
        start_time,
        end_time,
        location,
        created_at
      `,
      [
        academyId,
        program_id || null,
        day_of_week,
        start_time,
        end_time,
        location || null
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Schedule created successfully",
      schedule: result.rows[0]
    });

  } catch (error) {

    console.error("CREATE SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create schedule"
    });
  }
};


// ========================================
// GET ACADEMY SCHEDULE
// ========================================

const getAcademySchedule = async (req, res) => {
  try {

    const { academyId } = req.params;

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.academy_id,
        s.program_id,
        ap.name AS program_name,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.location,
        s.created_at
      FROM academy_schedule s
      LEFT JOIN academy_programs ap
        ON ap.id = s.program_id
      WHERE s.academy_id = $1
      ORDER BY s.day_of_week ASC, s.start_time ASC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      schedule: result.rows
    });

  } catch (error) {

    console.error("GET ACADEMY SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy schedule"
    });
  }
};


// ========================================
// GET SCHEDULE BY ID
// ========================================

const getScheduleById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        s.id,
        s.academy_id,
        a.name AS academy_name,
        s.program_id,
        ap.name AS program_name,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.location,
        s.created_at
      FROM academy_schedule s
      INNER JOIN academies a
        ON a.id = s.academy_id
      LEFT JOIN academy_programs ap
        ON ap.id = s.program_id
      WHERE s.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found"
      });
    }

    return res.status(200).json({
      success: true,
      schedule: result.rows[0]
    });

  } catch (error) {

    console.error("GET SCHEDULE BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get schedule"
    });
  }
};


// ========================================
// UPDATE SCHEDULE
// ========================================

const updateSchedule = async (req, res) => {
  try {

    const { id } = req.params;

    const {
      program_id,
      day_of_week,
      start_time,
      end_time,
      location
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      day_of_week !== undefined &&
      day_of_week !== null &&
      !VALID_DAYS_OF_WEEK.includes(String(day_of_week).toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid day_of_week",
        allowed_days: VALID_DAYS_OF_WEEK
      });
    }

    if (
      start_time !== undefined &&
      start_time !== null &&
      !isValidTimeString(start_time)
    ) {
      return res.status(400).json({
        success: false,
        message: "start_time must be a valid time (HH:MM)"
      });
    }

    if (
      end_time !== undefined &&
      end_time !== null &&
      !isValidTimeString(end_time)
    ) {
      return res.status(400).json({
        success: false,
        message: "end_time must be a valid time (HH:MM)"
      });
    }

    if (
      start_time &&
      end_time &&
      isValidTimeString(start_time) &&
      isValidTimeString(end_time) &&
      start_time >= end_time
    ) {
      return res.status(400).json({
        success: false,
        message: "start_time must be earlier than end_time"
      });
    }

    if (
      program_id !== undefined &&
      program_id !== null &&
      !isPositiveNumber(Number(program_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "program_id must be a valid positive number"
      });
    }

    // ========================================
    // CHECK EXISTING SCHEDULE (for cross-field time check)
    // ========================================

    const existingResult = await pool.query(
      `
      SELECT start_time, end_time
      FROM academy_schedule
      WHERE id = $1
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found"
      });
    }

    const existingSchedule = existingResult.rows[0];
    const effectiveStartTime = start_time || existingSchedule.start_time;
    const effectiveEndTime = end_time || existingSchedule.end_time;

    if (effectiveStartTime >= effectiveEndTime) {
      return res.status(400).json({
        success: false,
        message: "start_time must be earlier than end_time"
      });
    }

    const result = await pool.query(
      `
      UPDATE academy_schedule
      SET
        program_id = COALESCE($1, program_id),
        day_of_week = COALESCE($2, day_of_week),
        start_time = COALESCE($3, start_time),
        end_time = COALESCE($4, end_time),
        location = COALESCE($5, location)
      WHERE id = $6
      RETURNING
        id,
        academy_id,
        program_id,
        day_of_week,
        start_time,
        end_time,
        location,
        created_at
      `,
      [
        program_id !== undefined ? program_id : null,
        day_of_week !== undefined ? day_of_week : null,
        start_time !== undefined ? start_time : null,
        end_time !== undefined ? end_time : null,
        location !== undefined ? location : null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Schedule updated successfully",
      schedule: result.rows[0]
    });

  } catch (error) {

    console.error("UPDATE SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update schedule"
    });
  }
};


// ========================================
// DELETE SCHEDULE
// ========================================

const deleteSchedule = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM academy_schedule
      WHERE id = $1
      RETURNING
        id,
        academy_id,
        program_id,
        day_of_week,
        start_time,
        end_time,
        location,
        created_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Schedule deleted successfully",
      schedule: result.rows[0]
    });

  } catch (error) {

    console.error("DELETE SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete schedule"
    });
  }
};
// ========================================================================
// ADMIN REVIEWS
// ========================================================================

// ========================================
// GET ALL REVIEWS
// ========================================

const getAllReviews = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        r.id,

        r.player_id AS user_id,
        COALESCE(u.full_name, '') AS user_name,
        COALESCE(u.email, '') AS user_email,

        r.pitch_id,
        COALESCE(p.name, '') AS pitch_name,

        r.rating,
        COALESCE(r.comment, '') AS comment,

        r.is_hidden,
        r.created_at

      FROM reviews r

      LEFT JOIN users u
        ON u.id = r.player_id

      LEFT JOIN pitches p
        ON p.id = r.pitch_id

      ORDER BY r.created_at DESC
      `
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reviews: result.rows
    });

  } catch (error) {
    console.error("GET ALL REVIEWS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get reviews"
    });
  }
};
// ========================================
// GET ACADEMY REVIEWS
// ========================================

const getAcademyReviews = async (req, res) => {
  try {
    const { academyId } = req.params;

    const result = await pool.query(
      `
      SELECT
        r.id,
        a.id AS academy_id,
        a.name AS academy_name,
        r.pitch_id,
        p.name AS pitch_name,
        r.player_id,
        u.full_name AS reviewer_name,
        u.email AS reviewer_email,
        r.booking_id,
        r.rating,
        r.comment,
        r.is_hidden,
        r.created_at
      FROM reviews r
      INNER JOIN academies a
        ON a.pitch_id = r.pitch_id
      INNER JOIN pitches p
        ON p.id = r.pitch_id
      INNER JOIN users u
        ON u.id = r.player_id
      WHERE a.id = $1
      ORDER BY r.created_at DESC
      `,
      [academyId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      reviews: result.rows
    });

  } catch (error) {
    console.error("GET ACADEMY REVIEWS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get academy reviews"
    });
  }
};


// ========================================
// GET REVIEW DETAILS
// ========================================

const getReviewById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        r.id,
        a.id AS academy_id,
        a.name AS academy_name,
        r.pitch_id,
        p.name AS pitch_name,
        r.player_id,
        u.full_name AS reviewer_name,
        u.email AS reviewer_email,
        r.booking_id,
        r.rating,
        r.comment,
        r.is_hidden,
        r.created_at
      FROM reviews r
      INNER JOIN academies a
        ON a.pitch_id = r.pitch_id
      INNER JOIN users u
        ON u.id = r.player_id
      LEFT JOIN pitches p
        ON p.id = r.pitch_id
      WHERE r.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    return res.status(200).json({
      success: true,
      review: result.rows[0]
    });

  } catch (error) {
    console.error("GET REVIEW BY ID ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get review"
    });
  }
};


// ========================================
// HIDE / UNHIDE REVIEW
// ========================================

const updateReviewVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_hidden } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (typeof is_hidden !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_hidden must be a boolean"
      });
    }

    // ========================================
    // UPDATE REVIEW
    // ========================================

    const result = await pool.query(
      `
      UPDATE reviews
      SET is_hidden = $1
      WHERE id = $2
      RETURNING
        id,
        player_id,
        pitch_id,
        booking_id,
        rating,
        comment,
        is_hidden,
        created_at
      `,
      [is_hidden, id]
    );

    // ========================================
    // REVIEW NOT FOUND
    // ========================================

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    // ========================================
    // SUCCESS
    // ========================================

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "review",
      entityId: id,
      description: is_hidden
        ? "Hidden review"
        : "Unhidden review",
      metadata: {
        operation: is_hidden
          ? "hide_review"
          : "unhide_review",
        review_id: Number(id),
        is_hidden,
      },
    });

    return res.status(200).json({
      success: true,
      message: is_hidden
        ? "Review hidden successfully"
        : "Review unhidden successfully",
      review: result.rows[0]
    });

  } catch (error) {

    console.error(
      "UPDATE REVIEW VISIBILITY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update review visibility"
    });
  }
};

// ========================================================================
// COMPLAINTS
// ========================================================================

// ========================================
// GET ALL COMPLAINTS
// ========================================

const getAllComplaints = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        c.title,
        c.description,
        c.status,
        c.created_at,
        c.updated_at
      FROM complaints c
      INNER JOIN users u
        ON u.id = c.user_id
      ORDER BY c.created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      complaints: result.rows,
    });
  } catch (error) {
    console.error(
      "GET ALL COMPLAINTS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get complaints",
    });
  }
};


// ========================================
// GET COMPLAINT BY ID
// ========================================

const getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        c.title,
        c.description,
        c.status,
        c.created_at,
        c.updated_at
      FROM complaints c
      INNER JOIN users u
        ON u.id = c.user_id
      WHERE c.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    return res.status(200).json({
      success: true,
      complaint: result.rows[0],
    });
  } catch (error) {
    console.error(
      "GET COMPLAINT BY ID ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get complaint",
    });
  }
};


// ========================================
// CREATE COMPLAINT
// ========================================

const createComplaint = async (req, res) => {
  try {
    const {
      user_id,
      title,
      description,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }

    if (
      !title ||
      typeof title !== "string" ||
      title.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "title is required",
      });
    }

    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "description is required",
      });
    }

    const userCheck = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO complaints
      (
        user_id,
        title,
        description,
        status
      )
      VALUES
      (
        $1,
        $2,
        $3,
        'pending'
      )
      RETURNING
        id,
        user_id,
        title,
        description,
        status,
        created_at,
        updated_at
      `,
      [
        user_id,
        title.trim(),
        description.trim(),
      ]
    );
    await safeCreateActivityLog({
  adminId: req.user.userId,
  action: "create",
  entityType: "complaint",
  entityId: result.rows[0].id,
  description: `Created complaint: ${result.rows[0].title}`,
  metadata: {
    operation: "create_complaint",
    complaint_id: result.rows[0].id,
    user_id: result.rows[0].user_id,
  },
});

    return res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      complaint: result.rows[0],
    });
  } catch (error) {
    console.error(
      "CREATE COMPLAINT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create complaint",
    });
  }
};


// ========================================
// UPDATE COMPLAINT STATUS
// ========================================

const updateComplaintStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "investigating",
      "resolved",
    ];

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(
        status.toLowerCase()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint status",
        allowed_statuses: allowedStatuses,
      });
    }

    const normalizedStatus =
      status.toLowerCase();

    const result = await pool.query(
      `
      UPDATE complaints
      SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        user_id,
        title,
        description,
        status,
        created_at,
        updated_at
      `,
      [
        normalizedStatus,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "complaint",
      entityId: id,
      description: `Changed complaint status to ${normalizedStatus}`,
      metadata: {
        operation: "update_complaint_status",
        complaint_id: Number(id),
        new_status: normalizedStatus,
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Complaint status updated successfully",
      complaint: result.rows[0],
    });
  } catch (error) {
    console.error(
      "UPDATE COMPLAINT STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update complaint status",
    });
  }
};


// ========================================
// DELETE COMPLAINT
// ========================================

const deleteComplaint = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM complaints
      WHERE id = $1
      RETURNING
        id,
        user_id,
        title,
        description,
        status,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "delete",
      entityType: "complaint",
      entityId: id,
      description: "Deleted complaint",
      metadata: {
        operation: "delete_complaint",
        complaint_id: Number(id),
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Complaint deleted successfully",
      complaint: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE COMPLAINT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete complaint",
    });
  }
};
// ========================================
// DELETE / REMOVE REVIEW
// ========================================

const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM reviews
      WHERE id = $1
      RETURNING
        id,
        player_id,
        pitch_id,
        booking_id,
        rating,
        comment,
        is_hidden,
        created_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Review not found"
      });
    }

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "delete",
      entityType: "review",
      entityId: id,
      description: "Deleted review",
      metadata: {
        operation: "delete_review",
        review_id: Number(id),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
      review: result.rows[0]
    });

  } catch (error) {
    console.error("DELETE REVIEW ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete review"
    });
  }
};
// ========================================================================
// ACTIVITY LOGS
// ========================================================================

// ========================================
// GET ALL ACTIVITY LOGS
// ========================================

const getAllActivityLogs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        al.id,
        al.admin_id,
        u.full_name AS admin_name,
        u.email AS admin_email,
        al.action,
        al.entity_type,
        al.entity_id,
        al.description,
        al.metadata,
        al.created_at
      FROM activity_logs al
      LEFT JOIN users u
        ON u.id = al.admin_id
      ORDER BY al.created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      logs: result.rows,
    });
  } catch (error) {
    console.error(
      "GET ALL ACTIVITY LOGS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get activity logs",
    });
  }
};


// ========================================
// GET ACTIVITY LOG BY ID
// ========================================

const getActivityLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        al.id,
        al.admin_id,
        u.full_name AS admin_name,
        u.email AS admin_email,
        al.action,
        al.entity_type,
        al.entity_id,
        al.description,
        al.metadata,
        al.created_at
      FROM activity_logs al
      LEFT JOIN users u
        ON u.id = al.admin_id
      WHERE al.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found",
      });
    }

    return res.status(200).json({
      success: true,
      log: result.rows[0],
    });
  } catch (error) {
    console.error(
      "GET ACTIVITY LOG BY ID ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get activity log",
    });
  }
};


// ========================================
// CREATE ACTIVITY LOG
// ========================================

const createActivityLog = async ({
  adminId = null,
  action,
  entityType = null,
  entityId = null,
  description,
  metadata = null,
}) => {
  try {
    const result = await pool.query(
      `
      INSERT INTO activity_logs
      (
        admin_id,
        action,
        entity_type,
        entity_id,
        description,
        metadata
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )
      RETURNING
        id,
        admin_id,
        action,
        entity_type,
        entity_id,
        description,
        metadata,
        created_at
      `,
      [
        adminId,
        action,
        entityType,
        entityId,
        description,
        metadata,
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error(
      "CREATE ACTIVITY LOG ERROR:",
      error
    );

    throw error;
  }
};
// ========================================
// SAFE ACTIVITY LOG
// ========================================

const safeCreateActivityLog = async ({
  adminId,
  action,
  entityType,
  entityId,
  description,
  metadata = null,
}) => {
  try {
    return await createActivityLog({
      adminId,
      action,
      entityType,
      entityId,
      description,
      metadata,
    });
  } catch (error) {
    console.error(
      "SAFE ACTIVITY LOG ERROR:",
      error
    );

    return null;
  }
};


// ========================================
// DELETE ACTIVITY LOG
// ========================================

const deleteActivityLog = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM activity_logs
      WHERE id = $1
      RETURNING
        id,
        admin_id,
        action,
        entity_type,
        entity_id,
        description,
        metadata,
        created_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Activity log not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Activity log deleted successfully",
      log: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE ACTIVITY LOG ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete activity log",
    });
  }
};
// ========================================================================
// COUPONS
// ========================================================================

// ========================================
// GET ALL COUPONS
// ========================================

const getAllCoupons = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        code,
        type,
        value,
        minimum_booking,
        usage_limit,
        used_count,
        active,
        start_date,
        end_date,
        created_at,
        updated_at
      FROM coupons
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      coupons: result.rows,
    });
  } catch (error) {
    console.error(
      "GET ALL COUPONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get coupons",
    });
  }
};


// ========================================
// GET COUPON BY ID
// ========================================

const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        code,
        type,
        value,
        minimum_booking,
        usage_limit,
        used_count,
        active,
        start_date,
        end_date,
        created_at,
        updated_at
      FROM coupons
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      coupon: result.rows[0],
    });
  } catch (error) {
    console.error(
      "GET COUPON BY ID ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to get coupon",
    });
  }
};


// ========================================
// CREATE COUPON
// ========================================

const createCoupon = async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minimum_booking,
      usage_limit,
      start_date,
      end_date,
      active,
    } = req.body;

    // ========================================
    // VALIDATION
    // ========================================

    if (
      typeof code !== "string" ||
      code.trim().isEmpty
    ) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const normalizedCode =
      code.trim().toUpperCase();

    if (
      type !== "percentage" &&
      type !== "fixed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon type must be percentage or fixed",
      });
    }

    if (
      typeof value !== "number" ||
      Number.isNaN(value) ||
      value <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon value must be greater than 0",
      });
    }

    if (
      type === "percentage" &&
      value > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Percentage value cannot exceed 100",
      });
    }

    if (
      minimum_booking !== undefined &&
      minimum_booking !== null &&
      (
        typeof minimum_booking !== "number" ||
        Number.isNaN(minimum_booking) ||
        minimum_booking < 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "minimum_booking must be a non-negative number",
      });
    }

    if (
      !Number.isInteger(usage_limit) ||
      usage_limit <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "usage_limit must be a positive integer",
      });
    }

    if (!isValidDateString(start_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid start_date",
      });
    }

    if (!isValidDateString(end_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid end_date",
      });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message:
          "end_date must be after start_date",
      });
    }

    // ========================================
    // CHECK DUPLICATE CODE
    // ========================================

    const existing = await pool.query(
      `
      SELECT id
      FROM coupons
      WHERE UPPER(code) = $1
      LIMIT 1
      `,
      [normalizedCode]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Coupon code already exists",
      });
    }

    // ========================================
    // INSERT
    // ========================================

    const result = await pool.query(
      `
      INSERT INTO coupons
      (
        code,
        type,
        value,
        minimum_booking,
        usage_limit,
        used_count,
        active,
        start_date,
        end_date
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        0,
        $6,
        $7,
        $8
      )
      RETURNING
        id,
        code,
        type,
        value,
        minimum_booking,
        usage_limit,
        used_count,
        active,
        start_date,
        end_date,
        created_at,
        updated_at
      `,
      [
        normalizedCode,
        type,
        value,
        minimum_booking ?? 0,
        usage_limit,
        active ?? true,
        startDate,
        endDate,
      ]
    );

    const coupon = result.rows[0];

    // ========================================
    // ACTIVITY LOG
    // ========================================

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "create",
      entityType: "coupon",
      entityId: coupon.id,
      description: "Created coupon",
      metadata: {
        operation: "create_coupon",
        coupon_id: coupon.id,
        code: coupon.code,
      },
    });

    return res.status(201).json({
      success: true,
      message:
        "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    console.error(
      "CREATE COUPON ERROR:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "Coupon code already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create coupon",
    });
  }
};


// ========================================
// UPDATE COUPON
// ========================================

const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      code,
      type,
      value,
      minimum_booking,
      usage_limit,
      start_date,
      end_date,
      active,
    } = req.body;

    if (
      typeof code !== "string" ||
      code.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Coupon code is required",
      });
    }

    const normalizedCode =
      code.trim().toUpperCase();

    if (
      type !== "percentage" &&
      type !== "fixed"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon type must be percentage or fixed",
      });
    }

    if (
      typeof value !== "number" ||
      Number.isNaN(value) ||
      value <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Coupon value must be greater than 0",
      });
    }

    if (
      type === "percentage" &&
      value > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Percentage value cannot exceed 100",
      });
    }

    if (
      !Number.isInteger(usage_limit) ||
      usage_limit <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "usage_limit must be a positive integer",
      });
    }

    if (!isValidDateString(start_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid start_date",
      });
    }

    if (!isValidDateString(end_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid end_date",
      });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message:
          "end_date must be after start_date",
      });
    }

    // ========================================
    // CHECK EXISTING COUPON
    // ========================================

    const existingCoupon =
      await pool.query(
        `
        SELECT
          id,
          used_count
        FROM coupons
        WHERE id = $1
        `,
        [id]
      );

    if (
      existingCoupon.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const usedCount =
      existingCoupon.rows[0].used_count;

    if (usage_limit < usedCount) {
      return res.status(400).json({
        success: false,
        message:
          "usage_limit cannot be less than used_count",
      });
    }

    // ========================================
    // CHECK DUPLICATE CODE
    // ========================================

    const duplicate =
      await pool.query(
        `
        SELECT id
        FROM coupons
        WHERE UPPER(code) = $1
          AND id <> $2
        LIMIT 1
        `,
        [
          normalizedCode,
          id,
        ]
      );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Coupon code already exists",
      });
    }

    // ========================================
    // UPDATE
    // ========================================

    const result = await pool.query(
      `
      UPDATE coupons
      SET
        code = $1,
        type = $2,
        value = $3,
        minimum_booking = $4,
        usage_limit = $5,
        active = $6,
        start_date = $7,
        end_date = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING
        id,
        code,
        type,
        value,
        minimum_booking,
        usage_limit,
        used_count,
        active,
        start_date,
        end_date,
        created_at,
        updated_at
      `,
      [
        normalizedCode,
        type,
        value,
        minimum_booking ?? 0,
        usage_limit,
        active ?? true,
        startDate,
        endDate,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const coupon = result.rows[0];

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "coupon",
      entityId: coupon.id,
      description: "Updated coupon",
      metadata: {
        operation: "update_coupon",
        coupon_id: coupon.id,
        code: coupon.code,
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    console.error(
      "UPDATE COUPON ERROR:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "Coupon code already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update coupon",
    });
  }
};


// ========================================
// DELETE COUPON
// ========================================

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM coupons
      WHERE id = $1
      RETURNING
        id,
        code,
        type,
        value
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const coupon = result.rows[0];

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "delete",
      entityType: "coupon",
      entityId: coupon.id,
      description: "Deleted coupon",
      metadata: {
        operation: "delete_coupon",
        coupon_id: coupon.id,
        code: coupon.code,
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Coupon deleted successfully",
      coupon,
    });
  } catch (error) {
    console.error(
      "DELETE COUPON ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete coupon",
    });
  }
};


// ========================================
// TOGGLE COUPON STATUS
// ========================================

const toggleCouponStatus = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE coupons
      SET
        active = NOT active,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        code,
        type,
        value,
        minimum_booking,
        usage_limit,
        used_count,
        active,
        start_date,
        end_date,
        created_at,
        updated_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const coupon = result.rows[0];

    await safeCreateActivityLog({
      adminId: req.user.userId,
      action: "update",
      entityType: "coupon",
      entityId: coupon.id,
      description:
        "Changed coupon active status",
      metadata: {
        operation:
          "toggle_coupon_status",
        coupon_id: coupon.id,
        code: coupon.code,
        active: coupon.active,
      },
    });

    return res.status(200).json({
      success: true,
      message:
        "Coupon status updated successfully",
      coupon,
    });
  } catch (error) {
    console.error(
      "TOGGLE COUPON STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to update coupon status",
    });
  }
};
// ========================================
// ADMIN SELF PROFILE
// ========================================

// GET CURRENT ADMIN PROFILE
const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.userId;

    const result = await pool.query(
      `
      SELECT
        id,
        full_name,
        email,
        phone,
        profile_image,
        role,
        created_at,
        updated_at,
        is_active,
        is_verified
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("GET ADMIN PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get admin profile",
    });
  }
};


// UPDATE CURRENT ADMIN PROFILE
const updateAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.userId;

    const {
      full_name,
      email,
      phone,
      profile_image,
    } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({
        success: false,
        message: "Full name and email are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email belongs to another account
    const existingEmail = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
        AND id <> $2
      LIMIT 1
      `,
      [normalizedEmail, adminId]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET
        full_name = $1,
        email = $2,
        phone = $3,
        profile_image = $4,
        updated_at = NOW()
      WHERE id = $5
      RETURNING
        id,
        full_name,
        email,
        phone,
        profile_image,
        role,
        created_at,
        updated_at,
        is_active,
        is_verified
      `,
      [
        full_name.trim(),
        normalizedEmail,
        phone ? phone.trim() : null,
        profile_image || null,
        adminId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin profile updated successfully",
      profile: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE ADMIN PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update admin profile",
    });
  }
};


// UPDATE CURRENT ADMIN PASSWORD
const updateAdminPassword = async (req, res) => {
  try {
    const adminId = req.user.userId;

    const {
      current_password,
      new_password,
    } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found",
      });
    }

    const admin = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      current_password,
      admin.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const newPasswordHash = await bcrypt.hash(
      new_password,
      10
    );

    await pool.query(
      `
      UPDATE users
      SET
        password_hash = $1,
        updated_at = NOW()
      WHERE id = $2
      `,
      [
        newPasswordHash,
        adminId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("UPDATE ADMIN PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update password",
    });
  }
};
// ========================================
// ADMIN ROLES
// ========================================

// GET ALL ROLES
const getAllRoles = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        permissions,
        created_at,
        updated_at
      FROM roles
      ORDER BY id ASC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      roles: result.rows,
    });
  } catch (error) {
    console.error("GET ALL ROLES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get roles",
    });
  }
};


// CREATE ROLE
const createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Role name is required",
      });
    }

    if (
      permissions !== undefined &&
      (typeof permissions !== "object" ||
        Array.isArray(permissions) ||
        permissions === null)
    ) {
      return res.status(400).json({
        success: false,
        message: "permissions must be a valid object",
      });
    }

    const rolePermissions = permissions ?? {};

    const result = await pool.query(
      `
      INSERT INTO roles (
        name,
        permissions
      )
      VALUES ($1, $2::jsonb)
      RETURNING
        id,
        name,
        permissions,
        created_at,
        updated_at
      `,
      [
        name.trim(),
        JSON.stringify(rolePermissions),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Role created successfully",
      role: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE ROLE ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Role name already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create role",
    });
  }
};


// UPDATE ROLE
const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions } = req.body;

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid role id",
      });
    }

    if (
      name !== undefined &&
      (typeof name !== "string" || !name.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Role name must be a non-empty string",
      });
    }

    if (
      permissions !== undefined &&
      (typeof permissions !== "object" ||
        Array.isArray(permissions) ||
        permissions === null)
    ) {
      return res.status(400).json({
        success: false,
        message: "permissions must be a valid object",
      });
    }

    const result = await pool.query(
      `
      UPDATE roles
      SET
        name = COALESCE($1, name),
        permissions = COALESCE($2::jsonb, permissions),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING
        id,
        name,
        permissions,
        created_at,
        updated_at
      `,
      [
        name !== undefined
          ? name.trim()
          : null,
        permissions !== undefined
          ? JSON.stringify(permissions)
          : null,
        Number(id),
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Role updated successfully",
      role: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE ROLE ERROR:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Role name already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update role",
    });
  }
};


// DELETE ROLE
const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid role id",
      });
    }

    const result = await pool.query(
      `
      DELETE FROM roles
      WHERE id = $1
      RETURNING
        id,
        name
      `,
      [Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Role deleted successfully",
      role: result.rows[0],
    });
  } catch (error) {
    console.error("DELETE ROLE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete role",
    });
  }
};
// ========================================
// ADMIN SETTINGS
// ========================================

const getAdminSettings = async (req, res) => {
  try {
    const adminId =
      req.user?.id ??
      req.user?.userId ??
      req.user?.user_id ??
      req.user?.sub;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Admin identity not found",
      });
    }

    // Get admin settings
    const settingsResult = await pool.query(
      `
      SELECT
        notifications,
        dark_mode,
        language
      FROM admin_settings
      WHERE admin_id = $1
      `,
      [adminId]
    );

    // Create default settings automatically
    if (settingsResult.rows.length === 0) {
      await pool.query(
        `
        INSERT INTO admin_settings (
          admin_id,
          notifications,
          dark_mode,
          language
        )
        VALUES ($1, true, false, 'English')
        `,
        [adminId]
      );
    }

    const adminSettings =
      settingsResult.rows[0] ?? {
        notifications: true,
        dark_mode: false,
        language: "English",
      };

    // Get global maintenance mode
    const systemResult = await pool.query(
      `
      SELECT maintenance_mode
      FROM system_settings
      WHERE id = 1
      `
    );

    const maintenanceMode =
      systemResult.rows[0]?.maintenance_mode ?? false;

    return res.status(200).json({
      success: true,
      settings: {
        notifications: adminSettings.notifications,
        dark_mode: adminSettings.dark_mode,
        language: adminSettings.language,
        maintenance_mode: maintenanceMode,
      },
    });
  } catch (error) {
    console.error("GET ADMIN SETTINGS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get admin settings",
    });
  }
};


// UPDATE ADMIN SETTINGS
const updateAdminSettings = async (req, res) => {
  try {
    const adminId =
      req.user?.id ??
      req.user?.userId ??
      req.user?.user_id ??
      req.user?.sub;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Admin identity not found",
      });
    }

    const {
      notifications,
      dark_mode,
      language,
      maintenance_mode,
    } = req.body;

    // Validate booleans if provided
    if (
      notifications !== undefined &&
      typeof notifications !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "notifications must be boolean",
      });
    }

    if (
      dark_mode !== undefined &&
      typeof dark_mode !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "dark_mode must be boolean",
      });
    }

    if (
      maintenance_mode !== undefined &&
      typeof maintenance_mode !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "maintenance_mode must be boolean",
      });
    }

    if (language !== undefined) {
      if (
        typeof language !== "string" ||
        !["English", "Arabic"].includes(language)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid language",
        });
      }
    }

    // Make sure admin settings row exists
    await pool.query(
      `
      INSERT INTO admin_settings (
        admin_id
      )
      VALUES ($1)
      ON CONFLICT (admin_id) DO NOTHING
      `,
      [adminId]
    );

    // Update admin-specific settings
    await pool.query(
      `
      UPDATE admin_settings
      SET
        notifications = COALESCE(
          $1,
          notifications
        ),

        dark_mode = COALESCE(
          $2,
          dark_mode
        ),

        language = COALESCE(
          $3,
          language
        ),

        updated_at = CURRENT_TIMESTAMP

      WHERE admin_id = $4
      `,
      [
        notifications ?? null,
        dark_mode ?? null,
        language ?? null,
        adminId,
      ]
    );

    // Update global maintenance mode
    if (maintenance_mode !== undefined) {
      await pool.query(
        `
        INSERT INTO system_settings (
          id,
          maintenance_mode
        )
        VALUES (1, $1)

        ON CONFLICT (id)
        DO UPDATE SET
          maintenance_mode = EXCLUDED.maintenance_mode,
          updated_at = CURRENT_TIMESTAMP
        `,
        [maintenance_mode]
      );
    }

    // Return final settings
    const result = await pool.query(
      `
      SELECT
        a.notifications,
        a.dark_mode,
        a.language,
        s.maintenance_mode
      FROM admin_settings a

      CROSS JOIN system_settings s

      WHERE a.admin_id = $1
        AND s.id = 1
      `,
      [adminId]
    );

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      settings: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE ADMIN SETTINGS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update admin settings",
    });
  }
};
// ========================================
// SUPPORT TICKETS
// ========================================

// GET ALL SUPPORT TICKETS
const getAllSupportTickets = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        u.full_name AS user_name,
        t.subject,
        t.message,
        t.status,
        t.priority,
        t.assigned_admin_id,
        a.full_name AS assigned_admin,
        t.created_at,
        t.updated_at
      FROM support_tickets t
      INNER JOIN users u
        ON u.id = t.user_id
      LEFT JOIN users a
        ON a.id = t.assigned_admin_id
      ORDER BY t.created_at DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      tickets: result.rows,
    });
  } catch (error) {
    console.error("GET SUPPORT TICKETS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get support tickets",
    });
  }
};


// GET SINGLE SUPPORT TICKET
const getSupportTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket id",
      });
    }

    const ticketResult = await pool.query(
      `
      SELECT
        t.id,
        t.user_id,
        u.full_name AS user_name,
        t.subject,
        t.message,
        t.status,
        t.priority,
        t.assigned_admin_id,
        a.full_name AS assigned_admin,
        t.created_at,
        t.updated_at
      FROM support_tickets t
      INNER JOIN users u
        ON u.id = t.user_id
      LEFT JOIN users a
        ON a.id = t.assigned_admin_id
      WHERE t.id = $1
      `,
      [Number(id)]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    const repliesResult = await pool.query(
      `
      SELECT
        r.id,
        r.admin_id,
        a.full_name AS admin_name,
        r.message,
        r.created_at
      FROM support_ticket_replies r
      INNER JOIN users a
        ON a.id = r.admin_id
      WHERE r.ticket_id = $1
      ORDER BY r.created_at ASC
      `,
      [Number(id)]
    );

    return res.status(200).json({
      success: true,
      ticket: {
        ...ticketResult.rows[0],
        replies: repliesResult.rows,
      },
    });
  } catch (error) {
    console.error("GET SUPPORT TICKET ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get support ticket",
    });
  }
};


// UPDATE TICKET STATUS
const updateSupportTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      "open",
      "in_progress",
      "closed",
    ];

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket id",
      });
    }

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket status",
      });
    }

    const result = await pool.query(
      `
      UPDATE support_tickets
      SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [status, Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket status updated successfully",
      ticket: result.rows[0],
    });
  } catch (error) {
    console.error(
      "UPDATE SUPPORT TICKET STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update ticket status",
    });
  }
};


// UPDATE TICKET PRIORITY
const updateSupportTicketPriority = async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    const allowedPriorities = [
      "low",
      "medium",
      "high",
    ];

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket id",
      });
    }

    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket priority",
      });
    }

    const result = await pool.query(
      `
      UPDATE support_tickets
      SET
        priority = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [priority, Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket priority updated successfully",
      ticket: result.rows[0],
    });
  } catch (error) {
    console.error(
      "UPDATE SUPPORT TICKET PRIORITY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to update ticket priority",
    });
  }
};


// ASSIGN TICKET
const assignSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_id } = req.body;

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket id",
      });
    }

    if (
      admin_id !== null &&
      admin_id !== undefined &&
      !Number.isInteger(Number(admin_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin id",
      });
    }

    if (admin_id !== null && admin_id !== undefined) {
      const adminResult = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id = $1
          AND role = 'admin'
          AND is_active = true
        `,
        [Number(admin_id)]
      );

      if (adminResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Admin not found",
        });
      }
    }

    const result = await pool.query(
      `
      UPDATE support_tickets
      SET
        assigned_admin_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [
        admin_id === null
          ? null
          : Number(admin_id),
        Number(id),
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      ticket: result.rows[0],
    });
  } catch (error) {
    console.error(
      "ASSIGN SUPPORT TICKET ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to assign ticket",
    });
  }
};


// REPLY TO TICKET
const replyToSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const adminId =
      req.user?.id ??
      req.user?.userId ??
      req.user?.user_id ??
      req.user?.sub;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Admin identity not found",
      });
    }

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket id",
      });
    }

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Reply message is required",
      });
    }

    const ticketResult = await pool.query(
      `
      SELECT id
      FROM support_tickets
      WHERE id = $1
      `,
      [Number(id)]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    const replyResult = await pool.query(
      `
      INSERT INTO support_ticket_replies (
        ticket_id,
        admin_id,
        message
      )
      VALUES ($1, $2, $3)
      RETURNING id, ticket_id, admin_id, message, created_at
      `,
      [
        Number(id),
        Number(adminId),
        message.trim(),
      ]
    );

    await pool.query(
      `
      UPDATE support_tickets
      SET
        status = CASE
          WHEN status = 'open'
          THEN 'in_progress'
          ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [Number(id)]
    );

    const reply = await pool.query(
      `
      SELECT
        r.id,
        r.ticket_id,
        r.admin_id,
        a.full_name AS admin_name,
        r.message,
        r.created_at
      FROM support_ticket_replies r
      INNER JOIN users a
        ON a.id = r.admin_id
      WHERE r.id = $1
      `,
      [replyResult.rows[0].id]
    );

    return res.status(201).json({
      success: true,
      message: "Reply added successfully",
      reply: reply.rows[0],
    });
  } catch (error) {
    console.error(
      "REPLY SUPPORT TICKET ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to reply to ticket",
    });
  }
};


// DELETE SUPPORT TICKET
const deleteSupportTicket = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !Number.isInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket id",
      });
    }

    const result = await pool.query(
      `
      DELETE FROM support_tickets
      WHERE id = $1
      RETURNING id
      `,
      [Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Support ticket deleted successfully",
    });
  } catch (error) {
    console.error(
      "DELETE SUPPORT TICKET ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to delete support ticket",
    });
  }
};
// EXPORT
// ========================================
module.exports = {
  verifyUser,
  unverifyUser,
  createUser,
  createCoach,
  createPrivateCoach,
  getAllCoaches,
  getCoachById,
  updateCoach,
  deactivateCoach,
  activateCoach,
  deleteCoach,
  getAllUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
  getAllPlayers,
  getPlayerById,
  deactivatePlayer,
  activatePlayer,
  createOwner,
  updateOwner,
  verifyOwner,
  unverifyOwner,
  approveOwner,
  rejectOwner,
  getAllOwners,
  getOwnerById,
  deactivateOwner,
  activateOwner,
  deleteOwner,
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
  getAdminProfile,
  updateAdminProfile,
  updateAdminPassword,
  createNotification,
  getNotificationById,
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
    // Coupons
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  // Support Tickets
  getAllSupportTickets,
  getSupportTicketById,
  updateSupportTicketStatus,
  updateSupportTicketPriority,
  assignSupportTicket,
  replyToSupportTicket,
  deleteSupportTicket,
    // Activity Logs
  getAllActivityLogs,
  getActivityLogById,
  createActivityLog,
  deleteActivityLog,
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
  //Admin Reviews
  getAllReviews,
  // Complaints
  getAllComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
  deleteComplaint,
  // Academy Reviews
  getAcademyReviews,
  getReviewById,
  updateReviewVisibility,
  deleteReview,
  // Admin Roles
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  // Admin Settings
  getAdminSettings,
  updateAdminSettings,
}