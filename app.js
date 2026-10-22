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
const { createTs43AuthRateLimiter } = require('./middleware/ts43RateLimit');
const { createAppLocalsMiddleware } = require('./middleware/appLocals');
const { setupPlayIntegrity } = require('./bootstrap/playIntegrity');

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

// Shared request context must be available to every route below.
app.use(createAppLocalsMiddleware({ config, locale }));

// Keep the feature's 16kb JSON parser and safe errors ahead of the general parsers.
setupPlayIntegrity(app, { config });

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
