// routes/banners.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// --------------------- FOLDER SETUP ---------------------
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// File name sanitize
const sanitizeFilename = (name) =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, "_").substring(0, 50);

// --------------------- MULTER SETUP ---------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + sanitizeFilename(file.originalname)),
});
const uploadBanner = multer({ storage });

// ============================================================
// ✅ GET ALL BANNERS
// ============================================================
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM banners ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ GET /banners error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============================================================
// ✅ ADD NEW BANNER
// ============================================================
router.post("/", uploadBanner.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image required" });

    const image_url = `http://localhost:${process.env.PORT || 5000}/uploads/${req.file.filename}`;
    const { link } = req.body;

    const result = await pool.query(
      "INSERT INTO banners (image_url, link) VALUES ($1, $2) RETURNING *",
      [image_url, link]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ POST /banners error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============================================================
// ✅ DELETE BANNER BY ID
// ============================================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Check if banner exists
    const banner = await pool.query("SELECT * FROM banners WHERE id = $1", [id]);
    if (banner.rows.length === 0) {
      return res.status(404).json({ message: "Banner not found" });
    }

    const imageUrl = banner.rows[0].image_url;
    const filename = imageUrl.split("/uploads/")[1]; // extract filename
    const filePath = path.join(uploadsDir, filename);

    // 2️⃣ Delete DB entry
    await pool.query("DELETE FROM banners WHERE id = $1", [id]);

    // 3️⃣ Delete file from folder (if exists)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑️ Deleted banner image:", filePath);
    }

    res.json({ message: "Banner deleted successfully" });
  } catch (err) {
    console.error("❌ DELETE /banners/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
