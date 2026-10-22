const express = require('express');
const web = require('./auth/webHandlers');
const api = require('./auth/apiHandlers');

const router = express.Router();

// Browser authentication: authorize, receive the provider callback, adopt the session.
router.get('/login', web.login);
router.get('/start', web.start);
router.get('/callback/:userFlow/:serverId', web.callback);
router.get('/complete', web.complete);

// Result pages shown on the phone after a desktop QR authentication.
router.get('/qrcode/complete', web.qrComplete);
router.get('/qrcode/error', web.qrError);

// JSON APIs for backchannel result lookup and direct mobile code exchange.
router.post('/s2s/signin', api.s2sSignin);
router.post('/mobile/login', api.mobileLogin);

module.exports = router;
