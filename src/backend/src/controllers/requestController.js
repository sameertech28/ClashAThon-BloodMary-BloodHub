const pool = require("../config/db");
const nodemailer = require("nodemailer");

const createRequest = async (req, res) => {
    if (req.user.role !== "hospital")
        return res
            .status(403)
            .json({ error: "Only hospitals can create requests" });

    const {
        blood_type,
        quantity,
        urgency,
        city,
        patient_details,
    } = req.body;
    const hospital_id = req.user.id;

    console.log("request body", req.body);

    if (!blood_type || !city)
        return res.status(400).json({ error: "Blood type and city required" });

    try {
        // Normalize quantity
        let normalizedQuantity = quantity;
        if (typeof normalizedQuantity === "string") {
            const match = normalizedQuantity.match(/\d+/);
            normalizedQuantity = match ? parseInt(match[0], 10) : 1;
        }

        // Normalize urgency to match DB ENUM ('Normal', 'Urgent', 'Critical')
        let normalizedUrgency = "Normal";
        const u = urgency.toLowerCase();
        if (u === "critical") normalizedUrgency = "Critical";
        else if (u === "high" || u === "urgent") normalizedUrgency = "Urgent";
        else if (u === "medium" || u === "normal" || u === "low") normalizedUrgency = "Normal";

        // Cap patient_details length
        let safeDetails = patient_details == null ? null : String(patient_details);
        if (safeDetails && safeDetails.length > 255) {
            safeDetails = safeDetails.slice(0, 255);
        }

        const [result] = await pool.query(
            "INSERT INTO requests (hospital_id, blood_type, quantity, urgency, city, patient_details) VALUES (?, ?, ?, ?, ?, ?)",
            [
                hospital_id,
                blood_type,
                normalizedQuantity,
                normalizedUrgency,
                city,
                safeDetails,
            ],
        );

        const requestId = result.insertId;

        // Find matching donors
        const [donors] = await pool.query(
            "SELECT email, name FROM donors WHERE blood_type = ? AND city = ? AND available = TRUE",
            [blood_type, city],
        );

        // Send emails
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        for (const donor of donors) {
            try {
                await transporter.sendMail({
                    from: `"BLOODHUB" <${process.env.EMAIL_USER}>`,
                    to: donor.email,
                    subject: `URGENT Blood Request: ${blood_type} in ${city}`,
                    text: `Hello ${donor.name},\n\nA hospital in ${city} urgently needs ${blood_type} blood.\nDetails: ${patient_details || "Emergency case"}\n\nRespond here: http://localhost:5500/respond.html?requestId=${requestId}\n\nThank you for being a lifesaver!`,
                });
            } catch (emailErr) {
                console.error("Email failed to", donor.email, emailErr);
            }
        }

        res.status(201).json({
            message: "Request created & alerts sent",
            requestId,
            matchedDonors: donors.length,
        });
    } catch (err) {
        console.error("Create request error:", err);
        res.status(500).json({ error: err.message || "Failed to create request" });
    }
};

const getHospitalDashboard = async (req, res) => {
    if (req.user.role !== "hospital") {
        return res.status(403).json({ error: "Only hospitals can view dashboard" });
    }

    const requestId = req.params.requestId;

    try {
        const [responses] = await pool.query(
            `SELECT d.name, d.phone, d.blood_type, r.status, r.estimated_arrival, r.message, r.responded_at
       FROM responses r
       JOIN donors d ON r.donor_id = d.id
       WHERE r.request_id = ?
       ORDER BY r.responded_at DESC`,
            [requestId],
        );

        const [requestInfo] = await pool.query(
            `SELECT r.blood_type, r.city, r.urgency, r.patient_details, h.name AS hospital_name
       FROM requests r
       JOIN hospitals h ON r.hospital_id = h.id
       WHERE r.id = ?`,
            [requestId],
        );

        res.json({
            request: requestInfo[0] || null,
            responses: responses,
        });
    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
};

const getHospitalRequests = async (req, res) => {
    if (req.user.role !== "hospital") return res.status(403).json({ error: "Access denied" });
    try {
        const [requests] = await pool.query(
            "SELECT * FROM requests WHERE hospital_id = ? ORDER BY id DESC",
            [req.user.id]
        );
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch requests" });
    }
};

module.exports = { createRequest, getHospitalDashboard, getHospitalRequests };
