// backend/middlewares/adminAuth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // adjust path if different

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({
          statusCode: 401,
          success: false,
          error: { message: "Missing Authorization header" },
          data: null,
        });
    }
    const token = authHeader.split(" ")[1];

    // Verify token. Ensure JWT_SECRET is set in your env (.env)
    const secret = process.env.JWT_SECRET || process.env.SECRET || "secret";
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return res
        .status(401)
        .json({
          statusCode: 401,
          success: false,
          error: { message: "Invalid or expired token" },
          data: null,
        });
    }

    // If your token includes role in payload, use it. Otherwise fetch user from DB.
    if (payload && payload.role) {
      if (payload.role !== "admin") {
        return res
          .status(403)
          .json({
            statusCode: 403,
            success: false,
            error: { message: "Admin access required" },
            data: null,
          });
      }
      // attach user info
      req.user = payload;
      return next();
    }

    // If role not present in token, fetch user by id in payload (commonly payload.id or payload.userId)
    const userId = payload.userId || payload.id || payload._id;
    if (!userId) {
      return res
        .status(401)
        .json({
          statusCode: 401,
          success: false,
          error: { message: "Invalid token payload" },
          data: null,
        });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res
        .status(401)
        .json({
          statusCode: 401,
          success: false,
          error: { message: "User not found" },
          data: null,
        });
    }
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({
          statusCode: 403,
          success: false,
          error: { message: "Admin access required" },
          data: null,
        });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("adminAuth error:", err);
    res
      .status(500)
      .json({
        statusCode: 500,
        success: false,
        error: { message: "Internal server error" },
        data: null,
      });
  }
};

module.exports = adminAuth;
