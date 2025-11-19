const mongoose = require("mongoose");
const UserSubscription = require("../models/UserSubscription");
const User = require("../models/User");
const Subscription = require("../models/Subscription");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* Set or clear a user's current active subscription */
async function setUserCurrentSubscription(
  userId,
  userSubscriptionId = null,
  session = null
) {
  await User.findByIdAndUpdate(
    userId,
    { currentUserSubscription: userSubscriptionId },
    { session }
  );
}

/* Create a user-subscription (expects explicit startDate and endDate) */
exports.create = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let createdId = null;

    await session.withTransaction(async () => {
      const {
        userId,
        subscriptionId,
        startDate,
        endDate,
        available,
        accessDate,
      } = req.body;
      if (!userId || !subscriptionId || !startDate || !endDate)
        throw new Error(
          "userId, subscriptionId, startDate and endDate are required"
        );

      const [user, subscription] = await Promise.all([
        User.findById(userId).session(session),
        Subscription.findById(subscriptionId).session(session),
      ]);
      if (!user) throw new Error("User not found");
      if (!subscription) throw new Error("Subscription not found");

      let startingAvailable = 0;
      if (typeof available !== "undefined" && available !== null)
        startingAvailable = Number(available);
      else if (typeof subscription.accessibleSlots === "number")
        startingAvailable = subscription.accessibleSlots;
      else startingAvailable = subscription.features?.views ?? 0;

      const us = new UserSubscription({
        userId,
        subscriptionId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        available: startingAvailable,
        accessDate: accessDate || {},
        accessLevel:
          UserSubscription.computeAccessLevelFromRemaining(startingAvailable),
      });

      us.active = us.computeActive(new Date());
      await us.save({ session });

      if (us.active) await setUserCurrentSubscription(userId, us._id, session);
      createdId = us._id;
    });

    const populated = await UserSubscription.findById(createdId)
      .populate("subscriptionId", "name accessibleSlots price durationDays")
      .populate("userId", "name email");

    return res.status(201).json(populated);
  } catch (err) {
    console.error("create user-subscription error:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

/* List all user-subscriptions (admin) */
exports.list = async (req, res) => {
  try {
    const list = await UserSubscription.find()
      .populate("userId", "name email")
      .populate("subscriptionId", "name price durationDays")
      .lean();
    return res.json(list);
  } catch (err) {
    console.error("list user-subscriptions error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* Get a single user-subscription by id */
exports.get = async (req, res) => {
  try {
    const us = await UserSubscription.findById(req.params.id)
      .populate("userId", "name email")
      .populate("subscriptionId", "name price")
      .exec();
    if (!us) return res.status(404).json({ error: "Not found" });
    return res.json(us);
  } catch (err) {
    console.error("get user-subscription error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* Update a user-subscription (dates, available, viewedProperties, active) */
exports.update = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let updatedId = null;

    await session.withTransaction(async () => {
      const id = req.params.id;
      const payload = req.body;
      const us = await UserSubscription.findById(id).session(session);
      if (!us) throw new Error("Not found");

      if (payload.startDate) us.startDate = new Date(payload.startDate);
      if (payload.endDate) us.endDate = new Date(payload.endDate);
      if (typeof payload.available !== "undefined")
        us.available = payload.available;
      if (payload.viewedProperties)
        us.viewedProperties = payload.viewedProperties;
      if (payload.accessDate) us.accessDate = payload.accessDate;
      if (typeof payload.active !== "undefined") us.active = !!payload.active;
      else us.active = us.computeActive(new Date());

      await us.save({ session });

      const user = await User.findById(us.userId).session(session);
      if (us.active) {
        await setUserCurrentSubscription(us.userId, us._id, session);
      } else {
        if (
          user &&
          user.currentUserSubscription &&
          user.currentUserSubscription.toString() === us._id.toString()
        ) {
          await setUserCurrentSubscription(us.userId, null, session);
        }
      }

      updatedId = us._id;
    });

    const populated = await UserSubscription.findById(updatedId)
      .populate("userId", "name email")
      .populate("subscriptionId", "name price");

    return res.json(populated);
  } catch (err) {
    console.error("update user-subscription error:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

/* Delete a user-subscription and clear user's current subscription if needed */
exports.remove = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const id = req.params.id;
      const us = await UserSubscription.findById(id).session(session);
      if (!us) throw new Error("Not found");

      const user = await User.findById(us.userId).session(session);
      if (
        user &&
        user.currentUserSubscription &&
        user.currentUserSubscription.toString() === us._id.toString()
      ) {
        await setUserCurrentSubscription(us.userId, null, session);
      }

      await UserSubscription.findByIdAndDelete(id).session(session);
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("remove user-subscription error:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

/* Get active subscriptions for a user (based on start/end dates) */
exports.getActiveForUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    const now = new Date();
    const list = await UserSubscription.find({
      userId,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate("subscriptionId", "name price features")
      .lean();
    return res.json(list);
  } catch (err) {
    console.error("getActiveForUser error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* Consume one view slot for a subscription (records property view) */
exports.useView = async (req, res) => {
  try {
    const id = req.params.id;
    const { propertyId } = req.body;
    if (!propertyId)
      return res.status(400).json({ error: "propertyId required" });

    const us = await UserSubscription.findById(id);
    if (!us)
      return res.status(404).json({ error: "UserSubscription not found" });

    const updated = await us.usePropertyView(propertyId);

    if (!updated) {
      if (us.hasViewedProperty(propertyId)) {
        return res
          .status(409)
          .json({ error: "Property already viewed for this subscription" });
      }
      if (!us.active || us.available <= 0) {
        return res
          .status(403)
          .json({ error: "No remaining views or subscription not active" });
      }
      return res.status(400).json({ error: "Could not register view" });
    }

    return res.json({
      success: true,
      userSubscription: updated,
      remainingViews: updated.getRemainingViews
        ? updated.getRemainingViews()
        : updated.available,
    });
  } catch (err) {
    console.error("useView error:", err);
    return res.status(500).json({ error: err.message });
  }
};

/* Subscribe a user to a plan (atomic) - blocks subscribing to same active plan */
exports.subscribe = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let createdId = null;

    await session.withTransaction(async () => {
      const {
        userId,
        subscriptionId,
        startDate,
        endDate: clientEndDate,
      } = req.body;
      if (!userId || !subscriptionId)
        throw new Error("userId and subscriptionId are required");

      const [user, plan] = await Promise.all([
        User.findById(userId).session(session),
        Subscription.findById(subscriptionId).session(session),
      ]);
      if (!user) throw new Error("User not found");
      if (!plan) throw new Error("Subscription plan not found");

      // Prevent subscribing to the same plan if user already has an active subscription of that plan
      const now = new Date();
      const existingSame = await UserSubscription.findOne({
        userId: user._id,
        subscriptionId: plan._id,
        active: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).session(session);
      if (existingSame)
        throw new Error(
          "User already has an active subscription for this plan"
        );

      const start = startDate ? new Date(startDate) : new Date();
      let end;
      if (clientEndDate) {
        end = new Date(clientEndDate);
      } else if (
        typeof plan.durationDays === "number" &&
        plan.durationDays > 0
      ) {
        end = new Date(start.getTime() + plan.durationDays * MS_PER_DAY);
      } else {
        end = new Date(start.getTime() + 30 * MS_PER_DAY);
      }

      const startingAvailable =
        typeof plan.accessibleSlots === "number"
          ? plan.accessibleSlots
          : plan.features?.views ?? 0;

      const us = new UserSubscription({
        userId: user._id,
        subscriptionId: plan._id,
        startDate: start,
        endDate: end,
        available: startingAvailable,
        viewedProperties: [],
        accessLevel:
          UserSubscription.computeAccessLevelFromRemaining(startingAvailable),
        active:
          start <= new Date() && new Date() <= end && startingAvailable > 0,
      });

      await us.save({ session });

      if (us.active) {
        await User.findByIdAndUpdate(
          user._id,
          { currentUserSubscription: us._id },
          { session }
        );
      }

      createdId = us._id;
    });

    const populated = await UserSubscription.findById(createdId)
      .populate("subscriptionId", "name accessibleSlots price durationDays")
      .populate("userId", "name email");

    return res.status(201).json(populated);
  } catch (err) {
    console.error("subscribe error:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

/* End a subscription immediately and clear user's current subscription if it was active */
exports.endSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let updatedId = null;

    await session.withTransaction(async () => {
      const id = req.params.id;
      const us = await UserSubscription.findById(id).session(session);
      if (!us) throw new Error("UserSubscription not found");

      const now = new Date();
      us.endDate = now;
      us.active = false;
      await us.save({ session });

      const user = await User.findById(us.userId).session(session);
      if (
        user &&
        user.currentUserSubscription &&
        user.currentUserSubscription.toString() === us._id.toString()
      ) {
        await User.findByIdAndUpdate(
          user._id,
          { currentUserSubscription: null },
          { session }
        );
      }

      updatedId = us._id;
    });

    const populated = await UserSubscription.findById(updatedId)
      .populate("subscriptionId", "name accessibleSlots price durationDays")
      .populate("userId", "name email");

    return res.json({ success: true, userSubscription: populated });
  } catch (err) {
    console.error("endSubscription error:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

/* Upgrade a user's subscription to a new plan (adds remaining slots and remaining days) */
exports.upgradeSubscription = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let updatedId = null;

    await session.withTransaction(async () => {
      const id = req.params.id;
      const { newSubscriptionId, inheritRemaining = true } = req.body;
      if (!newSubscriptionId) throw new Error("newSubscriptionId is required");

      const [us, newPlan] = await Promise.all([
        UserSubscription.findById(id).session(session),
        Subscription.findById(newSubscriptionId).session(session),
      ]);
      if (!us) throw new Error("UserSubscription not found");
      if (!newPlan) throw new Error("New subscription plan not found");

      // Prevent upgrading to the same plan
      if (us.subscriptionId.toString() === newPlan._id.toString())
        throw new Error("Already on this subscription plan");

      const newPlanSlots =
        typeof newPlan.accessibleSlots === "number"
          ? newPlan.accessibleSlots
          : newPlan.features?.views ?? 0;

      // compute remaining days on existing plan (only if endDate in future)
      const now = new Date();
      let remainingDaysOld = 0;
      if (us.endDate && us.endDate > now) {
        remainingDaysOld = Math.ceil(
          (us.endDate.getTime() - now.getTime()) / MS_PER_DAY
        );
      }

      // resulting available slots: optionally inherit existing remaining slots
      const resultingAvailable = inheritRemaining
        ? Number(us.available || 0) + Number(newPlanSlots)
        : Number(newPlanSlots);

      // resulting end date = now + newPlan.durationDays + remainingDaysOld
      const durationDays =
        typeof newPlan.durationDays === "number" && newPlan.durationDays > 0
          ? newPlan.durationDays
          : 30;
      const newEndDate = new Date(
        now.getTime() + (durationDays + remainingDaysOld) * MS_PER_DAY
      );

      us.subscriptionId = newPlan._id;
      us.available = resultingAvailable;
      us.startDate = now;
      us.endDate = newEndDate;
      us.accessLevel =
        UserSubscription.computeAccessLevelFromRemaining(resultingAvailable);
      us.active = now <= newEndDate && resultingAvailable > 0;

      await us.save({ session });

      const user = await User.findById(us.userId).session(session);
      if (!user) throw new Error("Associated user not found");

      if (us.active) {
        await User.findByIdAndUpdate(
          user._id,
          { currentUserSubscription: us._id },
          { session }
        );
      } else {
        if (
          user.currentUserSubscription &&
          user.currentUserSubscription.toString() === us._id.toString()
        ) {
          await User.findByIdAndUpdate(
            user._id,
            { currentUserSubscription: null },
            { session }
          );
        }
      }

      updatedId = us._id;
    });

    const populated = await UserSubscription.findById(updatedId)
      .populate("subscriptionId", "name accessibleSlots price durationDays")
      .populate("userId", "name email");

    return res.json({ success: true, userSubscription: populated });
  } catch (err) {
    console.error("upgradeSubscription error:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};
