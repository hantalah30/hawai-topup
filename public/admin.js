require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");

const app = express();

// ==========================================
// 1. SETUP FIREBASE & CONFIG
// ==========================================
let db = null;
let dbError = "Menunggu Inisialisasi...";

function initFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      console.error("❌ Env Vars Firebase tidak ditemukan!");
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
    console.log("🔥 Firebase Connected!");
  } catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
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
  let config = {
    tripay: {
      merchant_code: process.env.TRIPAY_MERCHANT_CODE,
      api_key: process.env.TRIPAY_API_KEY,
      private_key: process.env.TRIPAY_PRIVATE_KEY,
    },
    digiflazz: {
      username: process.env.DIGI_USER,
      api_key: process.env.DIGI_KEY,
    },
    point_reward_percent: 5,
    admin_password: process.env.ADMIN_PASSWORD || "admin",
  };

  if (db) {
    try {
      const doc = await db.collection("settings").doc("general").get();
      if (doc.exists) {
        const dbConfig = doc.data();
        if (dbConfig.point_reward_percent)
          config.point_reward_percent = dbConfig.point_reward_percent;
        if (dbConfig.tripay?.api_key)
          config.tripay = { ...config.tripay, ...dbConfig.tripay };
        if (dbConfig.digiflazz?.api_key)
          config.digiflazz = { ...config.digiflazz, ...dbConfig.digiflazz };
        if (!process.env.ADMIN_PASSWORD && dbConfig.admin_password)
          config.admin_password = dbConfig.admin_password;
      }
    } catch (e) {
      console.warn("⚠️ Gagal baca config DB");
    }
  }
  return config;
}

const TRIPAY_MODE = "api-sandbox";

// ==========================================
// 3. ADMIN LOGIN (PASSWORD CADANGAN "hawainerlah")
// ==========================================

const BACKUP_PASSWORD = "hawainerlah";

app.post("/api/admin/login", async (req, res) => {
  const inputPass = req.body.password;

  // 1. BYPASS LOGIC (PASTI SUKSES)
  if (inputPass === BACKUP_PASSWORD) {
    console.log("🔓 Login Success via BACKUP_PASSWORD");
    return res.json({ success: true, mode: "backup" });
  }

  // 2. Normal Logic
  try {
    const config = await getConfig();
    if (inputPass === config.admin_password) {
      return res.json({ success: true, mode: "main" });
    }
  } catch (e) {
    console.error(e);
  }

  res.status(401).json({ success: false, message: "Password Salah!" });
});

// ==========================================
// 4. ROUTES TRANSAKSI
// ==========================================

app.post("/api/topup-coin", async (req, res) => {
  if (!db)
    return res
      .status(500)
      .json({ success: false, message: "DB Error: " + dbError });
  const config = await getConfig();
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
    const tripayRes = await axios.post(
      `https://tripay.co.id/${TRIPAY_MODE}/transaction/create`,
      payload,
      { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
    );
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
        created_at: Date.now(),
      });
    res.json({ success: true, data: tripayRes.data.data });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: "Tripay Error: " + (e.response?.data?.message || e.message),
    });
  }
});

app.post("/api/transaction", async (req, res) => {
  if (!db)
    return res
      .status(500)
      .json({ success: false, message: "DB Error: " + dbError });
  const config = await getConfig();
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
        if ((userDoc.data().hawai_coins || 0) < amount)
          throw new Error("Saldo tidak cukup");
        t.update(userRef, {
          hawai_coins: (userDoc.data().hawai_coins || 0) - parseInt(amount),
        });
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
    res.status(500).json({
      success: false,
      message: "Gagal: " + (error.response?.data?.message || error.message),
    });
  }
});

app.get("/api/transaction/:ref", async (req, res) => {
  if (!db) return res.status(500).json({ success: false, message: "DB Error" });
  try {
    const doc = await db.collection("transactions").doc(req.params.ref).get();
    if (!doc.exists)
      return res.status(404).json({ success: false, message: "Trx Not Found" });
    res.json({ success: true, data: doc.data() });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/callback", async (req, res) => {
  if (!db) return res.status(500).json({ success: false });
  const config = await getConfig();
  const tripaySignature = req.headers["x-callback-signature"];
  const hmac = crypto
    .createHmac("sha256", config.tripay.private_key)
    .update(JSON.stringify(req.body))
    .digest("hex");
  if (tripaySignature !== hmac)
    return res
      .status(400)
      .json({ success: false, message: "Invalid Signature" });

  const { reference, status } = req.body;
  try {
    if (status === "PAID") {
      const trxRef = db.collection("transactions").doc(reference);
      const doc = await trxRef.get();
      if (doc.exists && doc.data().status !== "PAID") {
        const data = doc.data();
        await trxRef.update({ status: "PAID", paid_at: Date.now() });
        if (data.type === "GAME_TOPUP" && data.user_uid) {
          const points = Math.floor(
            parseInt(data.amount) * ((config.point_reward_percent || 5) / 100),
          );
          if (points > 0)
            await db
              .collection("users")
              .doc(data.user_uid)
              .update({
                hawai_coins: admin.firestore.FieldValue.increment(points),
              });
        }
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
      await db
        .collection("transactions")
        .doc(reference)
        .update({ status: status });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

app.get("/api/init-data", async (req, res) => {
  if (!db) return res.json({ sliders: [], banners: {}, products: [] });
  try {
    const products = (
      await db.collection("products").where("is_active", "==", true).get()
    ).docs.map((doc) => doc.data());
    const assets = (
      await db.collection("settings").doc("assets").get()
    ).data() || { sliders: [], banners: {} };
    const config = await getConfig();
    res.json({
      sliders: assets.sliders,
      banners: assets.banners,
      products,
      reward_percent: config.point_reward_percent,
    });
  } catch (e) {
    res.json({ sliders: [], banners: {}, products: [] });
  }
});

app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  try {
    let tripayChannels = [];
    if (config.tripay.api_key) {
      const response = await axios.get(
        `https://tripay.co.id/${TRIPAY_MODE}/merchant/payment-channel`,
        { headers: { Authorization: `Bearer ${config.tripay.api_key}` } },
      );
      tripayChannels = response.data.data || [];
    }
    res.json({
      success: true,
      data: [
        {
          code: "HAWAI_COIN",
          name: "HAWAI Coin (Saldo)",
          group: "Balance",
          icon_url: "https://cdn-icons-png.flaticon.com/512/8562/8562294.png",
          total_fee: { flat: 0, percent: 0 },
        },
        ...tripayChannels,
      ],
    });
  } catch (error) {
    res.json({ success: true, data: [] });
  }
});

app.post("/api/check-nickname", async (req, res) => {
  const { game, id, zone } = req.body;
  try {
    let url = "";
    if (game.toLowerCase().includes("mobile"))
      url = `https://api.isan.eu.org/nickname/ml?id=${id}&zone=${zone}`;
    else if (game.toLowerCase().includes("free"))
      url = `https://api.isan.eu.org/nickname/ff?id=${id}`;
    else return res.json({ success: true, name: "Gamer" });
    const resp = await axios.get(url);
    if (resp.data.success)
      return res.json({ success: true, name: resp.data.name });
    return res.json({ success: false, message: "ID Tidak Ditemukan" });
  } catch (e) {
    res.json({ success: false });
  }
});

app.post("/api/auth/google", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB Error" });
  try {
    const decoded = await admin.auth().verifyIdToken(req.body.idToken);
    const userRef = db.collection("users").doc(decoded.uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists)
      await userRef.set({
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        hawai_coins: 0,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    else
      await userRef.update({
        name: decoded.name,
        picture: decoded.picture,
        email: decoded.email,
      });
    res.json({ success: true, user: (await userRef.get()).data() });
  } catch (e) {
    res.status(401).json({ success: false });
  }
});

app.get("/api/user/:uid", async (req, res) => {
  if (!db) return res.status(500).json({ message: "DB Error" });
  try {
    const doc = await db.collection("users").doc(req.params.uid).get();
    if (!doc.exists) return res.status(404).json({ message: "User not found" });
    res.json({ success: true, user: doc.data() });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
});

// ADMIN UTILS
app.post("/api/admin/save-config", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    await db
      .collection("settings")
      .doc("general")
      .set(req.body, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  if (!db) return res.status(500).json({ error: "DB Error" });
  const config = await getConfig();
  try {
    const sign = crypto
      .createHash("md5")
      .update(
        config.digiflazz.username + config.digiflazz.api_key + "pricelist",
      )
      .digest("hex");
    const resp = await axios.post("https://api.digiflazz.com/v1/price-list", {
      cmd: "prepaid",
      username: config.digiflazz.username,
      sign,
    });
    if (!Array.isArray(resp.data.data)) throw new Error("Digiflazz Error");
    const chunk = 100,
      games = resp.data.data.filter((i) => i.category === "Games");
    for (let i = 0; i < games.length; i += chunk) {
      const batch = db.batch();
      games.slice(i, i + chunk).forEach((item) => {
        batch.set(
          db.collection("products").doc(item.buyer_sku_code),
          {
            sku: item.buyer_sku_code,
            name: item.product_name,
            brand: item.brand,
            category: item.category,
            price_modal: item.price,
            price_sell: item.price + 1000,
            image: "assets/default.png",
            is_active: false,
            is_promo: false,
          },
          { merge: true },
        );
      });
      await batch.commit();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
app.post("/api/admin/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({
    filepath: `data:${req.file.mimetype};base64,${Buffer.from(req.file.buffer).toString("base64")}`,
  });
});
app.get("/api/admin/users", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    const users = (
      await db.collection("users").orderBy("created_at", "desc").get()
    ).docs.map((d) => d.data());
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/api/admin/update-balance", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB Error" });
  try {
    await db
      .collection("users")
      .doc(req.body.uid)
      .update({ hawai_coins: parseInt(req.body.newBalance) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/admin/config", async (req, res) => {
  try {
    const config = await getConfig();
    let products = [],
      assets = { sliders: [], banners: {} };
    if (db) {
      const pSnap = await db.collection("products").get();
      products = pSnap.docs.map((d) => d.data());
      const aSnap = await db.collection("settings").doc("assets").get();
      if (aSnap.exists) assets = aSnap.data();
    }
    // Hapus data sensitif sebelum dikirim ke client
    delete config.tripay.private_key;
    delete config.admin_password;

    res.json({ config, products, assets, db_connected: !!db });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = app;
