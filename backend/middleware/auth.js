// backend/middleware/auth.js
// Verifies the JWT on protected routes. Never trusts any user-supplied identity
// without checking the token signature against JWT_SECRET (from .env).
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, username: payload.username, role: payload.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Role gate — always used AFTER requireAuth (so req.user is already set and
// already verified against the JWT signature). Never trusts a role claimed by
// the client/body; only the role embedded in the signed token counts.
// Usage: router.post('/', requireAuth, requireRole('admin'), handler)
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden — you do not have permission to do this' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
