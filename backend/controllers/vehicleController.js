const Vehicle = require('../models/Vehicle');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * @desc    Register a new vehicle (associated with logged-in vendor)
 * @route   POST /api/vehicles
 * @access  Private (Vendor only)
 */
const createVehicle = async (req, res, next) => {
  try {
    const {
      vehicleNumber,
      make,
      model,
      year,
      vehicleType,
      capacity,
      fuelType,
      rcNumber,
      insuranceNumber,
      insuranceExpiry,
      documents,
      notes,
    } = req.body;

    // Validation
    if (!vehicleNumber || !make || !model) {
      return sendError(
        res,
        400,
        'Please provide all required vehicle fields: vehicleNumber, make, model'
      );
    }

    const formattedVehicleNumber = vehicleNumber.toUpperCase().trim();

    // Check if vehicle number already exists in system
    const existingVehicle = await Vehicle.findOne({ vehicleNumber: formattedVehicleNumber });
    if (existingVehicle) {
      return sendError(
        res,
        400,
        `A vehicle with registration number ${formattedVehicleNumber} is already registered.`
      );
    }

    // Always associate with logged-in vendor and enforce 'pending' status
    const vehicle = await Vehicle.create({
      vendor: req.user._id,
      vehicleNumber: formattedVehicleNumber,
      make: make.trim(),
      model: model.trim(),
      year: year ? Number(year) : undefined,
      vehicleType: vehicleType || 'truck',
      capacity,
      fuelType: fuelType || 'diesel',
      rcNumber: rcNumber ? rcNumber.trim() : undefined,
      insuranceNumber: insuranceNumber ? insuranceNumber.trim() : undefined,
      insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : undefined,
      status: 'pending',
      rejectionReason: null,
      documents: Array.isArray(documents) ? documents : [],
      notes: notes ? notes.trim() : undefined,
    });

    return sendSuccess(
      res,
      201,
      'Vehicle registered successfully and submitted for administrator approval.',
      vehicle
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all vehicles belonging to the logged-in vendor
 * @route   GET /api/vehicles/my
 * @access  Private (Vendor only)
 */
const getMyVehicles = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 10, sortBy = 'createdAt', order = 'desc' } = req.query;

    const query = { vendor: req.user._id };

    // Filter by status if provided
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    // Search filter across vehicleNumber, make, and model
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ vehicleNumber: searchRegex }, { make: searchRegex }, { model: searchRegex }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === 'asc' ? 1 : -1;

    const [vehicles, total] = await Promise.all([
      Vehicle.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum),
      Vehicle.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      200,
      'Vehicles retrieved successfully',
      vehicles,
      {
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single vehicle details
 * @route   GET /api/vehicles/:id
 * @access  Private (Vendor owner or Admin)
 */
const getVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id).populate(
      'vendor',
      'name email mobile companyName status isVerified'
    );

    if (!vehicle) {
      return sendError(res, 404, 'Vehicle not found');
    }

    // Role check: vendor can only view their own vehicle; admin can view any
    if (
      req.user.role === 'vendor' &&
      vehicle.vendor._id.toString() !== req.user._id.toString()
    ) {
      return sendError(
        res,
        403,
        'Access denied: You do not have permission to view this vehicle.'
      );
    }

    return sendSuccess(res, 200, 'Vehicle details retrieved successfully', vehicle);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a vehicle
 * @route   PUT /api/vehicles/:id
 * @access  Private (Vendor owner)
 */
const updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      return sendError(res, 404, 'Vehicle not found');
    }

    // Vendor can only update their own vehicle
    if (vehicle.vendor.toString() !== req.user._id.toString()) {
      return sendError(
        res,
        403,
        'Access denied: You can only update your own vehicles.'
      );
    }

    const {
      vehicleNumber,
      make,
      model,
      year,
      vehicleType,
      capacity,
      fuelType,
      rcNumber,
      insuranceNumber,
      insuranceExpiry,
      documents,
      notes,
    } = req.body;

    // If changing vehicle number, verify uniqueness
    if (vehicleNumber && vehicleNumber.toUpperCase().trim() !== vehicle.vehicleNumber) {
      const formattedNum = vehicleNumber.toUpperCase().trim();
      const existing = await Vehicle.findOne({
        vehicleNumber: formattedNum,
        _id: { $ne: id },
      });
      if (existing) {
        return sendError(
          res,
          400,
          `A vehicle with registration number ${formattedNum} already exists.`
        );
      }
      vehicle.vehicleNumber = formattedNum;
    }

    if (make) vehicle.make = make.trim();
    if (model) vehicle.model = model.trim();
    if (year !== undefined) vehicle.year = Number(year);
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (capacity !== undefined) vehicle.capacity = capacity;
    if (fuelType) vehicle.fuelType = fuelType;
    if (rcNumber !== undefined) vehicle.rcNumber = rcNumber.trim();
    if (insuranceNumber !== undefined) vehicle.insuranceNumber = insuranceNumber.trim();
    if (insuranceExpiry !== undefined) vehicle.insuranceExpiry = new Date(insuranceExpiry);
    if (documents !== undefined && Array.isArray(documents)) vehicle.documents = documents;
    if (notes !== undefined) vehicle.notes = notes.trim();

    // If vehicle was rejected, updating it sets it back to 'pending' for re-review
    if (vehicle.status === 'rejected') {
      vehicle.status = 'pending';
      vehicle.rejectionReason = null;
    }

    await vehicle.save();

    return sendSuccess(res, 200, 'Vehicle updated successfully', vehicle);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a vehicle
 * @route   DELETE /api/vehicles/:id
 * @access  Private (Vendor owner)
 */
const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      return sendError(res, 404, 'Vehicle not found');
    }

    // Only vendor owner or admin can delete
    if (
      req.user.role === 'vendor' &&
      vehicle.vendor.toString() !== req.user._id.toString()
    ) {
      return sendError(
        res,
        403,
        'Access denied: You can only delete your own vehicles.'
      );
    }

    await Vehicle.findByIdAndDelete(id);

    return sendSuccess(res, 200, 'Vehicle deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVehicle,
  getMyVehicles,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
};
