// routes/bookingRoutes.js
const express = require("express");
const router = express.Router();

// REMOVED DEBUG LOGS - They're no longer needed
// console.log('LOADED ROUTE:', __filename);
// console.log('bookingController resolved path:', require.resolve('../controllers/bookingController'));
// console.log('bookingController keys:', Object.keys(bookingController));

const bookingController = require("../controllers/bookingController");
const auth = require("../middlewares/auth"); // JWT verification
const { userAuth, adminAuth } = require("../middlewares/roleCheck");

// Protect all booking routes with auth middleware
router.use(auth);

// ---------- USER ROUTES ----------
router.post("/", userAuth, bookingController.createBooking);
router.get("/", userAuth, bookingController.getBookings);
router.put("/:id/update-time", userAuth, bookingController.updateBookingTime);
router.put(
  "/:id/respond-time-change",
  userAuth,
  bookingController.respondToTimeChange
);
router.get(
  "/pending-time-changes",
  userAuth,
  bookingController.getPendingTimeChangeRequests
);

// ---------- ADMIN ROUTES ----------
router.put("/:id/status", adminAuth, bookingController.updateBookingStatus);
router.get("/all", adminAuth, bookingController.getAllBookings);
router.get("/analytics", adminAuth, bookingController.getBookingAnalytics);
router.put(
  "/:id/request-time-change",
  adminAuth,
  bookingController.requestTimeChange
);

module.exports = router;
