// routes/userSubscriptions.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/userSubscriptionController");

// Health check endpoint
router.get("/_ping", (req, res) =>
  res.json({ ok: true, msg: "user-subscriptions router alive" })
);

// Subscribe a user to a plan
router.post("/subscribe", ctrl.subscribe);

// Get active subscription(s) for a user
router.get("/user/:userId/active", ctrl.getActiveForUser);

// Get active subscription(s) by userId (alternate)
router.get("/active/:userId", ctrl.getActiveForUser);

// Use one view slot
router.post("/:id/use-view", ctrl.useView);

// End an active subscription
router.put("/:id/end", ctrl.endSubscription);

// Upgrade to a higher subscription plan
router.put("/:id/upgrade", ctrl.upgradeSubscription);

// Create a new user subscription
router.post("/", ctrl.create);

// List all user subscriptions
router.get("/", ctrl.list);

// Get a user subscription by ID
router.get("/:id", ctrl.get);

// Update a user subscription
router.put("/:id", ctrl.update);

// Delete a user subscription
router.delete("/:id", ctrl.remove);

module.exports = router;
