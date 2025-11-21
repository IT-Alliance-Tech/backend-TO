const Subscription = require("../models/Subscription");
const UserSubscription = require("../models/UserSubscription"); 

/* Helper: standard success response wrapper */
const success = (res, status, data) =>
  res
    .status(status)
    .json({ statusCode: status, success: true, error: null, data });

/* Helper: standard failure response wrapper */
const failure = (res, status, message, details = null) =>
  res.status(status).json({
    statusCode: status,
    success: false,
    error: { message, details },
    data: null,
  });

/* Create a new subscription plan */
exports.create = async (req, res) => {
  try {
    const sub = new Subscription(req.body);
    await sub.save();
    return success(res, 201, { subscription: sub });
  } catch (err) {
    if (err.name === "ValidationError") {
      return failure(res, 400, "Validation error", err.message);
    }
    console.error("create subscription error:", err);
    return failure(res, 500, "Internal server error", err.message);
  }
};

/* List subscription plans (optional ?isActive=true filter) */
exports.list = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === "true";
    }
    const subs = await Subscription.find(filter).lean().sort({ createdAt: -1 });
    return success(res, 200, { subscriptions: subs });
  } catch (err) {
    console.error("list subscriptions error:", err);
    return failure(res, 500, "Internal server error", err.message);
  }
};

/* CHANGED: List subscription plans for the current user with availability flags.
   If user has an active subscription, only that plan will be marked available:true.
   If user has no active subscription, all plans will be available:true.
*/
exports.listForUser = async (req, res) => {
  try {
    // CHANGED: support common id fields from auth middleware (req.user.id is used by your auth.js)
    const userId =
      req.user && (req.user.id || req.user._id || req.user.userId || null);

    const now = new Date();

    // fetch all plans
    const plans = await Subscription.find({}).lean().sort({ createdAt: -1 });

    if (!userId) {
      // if not authenticated, return all plans available (frontend should handle auth)
      const result = plans.map((p) => ({ ...p, available: true }));
      return success(res, 200, { subscriptions: result });
    }

    // find user's active subscription (if any)
    const active = await UserSubscription.findOne({
      userId,
      active: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).lean();

    const result = plans.map((p) => {
      if (active) {
        // CHANGED: only the active plan is available; other plans are not selectable until it ends
        const isCurrent = p._id.toString() === active.subscriptionId.toString();
        return { ...p, available: isCurrent };
      }
      // no active subscription -> plan selectable
      return { ...p, available: true };
    });

    return success(res, 200, { subscriptions: result });
  } catch (err) {
    console.error("listForUser subscriptions error:", err);
    return failure(res, 500, "Internal server error", err.message);
  }
};

/* Get a single subscription by ID */
exports.get = async (req, res) => {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return failure(res, 404, "Subscription not found");
    return success(res, 200, { subscription: sub });
  } catch (err) {
    console.error("get subscription error:", err);
    return failure(res, 500, "Internal server error", err.message);
  }
};

/* Update a subscription plan (full/partial) */
exports.update = async (req, res) => {
  try {
    const sub = await Subscription.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true, // validate on updates
    });
    if (!sub) return failure(res, 404, "Subscription not found");
    return success(res, 200, { subscription: sub });
  } catch (err) {
    if (err.name === "ValidationError") {
      return failure(res, 400, "Validation error", err.message);
    }
    console.error("update subscription error:", err);
    return failure(res, 500, "Internal server error", err.message);
  }
};

/* Delete a subscription plan */
exports.remove = async (req, res) => {
  try {
    const sub = await Subscription.findByIdAndDelete(req.params.id);
    if (!sub) return failure(res, 404, "Subscription not found");
    return success(res, 200, { message: "Subscription deleted" });
  } catch (err) {
    console.error("delete subscription error:", err);
    return failure(res, 500, "Internal server error", err.message);
  }
};
