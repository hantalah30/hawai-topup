require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

// --- 1. SETUP SERVER ---
const app = express();

// --- 2. SETUP FIREBASE ---
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined;

    if (process.env.FIREBASE_PROJECT_ID && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log("🔥 Firebase Connected!");
    } else {
      console.warn("⚠️ Firebase Config Missing in Environment Variables");
    }
  } catch (error) {
    console.error("❌ Firebase Init Error:", error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
const upload = multer({ storage: multer.memoryStorage() });

// --- 4. CONFIG MANAGER (FIXED) ---
async function getConfig() {
  // 1. Set Default dari Environment Variable (Paling Aman)
  let config = {
    tripay: {
      merchant_code:
        process.env.TRIPAY_MERCHANT_CODE || process.env.TRIPAY_MERCHANT,
      api_key: process.env.TRIPAY_API_KEY,
      private_key: process.env.TRIPAY_PRIVATE_KEY,
    },
    digiflazz: {
      username: process.env.DIGI_USER,
      api_key: process.env.DIGI_KEY,
    },
    admin_password: process.env.ADMIN_PASSWORD || "admin",
  };

  // 2. Coba timpa dengan settingan dari Database (opsional)
  if (db) {
    try {
      const doc = await db.collection("settings").doc("general").get();
      if (doc.exists) {
        const dbConfig = doc.data();
        // Hanya timpa jika data di DB tidak kosong
        if (dbConfig.tripay?.api_key) config.tripay = dbConfig.tripay;
        if (dbConfig.digiflazz?.username) config.digiflazz = dbConfig.digiflazz;
        if (dbConfig.admin_password)
          config.admin_password = dbConfig.admin_password;
      }
    } catch (e) {
      console.log("⚠️ Gagal baca DB settings, pakai Env Vars.");
    }
  }
  return config;
}

// --- 5. ROUTES ---

app.get("/api/status", async (req, res) => {
  const config = await getConfig();
  res.json({
    status: "Online",
    firebase: db ? "Connected" : "Disconnected",
    tripay_configured: !!config.tripay.api_key, // Cek apakah API Key terdeteksi
    env_test: process.env.NODE_ENV,
  });
});

app.get("/api/init-data", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database offline" });
  try {
    const productsSnap = await db
      .collection("products")
      .where("is_active", "==", true)
      .get();
    const products = productsSnap.docs.map((doc) => doc.data());

    // Default data jika kosong
    let assets = { sliders: [], banners: {} };
    try {
      const assetsDoc = await db.collection("settings").doc("assets").get();
      if (assetsDoc.exists) assets = assetsDoc.data();
    } catch (e) {}

    res.json({ sliders: assets.sliders, banners: assets.banners, products });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server Error Fetching Data" });
  }
});

app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  // Gunakan 'api-sandbox' untuk testing, 'api' untuk production
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  if (!config.tripay.api_key) {
    return res
      .status(500)
      .json({ success: false, message: "Tripay API Key Missing" });
  }

  try {
    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      {
        headers: { Authorization: `Bearer ${config.tripay.api_key}` },
      },
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Tripay Channel Error:",
      error.response?.data || error.message,
    );
    res.status(500).json({ success: false, data: [] });
  }
});

app.post("/api/transaction", async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database Error" });

  const config = await getConfig();
  const { sku, amount, customer_no, method, nickname, game } = req.body;
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  // Validasi Config
  if (!config.tripay.private_key || !config.tripay.merchant_code) {
    console.error("Missing Tripay Config:", config.tripay);
    return res
      .status(500)
      .json({ success: false, message: "Server Misconfiguration (Tripay)" });
  }

  try {
    const productDoc = await db.collection("products").doc(sku).get();
    const productName = productDoc.exists
      ? productDoc.data().name
      : "Topup Game";
    const merchantRef =
      "INV-" + Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100);

    const signature = crypto
      .createHmac("sha256", config.tripay.private_key)
      .update(config.tripay.merchant_code + merchantRef + amount)
      .digest("hex");

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: nickname || "Guest",
      customer_email: "customer@email.com",
      customer_phone: customer_no,
      order_items: [{ sku, name: productName, price: amount, quantity: 1 }],
      return_url: "https://hawai-topup.vercel.app/invoice.html", // Ganti domain kamu
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    console.log("Sending to Tripay...", payload.merchant_ref);

    const tripayRes = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
    );

    const data = tripayRes.data.data;

    // Simpan ke Firestore
    await db.collection("transactions").doc(data.reference).set({
      ref_id: data.reference,
      merchant_ref: merchantRef,
      game,
      productName,
      nickname,
      user_id: customer_no,
      amount,
      method,
      status: "UNPAID",
      qr_url: data.qr_url,
      pay_code: data.pay_code,
      checkout_url: data.checkout_url,
      created_at: Date.now(),
    });

    res.json({ success: true, data: { ...data, ref_id: data.reference } });
  } catch (error) {
    console.error("Transaction Failed:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Gagal membuat transaksi. Cek server logs.",
      detail: error.response?.data,
    });
  }
});

// Admin Login
app.post("/api/admin/login", async (req, res) => {
  const config = await getConfig();
  if (req.body.password === config.admin_password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// WAJIB: Module Exports
module.exports = app;
