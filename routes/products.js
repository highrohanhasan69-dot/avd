const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
  const image_url = `http://localhost:${process.env.PORT || 5000}/uploads/products/${req.file.filename}`;
  res.json({ image_url });
});

// ✅ SEARCH products (must be above /:id)
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

// ✅ Add new product
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

// ✅ Update product
router.put("/:id", async (req, res) => {
  const { id } = req.params;
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

    await client.query(
      `UPDATE products
       SET name=$1, price=$2, description=$3, category_slug=$4, image_url=$5,
           secondary_image_url=$6, is_top_product=$7, is_hot_deal=$8,
           discount_percent=$9, offer_end_date=$10
       WHERE id=$11`,
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
        id,
      ]
    );

    await client.query(
      "DELETE FROM product_variant_options WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=$1)",
      [id]
    );
    await client.query("DELETE FROM product_variants WHERE product_id=$1", [id]);

    for (const variant of variants) {
      const vres = await client.query(
        `INSERT INTO product_variants (product_id, variant_level, name)
         VALUES ($1,$2,$3) RETURNING *`,
        [id, variant.level, variant.name]
      );
      const vr = vres.rows[0];
      if (variant.options?.length) {
        for (const o of variant.options) {
          await client.query(
            `INSERT INTO product_variant_options (variant_id, option_name, option_price, option_image_url)
             VALUES ($1,$2,$3,$4)`,
            [vr.id, o.option_name, o.option_price, o.option_image_url]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ PUT /api/products/:id error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ✅ Delete product
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM product_variant_options WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=$1)",
      [id]
    );
    await client.query("DELETE FROM product_variants WHERE product_id=$1", [id]);
    await client.query("DELETE FROM products WHERE id=$1", [id]);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ DELETE /api/products/:id error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
