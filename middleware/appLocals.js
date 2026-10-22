const { getAuthServer } = require('../utils/authServerHelper');

/** Build the request locals used by page rendering and authentication handlers. */
function createAppLocalsMiddleware({ config, locale }) {
  return function appLocals(req, res, next) {
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
      locale,
      baseUrl: `${req.protocol}://${req.headers.host}`,
      get_flow_title: (user_flow, default_title) => {
        const client = config.clients.find(item => item.user_flow === user_flow);
        return client ? client.title : default_title;
      },
      getAuthServer: (serverId) => getAuthServer(config.auth_servers, serverId),
      app_env: process.env.NODE_ENV || 'development',
    };

    next();
  };
}

module.exports = { createAppLocalsMiddleware };
