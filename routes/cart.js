// routes/cart.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const { getUserOrGuest } = require("../middleware/authMiddleware");

// ✅ Debug: confirm file loaded
console.log("✅ Cart routes loaded!");

// 🟣 1️⃣ GET CART (User বা Guest)
router.get("/", getUserOrGuest, async (req, res) => {
  const owner = req.cartOwner;

  try {
    console.log("🧾 CART OWNER:", owner);

    let query, params;

    if (owner.type === "user") {
      query = `
        SELECT 
          c.id, 
          c.product_id, 
          c.quantity, 
          p.name, 
          p.price, 
          p.image_url, 
          p.discount_percent
        FROM carts c
        JOIN products p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.id DESC`;
      params = [owner.id];
    } else {
      query = `
        SELECT 
          c.id, 
          c.product_id, 
          c.quantity, 
          p.name, 
          p.price, 
          p.image_url,
          p.discount_percent
        FROM carts c
        JOIN products p ON p.id = c.product_id
        WHERE c.session_id = $1
        ORDER BY c.id DESC`;
      params = [owner.id];
    }

    const result = await db.query(query, params);
    res.json({ cart: result.rows });
  } catch (err) {
    console.error("❌ GET CART ERROR:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 🟣 2️⃣ ADD TO CART
router.post("/add", getUserOrGuest, async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const owner = req.cartOwner;

  try {
    if (!productId)
      return res.status(400).json({ error: "Missing productId" });

    let existingCart;

    if (owner.type === "user") {
      existingCart = await db.query(
        "SELECT * FROM carts WHERE user_id=$1 AND product_id=$2",
        [owner.id, productId]
      );
    } else {
      existingCart = await db.query(
        "SELECT * FROM carts WHERE session_id=$1 AND product_id=$2",
        [owner.id, productId]
      );
    }

    if (existingCart.rows.length > 0) {
      await db.query(
        "UPDATE carts SET quantity = quantity + $1, updated_at = now() WHERE id = $2",
        [quantity, existingCart.rows[0].id]
      );
    } else {
      if (owner.type === "user") {
        await db.query(
          "INSERT INTO carts(user_id, product_id, quantity) VALUES($1,$2,$3)",
          [owner.id, productId, quantity]
        );
      } else {
        await db.query(
          "INSERT INTO carts(session_id, product_id, quantity) VALUES($1,$2,$3)",
          [owner.id, productId, quantity]
        );
      }
    }

    res.json({ success: true, message: "Item added to cart" });
  } catch (err) {
    console.error("❌ ADD TO CART ERROR:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// 🟣 3️⃣ REMOVE ITEM FROM CART (✅ এইটা আগে থাকবে)
router.delete("/remove/:id", async (req, res) => {
  const { id } = req.params;
  console.log("🗑 DELETE /remove/:id called →", id);

  try {
    const deleted = await db.query("DELETE FROM carts WHERE id=$1 RETURNING *", [id]);

    if (deleted.rowCount === 0)
      return res.status(404).json({ error: "Item not found" });

    console.log("✅ Item removed:", id);
    res.json({ success: true, message: "Item removed from cart" });
  } catch (err) {
    console.error("❌ REMOVE CART ITEM ERROR:", err);
    res.status(500).json({ error: "Failed to remove item" });
  }
});

// 🟣 4️⃣ UPDATE QUANTITY
router.put("/update/:id", async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity < 1)
    return res.status(400).json({ error: "Quantity must be >= 1" });

  try {
    const updated = await db.query(
      "UPDATE carts SET quantity=$1, updated_at=now() WHERE id=$2 RETURNING *",
      [quantity, id]
    );

    if (updated.rowCount === 0)
      return res.status(404).json({ error: "Cart item not found" });

    res.json({ success: true, item: updated.rows[0] });
  } catch (err) {
    console.error("❌ UPDATE QUANTITY ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 🟣 5️⃣ DELETE CART ITEM (fallback route)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  console.log("🗑 DELETE /:id called →", id);
  try {
    const deleted = await db.query("DELETE FROM carts WHERE id=$1 RETURNING *", [id]);
    if (deleted.rowCount === 0)
      return res.status(404).json({ error: "Item not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("❌ DELETE /cart/:id ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
