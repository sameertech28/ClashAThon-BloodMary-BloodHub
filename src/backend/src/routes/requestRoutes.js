const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { createRequest, getHospitalDashboard, getHospitalRequests, markDonationComplete, fulfillRequest } = require("../controllers/requestController");
const { respondToRequest, getRequestsForDonor, getDonationHistory } = require("../controllers/donorController");

// Request related routes
router.post("/create-request", authenticateToken, createRequest);
router.get("/requests/hospital", authenticateToken, getHospitalRequests);
router.get("/hospital-dashboard/:requestId", authenticateToken, getHospitalDashboard);
router.patch("/complete-donation/:responseId", authenticateToken, markDonationComplete);
router.patch("/requests/:requestId/fulfill", authenticateToken, fulfillRequest);

// Donor response related routes
router.post("/respond", authenticateToken, respondToRequest);
router.get("/requests/donor", authenticateToken, getRequestsForDonor);
router.get("/donation-history", authenticateToken, getDonationHistory);

module.exports = router;
