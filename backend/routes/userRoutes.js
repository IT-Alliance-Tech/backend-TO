const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const { userAuth } = require("../middlewares/roleCheck");
const userController = require("../controllers/userController");
const propertyController = require('../controllers/propertyController');


router.get("/properties", auth, propertyController.getUserProperties);

// PROTECTED ROUTES (Auth + User Role Required)
router.use(auth);
router.use(userAuth);

// Property routes
//router.get("/properties/:id", userController.getPropertyById);
router.get("/properties/:id", auth, propertyController.get);

// Wishlist routes
router.post("/wishlist", userController.addToWishlist);
router.get("/wishlist", userController.getUserWishlist);
router.delete("/wishlist", userController.removeFromWishlist);

// Booking routes
router.post("/bookings", userController.bookSiteVisit);
router.get("/bookings", userController.getUserBookings);

// Payment routes
router.post("/unlock-contact", userController.unlockOwnerContact);

module.exports = router;