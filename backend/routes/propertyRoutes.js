// routes/propertyRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");
const propCtrl = require("../controllers/propertyController");

// REMOVED: router.get("/user/properties", ...)
// This is now in userRoutes.js to get /api/user/properties path

// Existing routes with restrictions
router.post("/", auth, propCtrl.create); // owner/admin protected
router.get("/", auth, checkSubscription, propCtrl.list); // listing with masks
router.get("/:id", auth, checkSubscription, propCtrl.get); // details with tier access

module.exports = router;
