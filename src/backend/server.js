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

// Routes
app.use("/", authRoutes);
app.use("/", requestRoutes);
app.use("/", chatRoutes);
app.use("/", adminRoutes);

// Health check
app.get("/", (req, res) => {
  res.send("BLOODHUB Backend API - Modularized & Running");
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
