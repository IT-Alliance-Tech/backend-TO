const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { adminAuth } = require('../middlewares/roleCheck');
const adminController = require('../controllers/adminController');

// Apply auth middleware to all admin routes
router.use(auth);
router.use(adminAuth);

// Property management
router.patch('/properties/:id/review', adminController.reviewProperty);
router.put('/properties/:id', adminController.updatePropertyStatus);

// Booking management
router.patch('/bookings/:id', adminController.manageSiteVisit);

// User management
router.get('/users', adminController.getAllUsers);

// Data views
router.get('/properties', adminController.getAllPropertiesForAdmin);
router.get('/bookings', adminController.getAllBookings);

module.exports = router;
// routes/adminRoutes.js