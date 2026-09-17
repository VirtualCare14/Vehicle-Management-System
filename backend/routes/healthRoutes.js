const express = require('express');
const router = express.Router();

// @route   GET /api/health
// @desc    Health check endpoint to verify API server status
// @access  Public
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
  });
});

module.exports = router;
