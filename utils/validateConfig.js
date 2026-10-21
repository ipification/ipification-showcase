/**
 * Configuration validation module
 * Validates application configuration on startup
 */
const logger = require('./logger');

/**
 * Validate auth_servers configuration
 * @param {Array} authServers - Array of auth server configurations
 * @throws {Error} If validation fails
 */
function validateAuthServers(authServers) {
  if (!authServers || !Array.isArray(authServers)) {
    logger.log('auth_servers', authServers);
    throw new Error('Configuration error: auth_servers must be defined as an array in config');
  }

  if (authServers.length === 0) {
    logger.log('auth_servers', authServers);
    throw new Error('Configuration error: auth_servers must contain at least one server');
  }

  // Validate each auth server has required fields
  authServers.forEach((server, index) => {
    if (!server.id || typeof server.id !== 'string') {
      throw new Error(`Configuration error: auth_servers[${index}] must have an 'id' (string)`);
    }
    if (!server.url || typeof server.url !== 'string') {
      throw new Error(`Configuration error: auth_servers[${index}] must have a 'url' (string)`);
    }
    // Validate URL format
    try {
      new URL(server.url);
    } catch (err) {
      throw new Error(`Configuration error: auth_servers[${index}].url is not a valid URL: ${server.url}`);
    }
  });

  // Check for duplicate IDs
  const ids = authServers.map(s => s.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Configuration error: Duplicate auth server IDs found: ${duplicates.join(', ')}`);
  }

  logger.log(`✓ Auth servers configured: ${authServers.map(s => s.id).join(', ')}`);
}

/**
 * Validate clients configuration
 * @param {Array} clients - Array of client configurations
 * @throws {Error} If validation fails
 */
function validateClients(clients) {
  if (!clients || !Array.isArray(clients)) {
    throw new Error('Configuration error: clients must be defined as an array in config');
  }

  if (clients.length === 0) {
    throw new Error('Configuration error: clients must contain at least one client');
  }

  clients.forEach((client, index) => {
    if (!client.user_flow || typeof client.user_flow !== 'string') {
      throw new Error(`Configuration error: clients[${index}] must have a 'user_flow' (string)`);
    }
    if (!client.scope || typeof client.scope !== 'string') {
      throw new Error(`Configuration error: clients[${index}] must have a 'scope' (string)`);
    }
  });

  // Check for duplicate user_flow
  const userFlows = clients.map(c => c.user_flow);
  const duplicates = userFlows.filter((flow, index) => userFlows.indexOf(flow) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Configuration error: Duplicate user_flow found: ${duplicates.join(', ')}`);
  }

  logger.log(`✓ Clients configured: ${clients.length} client(s)`);
}

/**
 * Validate realm configuration
 * @param {string} realm - Realm name
 * @throws {Error} If validation fails
 */
function validateRealm(realm) {
  if (!realm || typeof realm !== 'string') {
    throw new Error('Configuration error: realm must be defined as a string in config');
  }
  logger.log(`✓ Realm configured: ${realm}`);
}

/**
 * Validate credentials configuration
 * @param {Object} config - Configuration object
 * @throws {Error} If validation fails
 */
function validateCredentials(config) {
  if (!config.client_id || typeof config.client_id !== 'string') {
    throw new Error('Configuration error: client_id must be defined as a string');
  }

  if (!config.client_secret || typeof config.client_secret !== 'string') {
    throw new Error('Configuration error: client_secret must be defined as a string');
  }

  logger.log('✓ Credentials configured');
}

/**
 * Main validation function
 * Validates all required configuration
 * @param {Object} config - Application configuration object
 * @throws {Error} If any validation fails
 */
function validateConfig(config) {
  logger.log('\n=== Validating Configuration ===');

  validateRealm(config.realm);
  validateAuthServers(config.auth_servers);
  validateClients(config.clients);
  validateCredentials(config);

  logger.log('=== Configuration Valid ✓ ===\n');
}

module.exports = {
  validateConfig,
  validateAuthServers,
  validateClients,
  validateRealm,
  validateCredentials
};
