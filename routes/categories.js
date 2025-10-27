// routes/categories.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// -------------------------
// 📂 CATEGORY UPLOAD FOLDER
// -------------------------
const categoryDir = path.join(__dirname, "../uploads/categories");
if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

// -------------------------
// 🧹 FILENAME SANITIZER
// -------------------------
const sanitizeFilename = (name) =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, "_").substring(0, 50);

// -------------------------
// 📸 MULTER STORAGE SETUP
// -------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, categoryDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + sanitizeFilename(file.originalname)),
});
const uploadCategory = multer({ storage });

/* ==========================================================
   ✅ 1️⃣ সব ক্যাটাগরি পাওয়া (READ)
========================================================== */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /categories error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ==========================================================
   ✅ 2️⃣ নতুন ক্যাটাগরি যোগ (CREATE)
========================================================== */
router.post("/", uploadCategory.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image required" });
    if (!req.body.slug) return res.status(400).json({ error: "Slug required" });

    const image_url = `http://localhost:${process.env.PORT || 5000}/uploads/categories/${req.file.filename}`;
    const { slug } = req.body;

    const result = await pool.query(
      "INSERT INTO categories (image_url, slug) VALUES ($1, $2) RETURNING *",
      [image_url, slug]
    );

    res.json({
      message: "✅ Category added successfully",
      category: result.rows[0],
    });
  } catch (err) {
    console.error("❌ POST /categories error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ==========================================================
   ✅ 3️⃣ নির্দিষ্ট ক্যাটাগরি আপডেট করা (UPDATE)
========================================================== */
router.put("/:id", uploadCategory.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { slug } = req.body;

    // পুরনো ডাটা বের করা
    const oldData = await pool.query("SELECT * FROM categories WHERE id=$1", [id]);
    if (oldData.rows.length === 0)
      return res.status(404).json({ message: "Category not found" });

    let image_url = oldData.rows[0].image_url;

    // যদি নতুন ছবি upload করা হয়, পুরনোটা মুছে দাও
    if (req.file) {
      const oldPath = path.join(
        __dirname,
        "..",
        "uploads",
        "categories",
        path.basename(image_url)
      );
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

      image_url = `http://localhost:${process.env.PORT || 5000}/uploads/categories/${req.file.filename}`;
    }

    const updated = await pool.query(
      "UPDATE categories SET slug=$1, image_url=$2 WHERE id=$3 RETURNING *",
      [slug || oldData.rows[0].slug, image_url, id]
    );

    res.json({
      message: "✅ Category updated successfully",
      category: updated.rows[0],
    });
  } catch (err) {
    console.error("❌ PUT /categories error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ==========================================================
   ✅ 4️⃣ ক্যাটাগরি ডিলিট করা (DELETE)
========================================================== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // পুরনো ডাটা বের করো
    const oldData = await pool.query("SELECT * FROM categories WHERE id=$1", [id]);
    if (oldData.rows.length === 0)
      return res.status(404).json({ message: "Category not found" });

    // ছবি ফাইল মুছে দাও
    const imagePath = path.join(
      __dirname,
      "..",
      "uploads",
      "categories",
      path.basename(oldData.rows[0].image_url)
    );
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);

    // ডাটাবেস থেকে row ডিলিট
    await pool.query("DELETE FROM categories WHERE id=$1", [id]);

    res.json({ message: "🗑️ Category deleted successfully" });
  } catch (err) {
    console.error("❌ DELETE /categories error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
