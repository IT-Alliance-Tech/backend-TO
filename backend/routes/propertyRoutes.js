const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");
const propCtrl = require("../controllers/propertyController");

router.get("/user/properties", auth, propCtrl.getUserProperties);
router.post("/", auth, propCtrl.create);
router.get("/", auth, checkSubscription, propCtrl.list);
router.get("/owner/:userId", auth, propCtrl.getSingleUserProperties);
router.get("/:id", auth, checkSubscription, propCtrl.get);
router.get("/:id", auth, checkSubscription, propCtrl.get);

module.exports = router;
