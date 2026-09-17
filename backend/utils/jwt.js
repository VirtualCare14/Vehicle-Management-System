const jwt = require('jsonwebtoken');

/**
 * Get centralized JWT secret
 */
const getJWTSecret = () => process.env.JWT_SECRET || 'dev_jwt_secret_key_12345';

/**
 * Generate JWT for an authenticated user
 * @param {Object} payload - Data to embed in the token (e.g. { id, role, email })
 * @returns {string} Signed JWT string
 */
const generateToken = (payload) => {
  const secret = getJWTSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, secret, { expiresIn });
};

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token string
 * @returns {Object} Decoded payload
 */
const verifyToken = (token) => {
  const secret = getJWTSecret();
  return jwt.verify(token, secret);
};

module.exports = {
  generateToken,
  verifyToken,
  getJWTSecret,
};
