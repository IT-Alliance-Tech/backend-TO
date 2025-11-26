const { ROLES } = require("../utils/constants");

const checkRole = (roles) => {
  return (req, res, next) => {
    // Because auth.js allows guests, we must block them here
    if (!req.user) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        error: { message: "Login required" },
        data: null,
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Access denied" },
        data: null,
      });
    }

    next();
  };
};

module.exports = {
  userAuth: checkRole([ROLES.USER]),

  // 👇 Allow BOTH Owner & Admin here
  ownerAuth: checkRole([ROLES.OWNER, ROLES.ADMIN]),

  adminAuth: checkRole([ROLES.ADMIN]),
};
