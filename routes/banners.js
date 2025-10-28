// routes/banners.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const streamifier = require("streamifier");

// ---------------------
// ☁️ CLOUDINARY CONFIG
// ---------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------------------
// 📸 MULTER MEMORY STORAGE
// ---------------------
const storage = multer.memoryStorage();
const uploadBanner = multer({ storage });

// ---------------------
// 🔼 Helper: Upload to Cloudinary
// 🧩 Cloudinary Upload Helper (Final Tested)
const uploadToCloudinary = async (fileBuffer, folder) => {
  return new Promise((resolve, reject) => {
    try {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "auto" }, // 🔹 auto detects image/video/etc.
        (error, result) => {
          if (error) {
            console.error("❌ Cloudinary upload failed:", error.message);
            reject(error);
          } else {
            console.log("✅ Cloudinary upload success:", result.secure_url);
            resolve(result.secure_url);
          }
        }
      );

      // 🔹 Proper stream pass
      streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    } catch (err) {
      console.error("❌ Streamifier failed:", err.message);
      reject(err);
    }
  });
};


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
// ✅ ADD NEW BANNER (Now via Cloudinary)
// ============================================================
router.post("/", uploadBanner.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image required" });

    // ☁️ Upload image to Cloudinary folder "avado/banners"
    const image_url = await uploadToCloudinary(req.file.buffer, "avado/banners");

    const { link } = req.body;

    const result = await pool.query(
      "INSERT INTO banners (image_url, link) VALUES ($1, $2) RETURNING *",
      [image_url, link]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ POST /banners error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ============================================================
// ✅ DELETE BANNER BY ID
// ============================================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const banner = await pool.query("SELECT * FROM banners WHERE id = $1", [id]);
    if (banner.rows.length === 0)
      return res.status(404).json({ message: "Banner not found" });

    // Database থেকে banner delete
    await pool.query("DELETE FROM banners WHERE id = $1", [id]);

    // (Optional) Cloudinary image delete করছো না — future use এর জন্য save থাকছে
    res.json({ message: "🗑️ Banner deleted successfully" });
  } catch (err) {
    console.error("❌ DELETE /banners/:id error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
