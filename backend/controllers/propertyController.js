// backend/controllers/propertyController.js
const Property = require("../models/Property");
const User = require("../models/User");

/* Create a property — admin must provide ownerName, owner uses token identity */
exports.create = async (req, res) => {
  try {
    const actor = req.user || {};
    const role = actor.role || "owner";
    const payload = req.body || {};

    // Admin must provide ownerName
    let ownerId = null;
    if (role === "admin") {
      if (!payload.ownerName) {
        return res
          .status(400)
          .json({ error: "ownerName is required when admin posts property" });
      }
      const owner = await User.findOne({ name: payload.ownerName }).lean();
      if (!owner) {
        return res.status(404).json({ error: "Owner name not found" });
      }
      ownerId = owner._id;
    } else {
      // Owner uses their ID from token
      ownerId = actor._id;
    }

    const propertyData = {
      ...payload,
      owner: ownerId,
    };

    delete propertyData.ownerName;

    const property = new Property(propertyData);
    await property.save();

    return res.status(201).json({
      success: true,
      property,
    });
  } catch (err) {
    console.error("create property error:", err);
    return res.status(500).json({ error: err.message });
  }
};
