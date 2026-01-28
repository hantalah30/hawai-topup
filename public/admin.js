require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

const app = express();

// ==========================================
// 1. SETUP FIREBASE (Vercel Friendly)
// ==========================================
let db = null;
let dbError = "Menunggu Inisialisasi...";

function initFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      console.error("❌ CRITICAL: Env Vars Firebase tidak ditemukan!");
      dbError = "Env Vars Missing in Vercel";
      return;
    }

    if (privateKey.indexOf("\\n") >= 0) {
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }

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
    db.settings({ ignoreUndefinedProperties: true });

    dbError = null;
    console.log("🔥 Firebase Connected!");
  } catch (error) {
    dbError = error.message;
    console.error("❌ Firebase Init Error:", error);
  }
}

initFirebase();

// ==========================================
// 2. MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
const upload = multer({ storage: multer.memoryStorage() });

// --- Helper Config ---
async function getConfig() {
  // 1. Ambil dari Environment Variables (PRIORITAS UTAMA UNTUK PASSWORD)
  let config = {
    tripay: {
      merchant_code: process.env.TRIPAY_MERCHANT_CODE,
      api_key: process.env.TRIPAY_API_KEY,
      private_key: process.env.TRIPAY_PRIVATE_KEY,
    },
    point_reward_percent: 5,
    admin_password: process.env.ADMIN_PASSWORD || "admin", // Default jika ENV kosong
  };

  // 2. Timpa dengan data DB (KECUALI PASSWORD jika ENV ada)
  if (db) {
    try {
      const doc = await db.collection("settings").doc("general").get();
      if (doc.exists) {
        const dbConfig = doc.data();

        // Config Reward
        if (dbConfig.point_reward_percent)
          config.point_reward_percent = dbConfig.point_reward_percent;

        // Config Tripay (Prioritaskan DB jika user update dari admin panel)
        if (dbConfig.tripay?.api_key)
          config.tripay = { ...config.tripay, ...dbConfig.tripay };

        // [FIX] Logika Password:
        // Jika di .env (Vercel) TIDAK ADA password, baru ambil dari DB.
        // Jika di .env ADA password, GUNAKAN ITU (Abaikan DB).
        if (!process.env.ADMIN_PASSWORD && dbConfig.admin_password) {
          config.admin_password = dbConfig.admin_password;
        }
      }
    } catch (e) {
      console.warn("⚠️ Gagal baca config DB, menggunakan ENV.");
    }
  }
  return config;
}

// Ubah ke "api" jika sudah Production
const TRIPAY_MODE = "api-sandbox";

// ==========================================
// 3. ROUTES TRANSAKSI
// ==========================================

// A. Create Transaction (Topup Coin)
app.post("/api/topup-coin", async (req, res) => {
  if (!db)
    return res
      .status(500)
      .json({ success: false, message: "Database Error: " + dbError });

  const config = await getConfig();
  if (!config.tripay.private_key || !config.tripay.api_key) {
    return res.status(500).json({
      success: false,
      message: "Server Config Error: Tripay Keys Missing",
    });
  }

  const { amount, method, user_uid, user_name } = req.body;

  if (!user_uid)
    return res.status(400).json({ success: false, message: "Login Required" });

  try {
    const merchantRef =
      "DEP-" + Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100);

    const signature = crypto
      .createHmac("sha256", config.tripay.private_key)
      .update(config.tripay.merchant_code + merchantRef + amount)
      .digest("hex");

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: user_name || "User",
      customer_email: "user@hawai.com",
      customer_phone: "08123456789",
      order_items: [
        {
          sku: "DEPOSIT_COIN",
          name: "Topup HAWAI Coin",
          price: parseInt(amount),
          quantity: 1,
        },
      ],
      return_url: "https://hawai-topup.vercel.app/",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    console.log(`Sending to Tripay (${TRIPAY_MODE}):`, JSON.stringify(payload));

    const tripayRes = await axios.post(
      `https://tripay.co.id/${TRIPAY_MODE}/transaction/create`,
      payload,
      { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
    );

    // Simpan dengan ID Dokumen = Reference Tripay (agar mudah di-GET)
    await db
      .collection("transactions")
      .doc(tripayRes.data.data.reference)
      .set({
        ref_id: tripayRes.data.data.reference,
        merchant_ref: merchantRef,
        type: "DEPOSIT",
        user_uid: user_uid,
        amount: parseInt(amount),
        method: method,
        status: "UNPAID",
        checkout_url: tripayRes.data.data.checkout_url,
        qr_url: tripayRes.data.data.qr_url,
        pay_code: tripayRes.data.data.pay_code,
        created_at: Date.now(),
      });

    res.json({ success: true, data: tripayRes.data.data });
  } catch (e) {
    console.error("Topup Coin Error:", e.response?.data || e.message);
    const msg = e.response?.data?.message || e.message;
    res.status(500).json({ success: false, message: "Tripay Error: " + msg });
  }
});

// B. Create Transaction (Game Topup)
app.post("/api/transaction", async (req, res) => {
  if (!db)
    return res
      .status(500)
      .json({ success: false, message: "Database Error: " + dbError });

  const config = await getConfig();
  if (!config.tripay.private_key)
    return res
      .status(500)
      .json({ success: false, message: "Tripay Private Key Missing" });

  const { sku, amount, customer_no, method, nickname, game, user_uid } =
    req.body;

  try {
    const productDoc = await db.collection("products").doc(sku).get();
    const productName = productDoc.exists
      ? productDoc.data().name
      : "Topup Game";
    const merchantRef =
      "INV-" + Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100);
    const safeNickname = nickname || "-";

    let transactionData = {
      ref_id: merchantRef,
      merchant_ref: merchantRef,
      type: "GAME_TOPUP",
      game,
      productName,
      nickname: safeNickname,
      user_id: customer_no,
      user_uid: user_uid || null,
      amount: parseInt(amount),
      method,
      status: "UNPAID",
      created_at: Date.now(),
    };

    if (method === "HAWAI_COIN") {
      if (!user_uid)
        return res
          .status(400)
          .json({ success: false, message: "Login required" });

      const userRef = db.collection("users").doc(user_uid);
      await db.runTransaction(async (t) => {
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) throw new Error("User not found");
        const userData = userDoc.data();
        const currentCoins = userData.hawai_coins || 0;
        if (currentCoins < amount) throw new Error("Saldo tidak cukup");

        t.update(userRef, { hawai_coins: currentCoins - parseInt(amount) });
        transactionData.status = "PAID";
        transactionData.paid_at = Date.now();
        t.set(db.collection("transactions").doc(merchantRef), transactionData);
      });

      return res.json({
        success: true,
        data: {
          reference: merchantRef,
          checkout_url: `https://hawai-topup.vercel.app/invoice.html?ref=${merchantRef}`,
        },
      });
    }

    const signature = crypto
      .createHmac("sha256", config.tripay.private_key)
      .update(config.tripay.merchant_code + merchantRef + amount)
      .digest("hex");

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount: parseInt(amount),
      customer_name: safeNickname,
      customer_email: "cust@email.com",
      customer_phone: customer_no,
      order_items: [
        { sku, name: productName, price: parseInt(amount), quantity: 1 },
      ],
      return_url: "https://hawai-topup.vercel.app/invoice.html",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayRes = await axios.post(
      `https://tripay.co.id/${TRIPAY_MODE}/transaction/create`,
      payload,
      { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
    );

    const data = tripayRes.data.data;

    await db
      .collection("transactions")
      .doc(data.reference)
      .set({
        ...transactionData,
        ref_id: data.reference,
        qr_url: data.qr_url,
        pay_code: data.pay_code,
        checkout_url: data.checkout_url,
      });

    res.json({ success: true, data: { ...data, ref_id: data.reference } });
  } catch (error) {
    console.error("Trx Error:", error.response?.data || error.message);
    const msg = error.response?.data?.message || error.message;
    res.status(500).json({ success: false, message: "Gagal: " + msg });
  }
});

// C. GET Detail Transaksi
app.get("/api/transaction/:ref", async (req, res) => {
  if (!db)
    return res.status(500).json({ success: false, message: "Database Error" });

  const { ref } = req.params;

  try {
    const doc = await db.collection("transactions").doc(ref).get();

    if (!doc.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Transaksi tidak ditemukan" });
    }

    res.json({ success: true, data: doc.data() });
  } catch (error) {
    console.error("Get Trx Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ==========================================
// 4. [PENTING] CALLBACK HANDLER & REWARD SYSTEM
// ==========================================
app.post("/api/callback", async (req, res) => {
  if (!db)
    return res.status(500).json({ success: false, message: "Database Error" });

  const config = await getConfig();

  const tripaySignature = req.headers["x-callback-signature"];
  const jsonBody = req.body;
  const hmac = crypto
    .createHmac("sha256", config.tripay.private_key)
    .update(JSON.stringify(jsonBody))
    .digest("hex");

  if (tripaySignature !== hmac) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid Signature" });
  }

  const { reference, status } = jsonBody;

  try {
    if (status === "PAID") {
      const trxRef = db.collection("transactions").doc(reference);
      const doc = await trxRef.get();

      if (doc.exists) {
        const data = doc.data();

        if (data.status === "PAID") {
          return res.json({ success: true, message: "Already Paid" });
        }

        await trxRef.update({
          status: "PAID",
          paid_at: Date.now(),
          last_update: Date.now(),
        });

        // REWARD SYSTEM
        if (data.type === "GAME_TOPUP" && data.user_uid) {
          const rewardPercent = config.point_reward_percent || 5;
          const points = Math.floor(
            parseInt(data.amount) * (rewardPercent / 100),
          );

          if (points > 0) {
            await db
              .collection("users")
              .doc(data.user_uid)
              .update({
                hawai_coins: admin.firestore.FieldValue.increment(points),
              });
          }
        }

        // DEPOSIT SYSTEM
        if (data.type === "DEPOSIT" && data.user_uid) {
          await db
            .collection("users")
            .doc(data.user_uid)
            .update({
              hawai_coins: admin.firestore.FieldValue.increment(
                parseInt(data.amount),
              ),
            });
        }
      }
    } else if (status === "EXPIRED" || status === "FAILED") {
      await db.collection("transactions").doc(reference).update({
        status: status,
        last_update: Date.now(),
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).json({ success: false });
  }
});

// ==========================================
// 5. PUBLIC ROUTES LAINNYA
// ==========================================

app.get("/api/init-data", async (req, res) => {
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
    const config = await getConfig();
    res.json({
      sliders: assets.sliders,
      banners: assets.banners,
      products,
      reward_percent: config.point_reward_percent,
    });
  } catch (e) {
    console.error(e);
    res.json({ sliders: [], banners: {}, products: [] });
  }
});

app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  try {
    const manualChannels = [
      {
        code: "HAWAI_COIN",
        name: "HAWAI Coin (Saldo Akun)",
        group: "Balance",
        icon_url: "https://cdn-icons-png.flaticon.com/512/8562/8562294.png",
        total_fee: { flat: 0, percent: 0 },
      },
    ];
    let tripayChannels = [];
    if (config.tripay.api_key) {
      const response = await axios.get(
        `https://tripay.co.id/${TRIPAY_MODE}/merchant/payment-channel`,
        { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
      );
      tripayChannels = response.data.data || [];
    }
    res.json({ success: true, data: [...manualChannels, ...tripayChannels] });
  } catch (error) {
    console.error("Channel Error:", error.message);
    res.json({ success: true, data: [] });
  }
});

app.post("/api/check-nickname", async (req, res) => {
  const { game, id, zone } = req.body;
  try {
    let apiUrl = "";
    if (game && game.toLowerCase().includes("mobile"))
      apiUrl = `https://api.isan.eu.org/nickname/ml?id=${id}&zone=${zone}`;
    else if (game && game.toLowerCase().includes("free"))
      apiUrl = `https://api.isan.eu.org/nickname/ff?id=${id}`;
    else return res.json({ success: true, name: "Gamer" });

    const response = await axios.get(apiUrl);
    if (response.data.success)
      return res.json({ success: true, name: response.data.name });
    return res.json({ success: false, message: "ID Tidak Ditemukan" });
  } catch (e) {
    res.json({ success: false, message: "Gagal Cek ID" });
  }
});

app.post("/api/auth/google", async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database Error" });
  const { idToken } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const name = decodedToken.name || "User";
    const picture = decodedToken.picture || "";
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      await userRef.set({
        uid,
        email,
        name,
        picture,
        hawai_coins: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await userRef.update({ name, picture, email });
    }
    const userData = (await userRef.get()).data();
    res.json({ success: true, user: userData });
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(401).json({ success: false, message: "Invalid Token" });
  }
});

app.get("/api/user/:uid", async (req, res) => {
  if (!db) return res.status(500).json({ message: "Database Error" });
  try {
    const userDoc = await db.collection("users").doc(req.params.uid).get();
    if (!userDoc.exists)
      return res.status(404).json({ message: "User not found" });
    res.json({ success: true, user: userDoc.data() });
  } catch (e) {
    res.status(500).json({ message: "Server Error" });
  }
});

// [LOGIN ADMIN DENGAN LOG]
app.post("/api/admin/login", async (req, res) => {
  const config = await getConfig();

  // Debug Log (Cek di Vercel Logs)
  console.log("Login Attempt:");
  console.log("- Input:", req.body.password);
  console.log("- Expected:", config.admin_password);
  console.log("- Source ENV:", process.env.ADMIN_PASSWORD ? "YES" : "NO");

  if (req.body.password === config.admin_password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// --- ADMIN FEATURES ---
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
      { cmd: "prepaid", username, sign },
    );

    if (!response.data || !Array.isArray(response.data.data)) {
      throw new Error("Respon Digiflazz Gagal");
    }

    const gameProducts = response.data.data.filter(
      (item) => item.category === "Games",
    );
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
          price_sell: item.price + 1000,
          image: "assets/default.png",
          is_active: false,
          is_promo: false,
        };
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

app.get("/api/admin/users", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    const snap = await db
      .collection("users")
      .orderBy("created_at", "desc")
      .get();
    const users = snap.docs.map((d) => d.data());
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/update-balance", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  const { uid, newBalance } = req.body;
  try {
    await db
      .collection("users")
      .doc(uid)
      .update({ hawai_coins: parseInt(newBalance) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

module.exports = app;
