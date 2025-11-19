// backend/swagger.js
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Tru-backend API",
    version: "1.0.0",
    description:
      "API docs for Tru-backend (auth, user, owner, admin, bookings, payments, subscriptions, etc.)",
  },
  servers: [
    { url: "http://localhost:5000", description: "Local development server" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      // add shared schemas here if you want (User, AuthRequest, etc.)
    },
  },
  security: [{ bearerAuth: [] }],
};

const options = {
  swaggerDefinition,
  apis: [
    "./routes/*.js",
    "./controllers/*.js",
    // adjust paths if swagger.js lives elsewhere (these are relative to the file that requires swagger.js)
  ],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = {
  swaggerUi,
  swaggerSpec,
};
