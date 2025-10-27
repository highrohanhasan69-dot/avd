// db.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    require: true,
    rejectUnauthorized: false // 🟢 Neon requires this for SSL
  }
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected successfully!");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL connection error:", err);
});

module.exports = pool;
