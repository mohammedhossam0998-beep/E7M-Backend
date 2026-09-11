const express = require("express");

const {
  getCmsPages,
  getCmsPageById,
  updateCmsPage,
} = require("../controllers/cmsController");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const router = express.Router();

// ============================================================
// ADMIN PROTECTION
// ============================================================

router.use(
  authenticateToken,
  authorizeRoles("admin")
);

// ============================================================
// GET ALL CMS PAGES
// GET /api/cms
// ============================================================

router.get(
  "/",
  getCmsPages
);

// ============================================================
// GET SINGLE CMS PAGE
// GET /api/cms/:id
// ============================================================

router.get(
  "/:id",
  getCmsPageById
);

// ============================================================
// UPDATE CMS PAGE
// PUT /api/cms/:id
// ============================================================

router.put(
  "/:id",
  updateCmsPage
);

module.exports = router;