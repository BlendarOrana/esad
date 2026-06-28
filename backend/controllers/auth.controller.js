import jwt from "jsonwebtoken";
import { promisePool } from "../lib/db.js";
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const ACCESS_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/",
};

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: `${ACCESS_TOKEN_EXPIRY_SECONDS}s`,
  });
};

// ── LOGIN ──────────────────────────────────────────────
export const login = async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: "Name and password are required" });
  }
  try {
    const result = await promisePool.query(
      'SELECT * FROM users WHERE name = $1',
      [name]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(400).json({ message: "Invalid name or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid name or password" });
    }

    const accessToken = generateAccessToken(user.id);

    // Cookie for web clients
    res.cookie("accessToken", accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_EXPIRY_SECONDS ,
    });

    // Token in body for mobile clients (AsyncStorage can't read httpOnly cookies)
    return res.json({ _id: user.id, name: user.name, token: accessToken });
} catch (error) {
  console.error("LOGIN FULL ERROR:", error); // 👈 IMPORTANT
  return res.status(500).json({
    message: error.message,
    stack: error.stack,
  });
}};
// ── LOGOUT ────────────────────────────────────────────
export const logout = (req, res) => {
  try {
    res.clearCookie("accessToken", COOKIE_OPTIONS);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ── GET ME ────────────────────────────────────────────
export const getMe = (req, res) => {
  const { id, name } = req.user;
  res.json({ _id: id, name });
};