const path = require("path");

// Load env from backend/.env
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const http = require("http");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

// Start server function
const startServer = async () => {
  try {
    // Step 1: Connect to Database FIRST
    await connectDB();

    // Step 2: Import app AFTER DB connection
    // This ensures routes are loaded after DB is ready
    const app = require("./app");

    // Step 3: Create and start server
    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();
