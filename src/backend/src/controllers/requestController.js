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

        // Normalize urgency to match DB ENUM ('Low', 'Medium', 'High', 'Critical')
        let normalizedUrgency = "Medium";
        const u = (urgency || "").toLowerCase();
        if (u === "critical") normalizedUrgency = "Critical";
        else if (u === "high" || u === "urgent") normalizedUrgency = "High";
        else if (u === "medium" || u === "normal") normalizedUrgency = "Medium";
        else if (u === "low") normalizedUrgency = "Low";

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

        // Find matching donors and hospital info
        console.log(`Searching for donors and hospital info: blood_type=${blood_type}, city=${city}`);

        const [[hospital]] = await pool.query("SELECT name FROM hospitals WHERE id = ?", [hospital_id]);
        const hospitalName = hospital ? hospital.name : "A hospital";

        const [donors] = await pool.query(
            "SELECT email, name FROM donors WHERE blood_type = ? AND city = ? AND available = TRUE",
            [blood_type, city],
        );
        console.log(`Found ${donors.length} matching donors for ${hospitalName}.`);

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            const appUrl = "http://localhost:3000/donor.html"; // Should ideally be from env

            for (const donor of donors) {
                try {
                    console.log(`Sending professional HTML email to ${donor.email}...`);
                    await transporter.sendMail({
                        from: `"BLOODHUB Nepal" <${process.env.EMAIL_USER}>`,
                        to: donor.email,
                        subject: `🚨 URGENT: ${blood_type} Blood Needed at ${hospitalName}`,
                        html: `
                            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                                <div style="background-color: #e63946; padding: 20px; text-align: center;">
                                    <h1 style="color: white; margin: 0; font-size: 24px;">BLOODHUB NEPAL</h1>
                                </div>
                                <div style="padding: 30px; line-height: 1.6; color: #333;">
                                    <h2 style="color: #e63946; margin-top: 0;">Urgent Blood Request!</h2>
                                    <p>Hello <strong>${donor.name}</strong>,</p>
                                    <p>A life is in need. <strong>${hospitalName}</strong> in <strong>${city}</strong> has just created an emergency request for your blood type.</p>
                                    
                                    <div style="background-color: #f8f9fa; border-left: 4px solid #e63946; padding: 15px; margin: 20px 0;">
                                        <p style="margin: 5px 0;"><strong>Blood Type:</strong> ${blood_type}</p>
                                        <p style="margin: 5px 0;"><strong>Urgency:</strong> ${normalizedUrgency}</p>
                                        <p style="margin: 5px 0;"><strong>Location:</strong> ${city}</p>
                                        <p style="margin: 5px 0;"><strong>Details:</strong> ${safeDetails || "Immediate assistance required."}</p>
                                    </div>

                                    <p>Your contribution can save a life today. Please click the button below to view the request and mark your availability.</p>
                                    
                                    <div style="text-align: center; margin-top: 30px;">
                                        <a href="${appUrl}" style="background-color: #e63946; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">RESPOND NOW</a>
                                    </div>
                                </div>
                                <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                                    <p>This is an automated emergency alert from BLOODHUB Nepal.<br>Thank you for being a lifesaver.</p>
                                </div>
                            </div>
                        `,
                    });
                } catch (emailErr) {
                    console.error("Email failed to", donor.email, emailErr);
                }
            }
        }

        res.status(201).json({
            message: "Request created & alerts sent",
            requestId,
            matchedDonors: donors.length,
        });
    } catch (err) {
        console.error("Create request error - Details:", {
            hospital_id,
            blood_type,
            quantity: normalizedQuantity,
            urgency: normalizedUrgency,
            city,
            error: err.message,
            stack: err.stack
        });
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
            `SELECT r.id as responseId, d.name, d.phone, d.blood_type, r.status, r.estimated_arrival, r.message, r.responded_at
       FROM responses r
       JOIN donors d ON r.donor_id = d.id
       WHERE r.request_id = ?
       ORDER BY r.responded_at DESC`,
            [requestId],
        );

        const [requestInfo] = await pool.query(
            `SELECT r.blood_type as blood_type, r.city, r.urgency, r.patient_details as patient_details, h.name AS hospital_name
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
            "SELECT id, hospital_id, blood_type as bloodType, quantity, urgency, city, patient_details as patientCondition, status, created_at FROM requests WHERE hospital_id = ? ORDER BY id DESC",
            [req.user.id]
        );
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch requests" });
    }
};

const markDonationComplete = async (req, res) => {
    if (req.user.role !== "hospital") return res.status(403).json({ error: "Access denied" });

    const { responseId } = req.params;

    try {
        // Verify this response belongs to a request owned by this hospital
        const [rows] = await pool.query(
            `SELECT r.id FROM responses res 
             JOIN requests r ON res.request_id = r.id 
             WHERE res.id = ? AND r.hospital_id = ?`,
            [responseId, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Response not found or unauthorized" });
        }

        await pool.query(
            "UPDATE responses SET status = 'Completed' WHERE id = ?",
            [responseId]
        );

        res.json({ message: "Donation marked as completed" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update donation status" });
    }
};

const fulfillRequest = async (req, res) => {
    if (req.user.role !== "hospital") return res.status(403).json({ error: "Access denied" });

    const { requestId } = req.params;

    try {
        // Verify this request belongs to this hospital
        const [rows] = await pool.query(
            "SELECT id FROM requests WHERE id = ? AND hospital_id = ?",
            [requestId, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Request not found or unauthorized" });
        }

        // Mark the request as Fulfilled
        await pool.query(
            "UPDATE requests SET status = 'Fulfilled' WHERE id = ?",
            [requestId]
        );

        // Also mark all 'Coming'/'Pending' responses for this request as 'Completed'
        // so they appear in the donor's donation history
        await pool.query(
            "UPDATE responses SET status = 'Completed' WHERE request_id = ? AND status IN ('Coming', 'Pending')",
            [requestId]
        );

        res.json({ message: "Request marked as fulfilled" });
    } catch (err) {
        console.error("Fulfill request error:", err);
        res.status(500).json({ error: "Failed to fulfill request" });
    }
};

module.exports = { createRequest, getHospitalDashboard, getHospitalRequests, markDonationComplete, fulfillRequest };
