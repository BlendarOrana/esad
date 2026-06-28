import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import crypto from "crypto";

// Routes
import apiRoutes from "./routes/api.routes.js";

// Libs
import { connectDB } from "./lib/db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.resolve();

app.set("trust proxy", 1);

// ---------------- SECURITY ----------------
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "img-src": [
          "'self'",
          "data:",
          "https://d1pjgmze6j7fh9.cloudfront.net",
        ],
      },
    },
  })
);

app.use(compression());

// ---------------- RATE LIMITS ----------------
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15000,
  message: { error: "Too many requests, try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 110000000,
  message: { error: "Too many login attempts, try again later." },
});

// ---------------- BODY PARSERS ----------------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// ---------------- CORS ----------------
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (React Native mobile app, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
console.log("CORS is allowing requests from:", allowedOrigins);

// ---------------- CSRF ----------------
app.get("/api/csrf-token", (req, res) => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrf-token", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ csrfToken: token });
});

const validateCsrf = (req, res, next) => {
  // Skip CSRF for mobile app (uses Bearer tokens, immune to CSRF by design)
  const clientType = req.headers["x-client-type"];
  if (clientType === "mobile") {
    return next();
  }

  // Skip CSRF for Bearer token requests (authenticated mobile calls)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return next();
  }

  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const headerToken = req.headers["csrf-token"];
    const cookieToken = req.cookies["csrf-token"];
    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      return res.status(403).json({
        message: "Invalid CSRF token",
        code: "EBADCSRFTOKEN",
      });
    }
  }
  next();
};

// ---------------- GLOBAL API LIMIT ----------------
app.use("/api", apiLimiter);

// ---------------- AUTH RATE LIMIT (scoped to /api/auth/*) ----------------
app.use("/api/auth", authLimiter);

// ---------------- CSRF VALIDATION (all /api state-changing requests) ----------------
app.use("/api", validateCsrf);

// ---------------- ROUTES ----------------
app.use("/api", apiRoutes);

// ---------------- HEALTH CHECK ----------------
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// ---------------- PRODUCTION FRONTEND ----------------
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "frontend/dist")));
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "dist", "index.html"));
  });
}

// ---------------- ERROR HANDLER ----------------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message || "Server Error",
  });
});

// ---------------- START SERVER ----------------
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await connectDB();
});