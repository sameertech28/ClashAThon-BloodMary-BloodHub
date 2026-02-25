const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { createRequest, getHospitalDashboard, getHospitalRequests } = require("../controllers/requestController");
const { respondToRequest, getRequestsForDonor } = require("../controllers/donorController");

// Request related routes
router.post("/create-request", authenticateToken, createRequest);
router.get("/requests/hospital", authenticateToken, getHospitalRequests);
router.get("/hospital-dashboard/:requestId", authenticateToken, getHospitalDashboard);

// Donor response related routes
router.post("/respond", authenticateToken, respondToRequest);
router.get("/requests/donor", authenticateToken, getRequestsForDonor);

module.exports = router;
