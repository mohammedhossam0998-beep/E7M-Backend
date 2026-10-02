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
  uploadOwnerProfileImage,
} = require("../controllers/ownerProfileController");

const router = express.Router();

// ========================================
// UPLOAD DIRECTORY
// ========================================

const uploadDirectory = path.join(
  __dirname,
  "../../uploads/owners/profile"
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
    const extension = path.extname(
      file.originalname
    );

    const filename =
      `owner-${req.user.userId}-${Date.now()}${extension}`;

    cb(null, filename);
  },
});

// ========================================
// FILE FILTER
// ========================================

const fileFilter = (req, file, cb) => {
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
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
});

// ========================================
// UPLOAD OWNER PROFILE IMAGE
// POST /api/owner/profile/image
// ========================================

router.post(
  "/image",

  authenticateToken,

  authorizeRoles("owner"),

  upload.single("image"),

  uploadOwnerProfileImage
);

module.exports = router;