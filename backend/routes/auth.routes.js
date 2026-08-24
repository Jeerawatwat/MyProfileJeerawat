// backend/routes/auth.routes.js
// Login checks the real `Users` table (id, username, password [bcrypt hash], role).
// Never compares passwords as plain text, never fakes a login in JS.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [rows] = await pool.execute(
      'SELECT id, username, password, role FROM Users WHERE username = ? LIMIT 1',
      [username]
    );

    const user = rows[0];
    // Same generic error whether the username doesn't exist or the password is wrong —
    // never reveal which one it was.
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    return next(err);
  }
});

// Stateless JWT — there's no server-side session to destroy, but we expose a
// logout endpoint for symmetry/logging and so the frontend has a real API to call.
router.post('/logout', requireAuth, (req, res) => {
  res.json({ success: true });
});

// Lets the frontend validate a persisted token on app start and re-hydrate the
// logged-in user without asking them to log in again every time they open the app.
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
