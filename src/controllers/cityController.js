const pool = require("../config/db");

// ============================================================
// GET ALL CITIES
// ============================================================

const getCities = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name
      FROM cities
      ORDER BY name ASC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      cities: result.rows,
    });
  } catch (error) {
    console.error("GET CITIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load cities",
    });
  }
};

// ============================================================
// GET CITY BY ID
// ============================================================

const getCityById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        name
      FROM cities
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "City not found",
      });
    }

    return res.status(200).json({
      success: true,
      city: result.rows[0],
    });
  } catch (error) {
    console.error("GET CITY ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load city",
    });
  }
};

module.exports = {
  getCities,
  getCityById,
};