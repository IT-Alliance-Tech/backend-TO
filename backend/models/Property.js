// backend/models/Property.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const propertySchema = new Schema({
  // owner references Owner and admin can uploade the property details
  owner: { type: Schema.Types.ObjectId, ref: "Owner", default: null },
  ownerName: { type: String, default: null },
  createdByRole: { type: String, enum: ["owner","admin"], default: "owner" },

  title: { type: String, required: true },
  description: { type: String },
  location: {
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
  },
  rent: { type: Number, required: true },
  deposit: { type: Number },
  propertyType: {
    type: String,
    enum: ["apartment", "house", "villa", "condo"],
  },
  bedrooms: { type: Number },
  bathrooms: { type: Number },
  area: { type: Number },
  amenities: [String],
  images: [String], // Array of image URLs
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "published", "sold"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

module.exports = mongoose.model("Property", propertySchema);
