// middlewares/auth.js
// This middleware already supports optional authentication!
// It allows requests to continue even without a token (guest mode)

const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function (req, res, next) {
  const authHeader = req.header("Authorization");

  // No token provided - allow as guest
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null; // Set user to null for guest access
    return next();
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // The token payload has structure: { user: { _id, email, role, verified } }
    const userId = decoded.user._id || decoded.user.id || decoded.user;

    if (!userId) {
      console.error("No user ID found in token:", decoded);
      req.user = null; // Treat as guest
      return next();
    }

    const user = await User.findById(userId).select("-password").lean();

    if (!user) {
      console.error("User not found for ID:", userId);
      req.user = null; // Treat as guest
      return next();
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    req.user = null; // Treat invalid token as guest
    return next();
  }
};


