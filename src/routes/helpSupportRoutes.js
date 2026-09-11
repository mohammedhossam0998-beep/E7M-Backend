const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const {
  createSupportReport,
} = require("../controllers/playerHelpSupportController");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, phone, version, faq, updated_at
      FROM help_support
      ORDER BY id DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Help & Support data not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Help Support Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.post(
  "/report",
  authenticateToken,
  authorizeRoles("player"),
  createSupportReport
);

module.exports = router;