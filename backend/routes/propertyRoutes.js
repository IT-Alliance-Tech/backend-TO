const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");
const propCtrl = require("../controllers/propertyController");

router.post("/", auth, propCtrl.create); // owner/admin protected
router.get("/", auth, checkSubscription, propCtrl.list); // listing with masks
router.get("/:id", auth, checkSubscription, propCtrl.get); // details with tier access

module.exports = router;
