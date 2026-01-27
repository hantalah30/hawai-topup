const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");
const path = require("path");

const app = express();

// --- 1. INISIALISASI FIREBASE (FIX UNTUK VERCEL) ---
// JANGAN PAKAI require('./service-account.json') DI SINI!
if (!admin.apps.length) {
  try {
    // Mengambil private key dari Environment Variable Vercel
    // Kita harus mengganti karakter \n (baris baru) agar terbaca benar
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
      console.log("Firebase Connected via Env Vars");
    } else {
      console.warn("WARNING: Firebase Config missing in Env Vars");
    }
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Upload Handler (Memory Storage)
const upload = multer({ storage: multer.memoryStorage() });

// --- HELPER FUNCTIONS ---
async function getConfig() {
  if (!db) return {}; // Cegah crash jika DB belum connect
  try {
    const doc = await db.collection("settings").doc("general").get();
    if (!doc.exists) {
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

// --- PUBLIC API ENDPOINTS ---

app.get("/api/init-data", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const productsSnap = await db
      .collection("products")
      .where("is_active", "==", true)
      .get();
    const products = productsSnap.docs.map((doc) => doc.data());

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

app.post("/api/check-nickname", async (req, res) => {
  const { game, id, zone } = req.body;
  try {
    let apiUrl = "";
    let response;

    if (game.toLowerCase().includes("mobile")) {
      apiUrl = `https://api.isan.eu.org/nickname/ml?id=${id}&zone=${zone}`;
    } else if (game.toLowerCase().includes("free")) {
      apiUrl = `https://api.isan.eu.org/nickname/ff?id=${id}`;
    }

    if (apiUrl) {
      response = await axios.get(apiUrl);
      if (response.data.success) {
        return res.json({ success: true, name: response.data.name });
      }
    }
    return res.json({
      success: false,
      message: "ID Tidak Ditemukan / Game belum support",
    });
  } catch (error) {
    console.error("Check Nick Error:", error.message);
    res.status(500).json({ success: false, message: "Gagal cek ID" });
  }
});

app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  // Gunakan 'api' untuk production, 'api-sandbox' untuk testing
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  try {
    if (!config.tripay?.api_key) throw new Error("Tripay API Key missing");

    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      { headers: { Authorization: "Bearer " + config.tripay.api_key } },
    );
    res.json(response.data);
  } catch (error) {
    console.error("Channel Error:", error.message);
    res.status(500).json({ success: false, data: [] });
  }
});

app.post("/api/transaction", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB Error" });
  const config = await getConfig();
  const { sku, amount, customer_no, method, nickname, game } = req.body;
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  try {
    const productDoc = await db.collection("products").doc(sku).get();
    const productName = productDoc.exists
      ? productDoc.data().name
      : "Topup Game";

    const merchantRef =
      "INV-" + Math.floor(Math.random() * 100000) + Date.now();
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
      return_url: "https://hawai-topup.vercel.app/invoice.html", // Pastikan ini domain kamu
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayRes = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      { headers: { Authorization: "Bearer " + config.tripay.api_key } },
    );

    const data = tripayRes.data.data;

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
    console.error("Trx Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Transaksi Gagal" });
  }
});

// Endpoint lain biarkan, tapi pastikan 'db' dicek sebelum dipakai
module.exports = app;
