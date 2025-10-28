// routes/products.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 🌐 Dynamic Base URL Setup
const getBaseURL = () => {
  return process.env.NODE_ENV === "production"
    ? "https://avado-backend.onrender.com"
    : `http://localhost:${process.env.PORT || 5000}`;
};

// ------------------- Upload Config -------------------
const productDir = path.join(__dirname, "../uploads/products");
if (!fs.existsSync(productDir)) fs.mkdirSync(productDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, productDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// ✅ Upload Image
router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image required" });
  const baseURL = getBaseURL();
  const image_url = `${baseURL}/uploads/products/${req.file.filename}`;
  res.json({ image_url });
});

// ✅ SEARCH products
router.get("/search", async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT id, name, price, image_url, discount_percent
       FROM products
       WHERE name ILIKE $1
       ORDER BY id DESC
       LIMIT 15`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ /api/products/search error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// ✅ Get all products (with variants)
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id DESC");
    const products = result.rows;

    for (const product of products) {
      const vres = await pool.query(
        "SELECT * FROM product_variants WHERE product_id=$1",
        [product.id]
      );
      const variants = [];
      for (const variant of vres.rows) {
        const ores = await pool.query(
          "SELECT * FROM product_variant_options WHERE variant_id=$1",
          [variant.id]
        );
        variants.push({ ...variant, options: ores.rows });
      }
      product.variants = variants;
    }

    res.json(products);
  } catch (err) {
    console.error("❌ GET /api/products error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Get single product (with variants)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const pres = await client.query("SELECT * FROM products WHERE id=$1", [id]);
    if (!pres.rows.length) return res.status(404).json({ error: "Not found" });

    const product = pres.rows[0];
    const vres = await client.query("SELECT * FROM product_variants WHERE product_id=$1", [id]);

    const variants = [];
    for (const variant of vres.rows) {
      const ores = await client.query(
        "SELECT * FROM product_variant_options WHERE variant_id=$1",
        [variant.id]
      );
      variants.push({ ...variant, options: ores.rows });
    }

    res.json({ ...product, variants });
  } catch (err) {
    console.error("❌ GET /api/products/:id error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

module.exports = router;
