// models/Property.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const propertySchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "Owner", // or "User" depending on your model name
      required: true,
      index: true,
    },

    // Admin can type an ownerName but we never validate it – display only
    ownerName: {
      type: String,
      default: null,
    },

    createdByRole: {
      type: String,
      enum: ["owner", "admin"],
      default: "owner",
    },

    title: {
      type: String,
      required: [true, "Property title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },

    description: {
      type: String,
      required: [true, "Property description is required"],
      trim: true,
    },
    location: {
      address: {
        type: String,
        required: [true, "Address is required"],
        trim: true,
      },
      city: {
        type: String,
        required: [true, "City is required"],
        trim: true,
        index: true,
      },
      state: {
        type: String,
        required: [true, "State is required"],
        trim: true,
        index: true,
      },
      country: {
        type: String,
        required: [true, "Country is required"],
        trim: true,
      },
      pincode: {
        type: String,
        trim: true,
      },
      googleMapsLink: {
        type: String,
        trim: true,
      },
      coordinates: {
        lat: { type: Number, default: null }, // latitude
        lng: { type: Number, default: null }, // longitude
      },
    },

    deposit: {
      type: Number,
      min: [0, "Deposit cannot be negative"],
      default: function () {
        return this.rent * 2;
      },
    },

    propertyType: {
      type: String,
      enum: {
        values: ["apartment", "house", "villa", "condo"],
        message: "{VALUE} is not a valid property type",
      },
      default: "apartment",
      lowercase: true,
      index: true,
    },

    bedrooms: {
      type: Number,
      required: [true, "Number of bedrooms is required"],
      min: [0, "Bedrooms cannot be negative"],
      default: 1,
    },

    bathrooms: {
      type: Number,
      required: [true, "Number of bathrooms is required"],
      min: [0, "Bathrooms cannot be negative"],
      default: 1,
    },

    area: {
      type: Number,
      required: [true, "Property area is required"],
      min: [0, "Area cannot be negative"],
    },

    // Amenities array
    amenities: {
      type: [String],
      default: [],
    },

    // Images array with flexible structure
    images: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: "At least one image is required",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected", "published", "sold"],
        message: "{VALUE} is not a valid status",
      },
      default: "pending",
      index: true,
    },

    views: {
      type: Number,
      default: 0,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Indexes for better query performance
propertySchema.index({ owner: 1, status: 1 });
propertySchema.index({ "location.city": 1, "location.state": 1 });
propertySchema.index({ propertyType: 1, status: 1 });
propertySchema.index({ rent: 1, status: 1 });
propertySchema.index({ createdAt: -1 });

// Compound index for search
propertySchema.index({
  title: "text",
  description: "text",
  "location.address": "text",
});

// Prevent admin from creating duplicate properties
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

// Pre-save middleware to update timestamps
propertySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Pre-update middleware
propertySchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Virtual for formatted rent
propertySchema.virtual("formattedRent").get(function () {
  return `₹${this.rent.toLocaleString("en-IN")}`;
});

// Virtual for formatted area
propertySchema.virtual("formattedArea").get(function () {
  return `${this.area} sq ft`;
});

// Method to check if property is available
propertySchema.methods.isAvailable = function () {
  return this.status === "approved" || this.status === "published";
};

// Static method to find available properties
propertySchema.statics.findAvailable = function (filter = {}) {
  return this.find({
    ...filter,
    status: { $in: ["approved", "published"] },
  });
};

// Ensure virtuals are included in JSON output
propertySchema.set("toJSON", { virtuals: true });
propertySchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.Property || mongoose.model("Property", propertySchema);
