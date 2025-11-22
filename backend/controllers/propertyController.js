const Property = require("../models/Property");

// hide details for guest
function guestView(p) {
  return {
    _id: p._id,
    images: p.images || [],
    rent: p.rent,
    title: p.title,
    amenities: p.amenities || [],
    restricted: true, // UI hint
  };
}

// hide owner/location for logged-in without subscription
function loggedView(p) {
  return {
    _id: p._id,
    images: p.images || [],
    rent: p.rent,
    title: p.title,
    description: p.description,
    amenities: p.amenities || [],
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    propertyType: p.propertyType,
    location: null, // hide all location details for non-subscribed users
    owner: null, // hide owner for non-subscribed users
    restricted: true,
  };
}

// full data for subscribed user
function subscribedView(p) {
  return p;
}

exports.create = async (req, res) => {
  try {
    const actor = req.user || {};
    const role = (actor.role || "owner").toLowerCase();

    const payload = req.body || {};
    const propertyData = { ...payload, createdByRole: role };

    if (role === "owner") {
      propertyData.owner = actor._id;
      propertyData.ownerName = null;
    }

    if (role === "admin") {
      propertyData.owner = null;
      propertyData.ownerName = payload.ownerName || null;

      const dup = await Property.findOne({
        title: payload.title,
        rent: payload.rent,
        "location.address": payload?.location?.address || null,
        "location.city": payload?.location?.city || null,
        createdByRole: "admin",
      });

      if (dup)
        return res.status(400).json({
          error:
            "you cannot post same property, already property has listed by admin",
        });
    }

    const property = new Property(propertyData);
    await property.save();

    return res.status(201).json({ success: true, property });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.get = async (req, res) => {
  try {
    const id = req.params.id;
    let p = await Property.findById(id)
      .populate("owner", "name phone email")
      .lean();

    if (!p) return res.status(404).json({ error: "Not found" });

    if (!req.user) return res.json(guestView(p));
    if (req.user && !req.userSubscription) return res.json(loggedView(p));
    return res.json(subscribedView(p));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.list = async (req, res) => {
  try {
    const props = await Property.find({
      status: { $in: ["approved", "published"] },
    }).lean();

    const out = props.map((p) => {
      if (!req.user) return guestView(p);
      if (req.user && !req.userSubscription) return loggedView(p);
      return subscribedView(p);
    });

    return res.json({ success: true, data: out });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};