const { Prisma } = require('@prisma/client');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A record with this unique value already exists', code: err.code });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found', code: err.code });
    }
    return res.status(400).json({ error: 'Database request error', code: err.code });
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: 'Invalid data for this entity' });
  }
  const status = err.status || 500;
  if (status >= 500) {
    // Log the real error server-side, but never return it: a 500 message can
    // carry connection strings, file paths or driver internals.
    console.error(err);
    const body = { error: 'Internal server error' };
    if (process.env.NODE_ENV !== 'production') body.detail = err.message;
    return res.status(status).json(body);
  }
  // 4xx messages are deliberate and safe to surface.
  res.status(status).json({ error: err.message || 'Request failed' });
}

function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
