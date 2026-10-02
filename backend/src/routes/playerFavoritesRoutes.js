const express = require("express");
const router = express.Router();

const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const {
  addFavorite,
  getMyFavorites,
  removeFavorite,
  checkFavorite,
} = require("../controllers/playerFavoritesController");

router.post(
  "/favorites/:pitchId",
  authenticateToken,
  authorizeRoles("player"),
  addFavorite
);

router.get(
  "/favorites",
  authenticateToken,
  authorizeRoles("player"),
  getMyFavorites
);

router.delete(
  "/favorites/:pitchId",
  authenticateToken,
  authorizeRoles("player"),
  removeFavorite
);

router.get(
  "/favorites/:pitchId/check",
  authenticateToken,
  authorizeRoles("player"),
  checkFavorite
);

module.exports = router;