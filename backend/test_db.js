
const mongoose = require('mongoose');

(async () => {
  try {
    // load your config (adjust path if your config file is different)
    const cfg = require('./config/db');

    const uri = process.env.MONGO_URI || cfg.MONGO_URI || null;
    console.log('MONGO_URI used (env or cfg):', !!process.env.MONGO_URI ? process.env.MONGO_URI : uri);

    if (!uri) {
      console.error('No Mongo URI found in process.env.MONGO_URI or config/db.js');
      process.exit(1);
    }

    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Mongoose connected. dbName=', mongoose.connection.name, 'readyState=', mongoose.connection.readyState);

    const P = require('./models/Property');

    const total = await P.countDocuments({});
    const publicCount = await P.countDocuments({ status: { $in: ['approved', 'published'] } });
    console.log('COUNT all =', total, 'COUNT public (approved|published) =', publicCount);

    const sampleAny = await P.findOne({}).lean();
    const samplePublic = await P.findOne({ status: { $in: ['approved', 'published'] } }).lean();

    console.log('SAMPLE any:', sampleAny ? { id: String(sampleAny._id), status: sampleAny.status, title: sampleAny.title } : null);
    console.log('SAMPLE public:', samplePublic ? { id: String(samplePublic._id), status: samplePublic.status, title: samplePublic.title } : null);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    try { await mongoose.disconnect(); } catch(e) {}
    process.exit(1);
  }
})();
