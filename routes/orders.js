// routes/orders.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

router.get("/", async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const orders = await pool.query(
      "SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC",
      [decoded.id]
    );
    res.json(orders.rows);
  } catch (err) {
    console.error("❌ FETCH ORDERS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
