require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../config/db");

const createAdmin = async () => {
  try {
    const full_name = "E7M Admin";
    const email = "admin@e7m.com";
    const password = "Admin@123456";
    const phone = null;

    // ========================================
    // CHECK EXISTING ADMIN
    // ========================================

    const existingAdmin = await pool.query(
      `
      SELECT id, email, role
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      console.log("Admin already exists:");
      console.log(existingAdmin.rows[0]);

      await pool.end();
      return;
    }

    // ========================================
    // HASH PASSWORD
    // ========================================

    const passwordHash = await bcrypt.hash(password, 10);

    // ========================================
    // CREATE ADMIN
    // ========================================

    const result = await pool.query(
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
        phone,
        "admin"
      ]
    );

    console.log("========================================");
    console.log("ADMIN CREATED SUCCESSFULLY");
    console.log("========================================");
    console.log(result.rows[0]);
    console.log("========================================");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("========================================");

    await pool.end();

  } catch (error) {

    console.error("CREATE ADMIN ERROR:", error);

    await pool.end();

    process.exit(1);
  }
};

createAdmin();