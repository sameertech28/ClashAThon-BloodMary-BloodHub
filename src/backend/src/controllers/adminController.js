const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────
const adminLogin = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: "Email and password required" });

    try {
        const [rows] = await pool.query("SELECT * FROM admins WHERE email = ?", [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: "Invalid admin credentials" });
        }

        const admin = rows[0];
        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) {
            return res.status(401).json({ error: "Invalid admin credentials" });
        }

        const token = jwt.sign(
            { id: admin.id, role: "admin", email: admin.email },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            token,
            role: "admin",
            user: { id: admin.id, name: admin.name, email: admin.email }
        });
    } catch (err) {
        console.error("Admin login error:", err);
        res.status(500).json({ error: "Admin login failed" });
    }
};

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────
const getStats = async (req, res) => {
    try {
        const [[{ totalDonors }]] = await pool.query("SELECT COUNT(*) as totalDonors FROM donors");
        const [[{ pendingDonors }]] = await pool.query("SELECT COUNT(*) as pendingDonors FROM donors WHERE approved = FALSE");
        const [[{ totalHospitals }]] = await pool.query("SELECT COUNT(*) as totalHospitals FROM hospitals");
        const [[{ pendingHospitals }]] = await pool.query("SELECT COUNT(*) as pendingHospitals FROM hospitals WHERE approved = FALSE");
        const [[{ unreadMessages }]] = await pool.query("SELECT COUNT(*) as unreadMessages FROM contact_messages WHERE is_read = FALSE");
        const [[{ totalMessages }]] = await pool.query("SELECT COUNT(*) as totalMessages FROM contact_messages");

        res.json({
            totalDonors, pendingDonors,
            totalHospitals, pendingHospitals,
            unreadMessages, totalMessages
        });
    } catch (err) {
        console.error("Stats error:", err);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
};

// ─── DONOR MANAGEMENT ─────────────────────────────────────────────────────
const getDonors = async (req, res) => {
    try {
        const [donors] = await pool.query(
            "SELECT id, name, email, phone, age, blood_type, city, approved, available FROM donors ORDER BY id DESC"
        );
        res.json(donors);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch donors" });
    }
};

const approveDonor = async (req, res) => {
    try {
        const [result] = await pool.query("UPDATE donors SET approved = TRUE WHERE id = ?", [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Donor not found" });
        res.json({ message: "Donor approved successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to approve donor" });
    }
};

const rejectDonor = async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM donors WHERE id = ?", [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Donor not found" });
        res.json({ message: "Donor rejected and removed" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to reject donor" });
    }
};

// ─── HOSPITAL MANAGEMENT ──────────────────────────────────────────────────
const getHospitals = async (req, res) => {
    try {
        const [hospitals] = await pool.query(
            "SELECT id, name, email, phone, city, address, license_number, approved, verified FROM hospitals ORDER BY id DESC"
        );
        res.json(hospitals);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch hospitals" });
    }
};

const approveHospital = async (req, res) => {
    try {
        const [result] = await pool.query("UPDATE hospitals SET approved = TRUE, verified = TRUE WHERE id = ?", [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Hospital not found" });
        res.json({ message: "Hospital approved successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to approve hospital" });
    }
};

const rejectHospital = async (req, res) => {
    try {
        const [result] = await pool.query("DELETE FROM hospitals WHERE id = ?", [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: "Hospital not found" });
        res.json({ message: "Hospital rejected and removed" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to reject hospital" });
    }
};

// ─── CONTACT MESSAGES ─────────────────────────────────────────────────────
const getMessages = async (req, res) => {
    try {
        const [messages] = await pool.query(
            "SELECT * FROM contact_messages ORDER BY created_at DESC"
        );
        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
};

const markMessageRead = async (req, res) => {
    try {
        await pool.query("UPDATE contact_messages SET is_read = TRUE WHERE id = ?", [req.params.id]);
        res.json({ message: "Marked as read" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update message" });
    }
};

const deleteMessage = async (req, res) => {
    try {
        await pool.query("DELETE FROM contact_messages WHERE id = ?", [req.params.id]);
        res.json({ message: "Message deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete message" });
    }
};

// ─── CONTACT FORM SUBMISSION (public, no auth) ───────────────────────────
const submitContactMessage = async (req, res) => {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "Name, email, subject and message are required" });
    }

    try {
        await pool.query(
            "INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)",
            [name, email, phone || null, subject, message]
        );
        res.status(201).json({ message: "Message sent successfully! We'll respond within 24 hours." });
    } catch (err) {
        console.error("Contact message error:", err);
        res.status(500).json({ error: "Failed to send message. Please try again." });
    }
};

// ─── GET PROFILE (for donors/hospitals after login) ──────────────────────
const getDonorProfile = async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, name, email, phone, age, blood_type, city, available, approved, health_declaration FROM donors WHERE id = ?",
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: "Donor not found" });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
};

const getHospitalProfile = async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, name, email, phone, city, address, license_number, verified, approved FROM hospitals WHERE id = ?",
            [req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: "Hospital not found" });
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
};

module.exports = {
    adminLogin,
    getStats,
    getDonors, approveDonor, rejectDonor,
    getHospitals, approveHospital, rejectHospital,
    getMessages, markMessageRead, deleteMessage,
    submitContactMessage,
    getDonorProfile, getHospitalProfile
};
