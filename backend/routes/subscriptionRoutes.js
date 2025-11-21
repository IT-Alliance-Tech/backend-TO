// backend/routes/subscriptionRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/subscriptionController");
const auth = require("../middlewares/auth"); // CHANGED: Correct path

// Create a subscription plan (admin)
router.post("/", ctrl.create);

// List subscription plans (public)
router.get("/", ctrl.list);

// CHANGED: Added route for per-user availability (MUST be above /:id route)
router.get("/plans/for-user", auth, ctrl.listForUser);

// Get a single subscription plan
router.get("/:id", ctrl.get);

// Update a subscription plan (admin)
router.put("/:id", ctrl.update);

// Delete a subscription plan (admin)
router.delete("/:id", ctrl.remove);

module.exports = router;
