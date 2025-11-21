const { ROLES } = require("../utils/constants");

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send({ error: "Login required" });
    if (!roles.includes(req.user.role)) return res.status(403).send({ error: "Access denied" });
    next();
  };
};

module.exports = {
  userAuth: checkRole([ROLES.USER]),
  ownerAuth: checkRole([ROLES.OWNER]),
  adminAuth: checkRole([ROLES.ADMIN]),
};