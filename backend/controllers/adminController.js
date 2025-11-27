const mongoose = require("mongoose");
const Property = require("../models/Property");
const Booking = require("../models/Booking");
const User = require("../models/User");
const Owner = require("../models/Owner");
const { PROPERTY_STATUS, BOOKING_STATUS } = require("../utils/constants");

// Helper: format property for admin responses
function formatPropertyForAdmin(property) {
  // property.owner may be populated Owner with nested user
  const ownerDoc = property.owner || null;
  const ownerUser = ownerDoc && ownerDoc.user ? ownerDoc.user : null;

  const owner = {
    id: ownerDoc ? ownerDoc._id : null,
    name: (ownerUser && ownerUser.name) || property.ownerName || null,
    firstName: ownerUser ? ownerUser.firstName || null : null,
    lastName: ownerUser ? ownerUser.lastName || null : null,
    email: (ownerUser && ownerUser.email) || property.ownerEmail || null,
    phone: (ownerUser && ownerUser.phone) || property.ownerPhone || null,
    verified:
      ownerUser && typeof ownerUser.verified !== "undefined"
        ? ownerUser.verified
        : ownerDoc
        ? ownerDoc.verified
        : null,
    role: ownerUser ? ownerUser.role || "owner" : "owner",
    idProof: ownerDoc
      ? {
          type: ownerDoc.idProofType || null,
          number: ownerDoc.idProofNumber || null,
          imageUrl: ownerDoc.idProofImageUrl || null,
        }
      : null,
  };

  return {
    id: property._id,
    title: property.title,
    description: property.description,
    location: property.location,
    rent: typeof property.rent === "number" ? property.rent : null,
    deposit: property.deposit ?? null,
    propertyType: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    area: property.area,
    amenities: property.amenities,
    images: property.images,
    status: property.status,
    ownerName: property.ownerName || null,
    ownerEmail: property.ownerEmail || null,
    ownerPhone: property.ownerPhone || null,
    owner, // clean summarized owner object
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
  };
}

// Approve / reject / publish / sold property (single endpoint)
const reviewProperty = async (req, res) => {
  let { status } = req.body;

  try {
    if (!status) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Status is required",
        },
        data: null,
      });
    }

    // Make status case-insensitive (APPROVED, approved, Approved…)
    const normalizedStatus = status.toString().trim().toUpperCase();

    let finalStatus = null;
    if (normalizedStatus === "APPROVED") {
      finalStatus = PROPERTY_STATUS.APPROVED;
    } else if (normalizedStatus === "REJECTED") {
      finalStatus = PROPERTY_STATUS.REJECTED;
    } else if (normalizedStatus === "PUBLISHED") {
      finalStatus = PROPERTY_STATUS.PUBLISHED;
    } else if (normalizedStatus === "SOLD") {
      finalStatus = PROPERTY_STATUS.SOLD;
    }

    // If status not one of the allowed
    if (!finalStatus) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message:
            "Invalid status. Must be one of APPROVED, REJECTED, PUBLISHED or SOLD",
        },
        data: null,
      });
    }

    // populate owner + owner.user for clean owner info
    const property = await Property.findById(req.params.id).populate({
      path: "owner",
      populate: {
        path: "user",
        model: "User",
        select: "firstName lastName name email phone verified role",
      },
    });

    if (!property) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: {
          message: "Property not found",
        },
        data: null,
      });
    }

    const currentStatus = property.status; // "pending" | "approved" | "rejected" | "published" | "sold"

    // If same status, no-op (still return clean formatted response)
    if (currentStatus === finalStatus) {
      return res.status(200).json({
        statusCode: 200,
        success: true,
        error: null,
        data: {
          message: `Property is already ${finalStatus
            .toString()
            .toLowerCase()}`,
          property: formatPropertyForAdmin(property),
        },
      });
    }

    // ---------- STATUS TRANSITION RULES ----------

    // APPROVED: only from PENDING or REJECTED
    if (finalStatus === PROPERTY_STATUS.APPROVED) {
      if (
        ![PROPERTY_STATUS.PENDING, PROPERTY_STATUS.REJECTED].includes(
          currentStatus
        )
      ) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: {
            message: "Only pending or rejected properties can be approved",
          },
          data: null,
        });
      }
    }

    // PUBLISHED: only from APPROVED
    if (finalStatus === PROPERTY_STATUS.PUBLISHED) {
      if (currentStatus !== PROPERTY_STATUS.APPROVED) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: {
            message: "Only approved properties can be published",
          },
          data: null,
        });
      }
    }

    // SOLD: only from PUBLISHED
    if (finalStatus === PROPERTY_STATUS.SOLD) {
      if (currentStatus !== PROPERTY_STATUS.PUBLISHED) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: {
            message: "Only published properties can be marked as sold",
          },
          data: null,
        });
      }
    }

    // REJECTED: allowed from any status (no extra rule)

    // ---------- APPLY STATUS CHANGE ----------
    // To avoid validation errors from old documents, you can either:
    // A) do direct update (no full validation), or
    // B) save with validation if your data is clean.
    // I'll keep simple `save()` – if you want the no-validation version, I can switch to updateOne.
    property.status = finalStatus;
    await property.save();

    const formatted = formatPropertyForAdmin(property);

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: `Property ${finalStatus
          .toString()
          .toLowerCase()} successfully`,
        property: formatted,
      },
    });
  } catch (error) {
    console.error("Review property error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Publish property / update status (kept same as your logic)
const updatePropertyStatus = async (req, res) => {
  try {
    let { status } = req.body;

    if (!status) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Status is required" },
        data: null,
      });
    }

    // Case-insensitive: PUBLISHED / published / Published…
    const normalizedStatus = status.toString().trim().toUpperCase();

    let finalStatus = null;
    if (normalizedStatus === "PUBLISHED") {
      finalStatus = PROPERTY_STATUS.PUBLISHED;
    } else if (normalizedStatus === "SOLD") {
      finalStatus = PROPERTY_STATUS.SOLD;
    } else if (normalizedStatus === "REJECTED") {
      finalStatus = PROPERTY_STATUS.REJECTED;
    }

    // Allow only valid statuses
    if (!finalStatus) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Invalid status update" },
        data: null,
      });
    }

    const property = await Property.findById(req.params.id);
    if (!property) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Property not found" },
        data: null,
      });
    }

    // Prevent redundant updates
    if (property.status === finalStatus) {
      return res.status(200).json({
        statusCode: 200,
        success: true,
        error: null,
        data: {
          message: `Property is already marked as ${finalStatus
            .toString()
            .toLowerCase()}`,
          property,
        },
      });
    }

    // Status transition rules
    if (
      finalStatus === PROPERTY_STATUS.PUBLISHED &&
      property.status !== PROPERTY_STATUS.APPROVED
    ) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Only approved properties can be published" },
        data: null,
      });
    }

    if (
      finalStatus === PROPERTY_STATUS.SOLD &&
      property.status !== PROPERTY_STATUS.PUBLISHED
    ) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Only published properties can be marked as sold" },
        data: null,
      });
    }

    // REJECTED is always allowed, no condition needed
    property.status = finalStatus;
    await property.save();

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: `Property marked as ${finalStatus
          .toString()
          .toLowerCase()} successfully`,
        property,
      },
    });
  } catch (error) {
    console.error("Update property status error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Internal server error", details: error.message },
      data: null,
    });
  }
};

// Manage site visit requests
const manageSiteVisit = async (req, res) => {
  let { status } = req.body;

  try {
    if (!status) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Status is required",
        },
        data: null,
      });
    }

    // Case-insensitive for booking status
    const normalizedStatus = status.toString().trim().toUpperCase();

    let finalStatus = null;
    if (normalizedStatus === "APPROVED") {
      finalStatus = BOOKING_STATUS.APPROVED;
    } else if (normalizedStatus === "REJECTED") {
      finalStatus = BOOKING_STATUS.REJECTED;
    }

    if (!finalStatus) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: {
          message: "Invalid status. Must be either APPROVED or REJECTED",
        },
        data: null,
      });
    }

    const booking = await Booking.findById(req.params.id)
      .populate("user")
      .populate("property");

    if (!booking) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: {
          message: "Booking not found",
        },
        data: null,
      });
    }

    booking.status = finalStatus;
    await booking.save();

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: `Site visit ${finalStatus
          .toString()
          .toLowerCase()} successfully`,
        booking: {
          id: booking._id,
          user: booking.user,
          property: booking.property,
          visitDate: booking.visitDate,
          status: booking.status,
          message: booking.message,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("Manage site visit error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("-password");

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Users retrieved successfully",
        users: users.map((user) => ({
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.verified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
        totalUsers: users.length,
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get all properties for admin
const getAllPropertiesForAdmin = async (req, res) => {
  try {
    const {
      title,
      propertyId,
      customerEmail,
      customerName,
      customerPhone,
      status,
      propertyType,
      minRent,
      maxRent,
      bedrooms,
      bathrooms,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Cap at 100
    const skip = (pageNum - 1) * limitNum;

    // Validate sort parameters
    const allowedSortFields = ["createdAt", "updatedAt", "rent", "title"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    // Build property filters
    let propertyFilters = {};

    if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
      propertyFilters._id = propertyId;
    }
    if (status && Object.values(PROPERTY_STATUS).includes(status)) {
      propertyFilters.status = status;
    }
    if (propertyType) {
      propertyFilters.propertyType = new RegExp(propertyType, "i");
    }
    if (title) {
      propertyFilters.title = new RegExp(title, "i");
    }
    if (minRent || maxRent) {
      propertyFilters.rent = {};
      if (minRent && !isNaN(minRent)) {
        propertyFilters.rent.$gte = parseInt(minRent);
      }
      if (maxRent && !isNaN(maxRent)) {
        propertyFilters.rent.$lte = parseInt(maxRent);
      }
    }
    if (bedrooms && !isNaN(bedrooms)) {
      propertyFilters.bedrooms = parseInt(bedrooms);
    }
    if (bathrooms && !isNaN(bathrooms)) {
      propertyFilters.bathrooms = parseInt(bathrooms);
    }

    // Build user filters for aggregation
    let userMatchStage = {};
    if (customerEmail) {
      userMatchStage.email = new RegExp(customerEmail, "i");
    }
    if (customerPhone) {
      userMatchStage.phone = new RegExp(customerPhone, "i");
    }
    if (customerName) {
      userMatchStage.$or = [
        { "userData.firstName": new RegExp(customerName, "i") },
        { "userData.lastName": new RegExp(customerName, "i") },
        { "userData.name": new RegExp(customerName, "i") },
        {
          $expr: {
            $regexMatch: {
              input: {
                $concat: ["$userData.firstName", " ", "$userData.lastName"],
              },
              regex: customerName,
              options: "i",
            },
          },
        },
      ];
    }

    const hasUserFilters = customerEmail || customerPhone || customerName;

    let properties, totalCount;

    if (hasUserFilters) {
      // Aggregation pipeline when filtering by user data
      const pipeline = [
        { $match: propertyFilters },
        {
          $lookup: {
            from: "owners",
            localField: "owner",
            foreignField: "_id",
            as: "ownerData",
          },
        },
        { $unwind: { path: "$ownerData", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "users",
            localField: "ownerData.user",
            foreignField: "_id",
            as: "userData",
          },
        },
        { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
        ...(Object.keys(userMatchStage).length > 0
          ? [{ $match: userMatchStage }]
          : []),
        { $sort: { [sortField]: sortDirection } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "count" }],
          },
        },
      ];

      const result = await Property.aggregate(pipeline);
      properties = result[0].data;
      totalCount = result[0].totalCount[0]?.count || 0;

      properties = properties.map((prop) => ({
        ...prop,
        owner: prop.ownerData
          ? {
              ...prop.ownerData,
              user: prop.userData || null,
            }
          : null,
      }));
    } else {
      // Normal find when no user filters
      const countPromise = Property.countDocuments(propertyFilters);
      const propertiesPromise = Property.find(propertyFilters)
        .populate({
          path: "owner",
          populate: {
            path: "user",
            model: "User",
            select: "firstName lastName name email phone verified role",
          },
        })
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limitNum);

      [totalCount, properties] = await Promise.all([
        countPromise,
        propertiesPromise,
      ]);
    }

    // Status breakdown
    const statusBreakdownPipeline = [
      { $match: hasUserFilters ? {} : propertyFilters },
      ...(hasUserFilters
        ? [
            {
              $lookup: {
                from: "owners",
                localField: "owner",
                foreignField: "_id",
                as: "ownerData",
              },
            },
            {
              $unwind: { path: "$ownerData", preserveNullAndEmptyArrays: true },
            },
            {
              $lookup: {
                from: "users",
                localField: "ownerData.user",
                foreignField: "_id",
                as: "userData",
              },
            },
            {
              $unwind: { path: "$userData", preserveNullAndEmptyArrays: true },
            },
            ...(Object.keys(userMatchStage).length > 0
              ? [{ $match: userMatchStage }]
              : []),
          ]
        : []),
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ];

    const statusBreakdownResult = await Property.aggregate(
      statusBreakdownPipeline
    );
    const statusBreakdown = statusBreakdownResult.reduce(
      (acc, item) => {
        acc[item._id] = item.count;
        return acc;
      },
      {
        [PROPERTY_STATUS.PENDING]: 0,
        [PROPERTY_STATUS.APPROVED]: 0,
        [PROPERTY_STATUS.PUBLISHED]: 0,
        [PROPERTY_STATUS.REJECTED]: 0,
        [PROPERTY_STATUS.SOLD]: 0,
      }
    );

    // Format response
    const formattedProperties = properties.map((property) => ({
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

      // admin-entered owner contact (for admin-created properties)
      ownerName: property.ownerName || null,
      ownerEmail: property.ownerEmail || null,
      ownerPhone: property.ownerPhone || null,

      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      owner:
        property.owner && property.owner.user
          ? {
              id: property.owner.user._id,
              firstName: property.owner.user.firstName,
              lastName: property.owner.user.lastName,
              name: property.owner.user.name,
              email: property.owner.user.email,
              phone: property.owner.user.phone,
              verified: property.owner.user.verified,
              role: property.owner.user.role,
            }
          : null,
    }));

    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Properties retrieved successfully",
        properties: formattedProperties,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalProperties: totalCount,
          propertiesPerPage: limitNum,
          hasNextPage,
          hasPrevPage,
        },
        filters: {
          propertyId: propertyId || null,
          customerEmail: customerEmail || null,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          status: status || null,
          propertyType: propertyType || null,
          rentRange: { min: minRent || null, max: maxRent || null },
          bedrooms: bedrooms || null,
          bathrooms: bathrooms || null,
        },
        sorting: {
          sortBy: sortField,
          sortOrder: sortOrder,
        },
        statusBreakdown,
      },
    });
  } catch (error) {
    console.error("Get all properties for admin error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

// Get all bookings for admin
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate("user")
      .populate("property")
      .sort({ createdAt: -1 });

    res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        message: "Bookings retrieved successfully",
        bookings: bookings.map((booking) => ({
          id: booking._id,
          user: {
            id: booking.user._id,
            name: booking.user.name,
            email: booking.user.email,
          },
          property: {
            id: booking.property._id,
            title: booking.property.title,
            location: booking.property.location,
            rent: booking.property.rent,
          },
          visitDate: booking.visitDate,
          status: booking.status,
          message: booking.message,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        })),
        totalBookings: bookings.length,
        statusBreakdown: {
          pending: bookings.filter((b) => b.status === BOOKING_STATUS.PENDING)
            .length,
          approved: bookings.filter((b) => b.status === BOOKING_STATUS.APPROVED)
            .length,
          rejected: bookings.filter((b) => b.status === BOOKING_STATUS.REJECTED)
            .length,
          completed: bookings.filter(
            (b) => b.status === BOOKING_STATUS.COMPLETED
          ).length,
        },
      },
    });
  } catch (error) {
    console.error("Get all bookings error:", error);
    res.status(500).json({
      statusCode: 500,
      success: false,
      error: {
        message: "Internal server error",
        details: error.message,
      },
      data: null,
    });
  }
};

module.exports = {
  reviewProperty,
  updatePropertyStatus,
  manageSiteVisit,
  getAllUsers,
  getAllPropertiesForAdmin,
  getAllBookings,
};
