const express = require("express");

const {
  getBanners,
  getBannerById,
  createBanner,
  updateBanner,
  toggleBannerStatus,
  deleteBanner,
} = require("../controllers/bannerController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const router = express.Router();

// كل عمليات الـ Banners للـ Admin فقط
router.use(
  authenticateToken,
  authorizeRoles("admin")
);

// GET /api/banners
router.get("/", getBanners);

// GET /api/banners/:id
router.get("/:id", getBannerById);

// POST /api/banners
router.post("/", createBanner);

// PUT /api/banners/:id
router.put("/:id", updateBanner);

// PATCH /api/banners/:id/toggle
router.patch("/:id/toggle", toggleBannerStatus);

// DELETE /api/banners/:id
router.delete("/:id", deleteBanner);

module.exports = router;