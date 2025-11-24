const User = require("../models/User");
const OTP = require("../models/OTP");
const Owner = require("../models/Owner");
const jwt = require("jsonwebtoken");
const { sendOTPEmail } = require("../services/emailService");
const { generateAndSaveOTP, verifyOTP } = require("../services/otpService");
const { validateEmail } = require("../utils/helpers");
const { ROLES } = require("../utils/constants");

// Generate JWT Token - FIXED: Now consistent
const generateToken = async (user) => {
  // Store only necessary user data in token
  const payload = {
    user: {
      _id: user._id,
      email: user.email,
      role: user.role,
      verified: user.verified,
    },
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// Register user
const register = async (req, res) => {
  const {
    firstName,
    lastName,
    name,
    email,
    password,
    phone,
    role,
    idProofNumber,
    idProofType,
    idProofImageUrl,
  } = req.body;

  try {
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: { message: "Invalid email format" },
        data: null,
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: { message: "Email already in use" },
        data: null,
      });
    }

    // Validate ID proof for owner
    if (role === ROLES.OWNER) {
      if (!idProofNumber || !idProofType || !idProofImageUrl) {
        return res.status(400).json({
          success: false,
          error: { message: "Owner registration requires ID proof details" },
          data: null,
        });
      }
    }

    const user = new User({
      firstName,
      lastName,
      name: name || `${firstName || ""} ${lastName || ""}`.trim(),
      email,
      phone,
      password,
      role: role || ROLES.USER,
      verified: false,
    });

    await user.save();

    // If registering as owner, also create owner profile
    if (role === ROLES.OWNER) {
      const owner = new Owner({
        user: user._id,
        idProofNumber,
        idProofType,
        idProofImageUrl,
        properties: [],
        verified: false,
      });
      await owner.save();
    }

    // Generate and send OTP
    const otp = await generateAndSaveOTP(email);
    await sendOTPEmail(email, otp);

    res.status(201).json({
      success: true,
      error: null,
      data: {
        message:
          "User registered successfully. Please verify your email with OTP.",
        user: {
          id: user._id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isVerified: user.verified,
        },
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

// Update User
const updateUser = async (req, res) => {
  const userId = req.user._id; // from auth middleware
  const { id, firstName, lastName, name, phone, password } = req.body;

  try {
    // ✅ Check if the request is trying to update the same logged-in user
    if (id && id !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: { message: "You are not authorized to update this user" },
        data: null,
      });
    }

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (password) updateData.password = password; // will be hashed by pre-save hook

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    });

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: { message: "User not found" },
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      error: null,
      data: {
        message: "User updated successfully",
        user: {
          id: updatedUser._id,
          email: updatedUser.email,
          phone: updatedUser.phone,
          name: updatedUser.name,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role,
          isVerified: updatedUser.verified,
        },
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

// Validate OTP after registration
const validateOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Verify OTP
    const isValidOTP = await verifyOTP(email, otp);
    if (!isValidOTP) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Invalid or expired OTP",
        },
        data: null,
      });
    }

    // Find and update user
    const user = await User.findOneAndUpdate(
      { email },
      { verified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: {
          message: "User not found",
        },
        data: null,
      });
    }

    // Generate token after verification
    const token = await generateToken(user);

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Email verified successfully",
        token,
        user: {
          id: user._id,
          email: user.email,
          isVerified: user.verified,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Login with password
const loginWithPassword = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Invalid credentials",
        },
        data: null,
      });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: {
          message: "Email not verified",
        },
        data: {
          user: {
            id: user._id,
            email: user.email,
            isVerified: user.verified,
          },
        },
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Invalid credentials",
        },
        data: null,
      });
    }

    const token = await generateToken(user);

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Login successful",
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.verified,
        },
      },
    });
  } catch (error) {
    console.error("Login with password error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Login with OTP - FIXED: Pass user object instead of just ID
const loginWithOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "User not found",
        },
        data: null,
      });
    }

    // Check if user is verified
    if (!user.verified) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: {
          message: "Email not verified",
        },
        data: {
          user: {
            id: user._id,
            email: user.email,
            isVerified: user.verified,
          },
        },
      });
    }

    const isValidOTP = await verifyOTP(email, otp);
    if (!isValidOTP) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Invalid or expired OTP",
        },
        data: null,
      });
    }

    // FIXED: Pass full user object, not just ID
    const token = await generateToken(user);

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Login successful",
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isVerified: user.verified,
        },
      },
    });
  } catch (error) {
    console.error("Login with OTP error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Send OTP
const sendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "User not found",
        },
        data: null,
      });
    }

    const otp = await generateAndSaveOTP(email);
    await sendOTPEmail(email, otp);

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "OTP sent successfully",
        user: {
          id: user._id,
          email: user.email,
          isVerified: user.verified,
        },
      },
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Step 1: Request password reset OTP
const forgotPasswordRequest = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "User not found" },
        data: null,
      });
    }

    const otp = await generateAndSaveOTP(email);
    await sendOTPEmail(email, otp);

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: { message: "Password reset OTP sent successfully" },
    });
  } catch (error) {
    console.error("Forgot password request error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

// Step 2: Verify OTP for password reset
const verifyForgotPasswordOTP = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "User not found" },
        data: null,
      });
    }

    const isValidOTP = await verifyOTP(email, otp);
    if (!isValidOTP) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Invalid or expired OTP" },
        data: null,
      });
    }

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: { message: "OTP verified successfully" },
    });
  } catch (error) {
    console.error("Verify forgot password OTP error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

// Step 3: Reset password using OTP
const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "User not found" },
        data: null,
      });
    }

    const isValidOTP = await verifyOTP(email, otp);
    if (!isValidOTP) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Invalid or expired OTP" },
        data: null,
      });
    }

    user.password = newPassword; // will be hashed by pre-save hook
    await user.save();

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: { message: "Password reset successfully" },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

// Delete User
const deleteUser = async (req, res) => {
  const requesterRole = req.user.role; // role comes from auth middleware
  const { userId } = req.body; // admin specifies which user to delete

  try {
    // Check if the logged-in user is admin
    if (requesterRole !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        error: { message: "Access denied. Only admins can delete users." },
        data: null,
      });
    }

    // Delete target user
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        error: { message: "User not found" },
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      error: null,
      data: { message: "User deleted successfully", deletedUserId: userId },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

module.exports = {
  register,
  validateOTP,
  loginWithPassword,
  loginWithOTP,
  sendOTP,
  forgotPasswordRequest,
  verifyForgotPasswordOTP,
  resetPassword,
  updateUser,
  deleteUser,
};
