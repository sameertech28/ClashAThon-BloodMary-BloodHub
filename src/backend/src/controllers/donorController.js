const pool = require("../config/db");

const respondToRequest = async (req, res) => {
    if (req.user.role !== "donor") {
        return res
            .status(403)
            .json({ error: "Only donors can respond to requests" });
    }

    const {
        request_id,
        status = "Coming",
        estimated_arrival,
        message,
    } = req.body;
    const donor_id = req.user.id;

    if (!request_id) {
        return res.status(400).json({ error: "request_id is required" });
    }

    try {
        const [requests] = await pool.query(
            'SELECT id FROM requests WHERE id = ? AND status = "Open"',
            [request_id],
        );
        if (requests.length === 0) {
            return res
                .status(404)
                .json({ error: "Request not found or already closed" });
        }

        await pool.query(
            "INSERT INTO responses (request_id, donor_id, status, estimated_arrival, message) VALUES (?, ?, ?, ?, ?)",
            [
                request_id,
                donor_id,
                status,
                estimated_arrival || null,
                message || null,
            ],
        );

        res.status(201).json({ message: "Response recorded successfully" });
    } catch (err) {
        console.error("Respond error:", err);
        if (err.code === "ER_DUP_ENTRY") {
            return res
                .status(409)
                .json({ error: "You have already responded to this request" });
        }
        res.status(500).json({ error: "Failed to record response" });
    }
};

const getRequestsForDonor = async (req, res) => {
    if (req.user.role !== "donor")
        return res.status(403).json({ error: "Only donors can view matching requests" });

    try {
        const [donorInfo] = await pool.query("SELECT blood_type, city FROM donors WHERE id = ?", [req.user.id]);
        if (donorInfo.length === 0) return res.status(404).json({ error: "Donor not found" });
        const { blood_type, city } = donorInfo[0];

        const [requests] = await pool.query(
            `SELECT r.*, h.name as hospitalName, r.patient_details as patientCondition 
       FROM requests r 
       JOIN hospitals h ON r.hospital_id = h.id 
       WHERE r.blood_type = ? AND r.city = ? 
       ORDER BY r.id DESC`,
            [blood_type, city]
        );

        const [responses] = await pool.query(
            "SELECT request_id FROM responses WHERE donor_id = ?",
            [req.user.id]
        );
        const respondedIds = responses.map(r => r.request_id);

        res.json({ requests, respondedIds });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch requests" });
    }
};

module.exports = { respondToRequest, getRequestsForDonor };
