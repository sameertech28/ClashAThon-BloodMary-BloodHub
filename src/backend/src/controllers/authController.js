const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerDonor = async (req, res) => {
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
};

const registerHospital = async (req, res) => {
    const { name, license, email, phone, city, password, address } = req.body;

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
            .json({ message: "Hospital registered", id: result.insertId, city: result.city });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY")
            return res.status(409).json({ error: "Email already exists" });
        console.error("Register hospital error:", err);
        res
            .status(500)
            .json({ error: err.message || "Server error during registration" });
    }
};

const login = async (req, res) => {
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
        console.log("user", user.city);
        res.json({
            token,
            role,
            user: { id: user.id, name: user.name, email: user.email, city: user.city },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Login failed" });
    }
};

module.exports = { registerDonor, registerHospital, login };
