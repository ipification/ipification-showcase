const express = require('express');
const handlers = require('./ts43/handlers');

const router = express.Router();

// TS43 authentication, client diagnostics, and session completion.
router.post('/auth', handlers.auth);
router.post('/log', handlers.log);
router.post('/token', handlers.token);

module.exports = router;
