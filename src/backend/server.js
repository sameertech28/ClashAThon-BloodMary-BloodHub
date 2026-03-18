require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./src/routes/authRoutes");
const requestRoutes = require("./src/routes/requestRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const adminRoutes = require("./src/routes/adminRoutes");

const app = express();

// Middleware
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(express.json());

// Handle Vercel /api prefix
app.use((req, res, next) => {
  if (req.url.startsWith("/api")) {
    req.url = req.url.replace("/api", "");
  }
  next();
});

// Routes
app.use("/", authRoutes);
app.use("/", requestRoutes);
app.use("/", chatRoutes);
app.use("/", adminRoutes);

// Diagnostic route
app.get("/test-db", async (req, res) => {
  const mysql = require("mysql2/promise");
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT || 10607,
      ssl: { rejectUnauthorized: false }
    });
    await conn.query("SELECT 1");
    await conn.end();
    res.json({ success: true, message: "Cloud Database Connected!" });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message,
      config: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        db: process.env.DB_NAME
      }
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("BLOODHUB Backend API - Modularized & Running");
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
