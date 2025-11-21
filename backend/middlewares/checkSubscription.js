const UserSubscription = require("../models/UserSubscription");
const mongoose = require("mongoose");

module.exports = async function (req, res, next) {
  req.userSubscription = false;
  if (!req.user) return next();

  try {
    let sub = null;

    if (req.user.currentUserSubscription) {
      sub = await UserSubscription.findById(req.user.currentUserSubscription).lean();
    }

    if (!sub) {
      sub = await UserSubscription.findOne({
        userId: req.user._id,
        active: true,
        endDate: { $gte: new Date() },
        available: { $gt: 0 },
      })
        .sort({ endDate: -1 })
        .lean();
    }

    if (sub) {
      const now = new Date();
      req.userSubscription =
        sub.startDate <= now && now <= sub.endDate && sub.available > 0 && sub.active;
    }

    next();
  } catch (err) {
    req.userSubscription = false;
    next();
  }
};