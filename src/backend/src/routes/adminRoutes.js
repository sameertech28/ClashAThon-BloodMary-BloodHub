const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const {
    adminLogin,
    getStats,
    getDonors, approveDonor, rejectDonor,
    getHospitals, approveHospital, rejectHospital,
    getMessages, markMessageRead, deleteMessage,
    submitContactMessage,
    getDonorProfile, getHospitalProfile
} = require("../controllers/adminController");

// Admin auth check middleware
const isAdmin = (req, res, next) => {
    if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
};

// Public routes
router.post("/admin/login", adminLogin);
router.post("/contact-message", submitContactMessage);

// Profile routes (for logged-in donors/hospitals)
router.get("/profile/donor", authenticateToken, getDonorProfile);
router.get("/profile/hospital", authenticateToken, getHospitalProfile);

// Admin-only routes
router.get("/admin/stats", authenticateToken, isAdmin, getStats);
router.get("/admin/donors", authenticateToken, isAdmin, getDonors);
router.patch("/admin/donors/:id/approve", authenticateToken, isAdmin, approveDonor);
router.patch("/admin/donors/:id/reject", authenticateToken, isAdmin, rejectDonor);
router.get("/admin/hospitals", authenticateToken, isAdmin, getHospitals);
router.patch("/admin/hospitals/:id/approve", authenticateToken, isAdmin, approveHospital);
router.patch("/admin/hospitals/:id/reject", authenticateToken, isAdmin, rejectHospital);
router.get("/admin/messages", authenticateToken, isAdmin, getMessages);
router.patch("/admin/messages/:id/read", authenticateToken, isAdmin, markMessageRead);
router.delete("/admin/messages/:id", authenticateToken, isAdmin, deleteMessage);

module.exports = router;
