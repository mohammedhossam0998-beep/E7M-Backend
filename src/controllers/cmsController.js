const pool = require("../config/db");

// ============================================================
// GET ALL CMS PAGES
// ============================================================

const getCmsPages = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        type,
        title,
        content,
        updated_at
      FROM cms_pages
      ORDER BY id ASC
    `);

    return res.status(200).json({
      success: true,
      pages: result.rows,
    });
  } catch (error) {
    console.error("❌ GET CMS PAGES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load CMS pages.",
    });
  }
};

// ============================================================
// GET SINGLE CMS PAGE
// ============================================================

const getCmsPageById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        type,
        title,
        content,
        updated_at
      FROM cms_pages
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "CMS page not found.",
      });
    }

    return res.status(200).json({
      success: true,
      page: result.rows[0],
    });
  } catch (error) {
    console.error("❌ GET CMS PAGE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load CMS page.",
    });
  }
};

// ============================================================
// UPDATE CMS PAGE
// ============================================================

const updateCmsPage = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      content,
    } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "CMS content is required.",
      });
    }

    const result = await pool.query(
      `
      UPDATE cms_pages
      SET
        title = COALESCE($1, title),
        content = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        type,
        title,
        content,
        updated_at
      `,
      [
        title?.trim() || null,
        content.trim(),
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "CMS page not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "CMS page updated successfully.",
      page: result.rows[0],
    });
  } catch (error) {
    console.error("❌ UPDATE CMS PAGE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update CMS page.",
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getCmsPages,
  getCmsPageById,
  updateCmsPage,
};