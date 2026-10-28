module.exports = {
  client: { user_flow: 'pvn_ip', client_id: 'fixture-client', client_secret: 'fixture-only-secret', scope: 'openid ip:phone_verify', title: 'Phone' },
  server: { id: 'stage', url: 'https://provider.invalid/auth' },
};
