import jwt from "jsonwebtoken";
import { promisePool } from "../lib/db.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  path: "/",
};

export const protectRoute = async (req, res, next) => {
  let accessToken = req.cookies?.accessToken;

  if (!accessToken) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }
  }

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized - No access token provided" });
  }

  try {
    const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);

    const result = await promisePool.query(
      'SELECT id, name FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    const message = error.name === "TokenExpiredError"
      ? "Unauthorized - Access token expired"
      : "Unauthorized - Invalid access token";

    return res.status(401).json({ message });
  }
};