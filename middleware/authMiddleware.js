const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

const getUserOrGuest = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (token) {
      // ✅ যদি লগইন করা থাকে (token থেকে user যাচাই)
      const decoded = jwt.verify(token, JWT_SECRET);
      const userResult = await db.query('SELECT id FROM users WHERE id=$1', [decoded.id]);

      if (userResult.rows.length) {
        req.user = { id: userResult.rows[0].id };
        req.cartOwner = { type: 'user', id: req.user.id };
        return next();
      }
    }

    // ✅ না থাকলে guest cookie থেকে session ID নাও
    let sessionId = req.cookies.userId;
    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('hex');
      res.cookie('userId', sessionId, { httpOnly: true, sameSite: 'lax' });
    }
    req.cartOwner = { type: 'guest', id: sessionId };
    next();
  } catch (err) {
    console.error('❌ Auth middleware error:', err.message);
    // fallback guest
    let sessionId = req.cookies.userId;
    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('hex');
      res.cookie('userId', sessionId, { httpOnly: true, sameSite: 'lax' });
    }
    req.cartOwner = { type: 'guest', id: sessionId };
    next();
  }
};

module.exports = { getUserOrGuest };
