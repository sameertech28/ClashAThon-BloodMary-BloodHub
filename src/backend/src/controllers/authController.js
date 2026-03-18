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
        console.error("Register Donor Error:", err);
        res.status(500).json({ error: err.message || "Server error during registration" });
    }
};

const registerHospital = async (req, res) => {
    console.log("REGISTER HOSPITAL - req.body:", req.body);
    const { name, email, phone, city, password, address } = req.body;
    const license = req.body.license || req.body.licence || req.body.license_number;

    if (!name || !email || !password || !city) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            "INSERT INTO hospitals (name, license_number, email, phone, city, password, address, verified) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)",
            [name, license || null, email, phone || null, city, hashedPassword, address || null],
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
    console.log("LOGIN ATTEMPT - req.body:", req.body);
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

        // Check if account is approved by admin
        if (user.approved === 0 || user.approved === false) {
            return res.status(403).json({ error: "Your account is pending admin approval. Please wait for the admin to verify your registration." });
        }

        const token = jwt.sign(
            { id: user.id, role, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "24h" },
        );
        console.log("user", user.city);

        // Return more profile data
        const userData = { id: user.id, name: user.name, email: user.email, city: user.city };
        if (role === "donor") {
            userData.phone = user.phone;
            userData.age = user.age;
            userData.blood_type = user.blood_type;
            userData.available = user.available;
        } else if (role === "hospital") {
            userData.phone = user.phone;
            userData.address = user.address;
            userData.license = user.license_number;
            userData.verified = user.verified;
        }

        res.json({
            token,
            role,
            user: userData,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Login failed" });
    }
};

module.exports = { registerDonor, registerHospital, login };
