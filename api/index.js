require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

const app = express();

// ==========================================
// 1. SETUP FIREBASE (BULLETPROOF KEY PARSING)
// ==========================================
if (!admin.apps.length) {
  try {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (privateKey) {
      // 1. Hapus tanda kutip ganda di awal/akhir jika ada (karena copy-paste dari JSON)
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }

      // 2. Ganti karakter literal "\n" menjadi Enter/Baris Baru yang asli
      privateKey = privateKey.replace(/\\n/g, "\n");
    }

    if (
      process.env.FIREBASE_PROJECT_ID &&
      privateKey &&
      process.env.FIREBASE_CLIENT_EMAIL
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      console.log("🔥 Firebase Connected Successfully!");
    } else {
      console.warn("⚠️ Firebase Config Missing/Incomplete in Env Vars");
      // Debugging: Cek variable mana yang hilang (Jangan log Private Key asli!)
      console.log("Check:", {
        ProjectId: !!process.env.FIREBASE_PROJECT_ID,
        Email: !!process.env.FIREBASE_CLIENT_EMAIL,
        KeyLength: privateKey ? privateKey.length : 0,
      });
    }
  } catch (error) {
    console.error("❌ Firebase Init Error:", error);
  }
}

// Inisialisasi DB (Pastikan tidak null sebelum dipakai)
const db = admin.apps.length ? admin.firestore() : null;

// ==========================================
// 2. MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================
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
      console.log("⚠️ Gagal baca DB settings, pakai default.");
    }
  }
  return config;
}

// ==========================================
// 4. PUBLIC ROUTES
// ==========================================

// Cek Status Server & Database (PENTING BUAT DEBUGGING)
app.get("/api/status", async (req, res) => {
  const config = await getConfig();
  res.json({
    status: "Online",
    server_time: new Date().toISOString(),
    firebase_status: db ? "Connected" : "Disconnected (Check Env Vars)",
    tripay_status: config.tripay.api_key ? "Configured" : "Missing API Key",
  });
});

app.get("/api/init-data", async (req, res) => {
  if (!db)
    return res
      .status(500)
      .json({ error: "Database Disconnected. Check /api/status" });
  try {
    const productsSnap = await db
      .collection("products")
      .where("is_active", "==", true)
      .get();
    const products = productsSnap.docs.map((doc) => doc.data());

    let assets = { sliders: [], banners: {} };
    try {
      const assetsDoc = await db.collection("settings").doc("assets").get();
      if (assetsDoc.exists) assets = assetsDoc.data();
    } catch (e) {}

    res.json({
      sliders: assets.sliders || [],
      banners: assets.banners || {},
      products,
    });
  } catch (e) {
    res.status(500).json({ error: "Server Error Fetching Data" });
  }
});

app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  const mode = process.env.NODE_ENV === "production" ? "api" : "api-sandbox";
  try {
    if (!config.tripay.api_key) throw new Error("Tripay API Key Missing");
    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      {
        headers: { Authorization: `Bearer ${config.tripay.api_key}` },
      },
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ success: false, data: [] });
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

    if (apiUrl) {
      const response = await axios.get(apiUrl);
      if (response.data.success)
        return res.json({ success: true, name: response.data.name });
    }
    return res.json({ success: false, message: "ID Tidak Ditemukan" });
  } catch (e) {
    res.json({ success: false, message: "Gagal Cek ID" });
  }
});

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
      customer_email: "cust@email.com",
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
    res.status(500).json({ success: false, message: "Gagal Transaksi" });
  }
});

// ==========================================
// 5. ADMIN ROUTES (BACKOFFICE)
// ==========================================

app.post("/api/admin/login", async (req, res) => {
  const config = await getConfig();
  if (req.body.password === config.admin_password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

app.get("/api/admin/config", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    const config = await getConfig();
    const productsSnap = await db.collection("products").get();
    const products = productsSnap.docs.map((doc) => doc.data());

    let assets = { sliders: [], banners: {} };
    try {
      const assetsDoc = await db.collection("settings").doc("assets").get();
      if (assetsDoc.exists) assets = assetsDoc.data();
    } catch (e) {}

    res.json({ config, products, assets });
  } catch (e) {
    console.error("Fetch Admin Error:", e);
    res.status(500).json({ error: "Gagal load data" });
  }
});

app.post("/api/admin/save-config", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database Disconnected" });
  try {
    await db
      .collection("settings")
      .doc("general")
      .set(req.body, { merge: true });
    res.json({ success: true });
  } catch (e) {
    console.error("Save Config Error:", e);
    res.status(500).json({ error: "Gagal simpan config" });
  }
});

app.post("/api/admin/save-products", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database Disconnected" });
  try {
    const products = req.body;
    const batch = db.batch();
    products.forEach((p) => {
      const ref = db.collection("products").doc(p.sku);
      batch.set(ref, p);
    });
    await batch.commit();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal simpan produk" });
  }
});

app.post("/api/admin/save-assets", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database Disconnected" });
  try {
    await db.collection("settings").doc("assets").set(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal simpan assets" });
  }
});

app.post("/api/admin/sync-digiflazz", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database Disconnected" });

  const config = await getConfig();
  const { username, api_key } = config.digiflazz;

  if (!username || !api_key) {
    return res
      .status(400)
      .json({ message: "Username/Key Digiflazz Kosong! Cek Config." });
  }

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
    if (!digiProducts) throw new Error("Digiflazz Response Empty");

    const batch = db.batch();
    let count = 0;

    const oldDataSnap = await db.collection("products").get();
    const oldDataMap = {};
    oldDataSnap.forEach((doc) => {
      oldDataMap[doc.id] = doc.data();
    });

    digiProducts.forEach((item) => {
      if (item.category === "Games") {
        const sku = item.buyer_sku_code;
        const oldItem = oldDataMap[sku];
        const newData = {
          sku: sku,
          name: item.product_name,
          brand: item.brand,
          category: item.category,
          price_modal: item.price,
          markup: oldItem ? oldItem.markup || 0 : 0,
          price_sell: oldItem ? item.price + (oldItem.markup || 0) : item.price,
          image: oldItem
            ? oldItem.image || "assets/default.png"
            : "assets/default.png",
          is_active: oldItem ? oldItem.is_active : false,
          is_promo: oldItem ? oldItem.is_promo || false : false,
        };
        const ref = db.collection("products").doc(sku);
        batch.set(ref, newData);
        count++;
      }
    });

    await batch.commit();
    res.json({ success: true, message: `Sukses Sync ${count} Produk!` });
  } catch (error) {
    console.error("Digi Sync Error:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Gagal Koneksi Digiflazz" });
  }
});

app.post("/api/admin/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const b64 = Buffer.from(req.file.buffer).toString("base64");
  const dataURI = `data:${req.file.mimetype};base64,${b64}`;
  res.json({ filepath: dataURI });
});

module.exports = app;
