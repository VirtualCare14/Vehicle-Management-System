const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Vehicle must belong to a vendor'],
      index: true,
    },
    vehicleNumber: {
      type: String,
      required: [true, 'Please provide vehicle registration number (e.g. MH12AB1234)'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    make: {
      type: String,
      required: [true, 'Please provide vehicle make/brand (e.g. Tata, Mahindra)'],
      trim: true,
    },
    model: {
      type: String,
      required: [true, 'Please provide vehicle model (e.g. Ace, Bolero Maxi)'],
      trim: true,
    },
    year: {
      type: Number,
      min: [1990, 'Year must be 1990 or later'],
      max: [new Date().getFullYear() + 1, 'Year cannot be in the distant future'],
    },
    vehicleType: {
      type: String,
      enum: [
        'truck',
        'trailer',
        'van',
        'pickup',
        'container',
        'tanker',
        'bus',
        'car',
        'three-wheeler',
        'other',
      ],
      default: 'truck',
    },
    capacity: {
      type: String,
      trim: true,
    },
    fuelType: {
      type: String,
      enum: ['diesel', 'petrol', 'cng', 'electric', 'hybrid', 'other'],
      default: 'diesel',
    },
    rcNumber: {
      type: String,
      trim: true,
    },
    insuranceNumber: {
      type: String,
      trim: true,
    },
    insuranceExpiry: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
    documents: [
      {
        name: { type: String, trim: true },
        url: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for vendor vehicle search
vehicleSchema.index({ vendor: 1, status: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
