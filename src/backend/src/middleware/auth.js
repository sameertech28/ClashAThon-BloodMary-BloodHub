const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    console.log("Auth Middleware - Token exists:", !!token);
    if (!token) return res.status(401).json({ error: "No token provided" });

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) {
            console.log("Auth Middleware - JWT Verify Error:", err.message);
            return res.status(403).json({ error: "Invalid/expired token" });
        }

        try {
            // Verify user still exists in the database
            let exists = false;
            if (user.role === "admin") {
                const [rows] = await pool.query("SELECT id FROM admins WHERE id = ?", [user.id]);
                exists = rows.length > 0;
            } else if (user.role === "donor") {
                const [rows] = await pool.query("SELECT id FROM donors WHERE id = ?", [user.id]);
                exists = rows.length > 0;
            } else if (user.role === "hospital") {
                const [rows] = await pool.query("SELECT id FROM hospitals WHERE id = ?", [user.id]);
                exists = rows.length > 0;
            }

            if (!exists) {
                console.log("Auth Middleware - User no longer exists in DB:", user.id, user.role);
                return res.status(401).json({ error: "Session invalid. Please log in again." });
            }

            console.log("Auth Middleware - User verified:", user.id, user.role);
            req.user = user;
            next();
        } catch (dbErr) {
            console.error("Auth Middleware - DB Error:", dbErr);
            return res.status(500).json({ error: "Authentication service error" });
        }
    });
};

module.exports = authenticateToken;
