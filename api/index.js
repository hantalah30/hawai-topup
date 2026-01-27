require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const admin = require("firebase-admin");
const multer = require("multer"); // Wajib ada

const app = express();

// --- KONFIGURASI MULTER (Memory Storage untuk Vercel) ---
const upload = multer({ storage: multer.memoryStorage() });

// --- KONFIGURASI FIREBASE (FIXED) ---
// HAPUS baris: const serviceAccount = require('./service-account.json');
// Ganti dengan logika Environment Variable ini:

if (!admin.apps.length) {
  try {
    // Cek apakah env var tersedia (Penting agar tidak crash saat build)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") // FIX: Ganti \\n jadi enter asli
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
      console.warn("Firebase config missing in Env Vars (OK during build)");
    }
  } catch (error) {
    console.error("Firebase Init Error:", error);
  }
}

// Inisialisasi DB aman
const db = admin.apps.length ? admin.firestore() : null;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- KONFIGURASI API KEY ---
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
    status: "Hawai Server Running",
    db_status: db ? "Connected" : "Disconnected",
    env: IS_PRODUCTION ? "PROD" : "DEV",
  });
});

// 2. Produk Digiflazz
app.post("/api/pricelist", async (req, res) => {
  try {
    const cmd = req.body.cmd || "prepaid";
    // Generate Signature Digiflazz: MD5(username + key + "depo")
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

// 3. Transaksi Tripay
app.post("/api/transaction", async (req, res) => {
  try {
    const { method, product_code, phone, amount, sku_name } = req.body;
    const merchantRef = "INV-" + Math.floor(Date.now() / 1000);

    // Signature Tripay: HMAC-SHA256(merchantCode + merchantRef + amount)
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
      // Ganti URL ini dengan domain Vercel kamu nanti
      return_url: "https://hawai-topup.vercel.app/invoice.html",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature: signature,
    };

    const tripayUrl = IS_PRODUCTION
      ? "https://tripay.co.id/api/transaction/create"
      : "https://tripay.co.id/api-sandbox/transaction/create";

    const { data } = await axios.post(tripayUrl, payload, {
      headers: { Authorization: `Bearer ${TRIPAY_API_KEY}` },
    });

    // Simpan ke Firebase (Hanya jika DB terkoneksi)
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

// 4. Callback Tripay (Webhook)
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
      // Update status pembayaran
      await db
        .collection("transactions")
        .doc(merchant_ref)
        .update({ status: status });

      // JIKA SUKSES BAYAR -> TEMBAK DIGIFLAZZ (Otomatis)
      if (status === "PAID") {
        const doc = await db.collection("transactions").doc(merchant_ref).get();
        if (doc.exists) {
          const data = doc.data();

          // --- PROSES DIGIFLAZZ ---
          const digiflazzRef = merchant_ref; // Bisa pakai ref yang sama
          const signDigi = crypto
            .createHash("md5")
            .update(DIGIFLAZZ_USER + DIGIFLAZZ_KEY + digiflazzRef)
            .digest("hex");

          try {
            await axios.post("https://api.digiflazz.com/v1/transaction", {
              username: DIGIFLAZZ_USER,
              buyer_sku_code: data.product_code,
              customer_no: data.phone,
              ref_id: digiflazzRef,
              sign: signDigi,
            });
            console.log(`Topup Sukses: ${merchant_ref}`);
          } catch (err) {
            console.error("Gagal Tembak Digiflazz:", err.message);
          }
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = app;
