require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(cors({ origin: "*" }));
app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("MySQL Connected successfully to bloodhub");
    connection.release();
  } catch (err) {
    console.error("MySQL connection failed:", err);
    process.exit(1);
  }
})();

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid/expired token" });
    req.user = user;
    next();
  });
};

//register-donor
app.post("/register-donor", async (req, res) => {
  const {
    name,
    email,
    phone,
    age,
    blood_type,
    city,
    password,
    health_declaration,
  } = req.body;

  if (!name || !email || !password || !blood_type || !city) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO donors (name, email, phone, age, blood_type, city, password, health_declaration, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)",
      [
        name,
        email,
        phone || null,
        age || null,
        blood_type,
        city,
        hashedPassword,
        JSON.stringify(health_declaration || {}),
      ],
    );

    res.status(201).json({ message: "Donor registered", id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Email already exists" });
    console.error(err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

//register-hospital
app.post("/register-hospital", async (req, res) => {
  const { name, email, phone, city, password, address } = req.body;

  if (!name || !email || !password || !city) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO hospitals (name, email, phone, city, password, address, verified) VALUES (?, ?, ?, ?, ?, ?, TRUE)",
      [name, email, phone || null, city, hashedPassword, address || null],
    );
    res
      .status(201)
      .json({ message: "Hospital registered", id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

// login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  try {
    let user, role;

    // Check donors
    let [rows] = await pool.query("SELECT * FROM donors WHERE email = ?", [
      email,
    ]);
    if (rows.length > 0) {
      user = rows[0];
      role = "donor";
    } else {
      // Check hospitals
      [rows] = await pool.query("SELECT * FROM hospitals WHERE email = ?", [
        email,
      ]);
      if (rows.length > 0) {
        user = rows[0];
        role = "hospital";
      }
    }

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Shape user object sent to frontend so dashboards can use city/phone/etc.
    let safeUser;
    if (role === "donor") {
      safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        blood_type: user.blood_type,
        city: user.city,
        phone: user.phone,
        available: !!user.available,
      };
    } else if (role === "hospital") {
      safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        city: user.city,
        phone: user.phone,
      };
    } else {
      // Fallback (should not happen)
      safeUser = { id: user.id, name: user.name, email: user.email };
    }

    res.json({
      token,
      role,
      user: safeUser,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// create request (hospital only)
app.post("/create-request", authenticateToken, async (req, res) => {
  if (req.user.role !== "hospital")
    return res
      .status(403)
      .json({ error: "Only hospitals can create requests" });

  const {
    blood_type,
    quantity = 1,
    urgency = "Medium",
    city,
    patient_details,
  } = req.body;
  const hospital_id = req.user.id;

  if (!blood_type || !city)
    return res.status(400).json({ error: "Blood type and city required" });

  try {
    // Normalize quantity in case frontend sends values like "2 units"
    let normalizedQuantity = quantity;
    if (typeof normalizedQuantity === "string") {
      const match = normalizedQuantity.match(/\d+/);
      normalizedQuantity = match ? parseInt(match[0], 10) : 1;
    }

    const [result] = await pool.query(
      "INSERT INTO requests (hospital_id, blood_type, quantity, urgency, city, patient_details) VALUES (?, ?, ?, ?, ?, ?)",
      [
        hospital_id,
        blood_type,
        normalizedQuantity,
        urgency,
        city,
        patient_details || null,
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
    res
      .status(500)
      .json({ error: err.message || "Failed to create request" });
  }
});

app.get("/", (req, res) => {
  res.send("BLOODHUB Backend running - Database connected");
});

const PORT = process.env.PORT || 3300;

// POST /respond - Donor only
app.post("/respond", authenticateToken, async (req, res) => {
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
    // Optional: Check if request exists and is still Open
    const [requests] = await pool.query(
      'SELECT id FROM requests WHERE id = ? AND status = "Open"',
      [request_id],
    );
    if (requests.length === 0) {
      return res
        .status(404)
        .json({ error: "Request not found or already closed" });
    }

    // Insert response
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
});

// GET /hospital-dashboard/:requestId - Hospital only
app.get(
  "/hospital-dashboard/:requestId",
  authenticateToken,
  async (req, res) => {
    if (req.user.role !== "hospital") {
      return res
        .status(403)
        .json({ error: "Only hospitals can view dashboard" });
    }

    const requestId = req.params.requestId;

    try {
      const [responses] = await pool.query(
        `SELECT 
         d.name, 
         d.phone, 
         d.blood_type, 
         r.status, 
         r.estimated_arrival, 
         r.message,
         r.responded_at
       FROM responses r
       JOIN donors d ON r.donor_id = d.id
       WHERE r.request_id = ?
       ORDER BY r.responded_at DESC`,
        [requestId],
      );

      // Optional: also return request details
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
  },
);

// GET /requests/hospital - Hospital only
app.get("/requests/hospital", authenticateToken, async (req, res) => {
  if (req.user.role !== "hospital") return res.status(403).json({ error: "Only hospitals can view their requests" });
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
});

// GET /requests/donor - Donor only
app.get("/requests/donor", authenticateToken, async (req, res) => {
  if (req.user.role !== "donor") return res.status(403).json({ error: "Only donors can view matching requests" });
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
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
