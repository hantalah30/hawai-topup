require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

// --- 1. INISIALISASI EXPRESS (WAJIB PERTAMA) ---
const app = express();

// --- 2. INISIALISASI FIREBASE ---
if (!admin.apps.length) {
  try {
    // Ambil private key dari env var dan perbaiki format newlinenya
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined;

    if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      privateKey
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log("Firebase initialized successfully.");
    } else {
      console.warn("WARNING: Firebase Config missing (Check Vercel Env Vars).");
    }
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Upload Handler (Memory Storage untuk Serverless)
const upload = multer({ storage: multer.memoryStorage() });

// --- 4. HELPER FUNCTIONS ---
async function getConfig() {
  if (!db) return {};
  try {
    const doc = await db.collection("settings").doc("general").get();
    if (!doc.exists) {
      // Default fallback jika database kosong
      return {
        tripay: {
          merchant_code: process.env.TRIPAY_MERCHANT,
          api_key: process.env.TRIPAY_API_KEY,
          private_key: process.env.TRIPAY_PRIVATE_KEY,
        },
        digiflazz: {
          username: process.env.DIGI_USER,
          api_key: process.env.DIGI_KEY,
        },
        admin_password: process.env.ADMIN_PASSWORD || "admin",
      };
    }
    return doc.data();
  } catch (e) {
    console.error("Error get config:", e);
    return {};
  }
}

// --- 5. ROUTES / API ENDPOINTS ---

// Cek Status Server & Database
app.get("/api/status", (req, res) => {
  res.json({
    status: "Online",
    database: db ? "Connected" : "Disconnected",
    env: process.env.NODE_ENV || "development",
  });
});

// Ambil Data Awal (Produk & Banner)
app.get("/api/init-data", async (req, res) => {
  if (!db)
    return res
      .status(500)
      .json({ error: "Database not connected. Check server logs." });

  try {
    // Ambil Produk Aktif
    const productsSnap = await db
      .collection("products")
      .where("is_active", "==", true)
      .get();

    const products = productsSnap.docs.map((doc) => doc.data());

    // Ambil Assets (Slider & Banner)
    const assetsDoc = await db.collection("settings").doc("assets").get();
    const assets = assetsDoc.exists
      ? assetsDoc.data()
      : { sliders: [], banners: {} };

    res.json({
      sliders: assets.sliders || [],
      banners: assets.banners || {},
      products: products,
    });
  } catch (e) {
    console.error("Init Data Error:", e);
    res.status(500).json({ error: "Gagal memuat data server" });
  }
});

// Cek Nickname Game
app.post("/api/check-nickname", async (req, res) => {
  const { game, id, zone } = req.body;
  try {
    let apiUrl = "";

    if (game && game.toLowerCase().includes("mobile")) {
      apiUrl = `https://api.isan.eu.org/nickname/ml?id=${id}&zone=${zone}`;
    } else if (game && game.toLowerCase().includes("free")) {
      apiUrl = `https://api.isan.eu.org/nickname/ff?id=${id}`;
    } else {
      // Fallback dummy success untuk game lain (agar tidak error)
      return res.json({ success: true, name: "Player Game" });
    }

    if (apiUrl) {
      const response = await axios.get(apiUrl);
      if (response.data.success) {
        return res.json({ success: true, name: response.data.name });
      }
    }
    return res.json({ success: false, message: "ID Tidak Ditemukan" });
  } catch (error) {
    console.error("Check Nick Error:", error.message);
    // Tetap return JSON valid meski error, agar frontend tidak crash
    res.json({ success: false, message: "Gagal cek ID (API Error)" });
  }
});

// Ambil Channel Pembayaran
app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  try {
    if (!config.tripay || !config.tripay.api_key) {
      throw new Error("Tripay API Key belum disetting di Database/Env");
    }

    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      { headers: { Authorization: "Bearer " + config.tripay.api_key } },
    );
    res.json(response.data);
  } catch (error) {
    console.error("Channel Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, data: [] });
  }
});

// Buat Transaksi
app.post("/api/transaction", async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database Error" });

  const config = await getConfig();
  const { sku, amount, customer_no, method, nickname, game } = req.body;
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  try {
    const productDoc = await db.collection("products").doc(sku).get();
    const productName = productDoc.exists
      ? productDoc.data().name
      : "Topup Game";

    const merchantRef =
      "INV-" +
      Math.floor(Math.random() * 10000) +
      Date.now().toString().slice(-6);

    // Generate Signature Tripay
    const signature = crypto
      .createHmac("sha256", config.tripay.private_key)
      .update(config.tripay.merchant_code + merchantRef + amount)
      .digest("hex");

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: nickname || "Gamer",
      customer_email: "user@example.com",
      customer_phone: customer_no,
      order_items: [{ sku, name: productName, price: amount, quantity: 1 }],
      return_url: "https://hawai-topup.vercel.app/invoice.html",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayRes = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      { headers: { Authorization: "Bearer " + config.tripay.api_key } },
    );

    const data = tripayRes.data.data;

    // Simpan ke Firestore
    await db
      .collection("transactions")
      .doc(data.reference)
      .set({
        ref_id: data.reference,
        merchant_ref: merchantRef,
        game: game || "Unknown",
        product_name: productName,
        nickname: nickname || "-",
        user_id: customer_no,
        amount: amount,
        method: method,
        status: "UNPAID",
        qr_url: data.qr_url,
        pay_code: data.pay_code,
        checkout_url: data.checkout_url,
        created_at: Date.now(),
      });

    res.json({ success: true, data: { ...data, ref_id: data.reference } });
  } catch (error) {
    console.error("Trx Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Transaksi Gagal" });
  }
});

// Admin Login
app.post("/api/admin/login", async (req, res) => {
  const config = await getConfig();
  const serverPass = config.admin_password || "admin";

  if (req.body.password === serverPass) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Password Salah" });
  }
});

// --- 6. EXPORT MODULE (WAJIB UNTUK VERCEL) ---
// Jangan gunakan app.listen di dalam handler Vercel
module.exports = app;
