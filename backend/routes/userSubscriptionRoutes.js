// backend/routes/userSubscriptionRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/userSubscriptionController");

// Health check
router.get("/_ping", (req, res) =>
  res.json({ ok: true, msg: "user-subscriptions router alive" })
);

// Subscribe user to plan
router.post("/subscribe", ctrl.subscribe);

// Get active subscriptions for a user
router.get("/active/:userId", ctrl.getActiveForUser);
router.get("/user/:userId/active", ctrl.getActiveForUser);

// Use a property view
router.post("/:id/use-view", ctrl.useView);

// Upgrade or end a subscription
router.put("/:id/upgrade", ctrl.upgradeSubscription);
router.put("/:id/end", ctrl.endSubscription);

// Core CRUD (list/get/create/update/delete)
router.post("/", ctrl.create);
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
