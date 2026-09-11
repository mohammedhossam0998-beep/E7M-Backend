const pool = require("../config/db");

// ============================================================
// GET ALL BANNERS
// ============================================================

const getBanners = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        image_url,
        active,
        created_at
      FROM banners
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      success: true,
      banners: result.rows,
    });
  } catch (error) {
    console.error("❌ GET BANNERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load banners.",
    });
  }
};

// ============================================================
// GET BANNER BY ID
// ============================================================

const getBannerById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        title,
        image_url,
        active,
        created_at
      FROM banners
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    return res.status(200).json({
      success: true,
      banner: result.rows[0],
    });
  } catch (error) {
    console.error("❌ GET BANNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load banner.",
    });
  }
};

// ============================================================
// CREATE BANNER
// ============================================================

const createBanner = async (req, res) => {
  try {
    const {
      title,
      image_url,
      active = true,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Banner title is required.",
      });
    }

    if (!image_url || !image_url.trim()) {
      return res.status(400).json({
        success: false,
        message: "Banner image URL is required.",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO banners (
        title,
        image_url,
        active
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        title,
        image_url,
        active,
        created_at
      `,
      [
        title.trim(),
        image_url.trim(),
        Boolean(active),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Banner created successfully.",
      banner: result.rows[0],
    });
  } catch (error) {
    console.error("❌ CREATE BANNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create banner.",
    });
  }
};

// ============================================================
// UPDATE BANNER
// ============================================================

const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      image_url,
      active,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Banner title is required.",
      });
    }

    if (!image_url || !image_url.trim()) {
      return res.status(400).json({
        success: false,
        message: "Banner image URL is required.",
      });
    }

    const result = await pool.query(
      `
      UPDATE banners
      SET
        title = $1,
        image_url = $2,
        active = $3
      WHERE id = $4
      RETURNING
        id,
        title,
        image_url,
        active,
        created_at
      `,
      [
        title.trim(),
        image_url.trim(),
        Boolean(active),
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Banner updated successfully.",
      banner: result.rows[0],
    });
  } catch (error) {
    console.error("❌ UPDATE BANNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update banner.",
    });
  }
};

// ============================================================
// TOGGLE STATUS
// ============================================================

const toggleBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE banners
      SET active = NOT active
      WHERE id = $1
      RETURNING
        id,
        title,
        image_url,
        active,
        created_at
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Banner status updated successfully.",
      banner: result.rows[0],
    });
  } catch (error) {
    console.error("❌ TOGGLE BANNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update banner status.",
    });
  }
};

// ============================================================
// DELETE BANNER
// ============================================================

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM banners
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Banner deleted successfully.",
    });
  } catch (error) {
    console.error("❌ DELETE BANNER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete banner.",
    });
  }
};

module.exports = {
  getBanners,
  getBannerById,
  createBanner,
  updateBanner,
  toggleBannerStatus,
  deleteBanner,
};