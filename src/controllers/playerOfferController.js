const pool = require("../config/db");

// ========================================
// GET ACTIVE OFFERS FOR PLAYER
// GET /api/player/offers
// ========================================

const getPlayerOffers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id,
        o.owner_id,
        o.pitch_id,
        o.title,
        o.description,
        o.discount_percentage,
        o.start_date,
        o.end_date,
        o.is_active,

        p.name AS pitch_name

      FROM offers o

      LEFT JOIN pitches p
        ON o.pitch_id = p.id

      WHERE o.is_active = true

        AND (
          o.start_date IS NULL
          OR o.start_date <= CURRENT_DATE
        )

        AND (
          o.end_date IS NULL
          OR o.end_date >= CURRENT_DATE
        )

      ORDER BY o.id DESC
    `);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      offers: result.rows,
    });

  } catch (error) {
    console.error("GET PLAYER OFFERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get player offers",
    });
  }
};

module.exports = {
  getPlayerOffers,
};