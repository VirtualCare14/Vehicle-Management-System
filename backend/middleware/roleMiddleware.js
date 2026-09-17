const { sendError } = require('../utils/response');

/**
 * Role-based authorization middleware
 * @param  {...string} roles - Allowed roles (e.g. 'admin', 'vendor')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required before role check.');
    }

    const userRole = String(req.user.role || '').toLowerCase().trim();
    const allowedRoles = roles.map((r) => String(r).toLowerCase().trim());

    if (!allowedRoles.includes(userRole)) {
      return sendError(
        res,
        403,
        `Forbidden: Role '${req.user.role}' is not authorized to access this route.`
      );
    }

    next();
  };
};

const adminOnly = authorize('admin');
const vendorOnly = authorize('vendor');

module.exports = {
  authorize,
  adminOnly,
  vendorOnly,
};
