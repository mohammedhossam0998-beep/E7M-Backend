const express = require("express");

const {
  getCities,
  getCityById,
} = require("../controllers/cityController");

const router = express.Router();

// ========================================
// PUBLIC CITY ROUTES
// ========================================

// GET /api/cities
router.get("/", getCities);

// GET /api/cities/:id
router.get("/:id", getCityById);

module.exports = router;