// backend/controllers/ownerController.js

const Property = require("../models/Property");
const Owner = require("../models/Owner");
const User = require("../models/User");
const { PROPERTY_STATUS } = require("../utils/constants");

/**
 * Create or update owner profile for the logged-in user.
 * Requires auth middleware so req.user is present.
 */
exports.createOrUpdateProfile = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        error: { message: "Unauthorized" },
        data: null,
      });
    }

    const {
      name,
      phone,
      address,
      city,
      state,
      pincode,
      bio,
      // any other owner-specific fields
    } = req.body;

    // Upsert Owner profile linked to this user
    let owner = await Owner.findOne({ user: userId });

    const payload = {
      name,
      phone,
      address,
      city,
      state,
      pincode,
      bio,
      updatedAt: new Date(),
    };

    if (!owner) {
      // Try to get user data for name fallback
      const u = await User.findById(userId).select("name email phone");
      payload.user = userId;
      payload.name = payload.name || (u ? u.name || u.email : "Unknown");
      owner = new Owner(payload);
    } else {
      // merge only provided fields
      Object.keys(payload).forEach((k) => {
        if (payload[k] !== undefined) owner[k] = payload[k];
      });
    }

    const saved = await owner.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      message: "Owner profile saved",
      data: saved,
    });
  } catch (err) {
    console.error("createOrUpdateProfile error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};

/**
 * Get owner profile for the logged-in user.
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        error: { message: "Unauthorized" },
        data: null,
      });
    }

    const owner = await Owner.findOne({ user: userId })
      .select("-__v")
      .populate("properties");
    if (!owner) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Owner profile not found" },
        data: null,
      });
    }

    return res
      .status(200)
      .json({ statusCode: 200, success: true, error: null, data: owner });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};

/**
 * Upload new property (handles admin, owner, and regular user cases).
 * - Admin must supply ownerId (Owner._id or User._id)
 * - Non-admin: the logged-in user becomes owner (Owner doc created if missing)
 */
exports.uploadProperty = async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      rent,
      deposit,
      propertyType,
      bedrooms,
      bathrooms,
      area,
      amenities,
      images, // frontend sends array of Supabase URLs
      status,
      ownerId, // optional for admin
    } = req.body;

    // ---------- BASIC VALIDATION ----------
    if (!title || !title.trim()) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Property title is required" },
        data: null,
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Property description is required" },
        data: null,
      });
    }

    if (
      !location ||
      !location.address ||
      !location.city ||
      !location.state ||
      !location.country
    ) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message:
            "Complete location (address, city, state, country) is required",
        },
        data: null,
      });
    }

    if (rent === undefined || rent === null || Number(rent) < 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Valid rent is required" },
        data: null,
      });
    }

    if (bedrooms === undefined || bedrooms === null || Number(bedrooms) < 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Valid number of bedrooms is required" },
        data: null,
      });
    }

    if (
      bathrooms === undefined ||
      bathrooms === null ||
      Number(bathrooms) < 0
    ) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Valid number of bathrooms is required" },
        data: null,
      });
    }

    if (area === undefined || area === null || Number(area) <= 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Valid property area is required" },
        data: null,
      });
    }

    // images: frontend sends array of URLs; schema expects [String]
    const normImages = Array.isArray(images)
      ? images.filter(Boolean)
      : images
      ? String(images)
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean)
      : [];

    if (!normImages || normImages.length === 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "At least one image URL is required" },
        data: null,
      });
    }

    // ---------- AUTH CHECK ----------
    const userId = req.user && (req.user.id || req.user._id);
    if (!userId) {
      return res.status(401).json({
        statusCode: 401,
        success: false,
        error: { message: "Unauthorized" },
        data: null,
      });
    }

    // ---------- OWNER RESOLUTION (ADMIN vs OWNER) ----------
    let ownerDoc = null;
    let ownerRef = null;
    let ownerName = null;
    let createdByRole = "owner";

    if (req.user.role === "admin") {
      createdByRole = "admin";

      // Admin must provide ownerId (Owner._id or User._id)
      if (!ownerId) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: {
            message: "Admin must provide ownerId when creating a property",
          },
          data: null,
        });
      }

      // Try Owner by id first
      ownerDoc = await Owner.findById(ownerId);
      if (!ownerDoc) {
        // maybe ownerId is a User id
        ownerDoc = await Owner.findOne({ user: ownerId });
      }

      if (!ownerDoc) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: {
            message:
              "Provided ownerId does not correspond to an existing owner profile",
          },
          data: null,
        });
      }

      ownerRef = ownerDoc._id;
      ownerName = ownerDoc.name || null;
    } else {
      // Non-admin: find or create Owner profile for this user
      ownerDoc = await Owner.findOne({ user: userId });
      if (!ownerDoc) {
        const userDoc = await User.findById(userId).select("name email phone");
        const newOwner = new Owner({
          user: userId,
          name: userDoc ? userDoc.name || userDoc.email : "Unknown",
          phone: userDoc ? userDoc.phone : undefined,
          properties: [],
        });
        ownerDoc = await newOwner.save();
      }
      ownerRef = ownerDoc._id;
      ownerName = ownerDoc.name || req.user.name || null;
    }

    // ---------- NORMALIZE AMENITIES ----------
    const normAmenities = Array.isArray(amenities)
      ? amenities
      : amenities
      ? String(amenities)
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    // ---------- BUILD LOCATION OBJECT TO MATCH SCHEMA ----------
    const locationPayload = {
      address: location.address,
      city: location.city,
      state: location.state,
      country: location.country,
      pincode: location.pincode || "",
      googleMapsLink: location.googleMapsLink || "",
    };

    // If frontend sends coordinates, store them

    // ---------- CREATE PROPERTY DOCUMENT ----------
    const property = new Property({
      owner: ownerRef,
      ownerName,
      createdByRole,
      title: title.trim(),
      description: description.trim(),
      location: locationPayload,
      rent: Number(rent),
      deposit:
        deposit !== undefined && deposit !== null && deposit !== ""
          ? Number(deposit)
          : undefined, // schema default will apply if undefined
      propertyType: propertyType || "apartment",
      bedrooms: Number(bedrooms),
      bathrooms: Number(bathrooms),
      area: Number(area),
      amenities: normAmenities,
      images: normImages, // <-- array of URL strings
      status: status || PROPERTY_STATUS.PENDING,
    });

    const saved = await property.save();

    // ---------- ADD PROPERTY REFERENCE TO OWNER ----------
    if (ownerDoc) {
      ownerDoc.properties = ownerDoc.properties || [];
      if (
        !ownerDoc.properties.some(
          (id) => id.toString() === saved._id.toString()
        )
      ) {
        ownerDoc.properties.push(saved._id);
        await ownerDoc.save();
      }
    }

    // ---------- RESPONSE ----------
    return res.status(201).json({
      statusCode: 201,
      success: true,
      error: null,
      data: {
        message: "Property uploaded successfully",
        property: {
          id: saved._id,
          title: saved.title,
          description: saved.description,
          location: saved.location,
          rent: saved.rent,
          deposit: saved.deposit,
          propertyType: saved.propertyType,
          bedrooms: saved.bedrooms,
          bathrooms: saved.bathrooms,
          area: saved.area,
          amenities: saved.amenities,
          images: saved.images, // array of URLs
          status: saved.status,
          owner: saved.owner,
          ownerName: saved.ownerName,
          createdByRole: saved.createdByRole,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        },
      },
    });
  } catch (err) {
    console.error("uploadProperty error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};

/**
 * Get properties for the logged-in owner.
 * If admin requests, they can pass a query param ownerId to fetch another owner's properties.
 */
exports.getOwnerProperties = async (req, res) => {
  try {
    let owner = null;

    // admin may provide ownerId query param to view
    if (req.user && req.user.role === "admin" && req.query.ownerId) {
      owner = await Owner.findById(req.query.ownerId).populate("properties");
      if (!owner) {
        // try find by user id
        owner = await Owner.findOne({ user: req.query.ownerId }).populate(
          "properties"
        );
      }
    } else {
      // normal owner: find by logged-in user
      const userId = req.user && (req.user.id || req.user._id);
      owner = await Owner.findOne({ user: userId }).populate("properties");
    }

    if (!owner) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Owner profile not found" },
        data: null,
      });
    }

    const properties = (owner.properties || []).map((property) => ({
      id: property._id,
      title: property.title,
      description: property.description,
      location: property.location,
      rent: property.rent,
      deposit: property.deposit,
      propertyType: property.propertyType,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      area: property.area,
      amenities: property.amenities,
      images: property.images,
      status: property.status,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    }));

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Properties retrieved successfully",
        properties,
        totalProperties: properties.length,
      },
    });
  } catch (err) {
    console.error("getOwnerProperties error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};

/**
 * Get a single property by id (owner or admin).
 * Owner can only access their own property; admin can access any.
 */
exports.getProperty = async (req, res) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Property not found" },
        data: null,
      });
    }

    // if requester is owner, ensure ownership
    if (req.user && req.user.role !== "admin") {
      const ownerDoc = await Owner.findOne({
        user: req.user.id || req.user._id,
      });
      if (
        !ownerDoc ||
        ownerDoc._id.toString() !== (prop.owner ? prop.owner.toString() : "")
      ) {
        return res.status(403).json({
          statusCode: 403,
          success: false,
          error: { message: "Access denied" },
          data: null,
        });
      }
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Property retrieved successfully",
        property: {
          id: prop._id,
          title: prop.title,
          description: prop.description,
          location: prop.location,
          rent: prop.rent,
          deposit: prop.deposit,
          propertyType: prop.propertyType,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          area: prop.area,
          amenities: prop.amenities,
          images: prop.images,
          status: prop.status,
          owner: prop.owner,
          ownerName: prop.ownerName,
          createdAt: prop.createdAt,
          updatedAt: prop.updatedAt,
        },
      },
    });
  } catch (err) {
    console.error("getProperty error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};

/**
 * Update property — only owner (or admin) can update.
 * If property is APPROVED or PUBLISHED, updating sets it back to PENDING.
 */
exports.updateProperty = async (req, res) => {
  const allowedUpdates = [
    "title",
    "description",
    "location",
    "rent",
    "deposit",
    "propertyType",
    "bedrooms",
    "bathrooms",
    "area",
    "amenities",
    "images",
    "status",
  ];

  try {
    // Validate updates keys
    const updates = Object.keys(req.body);
    const isValid = updates.every((u) => allowedUpdates.includes(u));
    if (!isValid) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Invalid updates! Allowed: " + allowedUpdates.join(", "),
        },
        data: null,
      });
    }

    const prop = await Property.findById(req.params.id);
    if (!prop) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Property not found" },
        data: null,
      });
    }

    // Permission: admin or owner
    if (req.user.role !== "admin") {
      const ownerDoc = await Owner.findOne({
        user: req.user.id || req.user._id,
      });
      if (
        !ownerDoc ||
        ownerDoc._id.toString() !== (prop.owner ? prop.owner.toString() : "")
      ) {
        return res.status(403).json({
          statusCode: 403,
          success: false,
          error: {
            message: "You do not have permission to update this property",
          },
          data: null,
        });
      }
    }

    // If published/approved -> set to pending for re-approval
    if (
      prop.status === PROPERTY_STATUS.APPROVED ||
      prop.status === PROPERTY_STATUS.PUBLISHED
    ) {
      prop.status = PROPERTY_STATUS.PENDING;
    }

    // Apply updates explicitly
    updates.forEach((key) => {
      if (key === "amenities" && !Array.isArray(req.body[key])) {
        prop[key] = String(req.body[key])
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
      } else if (key === "images" && !Array.isArray(req.body[key])) {
        prop[key] = String(req.body[key])
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean);
      } else {
        prop[key] = req.body[key];
      }
    });

    prop.updatedAt = new Date();
    await prop.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Property updated successfully",
        property: {
          id: prop._id,
          title: prop.title,
          description: prop.description,
          location: prop.location,
          rent: prop.rent,
          deposit: prop.deposit,
          propertyType: prop.propertyType,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          area: prop.area,
          amenities: prop.amenities,
          images: prop.images,
          status: prop.status,
          owner: prop.owner,
          ownerName: prop.ownerName,
          createdAt: prop.createdAt,
          updatedAt: prop.updatedAt,
        },
      },
    });
  } catch (err) {
    console.error("updateProperty error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};

/**
 * Delete property. Owner can delete their own property. Admin can delete any property.
 */
exports.deleteProperty = async (req, res) => {
  try {
    const prop = await Property.findById(req.params.id);
    if (!prop) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Property not found" },
        data: null,
      });
    }

    // Permission check
    if (req.user.role !== "admin") {
      const ownerDoc = await Owner.findOne({
        user: req.user.id || req.user._id,
      });
      if (
        !ownerDoc ||
        ownerDoc._id.toString() !== (prop.owner ? prop.owner.toString() : "")
      ) {
        return res.status(403).json({
          statusCode: 403,
          success: false,
          error: {
            message: "You do not have permission to delete this property",
          },
          data: null,
        });
      }
    }

    // Remove property
    await Property.deleteOne({ _id: prop._id });

    // Remove reference from owner.properties if exists
    if (prop.owner) {
      await Owner.updateOne(
        { _id: prop.owner },
        { $pull: { properties: prop._id } }
      );
    }

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: { message: "Property deleted successfully" },
    });
  } catch (err) {
    console.error("deleteProperty error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: err.message },
      data: null,
    });
  }
};
