const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function (req, res, next) {
  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next(); // guest allowed

  try {
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.user._id || decoded.user.id)
      .select("-password")
      .lean();
    req.user = user;
    next();
  } catch (err) {
    return next(); // treat invalid token as guest
  }
};
