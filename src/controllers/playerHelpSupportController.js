const pool = require("../config/db");

const createSupportReport = async (req, res) => {
  try {
    const userId = req.user.userId;

    const { subject, description } = req.body;

    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: "Subject and description are required",
      });
    }

    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();

    if (!cleanSubject || !cleanDescription) {
      return res.status(400).json({
        success: false,
        message: "Subject and description cannot be empty",
      });
    }

    if (cleanSubject.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Subject must not exceed 255 characters",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO support_reports
        (user_id, subject, description)
      VALUES
        ($1, $2, $3)
      RETURNING
        id,
        user_id,
        subject,
        description,
        status,
        created_at,
        updated_at
      `,
      [userId, cleanSubject, cleanDescription]
    );

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      report: result.rows[0],
    });
  } catch (error) {
    console.error("Create Support Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  createSupportReport,
};