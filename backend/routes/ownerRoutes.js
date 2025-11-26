// routes/ownerRoutes.js
const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const { ownerAuth } = require("../middlewares/roleCheck");
const ownerController = require("../controllers/ownerController");

// 🔐 Apply authentication to all owner routes (optional auth -> enforced by ownerAuth)
router.use(auth);

// 🔐 Allow only OWNER and ADMIN (based on updated ownerAuth in roleCheck.js)
router.use(ownerAuth);

/**
 * Owner profile routes
 * (optional, but matches your ownerController methods)
 */
router.get("/profile", ownerController.getProfile);
router.post("/profile", ownerController.createOrUpdateProfile);

/**
 * Property routes
 */
router.post("/properties", ownerController.uploadProperty); // create new property
router.get("/properties", ownerController.getOwnerProperties); // list properties of this owner/admin's selected owner
router.get("/properties/:id", ownerController.getProperty); // get single property
router.patch("/properties/:id", ownerController.updateProperty); // update property
router.delete("/properties/:id", ownerController.deleteProperty); // delete property

module.exports = router;
