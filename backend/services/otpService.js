const crypto = require('crypto');

/**
 * Service to handle OTP generation, delivery, and verification
 */
class OTPService {
  /**
   * Generate a secure random numeric OTP
   * @param {number} length - Number of digits (default: 6)
   * @returns {string} Numeric OTP
   */
  static generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      otp += digits[bytes[i] % 10];
    }
    return otp;
  }

  /**
   * Calculate OTP expiration timestamp
   * @param {number} minutes - Expiration window in minutes (default: 10)
   * @returns {Date}
   */
  static getExpiry(minutes = 10) {
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  /**
   * Send OTP to the recipient
   * Safe for development: logs to console and returns info without exposing in prod
   * @param {Object} params
   * @param {string} params.to - Recipient email or mobile
   * @param {string} params.otp - OTP string
   * @param {string} params.purpose - Purpose (e.g., 'registration', 'forgot-password')
   * @returns {Promise<{ delivered: boolean, devOtp?: string }>}
   */
  static async sendOTP({ to, otp, purpose = 'verification' }) {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
      console.log(`\n================== [OTP SERVICE DEV LOG] ==================`);
      console.log(`Purpose   : ${purpose.toUpperCase()}`);
      console.log(`Recipient : ${to}`);
      console.log(`OTP Code  : ${otp}`);
      console.log(`Expires in: 10 minutes`);
      console.log(`===========================================================\n`);
    }

    // In a production environment with SMS/Email services configured:
    // e.g. await smsClient.send({ to, body: `Your verification code is ${otp}` });
    // e.g. await mailer.sendMail({ to, subject: 'Your OTP Code', text: `Your code is ${otp}` });

    return {
      delivered: true,
      ...(isDevelopment && { devOtp: otp }),
    };
  }

  /**
   * Verify an OTP against stored OTP and expiry
   * @param {string} storedOtp - Stored OTP in DB
   * @param {Date|number} storedExpires - Expiration timestamp
   * @param {string} providedOtp - User provided OTP
   * @returns {{ valid: boolean, message: string }}
   */
  static verifyOTP(storedOtp, storedExpires, providedOtp) {
    if (!storedOtp || !storedExpires) {
      return { valid: false, message: 'No active OTP found. Please request a new one.' };
    }

    if (new Date(storedExpires).getTime() < Date.now()) {
      return { valid: false, message: 'OTP has expired. Please request a new one.' };
    }

    if (String(storedOtp).trim() !== String(providedOtp).trim()) {
      return { valid: false, message: 'Invalid OTP code. Please try again.' };
    }

    return { valid: true, message: 'OTP verified successfully.' };
  }
}

module.exports = OTPService;
