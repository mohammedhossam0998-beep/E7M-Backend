const pool = require("../config/db");

// Add favorite
const addFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { pitchId } = req.params;

    if (!pitchId || isNaN(Number(pitchId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch ID",
      });
    }

    const pitch = await pool.query(
      `SELECT id FROM pitches WHERE id = $1`,
      [pitchId]
    );

    if (pitch.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found",
      });
    }

    const existing = await pool.query(
      `SELECT id
       FROM player_favorites
       WHERE user_id = $1 AND pitch_id = $2`,
      [userId, pitchId]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Pitch is already in favorites",
        favorite: existing.rows[0],
      });
    }

    const result = await pool.query(
      `INSERT INTO player_favorites (user_id, pitch_id)
       VALUES ($1, $2)
       RETURNING id, user_id, pitch_id, created_at`,
      [userId, pitchId]
    );

    return res.status(201).json({
      success: true,
      message: "Pitch added to favorites",
      favorite: result.rows[0],
    });
  } catch (error) {
    console.error("Add favorite error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add favorite",
    });
  }
};


// Get my favorites
const getMyFavorites = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
          pf.id AS favorite_id,
          pf.pitch_id,
          pf.created_at,

          p.*
       FROM player_favorites pf
       INNER JOIN pitches p
          ON p.id = pf.pitch_id
       WHERE pf.user_id = $1
       ORDER BY pf.created_at DESC`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      favorites: result.rows,
    });
  } catch (error) {
    console.error("Get favorites error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load favorites",
    });
  }
};


// Remove favorite
const removeFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { pitchId } = req.params;

    if (!pitchId || isNaN(Number(pitchId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch ID",
      });
    }

    const result = await pool.query(
      `DELETE FROM player_favorites
       WHERE user_id = $1 AND pitch_id = $2
       RETURNING id, pitch_id`,
      [userId, pitchId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Favorite not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pitch removed from favorites",
    });
  } catch (error) {
    console.error("Remove favorite error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to remove favorite",
    });
  }
};


// Check favorite
const checkFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { pitchId } = req.params;

    if (!pitchId || isNaN(Number(pitchId))) {
      return res.status(400).json({
        success: false,
        message: "Invalid pitch ID",
      });
    }

    const result = await pool.query(
      `SELECT id
       FROM player_favorites
       WHERE user_id = $1 AND pitch_id = $2`,
      [userId, pitchId]
    );

    return res.status(200).json({
      success: true,
      isFavorite: result.rows.length > 0,
    });
  } catch (error) {
    console.error("Check favorite error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check favorite",
    });
  }
};


module.exports = {
  addFavorite,
  getMyFavorites,
  removeFavorite,
  checkFavorite,
};