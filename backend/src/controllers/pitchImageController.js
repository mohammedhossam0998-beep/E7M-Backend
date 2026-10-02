const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

// ========================================
// GET OWNER ID
// ========================================

const getOwnerId = async (userId) => {
  const result = await pool.query(
    `
    SELECT id
    FROM owners
    WHERE user_id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
};

// ========================================
// CHECK PITCH BELONGS TO OWNER
// ========================================

const checkPitchOwnership = async (
  pitchId,
  ownerId
) => {
  const result = await pool.query(
    `
    SELECT id
    FROM pitches
    WHERE id = $1
    AND owner_id = $2
    `,
    [pitchId, ownerId]
  );

  return result.rows.length > 0;
};

// ========================================
// UPLOAD PITCH IMAGES
// ========================================

const uploadPitchImages = async (req, res) => {
  try {
    const { id } = req.params;

    // ======================================
    // CHECK FILES
    // ======================================

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one image is required",
      });
    }

    // ======================================
    // GET OWNER ID
    // ======================================

    const ownerId = await getOwnerId(
      req.user.userId
    );

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ======================================
    // CHECK PITCH OWNERSHIP
    // ======================================

    const pitchBelongsToOwner =
      await checkPitchOwnership(
        id,
        ownerId
      );

    if (!pitchBelongsToOwner) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found",
      });
    }

    // ======================================
    // CHECK EXISTING IMAGES
    // ======================================

    const existingImagesResult =
      await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM pitch_images
        WHERE pitch_id = $1
        `,
        [id]
      );

    const existingCount =
      existingImagesResult.rows[0].count;

    // ======================================
    // INSERT IMAGES
    // ======================================

    const insertedImages = [];

    for (
      let i = 0;
      i < req.files.length;
      i++
    ) {
      const file = req.files[i];

      const imageUrl =
        `/uploads/pitches/${file.filename}`;

      const isPrimary =
        existingCount === 0 && i === 0;

      const result = await pool.query(
        `
        INSERT INTO pitch_images (
          pitch_id,
          image_url,
          is_primary
        )
        VALUES (
          $1,
          $2,
          $3
        )
        RETURNING
          id,
          pitch_id,
          image_url,
          is_primary,
          created_at
        `,
        [
          id,
          imageUrl,
          isPrimary,
        ]
      );

      insertedImages.push(
        result.rows[0]
      );
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(201).json({
      success: true,
      message:
        "Pitch images uploaded successfully",
      images: insertedImages,
    });

  } catch (error) {
    console.error(
      "UPLOAD PITCH IMAGES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to upload pitch images",
    });
  }
};

// ========================================
// GET PITCH IMAGES
// ========================================

const getPitchImages = async (req, res) => {
  try {
    const { id } = req.params;

    // ======================================
    // GET OWNER ID
    // ======================================

    const ownerId = await getOwnerId(
      req.user.userId
    );

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ======================================
    // CHECK PITCH OWNERSHIP
    // ======================================

    const pitchBelongsToOwner =
      await checkPitchOwnership(
        id,
        ownerId
      );

    if (!pitchBelongsToOwner) {
      return res.status(404).json({
        success: false,
        message: "Pitch not found",
      });
    }

    // ======================================
    // GET IMAGES
    // ======================================

    const result = await pool.query(
      `
      SELECT
        id,
        pitch_id,
        image_url,
        is_primary,
        created_at
      FROM pitch_images
      WHERE pitch_id = $1
      ORDER BY
        is_primary DESC,
        created_at ASC,
        id ASC
      `,
      [id]
    );

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      images: result.rows,
    });

  } catch (error) {
    console.error(
      "GET PITCH IMAGES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to get pitch images",
    });
  }
};

// ========================================
// DELETE PITCH IMAGE
// ========================================

const deletePitchImage = async (
  req,
  res
) => {
  try {
    const { id, imageId } =
      req.params;

    // ======================================
    // GET OWNER ID
    // ======================================

    const ownerId = await getOwnerId(
      req.user.userId
    );

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ======================================
    // GET IMAGE + CHECK OWNERSHIP
    // ======================================

    const imageResult =
      await pool.query(
        `
        SELECT
          pi.id,
          pi.pitch_id,
          pi.image_url,
          pi.is_primary
        FROM pitch_images pi
        INNER JOIN pitches p
          ON p.id = pi.pitch_id
        WHERE pi.id = $1
        AND pi.pitch_id = $2
        AND p.owner_id = $3
        `,
        [
          imageId,
          id,
          ownerId,
        ]
      );

    if (imageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const image =
      imageResult.rows[0];

    // ======================================
    // DELETE DATABASE RECORD
    // ======================================

    await pool.query(
      `
      DELETE FROM pitch_images
      WHERE id = $1
      AND pitch_id = $2
      `,
      [
        imageId,
        id,
      ]
    );

    // ======================================
    // DELETE FILE
    // ======================================

    const filename =
      path.basename(image.image_url);

    const filePath = path.join(
      __dirname,
      "../../uploads/pitches",
      filename
    );

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // ======================================
    // IF PRIMARY WAS DELETED
    // MAKE ANOTHER IMAGE PRIMARY
    // ======================================

    if (image.is_primary) {
      const nextPrimaryResult =
        await pool.query(
          `
          SELECT id
          FROM pitch_images
          WHERE pitch_id = $1
          ORDER BY
            created_at ASC,
            id ASC
          LIMIT 1
          `,
          [id]
        );

      if (
        nextPrimaryResult.rows.length > 0
      ) {
        await pool.query(
          `
          UPDATE pitch_images
          SET is_primary = TRUE
          WHERE id = $1
          `,
          [
            nextPrimaryResult.rows[0].id,
          ]
        );
      }
    }

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message:
        "Pitch image deleted successfully",
    });

  } catch (error) {
    console.error(
      "DELETE PITCH IMAGE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete pitch image",
    });
  }
};

// ========================================
// SET PRIMARY IMAGE
// ========================================

const setPrimaryPitchImage = async (
  req,
  res
) => {
  const client = await pool.connect();

  try {
    const { id, imageId } =
      req.params;

    // ======================================
    // GET OWNER ID
    // ======================================

    const ownerId = await getOwnerId(
      req.user.userId
    );

    if (!ownerId) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    // ======================================
    // CHECK IMAGE OWNERSHIP
    // ======================================

    const imageResult =
      await client.query(
        `
        SELECT
          pi.id,
          pi.pitch_id,
          pi.image_url
        FROM pitch_images pi
        INNER JOIN pitches p
          ON p.id = pi.pitch_id
        WHERE pi.id = $1
        AND pi.pitch_id = $2
        AND p.owner_id = $3
        `,
        [
          imageId,
          id,
          ownerId,
        ]
      );

    if (imageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // ======================================
    // START TRANSACTION
    // ======================================

    await client.query("BEGIN");

    // ======================================
    // REMOVE PRIMARY FROM ALL IMAGES
    // ======================================

    await client.query(
      `
      UPDATE pitch_images
      SET is_primary = FALSE
      WHERE pitch_id = $1
      `,
      [id]
    );

    // ======================================
    // SET SELECTED IMAGE PRIMARY
    // ======================================

    const result = await client.query(
      `
      UPDATE pitch_images
      SET is_primary = TRUE
      WHERE id = $1
      AND pitch_id = $2
      RETURNING
        id,
        pitch_id,
        image_url,
        is_primary,
        created_at
      `,
      [
        imageId,
        id,
      ]
    );

    // ======================================
    // COMMIT
    // ======================================

    await client.query("COMMIT");

    // ======================================
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,
      message:
        "Primary image updated successfully",
      image: result.rows[0],
    });

  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "SET PRIMARY PITCH IMAGE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to set primary image",
    });

  } finally {
    client.release();
  }
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
  uploadPitchImages,
  getPitchImages,
  deletePitchImage,
  setPrimaryPitchImage,
};