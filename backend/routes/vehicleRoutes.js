const express = require('express');
const router = express.Router();
const {
  createVehicle,
  getMyVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
} = require('../controllers/vehicleController');
const { protect } = require('../middleware/authMiddleware');
const { vendorOnly } = require('../middleware/roleMiddleware');

// All vehicle routes require authentication
router.use(protect);

// Vendor-specific vehicle registration and retrieval of own vehicles
router.post('/', vendorOnly, createVehicle);
router.get('/my', vendorOnly, getMyVehicles);

// Single vehicle operations
router.get('/:id', getVehicleById);
router.put('/:id', vendorOnly, updateVehicle);
router.delete('/:id', deleteVehicle);

module.exports = router;
