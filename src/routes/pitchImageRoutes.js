const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  authenticateToken,
} = require("../middleware/authMiddleware");

const {
  authorizeRoles,
} = require("../middleware/roleMiddleware");

const {
  uploadPitchImages,
  getPitchImages,
  deletePitchImage,
  setPrimaryPitchImage,
} = require("../controllers/pitchImageController");

const router = express.Router();

// ========================================
// UPLOAD DIRECTORY
// ========================================

const uploadDirectory = path.join(
  __dirname,
  "../../uploads/pitches"
);

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

// ========================================
// MULTER STORAGE
// ========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname);

    const filename =
      `pitch-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${extension}`;

    cb(null, filename);
  },
});

// ========================================
// FILE FILTER
// ========================================

const fileFilter = (
  req,
  file,
  cb
) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (
    allowedMimeTypes.includes(
      file.mimetype
    )
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed"
      )
    );
  }
};

// ========================================
// MULTER
// ========================================

const upload = multer({
  storage,
  fileFilter,

  limits: {
    files: 10,
    fileSize: 5 * 1024 * 1024,
  },
});

// ========================================
// GET PITCH IMAGES
// GET /api/owner/pitches/:id/images
// ========================================

router.get(
  "/:id/images",

  authenticateToken,

  authorizeRoles("owner"),

  getPitchImages
);

// ========================================
// UPLOAD PITCH IMAGES
// POST /api/owner/pitches/:id/images
// ========================================

router.post(
  "/:id/images",

  authenticateToken,

  authorizeRoles("owner"),

  upload.array("images", 10),

  uploadPitchImages
);

// ========================================
// DELETE PITCH IMAGE
// DELETE /api/owner/pitches/:id/images/:imageId
// ========================================

router.delete(
  "/:id/images/:imageId",

  authenticateToken,

  authorizeRoles("owner"),

  deletePitchImage
);

// ========================================
// SET PRIMARY IMAGE
// PUT /api/owner/pitches/:id/images/:imageId/primary
// ========================================

router.put(
  "/:id/images/:imageId/primary",

  authenticateToken,

  authorizeRoles("owner"),

  setPrimaryPitchImage
);

module.exports = router;