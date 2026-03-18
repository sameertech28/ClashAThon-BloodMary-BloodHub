const mysql = require("mysql2/promise");
require("dotenv").config();

async function fixSchema() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        console.log("Starting schema fix...\n");

        // Disable foreign key checks temporarily
        await pool.query("SET FOREIGN_KEY_CHECKS = 0");

        // 1. Recreate donors table with all fields
        console.log("1. Fixing donors table...");
        await pool.query("DROP TABLE IF EXISTS donors");
        await pool.query(`
            CREATE TABLE donors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                phone VARCHAR(50),
                age INT,
                blood_type ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
                city VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                health_declaration TEXT,
                available BOOLEAN DEFAULT TRUE,
                approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("   ✅ donors table fixed");

        // 2. Recreate hospitals table with all fields
        console.log("2. Fixing hospitals table...");
        await pool.query("DROP TABLE IF EXISTS hospitals");
        await pool.query(`
            CREATE TABLE hospitals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                phone VARCHAR(50),
                city VARCHAR(100) NOT NULL,
                address TEXT,
                license_number VARCHAR(100),
                password VARCHAR(255) NOT NULL,
                verified BOOLEAN DEFAULT TRUE,
                approved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("   ✅ hospitals table fixed");

        // 3. Recreate requests table
        console.log("3. Fixing requests table...");
        await pool.query("DROP TABLE IF EXISTS blood_requests");
        await pool.query("DROP TABLE IF EXISTS requests");
        await pool.query(`
            CREATE TABLE requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                hospital_id INT NOT NULL,
                blood_type ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
                quantity INT NOT NULL,
                urgency ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
                city VARCHAR(100) NOT NULL,
                patient_details TEXT,
                status ENUM('Open', 'Fulfilled') DEFAULT 'Open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
            )
        `);
        console.log("   ✅ requests table fixed");

        // 4. Recreate responses table
        console.log("4. Fixing responses table...");
        await pool.query("DROP TABLE IF EXISTS responses");
        await pool.query(`
            CREATE TABLE responses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                request_id INT NOT NULL,
                donor_id INT NOT NULL,
                status ENUM('Coming', 'Pending', 'Completed') DEFAULT 'Coming',
                estimated_arrival VARCHAR(100),
                message TEXT,
                responded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_response (request_id, donor_id),
                FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
                FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE CASCADE
            )
        `);
        console.log("   ✅ responses table fixed");

        // 5. Cleanup
        await pool.query("DROP TABLE IF EXISTS users");

        // Re-enable foreign key checks
        await pool.query("SET FOREIGN_KEY_CHECKS = 1");

        console.log("\n🎉 Schema fixed! Registration should now work.");
        process.exit(0);
    } catch (err) {
        console.error("\n❌ Schema fix failed:", err);
        process.exit(1);
    }
}

fixSchema();
