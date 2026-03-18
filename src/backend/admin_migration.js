const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
require("dotenv").config();

async function migrate() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        console.log("Starting admin migration...\n");

        // 1. Create admins table
        console.log("1. Creating admins table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("   ✅ admins table ready");

        // 2. Create contact_messages table
        console.log("2. Creating contact_messages table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("   ✅ contact_messages table ready");

        // 3. Add approved column to donors (if not exists)
        console.log("3. Adding approved column to donors...");
        try {
            await pool.query(`ALTER TABLE donors ADD COLUMN approved BOOLEAN DEFAULT FALSE`);
            console.log("   ✅ approved column added to donors");
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log("   ⚠️  approved column already exists in donors");
            } else {
                throw e;
            }
        }

        // 4. Add approved column to hospitals (if not exists)
        console.log("4. Adding approved column to hospitals...");
        try {
            await pool.query(`ALTER TABLE hospitals ADD COLUMN approved BOOLEAN DEFAULT FALSE`);
            console.log("   ✅ approved column added to hospitals");
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log("   ⚠️  approved column already exists in hospitals");
            } else {
                throw e;
            }
        }

        // 5. Approve existing donors and hospitals
        console.log("5. Approving all existing donors and hospitals...");
        const [donorResult] = await pool.query("UPDATE donors SET approved = TRUE WHERE approved = FALSE");
        const [hospitalResult] = await pool.query("UPDATE hospitals SET approved = TRUE WHERE approved = FALSE");
        console.log(`   ✅ Approved ${donorResult.affectedRows} donors and ${hospitalResult.affectedRows} hospitals`);

        // 6. Seed default admin account
        console.log("6. Seeding default admin account...");
        const [existing] = await pool.query("SELECT id FROM admins WHERE email = ?", ["admin@bloodhub.com"]);
        if (existing.length === 0) {
            const hashedPassword = await bcrypt.hash("Admin@123", 10);
            await pool.query(
                "INSERT INTO admins (name, email, password) VALUES (?, ?, ?)",
                ["BLOODHUB Admin", "admin@bloodhub.com", hashedPassword]
            );
            console.log("   ✅ Admin created: admin@bloodhub.com / Admin@123");
        } else {
            console.log("   ⚠️  Admin already exists");
        }

        console.log("\n🎉 Migration completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("\n❌ Migration failed:", err);
        process.exit(1);
    }
}

migrate();
