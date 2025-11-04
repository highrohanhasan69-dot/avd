// middleware/authMiddleware.js
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;

const isProd = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  sameSite: isProd ? "None" : "Lax",
  secure: isProd,
  maxAge: 1000 * 60 * 60 * 24 * 30,
};

// ✅ Logged-in or Guest detect
const getUserOrGuest = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userRes = await db.query("SELECT id, role FROM users WHERE id=$1", [decoded.id]);

      if (userRes.rows.length) {
        req.user = { id: userRes.rows[0].id, role: userRes.rows[0].role || "user" };
        req.cartOwner = { type: "user", id: req.user.id };
        return next();
      }
    }

    let guestId = req.cookies?.guest_session;
    if (!guestId) {
      guestId = "guest_" + crypto.randomBytes(12).toString("hex") + Date.now().toString(36);
      res.cookie("guest_session", guestId, cookieOptions);
      console.log("🆕 New guest session created:", guestId);
    }

    req.cartOwner = { type: "guest", id: guestId };
    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);

    let fallbackId = req.cookies?.guest_session;
    if (!fallbackId) {
      fallbackId = "guest_" + crypto.randomBytes(12).toString("hex") + Date.now().toString(36);
      res.cookie("guest_session", fallbackId, cookieOptions);
    }
    req.cartOwner = { type: "guest", id: fallbackId };
    next();
  }
};

// ✅ Admin only
const adminOnly = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: "Unauthorized: No token found" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userRes = await db.query("SELECT id, role FROM users WHERE id=$1", [decoded.id]);
    if (!userRes.rows.length) return res.status(401).json({ message: "Unauthorized user" });

    const role = userRes.rows[0].role || decoded.role;
    if (role !== "admin") {
      return res.status(403).json({ message: "Access denied: Admins only" });
    }

    req.user = { id: decoded.id, role: role };
    next();
  } catch (err) {
    console.error("JWT verification error:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = { getUserOrGuest, adminOnly };
