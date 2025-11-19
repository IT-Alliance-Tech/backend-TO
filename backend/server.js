const path = require("path");

// Load env from backend/.env
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

console.log("DEBUG server.js -> MONGO_URI:", !!process.env.MONGO_URI);

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 3000;

// Connect to DB first before starting server
connectDB();

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// console.log(`Server running on port ${PORT}`);