// backend/routes/userSubscriptionRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ctrl = require("../controllers/userSubscriptionController");

// Create a user subscription manually
router.post("/", auth, ctrl.create);

// Get all user subscriptions
router.get("/", auth, ctrl.list);

// Get user subscription by ID
router.get("/:id", auth, ctrl.get);

// Get active subscription(s) for a user
router.get("/active/:userId", auth, ctrl.getActiveForUser);

// Subscribe a user to a plan
router.post("/subscribe", auth, ctrl.subscribe);

// Use one view slot for a subscription
router.post("/:id/use-view", auth, ctrl.useView);

// Update user subscription details
router.put("/:id", auth, ctrl.update);

// Upgrade user subscription plan
router.put("/:id/upgrade", auth, ctrl.upgradeSubscription);

// End a user's subscription
router.put("/:id/end", auth, ctrl.endSubscription);

// Delete a user subscription
router.delete("/:id", auth, ctrl.remove);

module.exports = router;
