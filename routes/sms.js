const express = require('express');
const handlers = require('./sms/handlers');

const router = express.Router();

// SMS authentication, client diagnostics, and session completion.
router.post('/auth', handlers.auth);
router.post('/log', handlers.log);
router.post('/token', handlers.token);

module.exports = router;
