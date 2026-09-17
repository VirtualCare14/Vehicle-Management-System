const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

/**
 * Authentication Middleware
 * Validates JWT token from Authorization header and attaches user to req
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Extract and sanitize token (remove 'Bearer ', trim spaces, remove quotes if pasted)
      token = req.headers.authorization
        .replace(/^Bearer\s+/i, '')
        .trim()
        .replace(/^["']|["']$/g, '');

      // Verify token using centralized secret logic
      const decoded = verifyToken(token);

      // Fetch fresh user from database
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return sendError(res, 401, 'User not found or session expired');
      }

      if (user.status === 'suspended') {
        return sendError(res, 403, 'Your account has been suspended. Please contact support.');
      }

      req.user = user;
      req.userId = user._id;
      req.userRole = user.role;

      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return sendError(res, 401, 'Token expired. Please login again.');
      }
      return sendError(res, 401, 'Not authorized. Invalid token.');
    }
  }

  if (!token) {
    return sendError(res, 401, 'Not authorized. No token provided.');
  }
};

module.exports = {
  protect,
};
