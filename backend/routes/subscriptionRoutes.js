// backend/routes/subscriptionRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/subscriptionController");

// Create a subscription plan (admin)
router.post("/", ctrl.create);

// List subscription plans (public)
router.get("/", ctrl.list);

// Get a single subscription plan
router.get("/:id", ctrl.get);

// Update a subscription plan (admin)
router.put("/:id", ctrl.update);

// Delete a subscription plan (admin)
router.delete("/:id", ctrl.remove);

module.exports = router;
