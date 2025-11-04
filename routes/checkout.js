// routes/checkout.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getUserOrGuest } = require("../middleware/authMiddleware");
const { cookieOptions } = require("../utils/cookies");

const JWT_SECRET = process.env.JWT_SECRET;

router.post("/", getUserOrGuest, async (req, res) => {
  const { items, total, customer, payment_method } = req.body;

  if (!items || !total || !customer) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let userId = null;

    // 1) Logged-in থাকলে ID নাও
    const token = req.cookies.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (e) {
        userId = null;
      }
    }

    // 2) না থাকলে phone দিয়ে user find-or-create
    if (!userId && customer.phone) {
      const phone = customer.phone;
      const email = `${phone}@auto.avado.com`;
      const passwordPlain = phone; // simple auto password

      const existingUser = await client.query("SELECT id, role FROM users WHERE phone=$1", [phone]);

      let roleForToken = "user";

      if (existingUser.rows.length) {
        userId = existingUser.rows[0].id;
        roleForToken = existingUser.rows[0].role || "user";
      } else {
        const hashedPassword = await bcrypt.hash(passwordPlain, 10);
        const newUser = await client.query(
          "INSERT INTO users (email, phone, password) VALUES ($1,$2,$3) RETURNING id, role",
          [email, phone, hashedPassword]
        );
        userId = newUser.rows[0].id;
        roleForToken = newUser.rows[0].role || "user";
      }

      // ✅ auto-login cookie (role সহ)
      const newToken = jwt.sign({ id: userId, role: roleForToken }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("token", newToken, cookieOptions);
    }

    // 3) discount-safe price fix
    const fixedItems = items.map((item) => {
      let price = Number(item.price);
      if (item.discount_percent) {
        price = price - (price * Number(item.discount_percent)) / 100;
      }
      return { ...item, price };
    });

    // 4) order insert
    const insertQuery = `
      INSERT INTO orders (
        user_id, session_id, items, total, customer, payment_method, status, order_date, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      RETURNING *;
    `;

    const order = await client.query(insertQuery, [
      userId,
      req.cartOwner?.id || null,
      JSON.stringify(fixedItems),
      total,
      JSON.stringify(customer),
      payment_method || "Cash on Delivery",
      "pending",
    ]);

    // 5) cart clear
    if (userId) {
      await client.query("DELETE FROM carts WHERE user_id=$1", [userId]);
    } else if (req.cartOwner?.id) {
      await client.query("DELETE FROM carts WHERE session_id=$1", [req.cartOwner.id]);
    }

    await client.query("COMMIT");
    res.json({ success: true, order: order.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Checkout Error:", err);
    res.status(500).json({ error: "Checkout failed", details: err.message });
  } finally {
    client.release();
  }
});

// My Orders / Admin endpoints (unchanged)
module.exports = router;
