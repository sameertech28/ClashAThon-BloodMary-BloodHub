const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool(process.env.MYSQL_URL || {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 1, // Keep it low for Aiven Free and Serverless
    queueLimit: 0,
    connectTimeout: 10000, // 10 seconds
});

(async () => {
    try {
        const connection = await pool.getConnection();
        console.log("MySQL Connected successfully to bloodhub");
        connection.release();
    } catch (err) {
        console.error("MySQL connection failed:", err.message);
    }
})();

module.exports = pool;
