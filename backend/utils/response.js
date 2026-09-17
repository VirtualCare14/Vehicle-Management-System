/**
 * Standardized API response utilities
 */

const sendSuccess = (res, statusCode = 200, message = 'Success', data = null, extra = {}) => {
  const response = {
    success: true,
    message,
    ...(data !== null && { data }),
    ...extra,
  };
  return res.status(statusCode).json(response);
};

const sendError = (res, statusCode = 400, message = 'An error occurred', errors = null) => {
  const response = {
    success: false,
    message,
    ...(errors !== null && { errors }),
  };
  return res.status(statusCode).json(response);
};

module.exports = {
  sendSuccess,
  sendError,
};
