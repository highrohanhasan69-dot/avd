// db.js
const { Pool } = require('pg');
require('dotenv').config(); // ensure .env load হচ্ছে

const pool = new Pool({
  user: process.env.DB_USER,       // postgres
  host: process.env.DB_HOST,       // localhost
  database: process.env.DB_NAME,   // avado
  password: process.env.DB_PASSWORD, // Rohan6969
  port: process.env.DB_PORT        // 5432
});

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected using Pool!');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

module.exports = pool;
