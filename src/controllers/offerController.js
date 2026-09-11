const pool = require("../config/db");
const { createNotification } = require("./notificationController");

// ========================================
// CREATE OFFER
// POST /api/owner/offers
// ========================================

const createOffer = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      pitch_id,
      title,
      description,
      discount_percentage,
      start_date,
      end_date,
    } = req.body;

    // ========================================
    // VALIDATE REQUIRED DATA
    // ========================================

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Offer title is required",
      });
    }

    if (
      discount_percentage === undefined ||
      discount_percentage === null
    ) {
      return res.status(400).json({
        success: false,
        message: "Discount percentage is required",
      });
    }

    const discount = Number(discount_percentage);

    if (!Number.isFinite(discount) || discount <= 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: "Discount percentage must be between 0 and 100",
      });
    }

    // ========================================
    // GET OWNER
    // ========================================

    const ownerResult = await pool.query(
      `
        SELECT id
        FROM owners
        WHERE user_id = $1
          AND is_deleted = false
        LIMIT 1
      `,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Owner profile not found",
      });
    }

    const ownerId = ownerResult.rows[0].id;

    // ========================================
    // VALIDATE PITCH IF PROVIDED
    // ========================================

    if (pitch_id !== undefined && pitch_id !== null) {
      const pitchResult = await pool.query(
        `
          SELECT id
          FROM pitches
          WHERE id = $1
            AND owner_id = $2
          LIMIT 1
        `,
        [pitch_id, ownerId]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to create an offer for this pitch",
        });
      }
    }

    // ========================================
    // VALIDATE DATES
    // ========================================

    if (start_date && end_date) {
      if (new Date(start_date) > new Date(end_date)) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be after end date",
        });
      }
    }

    // ========================================
    // CREATE OFFER
    // ========================================

    const result = await pool.query(
      `
        INSERT INTO offers (
          owner_id,
          pitch_id,
          title,
          description,
          discount_percentage,
          start_date,
          end_date,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, true)
        RETURNING
          id,
          owner_id,
          pitch_id,
          title,
          description,
          discount_percentage,
          start_date,
          end_date,
          is_active
      `,
      [
        ownerId,
        pitch_id ?? null,
        title.trim(),
        description?.trim() || null,
        discount,
        start_date || null,
        end_date || null,
      ]
    );

    // ========================================
    // SEND OFFER NOTIFICATION TO PLAYERS
    // ========================================

    const playersResult = await pool.query(`
      SELECT id
      FROM users
      WHERE role = 'player'
        AND is_active = true
    `);

    for (const player of playersResult.rows) {
      await createNotification({
        userId: player.id,
        title: "🎁 عرض جديد",
        message: `خصم ${discount}% على الحجز`,
        type: "offers",
        bookingId: null,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Offer created successfully",
      offer: result.rows[0],
    });
  } catch (error) {
    console.error("CREATE OFFER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create offer",
    });
  }
};


// ========================================
// GET OWNER OFFERS
// GET /api/owner/offers
// ========================================

const getOwnerOffers = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `
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

        INNER JOIN owners ow
          ON o.owner_id = ow.id

        WHERE ow.user_id = $1

        ORDER BY o.id DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      offers: result.rows,
    });
  } catch (error) {
    console.error("GET OWNER OFFERS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get owner offers",
    });
  }
};


// ========================================
// UPDATE OFFER
// PATCH /api/owner/offers/:id
// ========================================

const updateOffer = async (req, res) => {
  try {
    const userId = req.user.userId;
    const offerId = req.params.id;

    const {
      pitch_id,
      title,
      description,
      discount_percentage,
      start_date,
      end_date,
      is_active,
    } = req.body;

    // ========================================
    // VERIFY OWNER + OFFER
    // ========================================

    const offerResult = await pool.query(
      `
        SELECT o.*
        FROM offers o
        INNER JOIN owners ow
          ON o.owner_id = ow.id
        WHERE o.id = $1
          AND ow.user_id = $2
        LIMIT 1
      `,
      [offerId, userId]
    );

    if (offerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    const currentOffer = offerResult.rows[0];

    // ========================================
    // FINAL VALUES
    // ========================================

    const finalTitle =
      title !== undefined
        ? title.trim()
        : currentOffer.title;

    const finalDescription =
      description !== undefined
        ? description?.trim() || null
        : currentOffer.description;

    const finalDiscount =
      discount_percentage !== undefined
        ? Number(discount_percentage)
        : Number(currentOffer.discount_percentage);

    const finalPitchId =
      pitch_id !== undefined
        ? pitch_id
        : currentOffer.pitch_id;

    const finalStartDate =
      start_date !== undefined
        ? start_date || null
        : currentOffer.start_date;

    const finalEndDate =
      end_date !== undefined
        ? end_date || null
        : currentOffer.end_date;

    const finalIsActive =
      is_active !== undefined
        ? Boolean(is_active)
        : currentOffer.is_active;

    // ========================================
    // VALIDATION
    // ========================================

    if (!finalTitle) {
      return res.status(400).json({
        success: false,
        message: "Offer title is required",
      });
    }

    if (
      !Number.isFinite(finalDiscount) ||
      finalDiscount <= 0 ||
      finalDiscount > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Discount percentage must be between 0 and 100",
      });
    }

    if (finalStartDate && finalEndDate) {
      if (new Date(finalStartDate) > new Date(finalEndDate)) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be after end date",
        });
      }
    }

    // ========================================
    // VALIDATE PITCH OWNERSHIP
    // ========================================

    if (finalPitchId !== null && finalPitchId !== undefined) {
      const pitchResult = await pool.query(
        `
          SELECT id
          FROM pitches
          WHERE id = $1
            AND owner_id = $2
          LIMIT 1
        `,
        [finalPitchId, currentOffer.owner_id]
      );

      if (pitchResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "You are not allowed to use this pitch",
        });
      }
    }

    // ========================================
    // UPDATE OFFER
    // ========================================

    const result = await pool.query(
      `
        UPDATE offers
        SET
          pitch_id = $1,
          title = $2,
          description = $3,
          discount_percentage = $4,
          start_date = $5,
          end_date = $6,
          is_active = $7
        WHERE id = $8
        RETURNING
          id,
          owner_id,
          pitch_id,
          title,
          description,
          discount_percentage,
          start_date,
          end_date,
          is_active
      `,
      [
        finalPitchId,
        finalTitle,
        finalDescription,
        finalDiscount,
        finalStartDate,
        finalEndDate,
        finalIsActive,
        offerId,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Offer updated successfully",
      offer: result.rows[0],
    });
  } catch (error) {
    console.error("UPDATE OFFER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update offer",
    });
  }
};


// ========================================
// DELETE OFFER
// DELETE /api/owner/offers/:id
// ========================================

const deleteOffer = async (req, res) => {
  try {
    const userId = req.user.userId;
    const offerId = req.params.id;

    const result = await pool.query(
      `
        DELETE FROM offers o
        USING owners ow
        WHERE o.id = $1
          AND o.owner_id = ow.id
          AND ow.user_id = $2
        RETURNING o.id
      `,
      [offerId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Offer deleted successfully",
    });
  } catch (error) {
    console.error("DELETE OFFER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete offer",
    });
  }
};


module.exports = {
  createOffer,
  getOwnerOffers,
  updateOffer,
  deleteOffer,
};