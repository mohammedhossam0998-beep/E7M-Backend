const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ========================================
// UPLOAD DIRECTORIES
// ========================================

const profileUploadDir = path.join(
  __dirname,
  "../../uploads/profile"
);

const competitionPaymentUploadDir = path.join(
  __dirname,
  "../../uploads/competition-payments"
);

if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, {
    recursive: true,
  });
}

if (!fs.existsSync(competitionPaymentUploadDir)) {
  fs.mkdirSync(competitionPaymentUploadDir, {
    recursive: true,
  });
}

// ========================================
// PROFILE IMAGE STORAGE
// ========================================

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileUploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    const uniqueName =
      `${Date.now()}-${crypto.randomUUID()}${extension}`;

    cb(null, uniqueName);
  },
});

// ========================================
// PROFILE IMAGE FILTER
// ========================================

const profileImageFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only JPG, PNG and WEBP images are allowed."
      )
    );
  }

  cb(null, true);
};

// ========================================
// PLAYER PROFILE IMAGE UPLOAD
// ========================================

const uploadPlayerProfileImage = multer({
  storage: profileStorage,
  fileFilter: profileImageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
});

// ========================================
// COMPETITION PAYMENT PROOF STORAGE
// ========================================

const competitionPaymentProofStorage =
  multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, competitionPaymentUploadDir);
    },

    filename: (req, file, cb) => {
      const extension =
        path.extname(file.originalname).toLowerCase();

      const uniqueName =
        `${Date.now()}-${crypto.randomUUID()}${extension}`;

      cb(null, uniqueName);
    },
  });

// ========================================
// COMPETITION PAYMENT PROOF FILTER
// ========================================

const competitionPaymentProofFilter = (
  req,
  file,
  cb
) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".pdf",
  ];

  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  const isValidMimeType =
    allowedMimeTypes.includes(file.mimetype);

  const isValidExtension =
    allowedExtensions.includes(extension);

  if (!isValidMimeType && !isValidExtension) {
    return cb(
      new Error(
        "Only JPG, PNG, WEBP and PDF files are allowed."
      )
    );
  }

  cb(null, true);
};

// ========================================
// COMPETITION PAYMENT PROOF UPLOAD
// ========================================

const uploadCompetitionPaymentProof = multer({
  storage: competitionPaymentProofStorage,
  fileFilter: competitionPaymentProofFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

// ========================================
// EXPORT
// ========================================

module.exports = {
  uploadPlayerProfileImage,
  uploadCompetitionPaymentProof,
};