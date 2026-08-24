// backend/middleware/errorHandler.js
// Central error handler: logs full detail server-side, sends only a safe generic
// message to the client. Never forwards SQL text, stack traces, or credentials.
function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -`, err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : (err.publicMessage || err.message);
  res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
