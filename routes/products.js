// routes/products.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");

// -------------------------
// ☁️ CLOUDINARY CONFIG
// -------------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// -------------------------
// 📸 MULTER MEMORY STORAGE
// -------------------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// -------------------------
// 🔼 Helper: Upload to Cloudinary
// -------------------------
const uploadToCloudinary = (fileBuffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (result) resolve(result.secure_url);
        else reject(error);
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

/* ==========================================================
   ✅ IMAGE UPLOAD (Primary/Secondary/Variant Option)
========================================================== */
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image required" });
    const image_url = await uploadToCloudinary(req.file.buffer, "avado/products");
    res.json({ image_url });
  } catch (err) {
    console.error("❌ Cloudinary Upload Error:", err);
    res.status(500).json({ error: "Image upload failed", details: err.message });
  }
});

/* ==========================================================
   ✅ SEARCH PRODUCTS
========================================================== */
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

/* ==========================================================
   ✅ GET ALL PRODUCTS (with variants)
========================================================== */
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

/* ==========================================================
   ✅ GET SINGLE PRODUCT (with variants)
========================================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const pres = await client.query("SELECT * FROM products WHERE id=$1", [id]);
    if (!pres.rows.length) return res.status(404).json({ error: "Not found" });

    const product = pres.rows[0];
    const vres = await client.query(
      "SELECT * FROM product_variants WHERE product_id=$1",
      [id]
    );

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

/* ==========================================================
   ✅ ADD NEW PRODUCT (with variants)
========================================================== */
router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      name,
      price,
      description,
      category_slug,
      image_url,
      secondary_image_url,
      is_top_product,
      is_hot_deal,
      discount_percent,
      offer_end_date,
      variants = [],
    } = req.body;

    const pres = await client.query(
      `INSERT INTO products 
       (name, price, description, category_slug, image_url, secondary_image_url, 
        is_top_product, is_hot_deal, discount_percent, offer_end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        name,
        price,
        description,
        category_slug,
        image_url,
        secondary_image_url,
        is_top_product,
        is_hot_deal,
        discount_percent,
        offer_end_date,
      ]
    );
    const product = pres.rows[0];

    for (const variant of variants) {
      const vres = await client.query(
        `INSERT INTO product_variants (product_id, variant_level, name)
         VALUES ($1,$2,$3) RETURNING *`,
        [product.id, variant.level, variant.name]
      );
      const vr = vres.rows[0];
      if (variant.options?.length) {
        for (const o of variant.options) {
          await client.query(
            `INSERT INTO product_variant_options 
             (variant_id, option_name, option_price, option_image_url)
             VALUES ($1,$2,$3,$4)`,
            [vr.id, o.option_name, o.option_price, o.option_image_url]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json(product);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ POST /api/products error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
