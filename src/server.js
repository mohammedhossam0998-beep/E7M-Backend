require("dotenv").config();

require("./firebase");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

// ========================================
// COMPETITION EXPIRATION JOB
// ========================================

const {
  startCompetitionExpirationJob,
} = require("./jobs/competitionExpirationJob");

// ========================================
// PLAYER ACADEMY ROUTES
// ========================================

const playerAcademyRoutes =
  require("./player/academy/routes/academyRoutes");

// ========================================
// PLAYER PROFILE ROUTES
// ========================================

const playerProfileRoutes =
  require("./routes/playerProfileRoutes");

// ========================================
// PLAYER FAVORITES ROUTES
// ========================================

const playerFavoritesRoutes =
  require("./routes/playerFavoritesRoutes");

// ========================================
// PLAYER OFFER ROUTES
// ========================================

const playerOfferRoutes =
  require("./routes/playerOfferRoutes");

// ========================================
// PLAYER TEAM ROUTES
// ========================================

const teamRoutes =
  require("./routes/teamRoutes");

const teamChatRoutes =
  require("./routes/teamChatRoutes");

// ========================================
// PLAYER HELP & SUPPORT ROUTES
// ========================================

const helpSupportRoutes =
  require("./routes/helpSupportRoutes");

// ========================================
// OWNER ACADEMY ROUTES
// ========================================

const academyRoutes =
  require("./routes/academyRoutes");

const academyScheduleRoutes =
  require("./routes/academyScheduleRoutes");

// ========================================
// OWNER OFFER ROUTES
// ========================================

const offerRoutes =
  require("./routes/offerRoutes");

// ========================================
// ROUTES
// ========================================

const cmsRoutes =
  require("./routes/cmsRoutes");

const authRoutes =
  require("./routes/authRoutes");

const ownerRoutes =
  require("./routes/ownerRoutes");

const playerPitchRoutes =
  require("./routes/playerPitchRoutes");

const playerCompetitionRoutes =
  require("./routes/playerCompetitionRoutes");

const bookingRoutes =
  require("./routes/bookingRoutes");

const adminRoutes =
  require("./routes/adminRoutes");

const reportRoutes =
  require("./routes/reportRoutes");

const bannerRoutes =
  require("./routes/bannerRoutes");

const adminCoachRoutes =
  require("./routes/adminCoachRoutes");

const paymentRoutes =
  require("./routes/paymentRoutes");

const reviewRoutes =
  require("./routes/reviewRoutes");

const ownerReviewRoutes =
  require("./routes/ownerReviewRoutes");

// ========================================
// SUPPORT ROUTES
// ========================================

const supportRoutes =
  require("./routes/supportRoutes");

// ========================================
// NOTIFICATION ROUTES
// ========================================

const notificationRoutes =
  require("./routes/notificationRoutes");

const {
  createNotification,
} = require("./controllers/notificationController");

// ========================================
// CITY ROUTES
// ========================================

const cityRoutes =
  require("./routes/cityRoutes");

// ========================================
// PITCH IMAGE ROUTES
// ========================================

const pitchImageRoutes =
  require("./routes/pitchImageRoutes");

// ========================================
// AVAILABILITY ROUTES
// ========================================

const availabilityRoutes =
  require("./routes/availabilityRoutes");

// ========================================
// EMAIL SERVICE
// ========================================

const {
  verifyEmailConnection,
} = require("./utils/emailService");

// ========================================
// DATABASE
// ========================================

const pool = require("./config/db");

// ========================================
// APP
// ========================================

const app = express();

// ========================================
// SECURITY
// ========================================

app.use(helmet());

// ========================================
// CORS
// ========================================

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {

      // Allow non-browser requests
      // such as Postman

      if (!origin) {
        return callback(null, true);
      }

      // Allow configured origins

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any localhost port
      // during development

      if (
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/localhost:\d+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error("CORS origin not allowed")
      );
    },

    credentials: true,
  })
);

// ========================================
// BODY PARSING
// ========================================

app.use(
  express.json({
    limit: "1mb",
  })
);

// ========================================
// RATE LIMITING
// ========================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // General API requests
  max: 300,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many requests. Please try again later.",
  },
});

// ========================================
// AUTH RATE LIMITER
// ========================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // Authentication requests
  max: 50,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    code: "AUTH_RATE_LIMITED",
    message:
      "Too many authentication requests. Please try again later.",
  },
});

// ========================================
// APPLY RATE LIMITERS
// ========================================

app.use(
  "/api",
  apiLimiter
);

app.use(
  "/api/auth",
  authLimiter
);

// ========================================
// STATIC UPLOADS
// ========================================

app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "../uploads")
  )
);

// ========================================
// ROUTES
// ========================================

// ========================================
// PLAYER ACADEMY
// ========================================

app.use(
  "/api/player/academies",
  playerAcademyRoutes
);

// ========================================
// PLAYER PROFILE
// ========================================

app.use(
  "/api/player",
  playerProfileRoutes
);

// ========================================
// PLAYER FAVORITES
// ========================================

app.use(
  "/api/player",
  playerFavoritesRoutes
);

// ========================================
// PLAYER OFFERS
// ========================================

app.use(
  "/api/player/offers",
  playerOfferRoutes
);

// ========================================
// PLAYER TEAMS
// ========================================

app.use(
  "/api/player/teams",
  teamRoutes
);

app.use(
  "/api/player/teams",
  teamChatRoutes
);

// ========================================
// PLAYER HELP & SUPPORT
// ========================================

app.use(
  "/api/player/help-support",
  helpSupportRoutes
);

// ========================================
// PLAYER COMPETITIONS
// ========================================

app.use(
  "/api/player/competitions",
  playerCompetitionRoutes
);

// ========================================
// AUTH
// ========================================

app.use(
  "/api/auth",
  authRoutes
);

// ========================================
// ADMIN
// ========================================

app.use(
  "/api/admin",
  adminRoutes
);

// ========================================
// ADMIN COACHES
// ========================================

app.use(
  "/api/admin/coaches",
  adminCoachRoutes
);

// ========================================
// OWNER
// ========================================

app.use(
  "/api/owner",
  ownerRoutes
);

// ========================================
// OWNER REVIEWS
// ========================================

app.use(
  "/api/owner",
  ownerReviewRoutes
);

// ========================================
// OWNER ACADEMY
// ========================================
//
// Academy is a separate Owner module.
//
// Final endpoints:
//
// POST /api/owner/academies
// GET  /api/owner/academies
// GET  /api/owner/academies/:id
// PUT  /api/owner/academies/:id
//
// POST /api/owner/academies/:academyId/programs
// GET  /api/owner/academies/:academyId/programs
//
// ========================================

app.use(
  "/api/owner/academies",
  academyRoutes
);

app.use(
  "/api/owner/academies",
  academyScheduleRoutes
);

// ========================================
// OWNER OFFERS
// ========================================

app.use(
  "/api/owner/offers",
  offerRoutes
);

// ========================================
// OWNER PITCH IMAGES
// ========================================
//
// Final endpoint:
//
// POST
// /api/owner/pitches/:id/images
//
// ========================================

app.use(
  "/api/owner/pitches",
  pitchImageRoutes
);

// ========================================
// PLAYER PITCHES
// ========================================

app.use(
  "/api/pitches",
  playerPitchRoutes
);

// ========================================
// BOOKINGS
// ========================================

app.use(
  "/api/bookings",
  bookingRoutes
);

// ========================================
// REVIEWS
// ========================================

app.use(
  "/api/reviews",
  reviewRoutes
);

// ========================================
// PAYMENTS
// ========================================

app.use(
  "/api/payments",
  paymentRoutes
);

// ========================================
// SUPPORT
// ========================================

app.use(
  "/api/support",
  supportRoutes
);

// ========================================
// NOTIFICATIONS
// ========================================

app.use(
  "/api/notifications",
  notificationRoutes
);

// ========================================
// REPORTS
// ========================================

app.use(
  "/api/reports",
  reportRoutes
);

// ========================================
// BANNERS
// ========================================

app.use(
  "/api/banners",
  bannerRoutes
);

// ========================================
// CMS
// ========================================

app.use(
  "/api/cms",
  cmsRoutes
);

// ========================================
// CITIES
// ========================================
//
// GET /api/cities
// GET /api/cities/:id
//
// ========================================

app.use(
  "/api/cities",
  cityRoutes
);

// ========================================
// AVAILABILITY
// ========================================

app.use(
  "/api",
  availabilityRoutes
);

// ========================================
// HEALTH CHECK
// ========================================

app.get(
  "/",
  (req, res) => {

    return res.json({
      success: true,
      message: "E7M API is running 🚀",
    });

  }
);

// ========================================
// 404
// ========================================

app.use(
  (req, res) => {

    return res.status(404).json({
      success: false,
      message: "Route not found",
    });

  }
);

// ========================================
// GLOBAL ERROR HANDLER
// ========================================

app.use(
  (err, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      err
    );

    const isProduction =
      process.env.NODE_ENV === "production";

    return res.status(
      err.status || 500
    ).json({

      success: false,

      message:
        isProduction &&
        (err.status || 500) >= 500
          ? "Internal server error"
          : err.message ||
            "Internal server error",

    });

  }
);

// ========================================
// HTTP SERVER + SOCKET.IO
// ========================================

const PORT =
  process.env.PORT || 5000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow non-browser clients
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/localhost:\d+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error("Socket.IO CORS origin not allowed")
      );
    },

    credentials: true,
  },
});

// ========================================
// SOCKET AUTHENTICATION
// ========================================

const {
  authenticateSocket,
} = require("./middleware/socketAuthMiddleware");

io.use(authenticateSocket);

// ========================================
// SOCKET.IO CONNECTION
// ========================================

io.on("connection", (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  console.log(`👤 Socket user: ${socket.user.userId}`);

  socket.on("team:join", async (teamId, callback) => {
    try {
      const parsedTeamId = Number(teamId);

      if (!Number.isInteger(parsedTeamId) || parsedTeamId <= 0) {
        return callback?.({
          success: false,
          message: "Invalid team ID",
        });
      }

      const membershipResult = await pool.query(
        `
        SELECT 1
        FROM team_members
        WHERE team_id = $1
          AND player_id = $2
        LIMIT 1
        `,
        [parsedTeamId, socket.user.userId]
      );

      if (membershipResult.rows.length === 0) {
        return callback?.({
          success: false,
          message: "You are not a member of this team",
        });
      }

      const roomName = `team:${parsedTeamId}`;

      socket.join(roomName);

      console.log(
        `👥 User ${socket.user.userId} joined ${roomName}`
      );

      return callback?.({
        success: true,
        teamId: parsedTeamId,
        room: roomName,
      });
    } catch (error) {
      console.error("TEAM SOCKET JOIN ERROR:", error);

      return callback?.({
        success: false,
        message: "Failed to join team room",
      });
    }
  });

  socket.on("team:send_message", async (data, callback) => {
    try {
      const teamId = Number(data?.teamId);
      const message = String(data?.message ?? "").trim();

      if (!Number.isInteger(teamId) || teamId <= 0) {
        return callback?.({
          success: false,
          message: "Invalid team ID",
        });
      }

      if (!message) {
        return callback?.({
          success: false,
          message: "Message cannot be empty",
        });
      }

      if (message.length > 2000) {
        return callback?.({
          success: false,
          message: "Message is too long",
        });
      }

      const membershipResult = await pool.query(
        `
        SELECT 1
        FROM team_members
        WHERE team_id = $1
          AND player_id = $2
        LIMIT 1
        `,
        [teamId, socket.user.userId]
      );

      if (membershipResult.rows.length === 0) {
        return callback?.({
          success: false,
          message: "You are not a member of this team",
        });
      }

      const roomName = `team:${teamId}`;

      const result = await pool.query(
        `
        INSERT INTO team_messages
          (team_id, sender_id, message)
        VALUES
          ($1, $2, $3)
        RETURNING
          id,
          team_id,
          sender_id,
          message,
          created_at
        `,
        [teamId, socket.user.userId, message]
      );

      const savedMessage = result.rows[0];

      savedMessage.full_name = socket.user.full_name;
      savedMessage.profile_image = socket.user.profile_image;

      // ========================================================
      // TEAM CHAT NOTIFICATION
      // ========================================================

      const teamMembersResult = await pool.query(
        `
          SELECT player_id
          FROM team_members
          WHERE team_id = $1
            AND player_id != $2
        `,
        [teamId, socket.user.userId]
      );

      for (const member of teamMembersResult.rows) {
        await createNotification({
          userId: member.player_id,
          title: socket.user.full_name || "Team Message",
          message: message,
          type: "team_chat",
          teamId: teamId,
        });
      }

      io.to(roomName).emit(
        "team:new_message",
        savedMessage
      );

      callback?.({
        success: true,
        data: savedMessage,
      });

      console.log(
        `💬 Team ${teamId}: message ${savedMessage.id} sent by ${socket.user.userId}`
      );
    } catch (error) {
      console.error("TEAM SOCKET MESSAGE ERROR:", error);

      callback?.({
        success: false,
        message: "Failed to send message",
      });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(
      `🔌 Socket disconnected: ${socket.id} - ${reason}`
    );
  });
});

// ========================================
// START SERVER
// ========================================

httpServer.listen(
  PORT,
  async () => {
    console.log(
      `🚀 Server running on port ${PORT}`
    );

    console.log(
      `🔌 Socket.IO ready`
    );

    await verifyEmailConnection();

    // Start competition expiration job
    startCompetitionExpirationJob();
  }
);