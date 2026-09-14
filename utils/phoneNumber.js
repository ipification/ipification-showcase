function normalizePhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== 'string') {
    throw new TypeError('phone number must be an E.164 string');
  }

  const normalized = phoneNumber.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new TypeError('phone number must be a valid E.164 value');
  }
  return normalized;
}

module.exports = { normalizePhoneNumber };
