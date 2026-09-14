const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_IP_MAX_REQUESTS = 20;
const DEFAULT_IDENTITY_MAX_REQUESTS = 5;

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function hashLoginHint(loginHint) {
  return crypto.createHash('sha256').update(String(loginHint || '')).digest('hex');
}

function createRateLimitHandler() {
  return (req, res, _next, options) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfter = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(options.windowMs / 1000);

    res.set('Retry-After', String(retryAfter));
    res.status(options.statusCode).json({ error: 'RATE_LIMITED' });
  };
}

function createTs43AuthRateLimiter(options = {}) {
  const windowMs = readPositiveInteger(options.windowMs || process.env.TS43_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
  const maxRequests = readPositiveInteger(options.maxRequests, 0);
  const ipMaxRequests = maxRequests || readPositiveInteger(options.ipMaxRequests || process.env.TS43_RATE_LIMIT_IP_MAX, DEFAULT_IP_MAX_REQUESTS);
  const identityMaxRequests = maxRequests || readPositiveInteger(options.identityMaxRequests || process.env.TS43_RATE_LIMIT_IDENTITY_MAX, DEFAULT_IDENTITY_MAX_REQUESTS);
  const handler = createRateLimitHandler();

  const ipLimiter = rateLimit({
    windowMs,
    limit: ipMaxRequests,
    identifier: 'ts43-auth-ip',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
  });
  const identityLimiter = rateLimit({
    windowMs,
    limit: identityMaxRequests,
    identifier: 'ts43-auth-identity',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${req.body?.client_id || ''}:${hashLoginHint(req.body?.login_hint)}`,
    handler,
  });

  return (req, res, next) => {
    ipLimiter(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }
      identityLimiter(req, res, next);
    });
  };
}

module.exports = { createTs43AuthRateLimiter };
