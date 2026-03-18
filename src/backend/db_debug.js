const mysql = require("mysql2/promise");
require("dotenv").config();

async function debugDB() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        console.log("--- DATABASE DEBUG INFO ---");
        const [rows] = await pool.query("DESCRIBE hospitals");
        console.log("Hospitals Table Structure:");
        console.table(rows);

        const [sample] = await pool.query("SELECT * FROM hospitals LIMIT 1");
        console.log("\nSample Hospital Row (Keys):");
        if (sample.length > 0) {
            console.log(Object.keys(sample[0]));
        } else {
            console.log("No data in hospitals table yet.");
        }

        process.exit(0);
    } catch (err) {
        console.error("Debug failed:", err);
        process.exit(1);
    }
}

debugDB();
