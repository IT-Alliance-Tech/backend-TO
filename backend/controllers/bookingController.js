// controllers/bookingController.js
const Booking = require("../models/Booking");
const UserSubscription = require("../models/UserSubscription");
const { ROLES, BOOKING_STATUS } = require("../utils/constants"); // optional; handle if present

async function createBooking(req, res) {
  try {
    if (!req.user || req.user.role !== ROLES?.USER) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Only users can book properties" },
        data: null,
      });
    }

    const { property, date, timeSlot } = req.body;
    if (!property || !date || !timeSlot) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Property, date, and timeSlot are required" },
        data: null,
      });
    }

    // check active subscription
    const now = new Date();
    const activeSub = await UserSubscription.findOne({
      userId: req.user._id,
      active: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).exec();

    if (!activeSub) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: " please subscribe the plan" },
        data: null,
      });
    }

    const booking = new Booking({
      user: req.user._id,
      property,
      date,
      timeSlot,
      status: BOOKING_STATUS?.PENDING ?? "PENDING",
      // subscription: activeSub._id, // optional
    });

    await booking.save();

    return res.status(201).json({
      statusCode: 201,
      success: true,
      error: null,
      data: booking,
    });
  } catch (err) {
    console.error("createBooking error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Get bookings (User sees own, Admin sees all)
 */
async function getBookings(req, res) {
  try {
    const filter = req.user?.role === ROLES?.USER ? { user: req.user._id } : {};
    const bookings = await Booking.find(filter)
      .populate("user", "name email")
      .populate("property", "title location");

    const totalBookings = await Booking.countDocuments(filter);

    const totalByStatusArr = await Booking.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const totalByStatus = totalByStatusArr.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: { totalBookings, totalByStatus, bookings },
    });
  } catch (err) {
    console.error("getBookings error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Update booking time (User can update their own booking)
 */
async function updateBookingTime(req, res) {
  try {
    const { id } = req.params;
    const { date, timeSlot } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Booking not found" },
        data: null,
      });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Not authorized to update this booking" },
        data: null,
      });
    }

    booking.date = date || booking.date;
    booking.timeSlot = timeSlot || booking.timeSlot;
    booking.status = BOOKING_STATUS?.PENDING ?? "PENDING";

    await booking.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: booking,
    });
  } catch (err) {
    console.error("updateBookingTime error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * User responds to time change request
 */
async function respondToTimeChange(req, res) {
  try {
    const { accept, newTimeSlot } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Booking not found" },
        data: null,
      });
    }

    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Not authorized to update this booking" },
        data: null,
      });
    }

    if (!booking.timeChangeRequest || !booking.timeChangeRequest.requested) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "No time change request pending for this booking" },
        data: null,
      });
    }

    if (accept) {
      if (
        !newTimeSlot ||
        !booking.timeChangeRequest.suggestedSlots.includes(newTimeSlot)
      ) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          error: {
            message: "Please select one of the suggested time slots",
            suggestedSlots: booking.timeChangeRequest.suggestedSlots,
          },
          data: null,
        });
      }

      booking.timeSlot = newTimeSlot;
      booking.status = BOOKING_STATUS?.APPROVED ?? "APPROVED";
    }

    booking.timeChangeRequest = {
      requested: false,
      reason: null,
      suggestedSlots: [],
      requestedAt: null,
    };

    await booking.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: booking,
    });
  } catch (err) {
    console.error("respondToTimeChange error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Get bookings with pending time change requests (for user)
 */
async function getPendingTimeChangeRequests(req, res) {
  try {
    const bookings = await Booking.find({
      user: req.user._id,
      "timeChangeRequest.requested": true,
    }).populate("property", "title location");

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: bookings,
    });
  } catch (err) {
    console.error("getPendingTimeChangeRequests error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Admin: update booking status
 */
async function updateBookingStatus(req, res) {
  try {
    if (req.user.role !== ROLES?.ADMIN) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Only admins can update booking status" },
        data: null,
      });
    }

    const { status } = req.body;
    const validStatuses = [
      BOOKING_STATUS?.APPROVED ?? "APPROVED",
      BOOKING_STATUS?.REJECTED ?? "REJECTED",
      BOOKING_STATUS?.COMPLETED ?? "COMPLETED",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Invalid booking status" },
        data: null,
      });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Booking not found" },
        data: null,
      });
    }

    booking.status = status;
    await booking.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: booking,
    });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Admin: get all bookings
 */
async function getAllBookings(req, res) {
  try {
    const bookings = await Booking.find()
      .populate("user", "name email role")
      .populate("property", "title location");

    const totalBookings = await Booking.countDocuments();

    const totalByStatusArr = await Booking.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const totalByStatus = totalByStatusArr.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: { totalBookings, totalByStatus, bookings },
    });
  } catch (err) {
    console.error("getAllBookings error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Admin analytics
 */
async function getBookingAnalytics(req, res) {
  try {
    const totalBookings = await Booking.countDocuments();

    const bookingsByStatusArr = await Booking.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const bookingsByStatus = bookingsByStatusArr.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const bookingsByUserRoleArr = await Booking.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: "$userDetails" },
      {
        $group: {
          _id: "$userDetails.role",
          count: { $sum: 1 },
        },
      },
    ]);

    const bookingsByUserRole = bookingsByUserRoleArr.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const topProperties = await Booking.aggregate([
      {
        $group: {
          _id: "$property",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "properties",
          localField: "_id",
          foreignField: "_id",
          as: "propertyDetails",
        },
      },
      { $unwind: "$propertyDetails" },
      {
        $project: {
          _id: 0,
          propertyId: "$_id",
          title: "$propertyDetails.title",
          bookingsCount: "$count",
        },
      },
    ]);

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: {
        totalBookings,
        bookingsByStatus,
        bookingsByUserRole,
        topProperties,
      },
    });
  } catch (err) {
    console.error("getBookingAnalytics error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

/**
 * Admin requests time change (asks user to pick from suggested slots)
 */
async function requestTimeChange(req, res) {
  try {
    if (req.user.role !== ROLES?.ADMIN) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Only admins can request time changes" },
        data: null,
      });
    }

    const { reason, suggestedSlots } = req.body;

    if (!Array.isArray(suggestedSlots) || suggestedSlots.length === 0) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Please provide at least one suggested time slot" },
        data: null,
      });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        error: { message: "Booking not found" },
        data: null,
      });
    }

    booking.timeChangeRequest = {
      requested: true,
      reason,
      suggestedSlots,
      requestedAt: new Date(),
    };

    await booking.save();

    return res.status(200).json({
      statusCode: 200,
      success: true,
      error: null,
      data: booking,
    });
  } catch (err) {
    console.error("requestTimeChange error:", err);
    return res.status(500).json({
      statusCode: 500,
      success: false,
      error: { message: "Server error" },
      data: null,
    });
  }
}

module.exports = {
  createBooking,
  getBookings,
  updateBookingTime,
  respondToTimeChange,
  getPendingTimeChangeRequests,
  updateBookingStatus,
  getAllBookings,
  getBookingAnalytics,
  requestTimeChange,
};
