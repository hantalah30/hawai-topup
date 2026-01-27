require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

const app = express();

// ==========================================
// 1. SETUP FIREBASE (Menggunakan Versi Lama - Lebih Robust)
// ==========================================
let db = null;
let dbError = "Menunggu Inisialisasi...";

function initFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      // Silent fail allowed but logged, preventing crash
      console.warn("⚠️ Env Vars Belum Lengkap (Cek ProjectID, Email, Key)");
      return;
    }

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
    dbError = null;
    console.log("🔥 Firebase App Initialized & Connected");
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

// --- Helper Config (Digabung: Tambah Reward Percent) ---
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
    point_reward_percent: 5, // Default reward 5% (Fitur Baru)
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
        if (dbConfig.point_reward_percent)
          config.point_reward_percent = dbConfig.point_reward_percent;
      }
    } catch (e) {
      console.warn("Gagal baca config DB:", e.message);
    }
  }
  return config;
}

// ==========================================
// 3. AUTH ROUTES
// ==========================================

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
        hawai_coins: 0, // Saldo Awal (Fitur Baru)
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Update info login, tapi jangan reset saldo
      await userRef.update({ name, picture, email });
    }

    const userData = (await userRef.get()).data();
    res.json({ success: true, user: userData });
  } catch (error) {
    console.error("Auth Error:", error);
    res.status(401).json({ success: false, message: "Invalid Token" });
  }
});

// Get User Data (Refresh Balance)
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

// ==========================================
// 4. PUBLIC ROUTES
// ==========================================

app.get("/api/status", async (req, res) => {
  let connectionTest = "Untested";
  let realError = dbError;
  if (db) {
    try {
      await db.collection("settings").limit(1).get();
      connectionTest = "SUCCESS: Read/Write OK";
    } catch (e) {
      connectionTest = "FAILED: " + e.message;
      realError = e.message;
    }
  }
  res.json({
    status: "Online",
    firebase_init: db ? "OK" : "FAILED",
    firebase_connection: connectionTest,
    error_detail: realError,
  });
});

// Init Data (Digabung: Kirim reward_percent)
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
      reward_percent: config.point_reward_percent, // Info untuk Frontend
    });
  } catch (e) {
    console.error(e);
    res.json({ sliders: [], banners: {}, products: [] });
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

app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  const coinChannel = {
    code: "HAWAI_COIN",
    name: "HAWAI Coin (Saldo)",
    group: "Balance",
    icon_url: "https://cdn-icons-png.flaticon.com/512/8562/8562294.png",
    total_fee: { flat: 0, percent: 0 },
  };

  try {
    if (!config.tripay.api_key) throw new Error("No Key");

    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
    );
    res.json({ success: true, data: [coinChannel, ...response.data.data] });
  } catch (error) {
    console.error("Channel Error:", error.message);
    res.json({ success: true, data: [coinChannel] });
  }
});

// --- FITUR BARU: Endpoint Khusus Topup Coin (Deposit) ---
app.post("/api/topup-coin", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB Error" });
  const config = await getConfig();
  const { amount, method, user_uid, user_name } = req.body;
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  if (!user_uid) return res.status(400).json({ message: "Login Required" });

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
      customer_name: user_name,
      customer_email: "user@hawai.com",
      customer_phone: "08123456789",
      order_items: [
        {
          sku: "DEPOSIT_COIN",
          name: "Topup HAWAI Coin",
          price: amount,
          quantity: 1,
        },
      ],
      return_url: "https://hawai-topup.vercel.app/",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayRes = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      {
        headers: { Authorization: `Bearer ${config.tripay.api_key}` },
      },
    );

    // Simpan Transaksi Deposit
    await db.collection("transactions").doc(tripayRes.data.data.reference).set({
      ref_id: tripayRes.data.data.reference,
      merchant_ref: merchantRef,
      type: "DEPOSIT", // Penanda ini Deposit Saldo
      user_uid: user_uid,
      amount: amount,
      method: method,
      status: "UNPAID",
      checkout_url: tripayRes.data.data.checkout_url,
      created_at: Date.now(),
    });

    res.json({ success: true, data: tripayRes.data.data });
  } catch (e) {
    console.error("Topup Coin Error:", e.response?.data || e.message);
    res.status(500).json({ message: "Gagal Topup Coin" });
  }
});

// --- TRANSAKSI UTAMA (Game & Voucher) ---
app.post("/api/transaction", async (req, res) => {
  if (!db)
    return res.status(500).json({ message: "Database Error: " + dbError });

  const config = await getConfig();
  const { sku, amount, customer_no, method, nickname, game, user_uid } =
    req.body;
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";

  try {
    const productDoc = await db.collection("products").doc(sku).get();
    const productName = productDoc.exists
      ? productDoc.data().name
      : "Item Game";
    const merchantRef =
      "INV-" + Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 100);

    // --- PEMBAYARAN VIA HAWAI COIN ---
    if (method === "HAWAI_COIN") {
      if (!user_uid) return res.status(400).json({ message: "Harus Login!" });

      await db.runTransaction(async (t) => {
        const userRef = db.collection("users").doc(user_uid);
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) throw new Error("User Missing");

        const userData = userDoc.data();
        if ((userData.hawai_coins || 0) < amount)
          throw new Error("Saldo HAWAI Coin Kurang");

        // Potong Saldo
        t.update(userRef, {
          hawai_coins: admin.firestore.FieldValue.increment(-amount),
        });

        // Simpan Transaksi Langsung PAID
        t.set(db.collection("transactions").doc(merchantRef), {
          ref_id: merchantRef,
          merchant_ref: merchantRef,
          type: "GAME_TOPUP",
          game,
          productName,
          user_id: customer_no,
          user_uid, // UID pembeli
          amount,
          method,
          status: "PAID",
          created_at: Date.now(),
        });
      });

      // TODO: Panggil API Digiflazz disini (atau via worker lain)
      return res.json({
        success: true,
        data: {
          checkout_url: `https://hawai-topup.vercel.app/invoice.html?ref=${merchantRef}`,
        },
      });
    }

    // --- PEMBAYARAN VIA TRIPAY ---
    const signature = crypto
      .createHmac("sha256", config.tripay.private_key)
      .update(config.tripay.merchant_code + merchantRef + amount)
      .digest("hex");

    const payload = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: nickname || "Guest",
      customer_email: "guest@email.com",
      customer_phone: customer_no,
      order_items: [{ sku, name: productName, price: amount, quantity: 1 }],
      return_url: "https://hawai-topup.vercel.app/invoice.html",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayRes = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
    );

    await db
      .collection("transactions")
      .doc(tripayRes.data.data.reference)
      .set({
        ref_id: tripayRes.data.data.reference,
        merchant_ref: merchantRef,
        type: "GAME_TOPUP",
        game,
        productName,
        user_id: customer_no,
        user_uid: user_uid || null, // Simpan UID jika login (untuk reward nanti)
        amount,
        method,
        status: "UNPAID",
        checkout_url: tripayRes.data.data.checkout_url,
        qr_url: tripayRes.data.data.qr_url, // Simpan QR jika ada
        pay_code: tripayRes.data.data.pay_code, // Simpan Paycode jika ada
        created_at: Date.now(),
      });

    res.json({ success: true, data: tripayRes.data.data });
  } catch (error) {
    console.error("Trx Error:", error.response?.data || error.message);
    res
      .status(500)
      .json({ success: false, message: error.message || "Gagal Transaksi" });
  }
});

// --- HELPER UNTUK CALLBACK TRIPAY (Perlu dipanggil di rute callback) ---
async function handleTransactionSuccess(trxData) {
  if (!trxData.user_uid) return;

  const userRef = db.collection("users").doc(trxData.user_uid);

  // CASE 1: Deposit Saldo -> Tambah Coin
  if (trxData.type === "DEPOSIT") {
    await userRef.update({
      hawai_coins: admin.firestore.FieldValue.increment(trxData.amount),
    });
  }
  // CASE 2: Beli Game -> Kasih Poin Reward
  else if (trxData.type === "GAME_TOPUP") {
    const config = await getConfig();
    const points = Math.floor(
      trxData.amount * (config.point_reward_percent / 100),
    );
    if (points > 0) {
      await userRef.update({
        hawai_coins: admin.firestore.FieldValue.increment(points),
      });
    }
  }
}
// Note: Anda perlu membuat endpoint callback Tripay yang memanggil fungsi di atas saat status = 'PAID'

// ==========================================
// 5. ADMIN ROUTES (Digabung Lengkap)
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

app.post("/api/admin/save-config", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Init Failed: " + dbError });
  try {
    await db
      .collection("settings")
      .doc("general")
      .set(req.body, { merge: true });
    res.json({ success: true });
  } catch (e) {
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

// --- ADMIN FITUR BARU: Manajemen User ---
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

// --- ADMIN: SYNC DIGIFLAZZ (Robust Version) ---
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

    if (!response.data || !Array.isArray(response.data.data)) {
      const errMsg = JSON.stringify(response.data);
      console.error("Digiflazz Error Respon:", errMsg);
      throw new Error("Respon Digiflazz Gagal: " + errMsg);
    }

    const digiProducts = response.data.data;
    const gameProducts = digiProducts.filter(
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

module.exports = app;
