const assert = require('assert');
const auth = require('./src/auth-middleware');

// 1. Test Input Sanitization
assert.strictEqual(auth.sanitizeInput('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
assert.strictEqual(auth.sanitizeInput('clean input'), 'clean input');

// 2. Test Bearer Token Validation
const validRes = auth.validateBearerToken('Bearer a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5');
assert.strictEqual(validRes.valid, true);

const invalidRes = auth.validateBearerToken('InvalidToken');
assert.strictEqual(invalidRes.valid, false);

// 3. Test Nonce Generation
const nonce = auth.generateSecureNonce(16);
assert.strictEqual(typeof nonce, 'string');
assert.strictEqual(nonce.length, 32);

console.log('✅ Auth middleware suite passed cleanly!');
