const pool = require("../../../config/db");

class AcademyService {
  // ========================================
  // GET ALL APPROVED ACADEMIES
  // ========================================
  async getApprovedAcademies() {
    const query = `
      SELECT
        a.id,
        a.name,
        a.description,
        a.address,
        a.city_id,
        c.name AS city_name,
        a.image_url,
        a.owner_id,
        a.pitch_id,
        a.status,
        a.created_at,
        a.updated_at
      FROM academies AS a
      LEFT JOIN cities AS c
        ON c.id = a.city_id
      WHERE a.status = 'approved'
      ORDER BY a.created_at DESC
    `;

    const { rows } = await pool.query(query);

    return rows;
  }

  // ========================================
  // GET APPROVED ACADEMY BY ID
  // ========================================
  async getApprovedAcademyById(academyId) {
    const query = `
      SELECT
        a.id,
        a.name,
        a.description,
        a.address,
        a.city_id,
        c.name AS city_name,
        a.image_url,
        a.owner_id,
        a.pitch_id,
        a.status,
        a.created_at,
        a.updated_at
      FROM academies AS a
      LEFT JOIN cities AS c
        ON c.id = a.city_id
      WHERE a.id = $1
        AND a.status = 'approved'
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [academyId]);

    return rows[0] || null;
  }

  // ========================================
  // GET ACADEMY PROGRAMS
  // ========================================
  async getAcademyPrograms(academyId) {
    const query = `
      SELECT
        id,
        academy_id,
        name,
        description,
        level,
        price,
        duration_weeks
      FROM academy_programs
      WHERE academy_id = $1
      ORDER BY id ASC
    `;

    const { rows } = await pool.query(query, [academyId]);

    return rows;
  }

  // ========================================
  // GET ACADEMY REVIEWS
  // ========================================
  async getAcademyReviews(academyId) {
    const query = `
      SELECT
        ar.id,
        ar.academy_id,
        ar.player_id,

        u.full_name AS player_name,
        u.profile_image AS player_image,

        ar.rating,
        ar.comment,
        ar.created_at,
        ar.likes,
        ar.is_verified_player

      FROM academy_reviews AS ar

      INNER JOIN users AS u
        ON u.id = ar.player_id

      WHERE ar.academy_id = $1

      ORDER BY ar.created_at DESC
    `;

    const { rows } = await pool.query(
      query,
      [academyId]
    );

    return rows;
  }

  // ========================================
  // ADD ACADEMY REVIEW
  // ========================================
  async addAcademyReview({
    academyId,
    playerId,
    rating,
    comment,
  }) {
    // ------------------------------------
    // Check academy
    // ------------------------------------
    const academyResult = await pool.query(
      `
      SELECT id
      FROM academies
      WHERE id = $1
        AND status = 'approved'
      LIMIT 1
      `,
      [academyId]
    );

    if (academyResult.rows.length === 0) {
      const error = new Error(
        "Academy not found or not approved"
      );

      error.statusCode = 404;
      throw error;
    }

    // ------------------------------------
    // Check player
    // ------------------------------------
    const playerResult = await pool.query(
      `
      SELECT
        id,
        is_verified
      FROM users
      WHERE id = $1
        AND role = 'player'
      LIMIT 1
      `,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      const error = new Error(
        "Player not found"
      );

      error.statusCode = 404;
      throw error;
    }

    // ------------------------------------
    // Check duplicate review
    // ------------------------------------
    const existingReview = await pool.query(
      `
      SELECT id
      FROM academy_reviews
      WHERE academy_id = $1
        AND player_id = $2
      LIMIT 1
      `,
      [academyId, playerId]
    );

    if (existingReview.rows.length > 0) {
      const error = new Error(
        "You have already reviewed this academy"
      );

      error.statusCode = 409;
      throw error;
    }

    // ------------------------------------
    // Create review
    // ------------------------------------
    const result = await pool.query(
      `
      INSERT INTO academy_reviews (
        academy_id,
        player_id,
        rating,
        comment,
        is_verified_player
      )
      VALUES ($1, $2, $3, $4, $5)

      RETURNING
        id,
        academy_id,
        player_id,
        rating,
        comment,
        created_at,
        likes,
        is_verified_player
      `,
      [
        academyId,
        playerId,
        rating,
        comment,
        playerResult.rows[0].is_verified,
      ]
    );

    return result.rows[0];
  }

  // ========================================
  // DELETE ACADEMY REVIEW
  // ========================================
  async deleteAcademyReview({
    reviewId,
    playerId,
  }) {
    const query = `
      DELETE FROM academy_reviews

      WHERE id = $1
        AND player_id = $2

      RETURNING
        id,
        academy_id,
        player_id
    `;

    const { rows } = await pool.query(
      query,
      [
        reviewId,
        playerId,
      ]
    );

    return rows[0] || null;
  }

  // ========================================
  // LIKE ACADEMY REVIEW
  // ========================================
  async likeAcademyReview(reviewId) {
    const query = `
      UPDATE academy_reviews

      SET likes = likes + 1

      WHERE id = $1

      RETURNING
        id,
        likes
    `;

    const { rows } = await pool.query(
      query,
      [reviewId]
    );

    return rows[0] || null;
  }

  // ========================================
  // JOIN ACADEMY PROGRAM
  // ========================================
  async sendJoinRequest({
    academyId,
    programId,
    playerId,
  }) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // ------------------------------------
      // Check academy
      // ------------------------------------
      const academyResult = await client.query(
        `
        SELECT id
        FROM academies
        WHERE id = $1
          AND status = 'approved'
        LIMIT 1
        `,
        [academyId]
      );

      if (academyResult.rows.length === 0) {
        const error = new Error(
          "Academy not found or not approved"
        );

        error.statusCode = 404;
        throw error;
      }

      // ------------------------------------
      // Check program belongs to academy
      // ------------------------------------
      const programResult = await client.query(
        `
        SELECT
          id,
          academy_id
        FROM academy_programs
        WHERE id = $1
          AND academy_id = $2
        LIMIT 1
        `,
        [programId, academyId]
      );

      if (programResult.rows.length === 0) {
        const error = new Error(
          "Program does not belong to this academy"
        );

        error.statusCode = 400;
        throw error;
      }

      // ------------------------------------
      // Check existing enrollment
      // ------------------------------------
      const existingResult = await client.query(
        `
        SELECT
          id,
          status
        FROM academy_enrollment
        WHERE player_id = $1
          AND program_id = $2
        LIMIT 1
        `,
        [playerId, programId]
      );

      if (existingResult.rows.length > 0) {
        const error = new Error(
          "You already have a request for this program"
        );

        error.statusCode = 409;
        throw error;
      }

      // ------------------------------------
      // Create enrollment request
      // ------------------------------------
      const insertResult = await client.query(
        `
        INSERT INTO academy_enrollment (
          academy_id,
          program_id,
          player_id,
          status
        )
        VALUES ($1, $2, $3, 'pending')

        RETURNING
          id,
          academy_id,
          program_id,
          player_id,
          status,
          enrolled_at
        `,
        [
          academyId,
          programId,
          playerId,
        ]
      );

      await client.query("COMMIT");

      return insertResult.rows[0];

    } catch (error) {
      await client.query("ROLLBACK");
      throw error;

    } finally {
      client.release();
    }
  }

  // ========================================
  // GET PLAYER REQUESTS
  // ========================================
  async getPlayerRequests(playerId) {
    const query = `
      SELECT
        ae.id,
        ae.academy_id,
        ae.program_id,
        ae.player_id,
        ae.status,
        ae.enrolled_at,

        a.name AS academy_name,
        a.image_url AS academy_image,

        ap.name AS program_name,
        ap.level AS program_level,
        ap.price AS program_price,
        ap.duration_weeks

      FROM academy_enrollment AS ae

      INNER JOIN academies AS a
        ON a.id = ae.academy_id

      INNER JOIN academy_programs AS ap
        ON ap.id = ae.program_id

      WHERE ae.player_id = $1

      ORDER BY ae.enrolled_at DESC
    `;

    const { rows } = await pool.query(
      query,
      [playerId]
    );

    return rows;
  }

  // ========================================
  // CANCEL JOIN REQUEST
  // ========================================
  async cancelJoinRequest({
    requestId,
    playerId,
  }) {
    const query = `
      UPDATE academy_enrollment

      SET status = 'cancelled'

      WHERE id = $1
        AND player_id = $2
        AND status = 'pending'

      RETURNING
        id,
        academy_id,
        program_id,
        player_id,
        status,
        enrolled_at
    `;

    const { rows } = await pool.query(
      query,
      [
        requestId,
        playerId,
      ]
    );

    return rows[0] || null;
  }
}

module.exports = new AcademyService();