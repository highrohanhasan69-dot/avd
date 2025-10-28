// routes/auth.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// 🌐 Dynamic Base URL (Local + Render)
const getBaseURL = () => {
  return process.env.NODE_ENV === "production"
    ? "https://avado-backend.onrender.com"
    : `http://localhost:${process.env.PORT || 5000}`;
};

// ---------------- SIGNUP ----------------
router.post('/signup', async (req, res) => {
  const { email, password, phone } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email & Password required' });

  try {
    const userExists = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (userExists.rows.length)
      return res.status(400).json({ message: 'Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password, phone) VALUES ($1,$2,$3) RETURNING id,email,phone',
      [email, hashedPassword, phone]
    );

    res.json({ message: 'Signup successful', user: result.rows[0] });
  } catch (err) {
    console.error("❌ SIGNUP ERROR:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------- LOGIN ----------------
router.post('/login', async (req, res) => {
  const { loginInput, password } = req.body;
  if (!loginInput || !password)
    return res.status(400).json({ message: 'Input & password required' });

  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email=$1 OR phone=$1',
      [loginInput]
    );

    if (!userResult.rows.length)
      return res.status(400).json({ message: 'User not found' });
    const user = userResult.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid password' });

    // ✅ JWT Cookie (Dynamic domain + Secure config)
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      sameSite: isProd ? "None" : "Lax",
      secure: isProd, // Cloudflare uses HTTPS, so secure must be true
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    res.cookie('token', token, cookieOptions);

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, phone: user.phone },
    });
  } catch (err) {
    console.error("❌ LOGIN ERROR:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------- CURRENT USER ----------------
router.get('/current-user', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userResult = await pool.query('SELECT id,email,phone FROM users WHERE id=$1', [decoded.id]);
    if (!userResult.rows.length)
      return res.status(404).json({ message: 'User not found' });

    res.json({ user: userResult.rows[0] });
  } catch (err) {
    console.error("❌ CURRENT USER ERROR:", err);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// ---------------- LOGOUT ----------------
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: isProd ? "None" : "Lax",
    secure: isProd,
  });
  res.json({ message: 'Logged out successfully' });
});

// ---------------- UPDATE ACCOUNT ----------------
router.put('/account', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const { email, phone, password } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    let query = 'UPDATE users SET ';
    const params = [];
    let i = 1;

    if (email) {
      query += `email=$${i},`;
      params.push(email);
      i++;
    }
    if (phone) {
      query += `phone=$${i},`;
      params.push(phone);
      i++;
    }
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query += `password=$${i},`;
      params.push(hashed);
      i++;
    }

    query = query.slice(0, -1); // remove trailing comma
    query += ` WHERE id=$${i} RETURNING id,email,phone`;
    params.push(decoded.id);

    const result = await pool.query(query, params);
    res.json({ message: 'Account updated', user: result.rows[0] });
  } catch (err) {
    console.error("❌ UPDATE ACCOUNT ERROR:", err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
