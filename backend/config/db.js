const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

// Validate
if (!MONGO_URI || MONGO_URI.trim() === "") {
  console.error("❌ MongoDB connection string is required");
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log("✅ MongoDB Connected Successfully");
    console.log(`📊 Database: ${mongoose.connection.name}`);
    
    // Connection event listeners
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB error:', err);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    
    // Helpful error messages
    if (err.message.includes('ENOTFOUND')) {
      console.error("HINT: Check your MongoDB URI hostname");
    } else if (err.message.includes('authentication failed')) {
      console.error("HINT: Check username/password");
    } else if (err.message.includes('IP')) {
      console.error("HINT: Check IP whitelist in MongoDB Atlas");
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;