require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const multer = require("multer");
const admin = require("firebase-admin");
const path = require("path");

// --- 1. INISIALISASI FIREBASE ---
// --- 1. INISIALISASI FIREBASE ---

let serviceAccount;

// Cek apakah ada Environment Variable dari Railway?
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // Jika ada, parse JSON string-nya
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Gagal parsing FIREBASE_SERVICE_ACCOUNT:", e);
  }
} else {
  // Jika tidak ada (sedang di local), cari file-nya
  try {
    serviceAccount = require("./service-account.json");
  } catch (e) {
    console.error(
      "File service-account.json tidak ditemukan dan Env Var kosong.",
    );
  }
}

// Pastikan serviceAccount ada isinya sebelum init
if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.error("CRITICAL ERROR: Firebase Config Missing!");
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
// Limit diperbesar karena kita kirim gambar base64 yang ukurannya besar
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, ".")));

// Multer (Simpan di Memory RAM untuk dikonversi ke Base64)
const upload = multer({ storage: multer.memoryStorage() });

// --- HELPER FUNCTIONS ---

// Ambil Config dari Firestore (Collection: 'settings', Doc: 'general')
async function getConfig() {
  const doc = await db.collection("settings").doc("general").get();
  if (!doc.exists) {
    // Default Config jika belum ada di database
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
}

// --- PUBLIC API ENDPOINTS ---

// 1. Get Data Awal (Produk Aktif, Slider, Banner)
app.get("/api/init-data", async (req, res) => {
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
    console.error(e);
    res.status(500).json({ error: "Gagal memuat data" });
  }
});

// 2. Cek Nickname Game (Proxy ke API Isan)
app.post("/api/check-nickname", async (req, res) => {
  const { game, id, zone } = req.body;
  try {
    let apiUrl = "";
    let response;

    if (game.toLowerCase().includes("mobile")) {
      apiUrl = `https://api.isan.eu.org/nickname/ml?id=${id}&zone=${zone}`;
      response = await axios.get(apiUrl);
      if (response.data.success) {
        return res.json({ success: true, name: response.data.name });
      }
    } else if (game.toLowerCase().includes("free")) {
      apiUrl = `https://api.isan.eu.org/nickname/ff?id=${id}`;
      response = await axios.get(apiUrl);
      if (response.data.success) {
        return res.json({ success: true, name: response.data.name });
      }
    }

    return res.json({ success: false, message: "ID Tidak Ditemukan" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal cek ID" });
  }
});

// 3. Ambil Channel Pembayaran Tripay
app.get("/api/channels", async (req, res) => {
  const config = await getConfig();
  const mode = "api-sandbox"; // Ubah ke 'api' jika production

  try {
    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      {
        headers: { Authorization: "Bearer " + config.tripay.api_key },
      },
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ success: false, data: [] });
  }
});

// 4. Buat Transaksi
app.post("/api/transaction", async (req, res) => {
  const config = await getConfig();
  const { sku, amount, customer_no, method, nickname, game } = req.body;
  const mode = "api-sandbox";

  // Validasi Produk di Database (Untuk ambil nama asli)
  const productDoc = await db.collection("products").doc(sku).get();
  const productName = productDoc.exists ? productDoc.data().name : "Topup Game";

  const merchantRef = "INV-" + Math.floor(Math.random() * 100000) + Date.now();
  const signature = crypto
    .createHmac("sha256", config.tripay.private_key)
    .update(config.tripay.merchant_code + merchantRef + amount)
    .digest("hex");

  try {
    const payload = {
      method,
      merchant_ref: merchantRef,
      amount,
      customer_name: nickname || "Gamer",
      customer_email: "user@example.com",
      customer_phone: customer_no,
      order_items: [{ sku, name: productName, price: amount, quantity: 1 }],
      return_url: "https://websitekamu.com", // Ganti domain kamu nanti
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature,
    };

    const tripayRes = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      { headers: { Authorization: "Bearer " + config.tripay.api_key } },
    );

    const data = tripayRes.data.data;

    // Simpan Transaksi ke Firestore
    await db.collection("transactions").doc(data.reference).set({
      ref_id: data.reference,
      merchant_ref: merchantRef,
      game: game,
      product_name: productName,
      nickname: nickname,
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

// 5. Cek Status Transaksi (Realtime ke Tripay)
app.get("/api/transaction/:ref", async (req, res) => {
  const ref = req.params.ref;
  const config = await getConfig();
  const mode = "api-sandbox";

  try {
    const docRef = db.collection("transactions").doc(ref);
    const doc = await docRef.get();

    if (!doc.exists)
      return res.status(404).json({ success: false, message: "Not Found" });

    let transaction = doc.data();

    // Jika belum lunas, cek ke Tripay
    if (transaction.status === "UNPAID") {
      try {
        const tripayDetail = await axios.get(
          `https://tripay.co.id/${mode}/transaction/detail?reference=${ref}`,
          {
            headers: { Authorization: "Bearer " + config.tripay.api_key },
          },
        );

        const remoteStatus = tripayDetail.data.data.status;

        if (remoteStatus !== transaction.status) {
          // Update Status di Firestore
          await docRef.update({ status: remoteStatus });
          transaction.status = remoteStatus;

          // --- TODO: PROSES KE DIGIFLAZZ JIKA PAID ---
          // if (remoteStatus === 'PAID') { await processDigiflazz(transaction); }
        }
      } catch (err) {
        console.log("Cek Tripay Gagal, gunakan data lokal.");
      }
    }

    res.json({ success: true, data: transaction });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// --- ADMIN API ENDPOINTS ---

// Login Admin
app.post("/api/admin/login", async (req, res) => {
  const config = await getConfig();
  if (req.body.password === config.admin_password) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// Get Config Admin
app.get("/api/admin/config", async (req, res) => {
  const config = await getConfig();

  // Ambil semua produk (termasuk yg tidak aktif)
  const productsSnap = await db.collection("products").get();
  const products = productsSnap.docs.map((doc) => doc.data());

  // Ambil Assets
  const assetsDoc = await db.collection("settings").doc("assets").get();
  const assets = assetsDoc.exists
    ? assetsDoc.data()
    : { sliders: [], banners: {} };

  res.json({
    config: config,
    products: products,
    assets: assets,
  });
});

// Simpan Config API
app.post("/api/admin/save-config", async (req, res) => {
  // Simpan ke collection 'settings', doc 'general'
  await db.collection("settings").doc("general").set(req.body, { merge: true });
  res.json({ success: true });
});

// UPLOAD GAMBAR -> BASE64 (Database)
app.post("/api/admin/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).send("No file.");

  // Convert Buffer ke Base64 Data URI
  // Format: data:image/png;base64,.....
  const b64 = Buffer.from(req.file.buffer).toString("base64");
  const dataURI = `data:${req.file.mimetype};base64,${b64}`;

  // Kirim string ini ke frontend, nanti frontend yang akan menyimpannya
  // bersamaan dengan data produk saat klik "Simpan".
  res.json({ filepath: dataURI });
});

// Simpan Produk (Bulk)
app.post("/api/admin/save-products", async (req, res) => {
  const products = req.body; // Array of products
  const batch = db.batch();

  products.forEach((prod) => {
    // Gunakan SKU sebagai ID Dokumen agar unik
    if (prod.sku) {
      const ref = db.collection("products").doc(prod.sku);
      batch.set(ref, prod);
    }
  });

  await batch.commit();
  res.json({ success: true });
});

// Simpan Assets (Slider & Banner)
app.post("/api/admin/save-assets", async (req, res) => {
  await db.collection("settings").doc("assets").set(req.body);
  res.json({ success: true });
});

// Sync Digiflazz
app.post("/api/admin/sync-digiflazz", async (req, res) => {
  const config = await getConfig();
  const { username, api_key } = config.digiflazz;

  if (!username || !api_key)
    return res.status(400).json({ message: "Set API Key dulu!" });

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
    const batch = db.batch();
    let count = 0;

    // Ambil data lama dulu untuk cek gambar/markup
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
          name: item.product_name, // Update nama dari pusat
          brand: item.brand,
          category: item.category,
          price_modal: item.price,
          // Pertahankan data lama jika ada
          markup: oldItem ? oldItem.markup || 0 : 0,
          price_sell: oldItem ? item.price + (oldItem.markup || 0) : item.price,
          image: oldItem
            ? oldItem.image || "assets/default.png"
            : "assets/default.png",
          is_active: oldItem ? oldItem.is_active : false,
          // Penanda promo
          is_promo: oldItem ? oldItem.is_promo || false : false,
        };

        const ref = db.collection("products").doc(sku);
        batch.set(ref, newData);
        count++;
      }
    });

    await batch.commit();
    res.json({ success: true, message: `Berhasil sync ${count} produk!` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal Sync Digiflazz" });
  }
});

// Hapus Semua Produk
app.post("/api/admin/delete-all-products", async (req, res) => {
  const snap = await db.collection("products").get();
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});
