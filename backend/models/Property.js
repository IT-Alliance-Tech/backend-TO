const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const propertySchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "Owner", default: null },

    // Admin can type an ownerName but we never validate it — display only
    ownerName: { type: String, default: null },

    createdByRole: {
      type: String,
      enum: ["owner", "admin"],
      default: "owner",
    },

    title: { type: String, required: true },
    description: { type: String, default: null },

    location: {
      address: { type: String, default: null },
      city: { type: String, default: null },
      state: { type: String, default: null },
      country: { type: String, default: null },
      coordinates: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
    },

    rent: { type: Number, required: true },
    deposit: { type: Number, default: null },

    propertyType: {
      type: String,
      enum: ["apartment", "house", "villa", "condo"],
      default: "apartment",
    },

    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    area: { type: Number, default: null },

    // JSON-friendly array fields
    amenities: {
      type: [String],
      default: [],
    },

    images: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "published", "sold"],
      default: "pending",
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// CHANGED: Prevent admin from creating duplicate properties
propertySchema.index(
  {
    title: 1,
    "location.address": 1,
    "location.city": 1,
    rent: 1,
  },
  {
    unique: true,
    name: "unique_admin_property",
    partialFilterExpression: { createdByRole: "admin" },
  }
);

module.exports =
  mongoose.models.Property || mongoose.model("Property", propertySchema);
