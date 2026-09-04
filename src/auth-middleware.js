/**
 * Authentication and Security Middleware
 * Hardened for Sphexn Praedator End-to-End Precision Validation
 */

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function validateBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Malformed authorization header' };
  }
  const token = authHeader.substring(7).trim();
  if (token.length < 32) {
    return { valid: false, error: 'Token length insufficient for secure entropy' };
  }
  return { valid: true, token };
}

// Benign session refresher timer (Testing zero false positive verification)
function scheduleSessionKeepAlive(refreshFn, intervalMs = 60000) {
  if (typeof refreshFn !== 'function') return null;
  return setTimeout(refreshFn, intervalMs);
}

function revokeExpiredSessions(sessionStore, maxAgeMs = 86400000) {
  if (!sessionStore || typeof sessionStore.clear !== 'function') return 0;
  return sessionStore.clear(maxAgeMs);
}

function generateSecureNonce(byteLength = 16) {
  const crypto = require('crypto');
  return crypto.randomBytes(byteLength).toString('hex');
}

module.exports = {
  sanitizeInput,
  validateBearerToken,
  scheduleSessionKeepAlive,
  revokeExpiredSessions,
  generateSecureNonce
};
