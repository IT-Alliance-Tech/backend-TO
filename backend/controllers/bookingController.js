// controllers/bookingController.js
const Booking = require("../models/Booking");
const UserSubscription = require("../models/UserSubscription");
const { ROLES, BOOKING_STATUS } = require("../utils/constants");

/**
 * Create a booking (User only).
 * Requirement: user must have an active subscription in UserSubscription
 * If not subscribed -> respond with message: " please subscribe the plan"
 */
exports.createBooking = async (req, res) => {
  try {
    // 1) role check
    if (!req.user || req.user.role !== ROLES.USER) {
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: "Only users can book properties" },
        data: null,
      });
    }

    // 2) validate input
    const { property, date, timeSlot } = req.body;
    if (!property || !date || !timeSlot) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        error: { message: "Property, date, and timeSlot are required" },
        data: null,
      });
    }

    // 3) check active subscription
    const now = new Date();
    const activeSub = await UserSubscription.findOne({
      userId: req.user._id,
      active: true, // ensure flag exists in your schema
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).exec();

    if (!activeSub) {
      // exact message requested by you
      return res.status(403).json({
        statusCode: 403,
        success: false,
        error: { message: " please subscribe the plan" },
        data: null,
      });
    }

    // 4) create booking
    const booking = new Booking({
      user: req.user._id,
      property,
      date,
      timeSlot,
      status: BOOKING_STATUS.PENDING, // keep default behavior (or set APPROVED if you want auto-approve)
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
};
