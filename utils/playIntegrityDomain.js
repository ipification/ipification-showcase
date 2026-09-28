function isPlayIntegrityVerificationDomain(hostname, domains) {
  if (typeof hostname !== 'string' || hostname.trim() === '' || !Array.isArray(domains)) return false;

  const normalizedHostname = hostname.trim().toLowerCase();
  return domains.some((domain) => typeof domain === 'string'
    && domain.trim().toLowerCase() === normalizedHostname);
}

module.exports = { isPlayIntegrityVerificationDomain };
