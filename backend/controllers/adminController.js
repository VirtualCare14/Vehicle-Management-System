const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Message = require('../models/Message');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * @desc    Get dashboard metrics & statistics for Admin
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin only)
 */
const getDashboard = async (req, res, next) => {
  try {
    const [
      totalVendors,
      activeVendors,
      unverifiedVendors,
      totalVehicles,
      pendingVehicles,
      approvedVehicles,
      rejectedVehicles,
      totalMessages,
      recentVendors,
      recentVehicles,
    ] = await Promise.all([
      User.countDocuments({ role: 'vendor' }),
      User.countDocuments({ role: 'vendor', status: 'active' }),
      User.countDocuments({ role: 'vendor', isVerified: false }),
      Vehicle.countDocuments(),
      Vehicle.countDocuments({ status: 'pending' }),
      Vehicle.countDocuments({ status: 'approved' }),
      Vehicle.countDocuments({ status: 'rejected' }),
      Message.countDocuments(),
      User.find({ role: 'vendor' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email mobile companyName isVerified status createdAt'),
      Vehicle.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('vendor', 'name email companyName'),
    ]);

    const stats = {
      vendors: {
        total: totalVendors,
        active: activeVendors,
        unverified: unverifiedVendors,
      },
      vehicles: {
        total: totalVehicles,
        pending: pendingVehicles,
        approved: approvedVehicles,
        rejected: rejectedVehicles,
      },
      messages: {
        total: totalMessages,
      },
    };

    return sendSuccess(res, 200, 'Admin dashboard metrics retrieved successfully', {
      stats,
      recentVendors,
      recentVehicles,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get list of all vendors
 * @route   GET /api/admin/vendors
 * @access  Private (Admin only)
 */
const getVendors = async (req, res, next) => {
  try {
    const {
      search,
      status,
      isVerified,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const query = { role: 'vendor' };

    if (status && ['active', 'inactive', 'suspended'].includes(status)) {
      query.status = status;
    }

    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { companyName: searchRegex },
        { mobile: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === 'asc' ? 1 : -1;

    const [vendors, total] = await Promise.all([
      User.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(query),
    ]);

    // Attach vehicle counts for each vendor
    const vendorsWithStats = await Promise.all(
      vendors.map(async (vendor) => {
        const vendorObj = vendor.toJSON();
        const [totalVehicles, approvedVehicles, pendingVehicles, rejectedVehicles] =
          await Promise.all([
            Vehicle.countDocuments({ vendor: vendor._id }),
            Vehicle.countDocuments({ vendor: vendor._id, status: 'approved' }),
            Vehicle.countDocuments({ vendor: vendor._id, status: 'pending' }),
            Vehicle.countDocuments({ vendor: vendor._id, status: 'rejected' }),
          ]);

        vendorObj.vehicleStats = {
          total: totalVehicles,
          approved: approvedVehicles,
          pending: pendingVehicles,
          rejected: rejectedVehicles,
        };

        return vendorObj;
      })
    );

    return sendSuccess(res, 200, 'Vendors list retrieved successfully', vendorsWithStats, {
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single vendor by ID
 * @route   GET /api/admin/vendors/:id
 * @access  Private (Admin only)
 */
const getVendorById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vendor = await User.findOne({ _id: id, role: 'vendor' });

    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const [totalVehicles, approvedVehicles, pendingVehicles, rejectedVehicles] =
      await Promise.all([
        Vehicle.countDocuments({ vendor: vendor._id }),
        Vehicle.countDocuments({ vendor: vendor._id, status: 'approved' }),
        Vehicle.countDocuments({ vendor: vendor._id, status: 'pending' }),
        Vehicle.countDocuments({ vendor: vendor._id, status: 'rejected' }),
      ]);

    const vendorData = vendor.toJSON();
    vendorData.vehicleStats = {
      total: totalVehicles,
      approved: approvedVehicles,
      pending: pendingVehicles,
      rejected: rejectedVehicles,
    };

    return sendSuccess(res, 200, 'Vendor details retrieved successfully', vendorData);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all vehicles belonging to a specific vendor
 * @route   GET /api/admin/vendors/:id/vehicles
 * @access  Private (Admin only)
 */
const getVendorVehicles = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const vendor = await User.findOne({ _id: id, role: 'vendor' });
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const query = { vendor: id };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [vehicles, total] = await Promise.all([
      Vehicle.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Vehicle.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      200,
      `Vehicles for vendor '${vendor.companyName}' retrieved successfully`,
      vehicles,
      {
        vendor: {
          _id: vendor._id,
          name: vendor.name,
          companyName: vendor.companyName,
          email: vendor.email,
        },
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
 * @desc    Get all vehicles in the system (with vendor details and filters)
 * @route   GET /api/admin/vehicles
 * @access  Private (Admin only)
 */
const getAllVehicles = async (req, res, next) => {
  try {
    const {
      status,
      search,
      vendorId,
      vehicleType,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const query = {};

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }

    if (vendorId) {
      query.vendor = vendorId;
    }

    if (vehicleType) {
      query.vehicleType = vehicleType;
    }

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
        .populate('vendor', 'name email mobile companyName isVerified status')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum),
      Vehicle.countDocuments(query),
    ]);

    return sendSuccess(res, 200, 'All vehicles retrieved successfully', vehicles, {
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single vehicle details with vendor info
 * @route   GET /api/admin/vehicles/:id
 * @access  Private (Admin only)
 */
const getAdminVehicleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id).populate(
      'vendor',
      'name email mobile companyName isVerified status'
    );

    if (!vehicle) {
      return sendError(res, 404, 'Vehicle not found');
    }

    return sendSuccess(res, 200, 'Vehicle details retrieved successfully', vehicle);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update vehicle approval status (pending, approved, rejected)
 * @route   PATCH /api/admin/vehicles/:id/status
 * @access  Private (Admin only)
 */
const updateVehicleStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
      return sendError(
        res,
        400,
        'Invalid status. Allowed values are: approved, rejected, pending'
      );
    }

    const vehicle = await Vehicle.findById(id).populate('vendor', 'name email companyName');

    if (!vehicle) {
      return sendError(res, 404, 'Vehicle not found');
    }

    vehicle.status = status;
    if (status === 'rejected') {
      vehicle.rejectionReason = rejectionReason
        ? rejectionReason.trim()
        : 'Application rejected by administration. Please update documentation.';
    } else if (status === 'approved') {
      vehicle.rejectionReason = null;
    }

    await vehicle.save();

    return sendSuccess(
      res,
      200,
      `Vehicle status updated to '${status}' successfully`,
      vehicle
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update vendor account status (active, inactive, suspended) or verification
 * @route   PATCH /api/admin/vendors/:id/status
 * @access  Private (Admin only)
 */
const updateVendorStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, isVerified } = req.body;

    const vendor = await User.findOne({ _id: id, role: 'vendor' });

    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    if (status !== undefined) {
      if (!['active', 'inactive', 'suspended'].includes(status)) {
        return sendError(
          res,
          400,
          'Invalid status. Allowed values: active, inactive, suspended'
        );
      }
      vendor.status = status;
    }

    if (isVerified !== undefined) {
      vendor.isVerified = Boolean(isVerified);
    }

    await vendor.save();

    return sendSuccess(res, 200, 'Vendor status updated successfully', vendor);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard,
  getVendors,
  getVendorById,
  getVendorVehicles,
  getAllVehicles,
  getAdminVehicleById,
  updateVehicleStatus,
  updateVendorStatus,
};
