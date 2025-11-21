// backend/models/UserSubscription.js
// CHANGED: file inspected — schema preserved (no changes needed)
const mongoose = require("mongoose");
const { Schema } = mongoose;
const ObjectId = mongoose.Types.ObjectId;

const ViewedPropertySchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, required: true },
    viewedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const UserSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // owner of subscription
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    }, // plan ref
    startDate: { type: Date, required: true }, // subscription start
    endDate: { type: Date, required: true }, // subscription end
    available: { type: Number, required: true, default: 0 }, // remaining view slots
    viewedProperties: { type: [ViewedPropertySchema], default: [] }, // recorded property views
    accessDate: { type: Schema.Types.Mixed, default: {} }, // misc access metadata
    accessLevel: {
      type: String,
      enum: ["full", "limited", "none"],
      default: "full",
    }, // access category
    active: { type: Boolean, default: false }, // whether subscription is active
  },
  { timestamps: true }
);

/* Active if within dates and has available slots */
UserSubscriptionSchema.methods.computeActive = function (asOf = new Date()) {
  return this.startDate <= asOf && asOf <= this.endDate && this.available > 0;
};

/* Access level from remaining slots */
UserSubscriptionSchema.statics.computeAccessLevelFromRemaining = function (
  remaining
) {
  if (remaining <= 0) return "none";
  if (remaining <= 10) return "limited";
  return "full";
};

/* Return number of remaining views */
UserSubscriptionSchema.methods.getRemainingViews = function () {
  return this.available;
};

/* Check whether the property has been viewed (safe string/ObjectId compare) */
UserSubscriptionSchema.methods.hasViewedProperty = function (propertyId) {
  const pidStr =
    propertyId && propertyId.toString
      ? propertyId.toString()
      : String(propertyId);
  return this.viewedProperties.some(
    (vp) => (vp.propertyId || "").toString() === pidStr
  );
};

/* Convenience validity boolean */
UserSubscriptionSchema.methods.isValid = function (asOf = new Date()) {
  return this.computeActive(asOf);
};

/**
 * usePropertyView(propertyId)
 * Atomically decrement a view slot and record viewed property if not seen before.
 * Uses findOneAndUpdate with safe ObjectId creation to avoid race conditions.
 * Returns updated document or null on failure (already viewed / no slots / inactive).
 */
UserSubscriptionSchema.methods.usePropertyView = async function (propertyId) {
  const Model = this.constructor;

  // accept string or ObjectId input; ensure proper ObjectId instance
  let pid;
  try {
    pid =
      propertyId instanceof mongoose.Types.ObjectId
        ? propertyId
        : new ObjectId(String(propertyId));
  } catch (e) {
    // invalid id format
    return null;
  }

  // atomic query: subscription must be active, have available >=1 and not have this propertyId recorded
  const query = {
    _id: this._id,
    active: true,
    available: { $gte: 1 },
    "viewedProperties.propertyId": { $ne: pid },
  };

  // decrement available and push viewed record atomically
  const update = {
    $inc: { available: -1 },
    $push: {
      viewedProperties: {
        propertyId: pid,
        viewedAt: new Date(),
      },
    },
  };

  const updated = await Model.findOneAndUpdate(query, update, {
    new: true,
  }).exec();

  if (!updated) {
    // null when already viewed, inactive, or no slots
    return null;
  }

  // recalc accessLevel and potentially deactivate if no slots left
  const newAccessLevel = Model.computeAccessLevelFromRemaining(
    updated.available
  );
  const sets = { accessLevel: newAccessLevel };
  if (updated.available <= 0) sets.active = false;

  // persist accessLevel/active
  const final = await Model.findByIdAndUpdate(
    updated._id,
    { $set: sets },
    { new: true }
  ).exec();
  return final;
};

/* Numeric virtual for simple queries */
UserSubscriptionSchema.virtual("activeNumeric").get(function () {
  return this.active ? 1 : 0;
});

module.exports = mongoose.model("UserSubscription", UserSubscriptionSchema);
