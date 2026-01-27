// api/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const admin = require("firebase-admin");

const app = express();

// --- KONFIGURASI FIREBASE DARI ENV ---
// Kita cek apakah ENV variable tersedia, jika tidak skip (untuk build time)
if (process.env.FIREBASE_PRIVATE_KEY) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace newline characters in private key for Vercel
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
}
const db = admin.apps.length ? admin.firestore() : null;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- KONFIGURASI API ---
const DIGIFLAZZ_USER = process.env.DIGIFLAZZ_USER;
const DIGIFLAZZ_KEY = process.env.DIGIFLAZZ_KEY;
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// --- ROUTES ---

app.get("/api/status", (req, res) => {
  res.json({
    status: "Hawai Server is Running!",
    env: IS_PRODUCTION ? "PROD" : "DEV",
  });
});

// 1. Endpoint Produk (Digiflazz)
app.post("/api/pricelist", async (req, res) => {
  try {
    const cmd = req.body.cmd || "prepaid";
    const sign = crypto
      .createHash("md5")
      .update(DIGIFLAZZ_USER + DIGIFLAZZ_KEY + "depo")
      .digest("hex");

    const response = await axios.post(
      "https://api.digiflazz.com/v1/price-list",
      {
        cmd: cmd,
        username: DIGIFLAZZ_USER,
        sign: sign,
      },
    );

    res.json(response.data);
  } catch (error) {
    console.error("Digiflazz Error:", error.message);
    res.status(500).json({ error: "Gagal mengambil data produk" });
  }
});

// 2. Endpoint Transaksi (Request ke Tripay)
app.post("/api/transaction", async (req, res) => {
  try {
    const { method, product_code, phone, amount, sku_name } = req.body;
    const merchantRef = "INV-" + Math.floor(Date.now() / 1000); // Ref unik

    // Signature Tripay
    const signature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(TRIPAY_MERCHANT_CODE + merchantRef + amount)
      .digest("hex");

    const payload = {
      method: method,
      merchant_ref: merchantRef,
      amount: amount,
      customer_name: "Customer Hawai",
      customer_email: "customer@email.com",
      customer_phone: phone,
      order_items: [
        {
          sku: product_code,
          name: sku_name,
          price: amount,
          quantity: 1,
        },
      ],
      return_url: "https://hawai-topup.vercel.app/invoice.html", // Ganti dengan domain Vercel kamu nanti
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 jam
      signature: signature,
    };

    const tripayUrl = IS_PRODUCTION
      ? "https://tripay.co.id/api/transaction/create"
      : "https://tripay.co.id/api-sandbox/transaction/create";

    const { data } = await axios.post(tripayUrl, payload, {
      headers: { Authorization: `Bearer ${TRIPAY_API_KEY}` },
    });

    // Simpan Transaksi ke Firebase Firestore (Bukan JSON File!)
    if (db) {
      await db.collection("transactions").doc(merchantRef).set({
        ref: merchantRef,
        status: "UNPAID",
        product_code,
        phone,
        amount,
        checkout_url: data.data.checkout_url,
        created_at: new Date(),
      });
    }

    res.json(data);
  } catch (error) {
    console.error(
      "Tripay Error:",
      error.response ? error.response.data : error.message,
    );
    res.status(500).json({ error: "Gagal membuat transaksi" });
  }
});

// 3. Callback Tripay (Webhook)
app.post("/api/callback", async (req, res) => {
  try {
    const jsonPayload = JSON.stringify(req.body);
    const signature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(jsonPayload)
      .digest("hex");

    if (req.headers["x-callback-signature"] !== signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Signature" });
    }

    const { merchant_ref, status } = req.body;

    // Update status di Firebase
    if (db) {
      await db
        .collection("transactions")
        .doc(merchant_ref)
        .update({ status: status });

      // Jika PAID, tembak Digiflazz
      if (status === "PAID") {
        const doc = await db.collection("transactions").doc(merchant_ref).get();
        const data = doc.data();

        // Proses Topup Digiflazz di sini...
        // (Masukkan logika axios ke digiflazz/transaction menggunakan data.product_code dan data.phone)
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).json({ success: false });
  }
});

// Export app untuk Vercel
module.exports = app;
