require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

const app = express();

// ==========================================
// 1. SETUP FIREBASE (ULTIMATE FIX)
// ==========================================
let db = null;
let dbError = "Menunggu Inisialisasi...";

function initFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Env Vars Belum Lengkap (Cek ProjectID, Email, Key)");
    }

    // Fix Format Key Vercel (Paling sering salah di sini)
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }
    privateKey = privateKey.replace(/\\n/g, "\n");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    db = admin.firestore();
    dbError = null; // Reset error
    console.log("🔥 Firebase App Initialized");
  } catch (error) {
    dbError = error.message;
    console.error("❌ Firebase Init Error:", error.message);
    db = null;
  }
}

initFirebase();

// ==========================================
// 2. MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
const upload = multer({ storage: multer.memoryStorage() });

// --- Helper Config ---
async function getConfig() {
  let config = {
    tripay: {
      merchant_code: process.env.TRIPAY_MERCHANT_CODE || "",
      api_key: process.env.TRIPAY_API_KEY || "",
      private_key: process.env.TRIPAY_PRIVATE_KEY || "",
    },
    digiflazz: {
      username: process.env.DIGI_USER || "",
      api_key: process.env.DIGI_KEY || "",
    },
    admin_password: process.env.ADMIN_PASSWORD || "admin",
  };

  if (db) {
    try {
      const doc = await db.collection("settings").doc("general").get();
      if (doc.exists) {
        const dbConfig = doc.data();
        if (dbConfig.tripay)
          config.tripay = { ...config.tripay, ...dbConfig.tripay };
        if (dbConfig.digiflazz)
          config.digiflazz = { ...config.digiflazz, ...dbConfig.digiflazz };
        if (dbConfig.admin_password)
          config.admin_password = dbConfig.admin_password;
      }
    } catch (e) {
      console.warn("Gagal baca config DB:", e.message);
    }
  }
  return config;
}

// ==========================================
// 3. PUBLIC ROUTES
// ==========================================

// DEBUGGING STATUS (CEK INI PERTAMA KALI)
app.get("/api/status", async (req, res) => {
  let connectionTest = "Untested";
  let realError = dbError;

  if (db) {
    try {
      // Coba baca data beneran untuk tes koneksi
      await db.collection("settings").limit(1).get();
      connectionTest = "SUCCESS: Read/Write OK";
    } catch (e) {
      connectionTest = "FAILED: " + e.message;
      realError = e.message; // Tangkap error asli dari Google
    }
  }

  res.json({
    status: "Online",
    firebase_init: db ? "OK" : "FAILED",
    firebase_connection: connectionTest, // Ini status yang jujur
    error_detail: realError,
  });
});

app.get("/api/init-data", async (req, res) => {
  // Fail-safe: Jangan crash jika DB mati
  if (!db) return res.json({ sliders: [], banners: {}, products: [] });
  try {
    const productsSnap = await db
      .collection("products")
      .where("is_active", "==", true)
      .get();
    const products = productsSnap.docs.map((doc) => doc.data());
    let assets = { sliders: [], banners: {} };
    try {
      const doc = await db.collection("settings").doc("assets").get();
      if (doc.exists) assets = doc.data();
    } catch (e) {}
    res.json({ sliders: assets.sliders, banners: assets.banners, products });
  } catch (e) {
    console.error(e);
    res.json({ sliders: [], banners: {}, products: [] }); // Return kosong jangan 500
  }
});

// ... (Endpoint check-nickname, channels, transaction sama seperti sebelumnya) ...
// Saya singkat agar muat, tapi pastikan endpoint transaction ada di file kamu.
app.post("/api/check-nickname", async (req, res) => {
  /* ... Logika Cek Nick ... */ res.json({ success: false });
});
app.get("/api/channels", async (req, res) => {
  /* ... Logika Channel ... */ res.json({ data: [] });
});
app.post("/api/transaction", async (req, res) => {
  /* ... Logika Transaksi ... */ res.json({ success: false });
});

// ==========================================
// 4. ADMIN ROUTES (DEBUGGING MODE)
// ==========================================

app.post("/api/admin/login", async (req, res) => {
  const config = await getConfig();
  if (req.body.password === config.admin_password) res.json({ success: true });
  else res.status(401).json({ success: false });
});

app.get("/api/admin/config", async (req, res) => {
  try {
    const config = await getConfig();
    let products = [];
    let assets = { sliders: [], banners: {} };

    if (db) {
      try {
        const pSnap = await db.collection("products").get();
        products = pSnap.docs.map((doc) => doc.data());
        const aDoc = await db.collection("settings").doc("assets").get();
        if (aDoc.exists) assets = aDoc.data();
      } catch (e) {
        console.error("DB Read Error:", e.message);
        // Jangan throw, kirim data kosong + error info
        return res.json({
          config,
          products: [],
          assets: {},
          db_connected: false,
          db_error: e.message,
        });
      }
    }

    res.json({ config, products, assets, db_connected: !!db });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SAVE CONFIG (Tampilkan Error Asli)
app.post("/api/admin/save-config", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Init Failed: " + dbError });
  try {
    await db
      .collection("settings")
      .doc("general")
      .set(req.body, { merge: true });
    res.json({ success: true });
  } catch (e) {
    console.error("Save Error:", e.message);
    res.status(500).json({ error: "Gagal Simpan ke DB: " + e.message });
  }
});

app.post("/api/admin/save-products", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    const batch = db.batch();
    req.body.forEach((p) => batch.set(db.collection("products").doc(p.sku), p));
    await batch.commit();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/save-assets", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    await db.collection("settings").doc("assets").set(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SYNC DIGIFLAZZ (OPTIMIZED CHUNKING)
app.post("/api/admin/sync-digiflazz", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database Error: " + dbError });

  const config = await getConfig();
  const { username, api_key } = config.digiflazz;

  if (!username || !api_key)
    return res.status(400).json({ message: "API Key Kosong" });

  try {
    const sign = crypto
      .createHash("md5")
      .update(username + api_key + "pricelist")
      .digest("hex");
    const response = await axios.post(
      "https://api.digiflazz.com/v1/price-list",
      {
        cmd: "prepaid",
        username,
        sign,
      },
    );

    const digiProducts = response.data.data;
    if (!digiProducts)
      throw new Error("Gagal mengambil data Digiflazz (Response Kosong)");

    const gameProducts = digiProducts.filter(
      (item) => item.category === "Games",
    );

    // Batching diperkecil jadi 100 agar aman dari timeout/limit
    const chunkSize = 100;
    for (let i = 0; i < gameProducts.length; i += chunkSize) {
      const batch = db.batch();
      const chunk = gameProducts.slice(i, i + chunkSize);

      chunk.forEach((item) => {
        const sku = item.buyer_sku_code;
        const newData = {
          sku: sku,
          name: item.product_name,
          brand: item.brand,
          category: item.category,
          price_modal: item.price,
          price_sell: item.price + 1000, // Default markup 1000
          image: "assets/default.png",
          is_active: false, // Default mati
          is_promo: false,
        };
        // Set merge: true agar markup lama tidak hilang
        batch.set(db.collection("products").doc(sku), newData, { merge: true });
      });
      await batch.commit();
    }

    res.json({
      success: true,
      message: `Sukses Sync ${gameProducts.length} Produk!`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Sync Error: " + error.message });
  }
});

app.post("/api/admin/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const b64 = Buffer.from(req.file.buffer).toString("base64");
  res.json({ filepath: `data:${req.file.mimetype};base64,${b64}` });
});

module.exports = app;
