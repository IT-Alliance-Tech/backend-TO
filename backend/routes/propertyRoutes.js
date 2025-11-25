// routes/propertyRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");
const propCtrl = require("../controllers/propertyController");
const multer = require("multer");
const upload = multer();

// NEW LANDING PAGE ROUTES (must be defined BEFORE parameterized routes)
// These routes use auth middleware which already supports optional authentication
// Public access with tiered data based on login/subscription status

// GET /api/user/properties - Get all properties (landing page)
router.get("/user/properties", auth, propCtrl.getUserProperties);

// Existing routes with restrictions
router.post("/", auth, propCtrl.create); // owner/admin protected
router.get("/", auth, checkSubscription, propCtrl.list); // listing with masks

// GET /api/properties/owner/:userId - Get properties for specific user (CHANGED PATH)
router.get("/owner/:userId", auth, propCtrl.getSingleUserProperties);

router.get("/:id", auth, checkSubscription, propCtrl.get); // details with tier access
// Note: uploadImages function not included - add it to controller if needed
// router.post("/:id/images", auth, upload.array("files", 6), propCtrl.uploadImages);

module.exports = router;