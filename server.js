const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = 3000;

// --- MIDDLEWARE PENTING (Agar server bisa baca JSON) ---
app.use(cors());
app.use(express.json()); // Pengganti body-parser
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, ".")));

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "assets/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage: storage });

const DB_FILE = "./database.json";

// --- AUTO GENERATE DATABASE ---
if (!fs.existsSync(DB_FILE)) {
  console.log("⚠️ Database tidak ditemukan. Membuat database.json baru...");
  const initialData = {
    config: {
      tripay: { merchant_code: "", api_key: "", private_key: "" },
      digiflazz: { username: "", api_key: "" },
      admin_password: "admin", // Password Default
    },
    assets: { sliders: [], banners: {} },
    products: [],
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  console.log("✅ Database dibuat! Password admin default: 'admin'");
} else {
  // Migrasi: Pastikan ada array transactions di DB lama
  const db = getDB();
  if (!db.transactions) {
    db.transactions = [];
    saveDB(db);
  }
}

function getDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- API LOGIN (DENGAN DEBUG LOG) ---
app.post("/api/admin/login", (req, res) => {
  const db = getDB();
  const inputPass = req.body.password;
  const realPass = db.config.admin_password;

  console.log("-----------------------------------------");
  console.log("📡 Menerima Request Login...");
  console.log("🔑 Password yang diketik :", inputPass);
  console.log("💾 Password di Database  :", realPass);

  if (!inputPass) {
    console.log("❌ ERROR: Password kosong/tidak terbaca oleh server.");
    return res.status(400).json({ success: false, message: "Input Kosong" });
  }

  if (inputPass === realPass) {
    console.log("✅ LOGIN SUKSES!");
    res.json({ success: true });
  } else {
    console.log("⛔ LOGIN GAGAL: Password salah.");
    res.status(401).json({ success: false, message: "Password Salah" });
  }
  console.log("-----------------------------------------");
});

// --- API LAINNYA ---
app.get("/api/init-data", (req, res) => {
  const db = getDB();
  const activeProducts = db.products.filter((p) => p.is_active);
  res.json({
    sliders: db.assets.sliders,
    products: activeProducts,
    banners: db.assets.banners,
  });
});

app.get("/api/admin/config", (req, res) => {
  res.json(getDB());
});

app.post("/api/admin/save-config", (req, res) => {
  const db = getDB();
  db.config = { ...db.config, ...req.body };
  saveDB(db);
  res.json({ success: true });
});

app.post("/api/admin/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).send("No file.");
  res.json({ filepath: `assets/${req.file.filename}` });
});

app.post("/api/admin/save-products", (req, res) => {
  const db = getDB();
  db.products = req.body;
  saveDB(db);
  res.json({ success: true });
});

app.post("/api/admin/save-assets", (req, res) => {
  const db = getDB();
  db.assets = req.body;
  saveDB(db);
  res.json({ success: true });
});

// --- UPDATE SYNC LOGIC (LEBIH RAPI) ---
app.post("/api/admin/sync-digiflazz", async (req, res) => {
  const db = getDB();
  const { username, api_key } = db.config.digiflazz;

  if (!username || !api_key)
    return res
      .status(400)
      .json({ success: false, message: "Set API Key dulu!" });

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
    let newProductList = [...db.products]; // Mulai dengan data lama agar settingan user ga hilang

    digiProducts.forEach((digiItem) => {
      // Filter: Hanya ambil kategori GAME agar tidak campur dengan pulsa/token
      if (digiItem.category !== "Games") return;

      // Cari produk yang sudah ada berdasarkan SKU
      const index = newProductList.findIndex(
        (p) => p.sku === digiItem.buyer_sku_code,
      );

      if (index !== -1) {
        // UPDATE HARGA MODAL SAJA (JANGAN TIMPA GAMBAR/MARKUP USER)
        newProductList[index].price_modal = digiItem.price;
        newProductList[index].name = digiItem.product_name; // Update nama jaga-jaga ada revisi pusat
        // Update harga jual otomatis jika markup ada
        if (newProductList[index].markup) {
          newProductList[index].price_sell =
            digiItem.price + newProductList[index].markup;
        }
      } else {
        // PRODUK BARU
        newProductList.push({
          sku: digiItem.buyer_sku_code,
          name: digiItem.product_name,
          brand: digiItem.brand, // PENTING: Ini pengelompokan gamenya (Mobile Legends, Free Fire, dll)
          category: digiItem.category,
          price_modal: digiItem.price,
          markup: 0, // Default markup 0
          price_sell: digiItem.price, // Harga jual = modal dulu
          image: "assets/default.png",
          is_active: false, // Default MATI agar admin bisa cek dulu
        });
      }
    });

    db.products = newProductList;
    saveDB(db);
    res.json({
      success: true,
      message: `Berhasil menarik ${digiProducts.length} data dari Digiflazz!`,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "Gagal koneksi ke Digiflazz" });
  }
});

// --- FITUR HAPUS SEMUA PRODUK (RESET) ---
app.post("/api/admin/delete-all-products", (req, res) => {
  const db = getDB();
  db.products = []; // Kosongkan array produk
  saveDB(db);
  res.json({ success: true, message: "Semua produk berhasil dihapus!" });
});

// ... (Kode sebelumnya tetap sama)

// --- API CEK NICKNAME (REAL API) ---
app.post("/api/check-nickname", async (req, res) => {
  const { game, id, zone } = req.body;

  console.log(`🔍 Checking Nickname: ${game} - ID: ${id} (${zone || "-"})`);

  try {
    let apiUrl = "";
    let response;

    // 1. CEK MOBILE LEGENDS (Pakai API yang kamu kirim)
    if (
      game.toLowerCase().includes("mobile") ||
      game.toLowerCase().includes("legends")
    ) {
      if (!id || !zone)
        return res.json({ success: false, message: "ID & Zone wajib diisi" });

      // URL dari Postman yang kamu berikan
      apiUrl = `https://api.isan.eu.org/nickname/ml?id=${id}&zone=${zone}`;

      response = await axios.get(apiUrl);

      // API ini biasanya mengembalikan JSON: { "success": true, "name": "NamaPlayer", ... }
      if (response.data.success && response.data.name) {
        return res.json({
          success: true,
          name: response.data.name, // Nama asli dari server Moonton
          id: id,
          zone: zone,
        });
      }
    }

    // 2. CEK FREE FIRE (Bonus: Menggunakan API Free Fire dari provider yang sama/serupa)
    else if (game.toLowerCase().includes("free")) {
      // Contoh endpoint FF (isan.eu.org juga punya endpoint ff biasanya, atau kita pakai logic lain)
      apiUrl = `https://api.isan.eu.org/nickname/ff?id=${id}`;
      response = await axios.get(apiUrl);

      if (response.data.success && response.data.name) {
        return res.json({ success: true, name: response.data.name, id: id });
      }
    }

    // 3. JIKA GAGAL / GAME LAIN (Simulasi Fallback agar tidak error)
    // Jika API mati atau game tidak didukung API, kembalikan simulasi
    console.log("⚠️ API Gagal/Game lain, menggunakan fallback.");
    return res.json({ success: false, message: "ID Tidak Ditemukan" });
  } catch (error) {
    // Tangkap error jika ID salah (biasanya API return 404 atau format error)
    console.error("Cek Nickname Error:", error.message);
    return res.json({ success: false, message: "ID Salah / Server Sibuk" });
  }
});

// ... (Kode endpoint login/admin tetap sama, update bagian Public API ini)

// 1. Ambil Channel Pembayaran Aktif dari TriPay
app.get("/api/channels", async (req, res) => {
  const db = getDB();
  const { api_key } = db.config.tripay;
  const mode = "api-sandbox"; // Ganti 'api' jika sudah production

  if (!api_key) return res.json({ success: false, data: [] });

  try {
    const response = await axios.get(
      `https://tripay.co.id/${mode}/merchant/payment-channel`,
      {
        headers: { Authorization: "Bearer " + api_key },
      },
    );
    res.json(response.data);
  } catch (error) {
    console.error(
      "Gagal ambil channel:",
      error.response?.data || error.message,
    );
    res.status(500).json({ success: false, data: [] });
  }
});

// 2. Transaksi (Updated: Support Dynamic Method)
app.post("/api/transaction", async (req, res) => {
  const db = getDB();
  const { sku, amount, customer_no, method, nickname, game } = req.body; // Tambah parameter
  const { merchant_code, api_key, private_key } = db.config.tripay;
  const mode = "api-sandbox";

  const merchantRef = "INV-" + Math.floor(Math.random() * 100000) + Date.now();
  const signature = crypto
    .createHmac("sha256", private_key)
    .update(merchant_code + merchantRef + amount)
    .digest("hex");

  try {
    // Cari detail produk untuk nama
    const product = db.products.find((p) => p.sku === sku);
    const productName = product ? product.name : "Topup Game";

    const payload = {
      method: method,
      merchant_ref: merchantRef,
      amount: amount,
      customer_name: nickname || "Gamer",
      customer_email: "user@email.com",
      customer_phone: customer_no,
      order_items: [
        { sku: sku, name: productName, price: amount, quantity: 1 },
      ],
      return_url: "http://localhost:3000",
      expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      signature: signature,
    };

    const response = await axios.post(
      `https://tripay.co.id/${mode}/transaction/create`,
      payload,
      { headers: { Authorization: "Bearer " + api_key } },
    );

    // SIMPAN KE DATABASE LOKAL
    const newTrans = {
      ref_id: response.data.data.reference, // Ref dari Tripay
      merchant_ref: merchantRef,
      game: game,
      product_name: productName,
      nickname: nickname,
      user_id: customer_no,
      amount: amount,
      method: method,
      status: "UNPAID", // Status awal
      qr_url: response.data.data.qr_url,
      pay_code: response.data.data.pay_code,
      checkout_url: response.data.data.checkout_url,
      created_at: Date.now(),
    };

    if (!db.transactions) db.transactions = [];
    db.transactions.push(newTrans);
    saveDB(db);

    res.json({ success: true, data: newTrans }); // Kirim data lengkap
  } catch (error) {
    console.error("TriPay Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: "Transaksi Gagal" });
  }
});

// 2. API CEK STATUS & DETAIL (Dipanggil oleh Halaman Invoice)
app.get("/api/transaction/:ref", async (req, res) => {
  const db = getDB();
  const ref = req.params.ref;
  const { api_key } = db.config.tripay;
  const mode = "api-sandbox";

  // Cari di DB Lokal dulu
  const transIndex = db.transactions.findIndex((t) => t.ref_id === ref);
  if (transIndex === -1)
    return res
      .status(404)
      .json({ success: false, message: "Transaksi tidak ditemukan" });

  let transaction = db.transactions[transIndex];

  // Jika status masih UNPAID, Cek ke Tripay (Real-time Check)
  if (transaction.status === "UNPAID") {
    try {
      const tripayRes = await axios.get(
        `https://tripay.co.id/${mode}/transaction/detail?reference=${ref}`,
        {
          headers: { Authorization: "Bearer " + api_key },
        },
      );

      const remoteStatus = tripayRes.data.data.status; // UNPAID / PAID / EXPIRED

      // Jika status berubah, update DB Lokal
      if (remoteStatus !== transaction.status) {
        transaction.status = remoteStatus;
        db.transactions[transIndex] = transaction; // Update
        saveDB(db);
      }
    } catch (e) {
      console.error("Gagal cek status ke Tripay", e.message);
    }
  }

  res.json({ success: true, data: transaction });
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
