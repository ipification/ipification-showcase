const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const createError = require('http-errors');
const config = require('config');
const helmet = require("helmet");
const fs = require('fs');

require('dotenv').config()

const { deepMerge } = require('./utils/helpers');
const { validateConfig } = require('./utils/validateConfig');
const { getAuthServer } = require('./utils/authServerHelper');
const { createPlayIntegrityService } = require('./services/playIntegrityService');
const { createPlayIntegrityAttemptService } = require('./services/playIntegrityAttemptService');
const { createPlayIntegrityRouter } = require('./routes/playIntegrity');
const dataStore = require('./lib/data_store');
const { exchangeCodeAndGetUserInfo } = require('./utils/httpClient');
const appLogger = require('./utils/logger');
const { createTs43AuthRateLimiter } = require('./middleware/ts43RateLimit');

// Load locale.json and merge with locale from default.json if exists
const localePath = path.join(__dirname, 'config', 'locale.json');
const defaultLocale = JSON.parse(fs.readFileSync(localePath, 'utf8'));

const locale = config.locale ? deepMerge(defaultLocale, config.locale) : defaultLocale;

// Validate configuration on startup
validateConfig(config);

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false
}));

app.set('trust proxy', 1);
app.locals.pretty = true;

// app.use(nocache());
logger.token('isoDate', () => new Date().toISOString());
const isAssetRequest = (req) => {
  const assetExtensions = /\.(css|js|map|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i;
  return req.path.startsWith('/public/') || assetExtensions.test(req.path);
};

app.use(logger(':isoDate :method :url :status :response-time ms - :res[content-length]', {
  skip: (req) => isAssetRequest(req)
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(session({
  secret: 'secret-session-key',
  resave: false,
  saveUninitialized: true,
}));

app.use(cookieParser());
app.use(require('stylus').middleware({ src: __dirname + '/public' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {

  const { client_id, client_secret, clients } = config;
  const customClients = clients.map(client => ({
    ...client,
    client_id: client.client_id || client_id,
    client_secret: client.client_secret || client_secret,
  }));

  res.locals = {
    ...res.locals,
    title: 'IPification Showcase',
    ...config,
    clients: customClients,
    locale: locale,
    baseUrl: `${req.protocol}://${req.headers.host}`,
    get_flow_title: (user_flow, default_title) => {
      const client = config.clients.find(item => item.user_flow === user_flow);
      return client ? client.title : default_title;
    },
    getAuthServer: (serverId) => getAuthServer(config.auth_servers, serverId),
    app_env: process.env.NODE_ENV || 'development'
  }

  // res.setHeader('Server', 'IPification');

  next();
});

if (process.env.PLAY_INTEGRITY_ENABLED === 'true') {
  const bypassVerification = process.env.PLAY_INTEGRITY_BYPASS_VERIFICATION === 'true';
  const allowVerificationBypass = bypassVerification && process.env.NODE_ENV !== 'production';
  if (bypassVerification && !allowVerificationBypass) {
    appLogger.warn('PLAY_INTEGRITY_BYPASS_VERIFICATION is ignored in production');
  }
  const { verify } = createPlayIntegrityService({
    packageName: process.env.PLAY_INTEGRITY_PACKAGE_NAME,
    requireLicensedApp: process.env.PLAY_INTEGRITY_REQUIRE_LICENSED_APP === 'true',
    timeoutMs: 10_000,
  });
  const attemptService = createPlayIntegrityAttemptService({
    dataStore,
    stateSecret: process.env.PLAY_INTEGRITY_STATE_SECRET,
    stateIssuer: process.env.PLAY_INTEGRITY_STATE_ISSUER,
    stateAudience: process.env.PLAY_INTEGRITY_STATE_AUDIENCE,
  });
  app.use('/api/play-integrity', createPlayIntegrityRouter({
    attemptService,
    verify,
    exchangeCodeAndGetUserInfo,
    expectedPackageName: process.env.PLAY_INTEGRITY_PACKAGE_NAME,
    userFlow: process.env.PLAY_INTEGRITY_USER_FLOW,
    bypassVerification: allowVerificationBypass,
  }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const indexRouter = require('./routes/index');
const userRouter = require('./routes/user');
const authRouter = require('./routes/auth');
const ts43Router = require('./routes/ts43');
const smsRouter = require('./routes/sms');

app.use('/', indexRouter);
app.use('/user', userRouter);
app.use('/auth', authRouter);
app.use('/ts43/auth', createTs43AuthRateLimiter());
app.use('/ts43', ts43Router);
app.use('/sms', smsRouter);

// error handler
app.use(function (err, req, res, next) {
  next(createError(500, err.message));
});

module.exports = app;
