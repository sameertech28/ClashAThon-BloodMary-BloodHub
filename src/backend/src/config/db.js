const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool(process.env.MYSQL_URL || {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 10607, // Default to Aiven port
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 5, 
    queueLimit: 0,
    connectTimeout: 20000, 
});

module.exports = pool;
