const User = require('../models/User');
const OTPService = require('../services/otpService');
const { generateToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * @desc    Register a new user (Admin or Vendor)
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { name, mobile, email, companyName, password, role } = req.body;

    // Validation
    if (!name || !mobile || !email || !companyName || !password) {
      return sendError(
        res,
        400,
        'Please provide all required fields: name, mobile, email, companyName, password'
      );
    }

    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedMobile = String(mobile).trim();

    // Check if user already exists
    let user = await User.findOne({
      $or: [{ email: normalizedEmail }, { mobile: normalizedMobile }],
    }).select('+otp +otpExpires');

    const otp = OTPService.generateOTP();
    const otpExpires = OTPService.getExpiry(10);

    if (user) {
      if (user.isVerified) {
        return sendError(
          res,
          400,
          user.email === normalizedEmail
            ? 'An account with this email is already registered and verified.'
            : 'An account with this mobile number is already registered and verified.'
        );
      }

      // If user exists but is unverified, update credentials and send fresh OTP
      user.name = name.trim();
      user.companyName = companyName.trim();
      user.password = password;
      if (role && ['admin', 'vendor'].includes(role)) {
        user.role = role;
      }
      user.otp = otp;
      user.otpExpires = otpExpires;
      await user.save();
    } else {
      // Create new user
      const assignedRole = role && ['admin', 'vendor'].includes(role) ? role : 'vendor';

      user = await User.create({
        name: name.trim(),
        mobile: normalizedMobile,
        email: normalizedEmail,
        companyName: companyName.trim(),
        password,
        role: assignedRole,
        isVerified: false,
        otp,
        otpExpires,
      });
    }

    const deliveryResult = await OTPService.sendOTP({
      to: user.email,
      otp,
      purpose: 'Account Registration Verification',
    });

    return sendSuccess(
      res,
      201,
      'Registration successful. Please verify the OTP sent to your email to activate your account.',
      {
        userId: user._id,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        ...(deliveryResult.devOtp && { devOtp: deliveryResult.devOtp }),
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP to activate account
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendError(res, 400, 'Please provide email and OTP');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+otp +otpExpires');

    if (!user) {
      return sendError(res, 404, 'User account not found');
    }

    if (user.isVerified) {
      return sendSuccess(res, 200, 'Account is already verified. You can log in.', {
        isVerified: true,
      });
    }

    const verification = OTPService.verifyOTP(user.otp, user.otpExpires, otp);

    if (!verification.valid) {
      return sendError(res, 400, verification.message);
    }

    // Activate user
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate JWT token
    const token = generateToken({
      id: user._id,
      role: user.role,
      email: user.email,
    });

    const userProfile = await User.findById(user._id);

    return sendSuccess(res, 200, 'Account verified successfully', {
      token,
      user: userProfile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend registration verification OTP
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 400, 'Please provide your email address');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+otp +otpExpires');

    if (!user) {
      return sendError(res, 404, 'No account found with this email');
    }

    if (user.isVerified) {
      return sendError(res, 400, 'Account is already verified. Please proceed to login.');
    }

    const otp = OTPService.generateOTP();
    user.otp = otp;
    user.otpExpires = OTPService.getExpiry(10);
    await user.save();

    const deliveryResult = await OTPService.sendOTP({
      to: user.email,
      otp,
      purpose: 'Resend Verification Code',
    });

    return sendSuccess(res, 200, 'A new verification OTP has been sent to your email', {
      email: user.email,
      ...(deliveryResult.devOtp && { devOtp: deliveryResult.devOtp }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Login user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Please provide email and password');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password');
    }

    if (!user.isVerified) {
      // Auto-dispatch OTP to assist the user
      const otp = OTPService.generateOTP();
      user.otp = otp;
      user.otpExpires = OTPService.getExpiry(10);
      await user.save();

      const deliveryResult = await OTPService.sendOTP({
        to: user.email,
        otp,
        purpose: 'Pending Account Verification',
      });

      return sendError(
        res,
        403,
        'Your account is not verified yet. A verification OTP has been sent to your email.',
        {
          requiresVerification: true,
          email: user.email,
          ...(deliveryResult.devOtp && { devOtp: deliveryResult.devOtp }),
        }
      );
    }

    if (user.status === 'suspended') {
      return sendError(
        res,
        403,
        'Your account has been suspended by administration. Please contact support.'
      );
    }

    const token = generateToken({
      id: user._id,
      role: user.role,
      email: user.email,
    });

    const userProfile = await User.findById(user._id);

    return sendSuccess(res, 200, 'Login successful', {
      token,
      user: userProfile,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send password reset OTP
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 400, 'Please provide your registered email address');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+resetPasswordOtp +resetPasswordExpires'
    );

    if (!user) {
      return sendError(res, 404, 'No account found with this email address');
    }

    const otp = OTPService.generateOTP();
    user.resetPasswordOtp = otp;
    user.resetPasswordExpires = OTPService.getExpiry(10);
    await user.save();

    const deliveryResult = await OTPService.sendOTP({
      to: user.email,
      otp,
      purpose: 'Password Reset',
    });

    return sendSuccess(res, 200, 'Password reset OTP has been sent to your email', {
      email: user.email,
      ...(deliveryResult.devOtp && { devOtp: deliveryResult.devOtp }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify forgot password OTP
 * @route   POST /api/auth/verify-forgot-otp
 * @access  Public
 */
const verifyForgotOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendError(res, 400, 'Please provide email and OTP');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+resetPasswordOtp +resetPasswordExpires'
    );

    if (!user) {
      return sendError(res, 404, 'No account found with this email');
    }

    const verification = OTPService.verifyOTP(
      user.resetPasswordOtp,
      user.resetPasswordExpires,
      otp
    );

    if (!verification.valid) {
      return sendError(res, 400, verification.message);
    }

    return sendSuccess(res, 200, 'OTP verified successfully. You may now reset your password.', {
      email: user.email,
      otpVerified: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password with OTP
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return sendError(res, 400, 'Please provide email, OTP, and new password');
    }

    if (newPassword.length < 6) {
      return sendError(res, 400, 'New password must be at least 6 characters long');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+password +resetPasswordOtp +resetPasswordExpires'
    );

    if (!user) {
      return sendError(res, 404, 'No account found with this email');
    }

    const verification = OTPService.verifyOTP(
      user.resetPasswordOtp,
      user.resetPasswordExpires,
      otp
    );

    if (!verification.valid) {
      return sendError(res, 400, verification.message);
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return sendSuccess(
      res,
      200,
      'Password reset successfully. You can now login with your new password.'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password for logged-in user
 * @route   PUT /api/auth/change-password
 * @access  Private (Authenticated)
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'Please provide both current and new password');
    }

    if (newPassword.length < 6) {
      return sendError(res, 400, 'New password must be at least 6 characters long');
    }

    if (currentPassword === newPassword) {
      return sendError(res, 400, 'New password must be different from current password');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return sendError(res, 400, 'Incorrect current password');
    }

    user.password = newPassword;
    await user.save();

    return sendSuccess(res, 200, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/auth/me
 * @access  Private (Authenticated)
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    return sendSuccess(res, 200, 'User profile retrieved successfully', { user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  forgotPassword,
  verifyForgotOTP,
  resetPassword,
  changePassword,
  getMe,
};
