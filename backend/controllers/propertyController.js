const Property = require("../models/Property");
const UserSubscription = require("../models/UserSubscription");

// Helper: Format property for GUEST view (landing page - no login)
function formatGuestView(p) {
  return {
    id: p._id.toString(),
    title: p.title,
    rent: p.rent,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    images: p.images?.slice(0, 1) || [], // Only first image
    amenities: p.amenities || [],
    location: {
      city: p.location?.city || null,
      state: p.location?.state || null,
      coordinates: {},
      address: null,
      country: null,
    },
    status: p.status,
    createdAt: p.createdAt,
    description: null,
    deposit: null,
    owner: null,
    restricted: true,
  };
}

// Helper: Format property for LOGGED-IN USER (no subscription)
function formatLoggedView(p) {
  return {
    id: p._id.toString(),
    title: p.title,
    description: p.description,
    rent: p.rent,
    deposit: p.deposit,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    images: p.images || [],
    amenities: p.amenities || [],
    location: {
      city: p.location?.city || null,
      state: p.location?.state || null,
      coordinates: {},
      address: null,
      country: null,
    },
    status: p.status,
    createdAt: p.createdAt,
    owner: null,
    restricted: true,
  };
}

// Helper: Format property for SUBSCRIBED USER (full access)
function formatSubscribedView(p) {
  return {
    id: p._id.toString(),
    title: p.title,
    description: p.description,
    location: {
      coordinates: p.location?.coordinates || {},
      address: p.location?.address || null,
      city: p.location?.city || null,
      state: p.location?.state || null,
      country: p.location?.country || null,
    },
    rent: p.rent,
    deposit: p.deposit,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    amenities: p.amenities || [],
    images: p.images || [],
    status: p.status,
    owner: {
      id: p.owner?._id?.toString() || p.owner?.toString() || null,
      name: p.ownerName || p.owner?.name || null,
      phone: p.owner?.phone || null,
      email: p.owner?.email || null,
    },
    createdByRole: p.createdByRole || null,
    createdAt: p.createdAt,
    restricted: false,
  };
}

// Original view functions for backward compatibility
function guestView(p) {
  return {
    _id: p._id,
    images: p.images || [],
    rent: p.rent,
    title: p.title,
    amenities: p.amenities || [],
    restricted: true,
  };
}

function loggedView(p) {
  return {
    _id: p._id,
    images: p.images || [],
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
  return p;
}

// CREATE PROPERTY
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

      if (dup)
        return res.status(400).json({
          error:
            "you cannot post same property, already property has listed by admin",
        });
    }

    const property = new Property(propertyData);
    await property.save();

    return res.status(201).json({ success: true, property });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// GET SINGLE PROPERTY
const get = async (req, res) => {
  try {
    const id = req.params.id;
    let p = await Property.findById(id)
      .populate("owner", "name phone email")
      .lean();

    if (!p) return res.status(404).json({ error: "Not found" });

    if (!req.user) return res.json(guestView(p));
    if (req.user && !req.userSubscription) return res.json(loggedView(p));
    return res.json(subscribedView(p));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// LIST PROPERTIES (with restrictions)
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
      Property.find(filter).sort(sort).skip(skip).limit(perPage).lean(),
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

// NEW: SINGLE ENDPOINT with tiered access
const getUserProperties = async (req, res) => {
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

    let properties;
    let userAccessLevel = "guest";
    let hasActiveSubscription = false;

    if (!req.user) {
      properties = props.map(formatGuestView);
      userAccessLevel = "guest";
    } else {
      const now = new Date();
      const activeSub = await UserSubscription.findOne({
        userId: req.user._id,
        active: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean();

      if (activeSub) {
        properties = props.map(formatSubscribedView);
        userAccessLevel = "subscribed";
        hasActiveSubscription = true;
      } else {
        properties = props.map(formatLoggedView);
        userAccessLevel = "logged_in";
        hasActiveSubscription = false;
      }
    }

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
        userAccess: {
          level: userAccessLevel,
          hasActiveSubscription,
          isAuthenticated: !!req.user,
        },
        properties,
        pagination,
        appliedFilters,
      },
    });
  } catch (err) {
    console.error("Error in getUserProperties:", err);
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

// EXPORT ALL FUNCTIONS
module.exports = {
  create,
  get,
  list,
  getUserProperties,
};
