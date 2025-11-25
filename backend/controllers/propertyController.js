const Property = require("../models/Property");
const UserSubscription = require("../models/UserSubscription");
const Subscription = require("../models/Subscription");
const User = require("../models/User");

const BUCKET = process.env.SUPABASE_BUCKET || "properties";

// ---------------------------------------------------------------------
// IMAGE NORMALIZATION
// ---------------------------------------------------------------------

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .map((img) => {
      // Simple string
      if (typeof img === "string") return img;

      // Object with url/path
      if (img && typeof img === "object") {
        if (img.url) return img.url;
        if (img.path) return img.path;

        // Weird object like {0:"h",1:"t",...}
        const charKeys = Object.keys(img).filter((k) => /^\d+$/.test(k));
        if (charKeys.length) {
          charKeys.sort((a, b) => Number(a) - Number(b));
          return charKeys.map((k) => img[k]).join("");
        }
      }

      return null;
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------
// LISTING VIEW HELPERS (for /api/properties list)
// ---------------------------------------------------------------------

function guestView(p) {
  return {
    _id: p._id,
    images: normalizeImages(p.images).slice(0, 1),
    rent: p.rent,
    title: p.title,
    amenities: p.amenities || [],
    restricted: true,
  };
}

function loggedView(p) {
  return {
    _id: p._id,
    images: normalizeImages(p.images),
    rent: p.rent,
    title: p.title,
    description: p.description,
    amenities: p.amenities || [],
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    propertyType: p.propertyType,
    location: null,
    owner: null,
    restricted: true,
  };
}

function subscribedView(p) {
  return {
    _id: p._id,
    images: normalizeImages(p.images),
    rent: p.rent,
    title: p.title,
    description: p.description,
    amenities: p.amenities || [],
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    propertyType: p.propertyType,
    location: p.location || null,
    owner: p.owner || null,
    restricted: false,
  };
}

// ---------------------------------------------------------------------
// SUBSCRIPTION HELPERS
// ---------------------------------------------------------------------

async function getActiveUserSubscription(userId) {
  if (!userId) return { subscriptionDoc: null, planDoc: null };

  const now = new Date();

  const subscriptionDoc = await UserSubscription.findOne({
    userId,
    startDate: { $lte: now },
    endDate: { $gte: now },
    active: true,
  }).exec();

  if (!subscriptionDoc) {
    return { subscriptionDoc: null, planDoc: null };
  }

  const planDoc = await Subscription.findById(
    subscriptionDoc.subscriptionId
  ).exec();

  return { subscriptionDoc, planDoc };
}

function buildPropertySubscriptionResponse(
  property,
  subscriptionDoc,
  planDoc,
  ownerUser
) {
  const propertyId = property._id.toString();
  const images = normalizeImages(property.images);

  let subscriptionStatus = "inactive";
  let remainingViews = null;
  let alreadyViewedThisProperty = false;
  let plan = null;
  let owner = null;
  let location = null;

  if (subscriptionDoc && planDoc) {
    const now = new Date();
    const withinDateRange =
      subscriptionDoc.startDate <= now && now <= subscriptionDoc.endDate;

    const available =
      typeof subscriptionDoc.getRemainingViews === "function"
        ? subscriptionDoc.getRemainingViews()
        : subscriptionDoc.available || 0;

    if (typeof subscriptionDoc.hasViewedProperty === "function") {
      alreadyViewedThisProperty = subscriptionDoc.hasViewedProperty(
        property._id
      );
    } else {
      alreadyViewedThisProperty = false;
    }

    const hasAccess =
      withinDateRange &&
      subscriptionDoc.active &&
      (available > 0 || alreadyViewedThisProperty);

    if (hasAccess) {
      subscriptionStatus = "active";
      remainingViews = available > 0 ? available : null;

      plan = {
        id: planDoc._id.toString(),
        name: planDoc.name,
        timeLabel: planDoc.timeLabel,
        durationDays: planDoc.durationDays,
        totalSlots: planDoc.accessibleSlots,
      };

      const o = property.owner || {};

      owner = {
        id: o._id?.toString?.() || o.id || o.toString?.() || null,
        name: property.ownerName || ownerUser?.name || o.name || null,
        phone: ownerUser?.phone || o.phone || null,
        email: ownerUser?.email || o.email || null,
      };

      location = {
        address: property.location?.address || null,
        city: property.location?.city || null,
        state: property.location?.state || null,
        country: property.location?.country || null,
        pincode: property.location?.pincode || null,
        coordinates: property.location?.coordinates || {
          lat: null,
          lng: null,
        },
        googleMapsLink: property.location?.googleMapsLink || null,
      };
    }
  }

  return {
    propertyId,
    images,
    subscription: {
      status: subscriptionStatus,
      plan,
      remainingViews,
      alreadyViewedThisProperty,
    },
    owner,
    location,
    meta: {
      title: property.title,
      description: property.description,
      rent: property.rent,
      deposit: property.deposit,
      propertyType: property.propertyType,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      area: property.area,
      status: property.status,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      createdByRole: property.createdByRole,
      ownerId:
        property.owner?._id?.toString?.() ||
        property.owner?.toString?.() ||
        null,
      ownerName: property.ownerName || null,
    },
  };
}

// ---------------------------------------------------------------------
// CREATE PROPERTY
// ---------------------------------------------------------------------

const create = async (req, res) => {
  try {
    const actor = req.user || {};
    const role = (actor.role || "owner").toLowerCase();

    const payload = req.body || {};
    const propertyData = { ...payload, createdByRole: role };

    if (role === "owner") {
      propertyData.owner = actor._id;
      propertyData.ownerName = null;
    }

    if (role === "admin") {
      propertyData.owner = null;
      propertyData.ownerName = payload.ownerName || null;

      const dup = await Property.findOne({
        title: payload.title,
        rent: payload.rent,
        "location.address": payload?.location?.address || null,
        "location.city": payload?.location?.city || null,
        createdByRole: "admin",
      });

      if (dup) {
        return res.status(400).json({
          error:
            "you cannot post same property, already property has listed by admin",
        });
      }
    }

    const property = new Property(propertyData);
    await property.save();

    return res.status(201).json({ success: true, property });
  } catch (err) {
    console.error("Error in property create:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------------------------------------
// SINGLE PROPERTY – WITH SUBSCRIPTION + DECREMENT LOGIC
// GET /api/properties/:id
// ---------------------------------------------------------------------

const get = async (req, res) => {
  try {
    const id = req.params.id;

    const property = await Property.findById(id).populate("owner").exec();

    if (!property) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Property not found" },
        data: null,
      });
    }

    // ---------- GUEST USER ----------
    if (!req.user) {
      const payload = {
        propertyId: property._id.toString(),
        images: normalizeImages(property.images),
        subscription: {
          status: "inactive",
          plan: null,
          remainingViews: null,
          alreadyViewedThisProperty: false,
        },
        owner: null,
        location: null,
        meta: {
          title: property.title,
          description: property.description,
          rent: property.rent,
          deposit: property.deposit,
          propertyType: property.propertyType,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          area: property.area,
          status: property.status,
          createdAt: property.createdAt,
          updatedAt: property.updatedAt,
          createdByRole: property.createdByRole,
          ownerId:
            property.owner?._id?.toString?.() ||
            property.owner?.toString?.() ||
            null,
          ownerName: property.ownerName || null,
        },
      };

      return res.status(200).json(payload);
    }

    // ---------- LOGGED-IN USER ----------
    const { subscriptionDoc, planDoc } = await getActiveUserSubscription(
      req.user._id
    );

    // If no subscription or no plan, treat as inactive
    if (!subscriptionDoc || !planDoc) {
      const payload = buildPropertySubscriptionResponse(
        property,
        null,
        null,
        null
      );
      return res.status(200).json(payload);
    }

    // Try to fetch owner user details (User table) if linked
    let ownerUser = null;
    const ownerDoc = property.owner;

    if (ownerDoc && (ownerDoc.userId || ownerDoc.user)) {
      const userId = ownerDoc.userId || ownerDoc.user;
      try {
        ownerUser = await User.findById(userId).lean();
      } catch (e) {
        ownerUser = null;
      }
    }

    // ---- CORE LOGIC: VIEW / DECREMENT ----
    let effectiveSub = subscriptionDoc;

    // 1) Already viewed this property?
    let alreadyViewed =
      typeof subscriptionDoc.hasViewedProperty === "function"
        ? subscriptionDoc.hasViewedProperty(property._id)
        : false;

    if (!alreadyViewed) {
      // 2) Not viewed yet → check remaining views
      const currentAvailable =
        typeof subscriptionDoc.getRemainingViews === "function"
          ? subscriptionDoc.getRemainingViews()
          : subscriptionDoc.available || 0;

      if (currentAvailable > 0) {
        // 3) Consume one slot + mark property viewed
        effectiveSub = await subscriptionDoc.usePropertyView(property._id);
        alreadyViewed = true;
      } else {
        // 4) No views left and not viewed → no access
        const payload = buildPropertySubscriptionResponse(
          property,
          null,
          null,
          null
        );
        return res.status(200).json(payload);
      }
    }

    // 5) Now build response using updated subscription (after decrement)
    const payload = buildPropertySubscriptionResponse(
      property,
      effectiveSub,
      planDoc,
      ownerUser
    );

    // Ensure flag is true after first view
    payload.subscription.alreadyViewedThisProperty = true;

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Error in single property get:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: err.message,
      },
      data: null,
    });
  }
};

// ---------------------------------------------------------------------
// LIST PROPERTIES – FILTER + TIERED VIEW
// GET /api/properties
// ---------------------------------------------------------------------

const list = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 10;
    const skip = (page - 1) * perPage;

    const {
      minRent,
      maxRent,
      minDeposit,
      maxDeposit,
      propertyType,
      bedrooms,
      bathrooms,
      minArea,
      maxArea,
      amenities,
      address,
      city,
      state,
      search,
      sortBy,
    } = req.query;

    const filter = {
      status: { $in: ["approved", "published"] },
    };

    if (minRent || maxRent) {
      filter.rent = {};
      if (minRent) filter.rent.$gte = Number(minRent);
      if (maxRent) filter.rent.$lte = Number(maxRent);
    }

    if (minDeposit || maxDeposit) {
      filter.deposit = {};
      if (minDeposit) filter.deposit.$gte = Number(minDeposit);
      if (maxDeposit) filter.deposit.$lte = Number(maxDeposit);
    }

    if (minArea || maxArea) {
      filter.area = {};
      if (minArea) filter.area.$gte = Number(minArea);
      if (maxArea) filter.area.$lte = Number(maxArea);
    }

    if (propertyType) filter.propertyType = propertyType;
    if (bedrooms) filter.bedrooms = Number(bedrooms);
    if (bathrooms) filter.bathrooms = Number(bathrooms);

    if (city) filter["location.city"] = new RegExp(city, "i");
    if (state) filter["location.state"] = new RegExp(state, "i");
    if (address) filter["location.address"] = new RegExp(address, "i");

    let amenitiesArr = [];
    if (amenities) {
      amenitiesArr = amenities
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      if (amenitiesArr.length) {
        filter.amenities = { $all: amenitiesArr };
      }
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { title: regex },
        { description: regex },
        { "location.address": regex },
      ];
    }

    let sort = { createdAt: -1 };
    let sortByValue = sortBy || "newest";

    if (sortBy === "rent_low_to_high") {
      sort = { rent: 1 };
    } else if (sortBy === "rent_high_to_low") {
      sort = { rent: -1 };
    } else if (sortBy === "oldest") {
      sort = { createdAt: 1 };
    } else {
      sortByValue = "newest";
    }

    const [props, totalProperties] = await Promise.all([
      Property.find(filter)
        .populate("owner", "name email phone")
        .sort(sort)
        .skip(skip)
        .limit(perPage)
        .lean(),
      Property.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalProperties / perPage);

    const properties = props.map((p) => {
      if (!req.user) return guestView(p);
      if (req.user && !req.userSubscription) return loggedView(p);
      return subscribedView(p);
    });

    const pagination = {
      currentPage: page,
      totalPages,
      totalProperties,
      propertiesPerPage: perPage,
      propertiesOnCurrentPage: properties.length,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    };

    const appliedFilters = {
      minRent: minRent ? Number(minRent) : null,
      maxRent: maxRent ? Number(maxRent) : null,
      minDeposit: minDeposit ? Number(minDeposit) : null,
      maxDeposit: maxDeposit ? Number(maxDeposit) : null,
      propertyType: propertyType || null,
      bedrooms: bedrooms ? Number(bedrooms) : null,
      bathrooms: bathrooms ? Number(bathrooms) : null,
      minArea: minArea ? Number(minArea) : null,
      maxArea: maxArea ? Number(maxArea) : null,
      amenities: amenitiesArr.length ? amenitiesArr : null,
      address: address || null,
      city: city || null,
      state: state || null,
      search: search || null,
      sortBy: sortByValue,
    };

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Properties retrieved successfully",
        properties,
        pagination,
        appliedFilters,
      },
    });
  } catch (err) {
    console.error("Error in property list:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: err.message,
      },
      data: null,
    });
  }
};

// Simple delegates (if your userRoutes use them)
const getUserProperties = async (req, res) => {
  return list(req, res);
};

const getSingleUserProperties = async (req, res) => {
  return list(req, res);
};

module.exports = {
  create,
  get,
  list,
  getUserProperties,
  getSingleUserProperties,
};
