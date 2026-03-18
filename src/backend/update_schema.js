const mysql = require("mysql2/promise");
require("dotenv").config();

async function updateSchema() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 10607,
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log("Updating responses status ENUM...");
        await pool.query("ALTER TABLE responses MODIFY COLUMN status ENUM('Coming', 'Unavailable', 'Pending', 'Completed', 'Donated') DEFAULT 'Pending'");
        console.log("Schema updated successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Error updating schema:", err);
        process.exit(1);
    }
}

updateSchema();
