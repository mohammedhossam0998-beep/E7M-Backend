const academyService = require("../services/academyService");

class AcademyController {
  // ========================================
  // GET ALL APPROVED ACADEMIES
  // GET /api/player/academies
  // ========================================
  async getAcademies(req, res) {
    try {
      const academies =
        await academyService.getApprovedAcademies();

      return res.status(200).json({
        success: true,
        count: academies.length,
        data: academies,
      });
    } catch (error) {
      console.error(
        "GET PLAYER ACADEMIES ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load academies",
      });
    }
  }

  // ========================================
  // GET ACADEMY DETAILS
  // GET /api/player/academies/:academyId
  // ========================================
  async getAcademyById(req, res) {
    try {
      const { academyId } = req.params;

      if (!academyId || !/^\d+$/.test(academyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid academy ID",
        });
      }

      const academy =
        await academyService.getApprovedAcademyById(
          academyId
        );

      if (!academy) {
        return res.status(404).json({
          success: false,
          message: "Academy not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: academy,
      });
    } catch (error) {
      console.error(
        "GET PLAYER ACADEMY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load academy",
      });
    }
  }

  // ========================================
  // GET ACADEMY PROGRAMS
  // GET /api/player/academies/:academyId/programs
  // ========================================
  async getAcademyPrograms(req, res) {
    try {
      const { academyId } = req.params;

      if (!academyId || !/^\d+$/.test(academyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid academy ID",
        });
      }

      const academy =
        await academyService.getApprovedAcademyById(
          academyId
        );

      if (!academy) {
        return res.status(404).json({
          success: false,
          message: "Academy not found",
        });
      }

      const programs =
        await academyService.getAcademyPrograms(
          academyId
        );

      return res.status(200).json({
        success: true,
        count: programs.length,
        data: programs,
      });
    } catch (error) {
      console.error(
        "GET ACADEMY PROGRAMS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load academy programs",
      });
    }
  }

  // ========================================
  // GET ACADEMY REVIEWS
  // GET /api/player/academies/:academyId/reviews
  // ========================================
  async getAcademyReviews(req, res) {
    try {
      const { academyId } = req.params;

      if (!academyId || !/^\d+$/.test(academyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid academy ID",
        });
      }

      // ------------------------------------
      // Make sure academy exists and is approved
      // ------------------------------------
      const academy =
        await academyService.getApprovedAcademyById(
          academyId
        );

      if (!academy) {
        return res.status(404).json({
          success: false,
          message: "Academy not found",
        });
      }

      // ------------------------------------
      // Get reviews
      // ------------------------------------
      const reviews =
        await academyService.getAcademyReviews(
          Number(academyId)
        );

      return res.status(200).json({
        success: true,
        count: reviews.length,
        data: reviews,
      });
    } catch (error) {
      console.error(
        "GET ACADEMY REVIEWS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load academy reviews",
      });
    }
  }

  // ========================================
  // ADD ACADEMY REVIEW
  // POST /api/player/academies/:academyId/reviews
  // ========================================
  async addAcademyReview(req, res) {
    try {
      const { academyId } = req.params;
      const body = req.body || {};

      const rating = body.rating;
      const comment = body.comment;

      // ------------------------------------
      // Validate academy ID
      // ------------------------------------
      if (!academyId || !/^\d+$/.test(String(academyId))) {
        return res.status(400).json({
          success: false,
          message: "Invalid academy ID",
        });
      }

      // ------------------------------------
      // Validate player
      // ------------------------------------
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // ------------------------------------
      // Validate rating
      // ------------------------------------
      const numericRating = Number(rating);

      if (
        !Number.isFinite(numericRating) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }

      // ------------------------------------
      // Validate comment
      // ------------------------------------
      if (
        comment === undefined ||
        comment === null ||
        String(comment).trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          message: "Review comment is required",
        });
      }

      const playerId = Number(req.user.userId);

      // ------------------------------------
      // Add review
      // ------------------------------------
      const review =
        await academyService.addAcademyReview({
          academyId: Number(academyId),
          playerId,
          rating: numericRating,
          comment: String(comment).trim(),
        });

      return res.status(201).json({
        success: true,
        message: "Review added successfully",
        data: review,
      });
    } catch (error) {
      console.error(
        "ADD ACADEMY REVIEW ERROR:",
        error
      );

      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to add academy review",
      });
    }
  }

  // ========================================
  // DELETE ACADEMY REVIEW
  // DELETE /api/player/academies/reviews/:reviewId
  // ========================================
  async deleteAcademyReview(req, res) {
    try {
      const { reviewId } = req.params;
      const playerId = req.user?.userId;

      // ------------------------------------
      // Validate player
      // ------------------------------------
      if (!playerId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // ------------------------------------
      // Validate review ID
      // ------------------------------------
      if (!reviewId || !/^\d+$/.test(String(reviewId))) {
        return res.status(400).json({
          success: false,
          message: "Invalid review ID",
        });
      }

      // ------------------------------------
      // Delete review
      // ------------------------------------
      const deleted =
        await academyService.deleteAcademyReview({
          reviewId: Number(reviewId),
          playerId: Number(playerId),
        });

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message:
            "Review not found or you are not allowed to delete it",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Review deleted successfully",
        data: deleted,
      });
    } catch (error) {
      console.error(
        "DELETE ACADEMY REVIEW ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to delete academy review",
      });
    }
  }

  // ========================================
  // LIKE ACADEMY REVIEW
  // POST /api/player/academies/reviews/:reviewId/like
  // ========================================
  async likeAcademyReview(req, res) {
    try {
      const { reviewId } = req.params;

      // ------------------------------------
      // Validate review ID
      // ------------------------------------
      if (!reviewId || !/^\d+$/.test(String(reviewId))) {
        return res.status(400).json({
          success: false,
          message: "Invalid review ID",
        });
      }

      // ------------------------------------
      // Like review
      // ------------------------------------
      const review =
        await academyService.likeAcademyReview(
          Number(reviewId)
        );

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Review liked successfully",
        data: review,
      });
    } catch (error) {
      console.error(
        "LIKE ACADEMY REVIEW ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to like academy review",
      });
    }
  }

  // ========================================
  // SEND JOIN REQUEST
  // POST /api/player/academies/:academyId/join
  // ========================================
  async sendJoinRequest(req, res) {
    try {
      console.log("========== ACADEMY JOIN DEBUG ==========");
      console.log("PARAMS:", req.params);
      console.log("BODY:", req.body);
      console.log(
        "CONTENT TYPE:",
        req.headers["content-type"]
      );
      console.log("USER:", req.user);
      console.log("========================================");

      const { academyId } = req.params;
      const body = req.body || {};
      const programId = body.programId;

      if (
        !academyId ||
        !/^\d+$/.test(String(academyId))
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid academy ID",
        });
      }

      if (
        programId === undefined ||
        programId === null ||
        programId === "" ||
        !/^\d+$/.test(String(programId))
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid program ID is required",
          debug: {
            body: req.body,
            contentType:
              req.headers["content-type"],
          },
        });
      }

      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const playerId = Number(req.user.userId);

      const result =
        await academyService.sendJoinRequest({
          academyId: Number(academyId),
          programId: Number(programId),
          playerId,
        });

      return res.status(201).json({
        success: true,
        message: "Join request sent successfully",
        data: result,
      });
    } catch (error) {
      console.error(
        "SEND ACADEMY JOIN REQUEST ERROR:",
        error
      );

      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to send join request",
        error: error.message,
      });
    }
  }

  // ========================================
  // GET MY ACADEMY REQUESTS
  // GET /api/player/academies/requests
  // ========================================
  async getMyRequests(req, res) {
    try {
      const playerId = req.user?.userId;

      if (!playerId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const requests =
        await academyService.getPlayerRequests(
          Number(playerId)
        );

      return res.status(200).json({
        success: true,
        count: requests.length,
        data: requests,
      });
    } catch (error) {
      console.error(
        "GET PLAYER ACADEMY REQUESTS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load academy requests",
      });
    }
  }

  // ========================================
  // CANCEL JOIN REQUEST
  // DELETE /api/player/academies/requests/:requestId
  // ========================================
  async cancelJoinRequest(req, res) {
    try {
      const { requestId } = req.params;
      const playerId = req.user?.userId;

      if (!playerId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (
        !requestId ||
        !/^\d+$/.test(requestId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid request ID",
        });
      }

      const cancelled =
        await academyService.cancelJoinRequest({
          requestId: Number(requestId),
          playerId: Number(playerId),
        });

      if (!cancelled) {
        return res.status(404).json({
          success: false,
          message:
            "Join request not found or cannot be cancelled",
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Join request cancelled successfully",
        data: cancelled,
      });
    } catch (error) {
      console.error(
        "CANCEL ACADEMY JOIN REQUEST ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to cancel join request",
      });
    }
  }
}

module.exports = new AcademyController();