const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getVendors,
  getVendorById,
  getVendorVehicles,
  getAllVehicles,
  getAdminVehicleById,
  updateVehicleStatus,
  updateVendorStatus,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');

// All admin routes require authentication and admin role
router.use(protect, adminOnly);

// Dashboard
router.get('/dashboard', getDashboard);

// Vendor management
router.get('/vendors', getVendors);
router.get('/vendors/:id', getVendorById);
router.get('/vendors/:id/vehicles', getVendorVehicles);
router.patch('/vendors/:id/status', updateVendorStatus);

// Vehicle management
router.get('/vehicles', getAllVehicles);
router.get('/vehicles/:id', getAdminVehicleById);
router.patch('/vehicles/:id/status', updateVehicleStatus);

module.exports = router;
