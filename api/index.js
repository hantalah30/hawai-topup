// api/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const admin = require("firebase-admin");
const multer = require("multer");

const app = express();

// --- KONFIGURASI MULTER (Memory Storage untuk Serverless) ---
const upload = multer({ storage: multer.memoryStorage() });

// --- KONFIGURASI FIREBASE ---
if (!admin.apps.length) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // FIX UTAMA: Mengubah karakter \n string menjadi baris baru asli
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        : undefined,
    };

    if (serviceAccount.privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Connected");
    } else {
      console.error("Firebase Private Key is missing!");
    }
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API VARIABLES ---
const DIGIFLAZZ_USER = process.env.DIGIFLAZZ_USER;
const DIGIFLAZZ_KEY = process.env.DIGIFLAZZ_KEY;
const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY;
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY;
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// --- ROUTES ---

// 1. Cek Status
app.get("/api/status", (req, res) => {
  res.json({
    status: "Server Running",
    firebase: db ? "Connected" : "Disconnected",
    env: IS_PRODUCTION ? "PROD" : "DEV",
  });
});

// 2. Ambil Produk Digiflazz
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

// 3. Buat Transaksi Tripay
app.post("/api/transaction", async (req, res) => {
  try {
    const { method, product_code, phone, amount, sku_name } = req.body;
    const merchantRef = "INV-" + Math.floor(Date.now() / 1000);

    const signature = crypto
      .createHmac("sha256", TRIPAY_PRIVATE_KEY)
      .update(TRIPAY_MERCHANT_CODE + merchantRef + amount)
      .digest("hex");

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: "Hawai User",
      customer_email: "user@hawai.com",
      customer_phone: phone,
      order_items: [
        { sku: product_code, name: sku_name, price: amount, quantity: 1 },
      ],
      return_url: "https://hawai-topup.vercel.app/invoice.html", // Ganti dengan domain Vercel kamu
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayUrl = IS_PRODUCTION
      ? "https://tripay.co.id/api/transaction/create"
      : "https://tripay.co.id/api-sandbox/transaction/create";

    const { data } = await axios.post(tripayUrl, payload, {
      headers: { Authorization: `Bearer ${TRIPAY_API_KEY}` },
    });

    // Simpan ke Firestore
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
    console.error("Tripay Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Gagal membuat transaksi" });
  }
});

// 4. Callback Tripay
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

    if (db) {
      await db.collection("transactions").doc(merchant_ref).update({ status });

      if (status === "PAID") {
        console.log(`Pembayaran ${merchant_ref} Sukses! Proses Digiflazz...`);
        // Tambahkan logika Topup Digiflazz otomatis di sini
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).json({ success: false });
  }
});

// PENTING: Export app agar Vercel bisa menjalankannya
module.exports = app;
