// dbc.js
const { Sequelize } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // 🟢 এটা অবশ্যই লাগবে
      }
    }
  }
);

sequelize
  .authenticate()
  .then(() => console.log("✅ Sequelize connected to PostgreSQL!"))
  .catch((err) => console.error("❌ Sequelize connection failed:", err));

module.exports = sequelize;
