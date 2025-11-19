const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const propCtrl = require("../controllers/propertyController");

// post property (owner + admin)
router.post("/", auth, propCtrl.create);

// others you can add later
module.exports = router;
