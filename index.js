// =======================
//  AVADO Backend Server
// =======================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const pool = require("./db");

const app = express();

// ---------------- MIDDLEWARE ----------------

// ✅ Proper CORS setup for Local + Cloudflare (Frontend)
app.use(
  cors({
    origin: [
      "http://localhost:5173",          // local dev
      "https://avado.pages.dev",        // Cloudflare live frontend
    ],
    credentials: true, // ✅ allow cookie exchange
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ Request Logger (optional but useful)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---------------- FILE UPLOAD FOLDERS ----------------
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ---------------- ROUTES IMPORT ----------------
const authRoutes = require("./routes/auth");
const cartRoutes = require("./routes/cart");
const checkoutRoutes = require("./routes/checkout");
const footerRoutes = require("./routes/footer");
const bannerRoutes = require("./routes/banners");      // ✅ Banners
const categoryRoutes = require("./routes/categories"); // ✅ Categories
const productRoutes = require("./routes/products");    // ✅ Products

// ---------------- ROUTES REGISTER ----------------
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/footer", footerRoutes);
app.use("/banners", bannerRoutes);
app.use("/categories", categoryRoutes);
app.use("/products", productRoutes);

// ---------------- HEALTH CHECK ----------------
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------------- 404 HANDLER ----------------
app.use((req, res) => res.status(404).json({ error: "Not Found" }));

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  try {
    const test = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected successfully at:", test.rows[0].now);
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err);
  }
});
