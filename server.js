const express = require("express");
const axios = require("axios");
const md5 = require("md5");
const crypto = require("crypto");
const QRCode = require("qrcode");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// --- KONFIGURASI ---
const CONFIG = {
  digiUser: "tifohugK4d1o",
  digiKey: "905819dd-1418-5f26-b737-0e46768db5c7",
  profitMargin: 5,
  tripayApiKey: "DEV-YOUR-API-KEY", // GANTI API KEY
  tripayPrivateKey: "YOUR-PRIVATE-KEY", // GANTI PRIVATE KEY
  tripayMerchantCode: "YOUR-CODE", // GANTI MERCHANT CODE
  tripayUrl: "https://tripay.co.id/api-sandbox",
};

let transactions = [];
let CACHE_DATA = null;
let LAST_FETCH = 0;
const CACHE_DURATION = 60 * 60 * 1000;

// 1. GET PRICELIST
app.get("/api/pricelist", async (req, res) => {
  const now = Date.now();
  if (CACHE_DATA && now - LAST_FETCH < CACHE_DURATION)
    return res.json(CACHE_DATA);
  try {
    const sign = md5(CONFIG.digiUser + CONFIG.digiKey + "pricelist");
    const response = await axios.post(
      "https://api.digiflazz.com/v1/price-list",
      {
        cmd: "prepaid",
        username: CONFIG.digiUser,
        sign: sign,
      },
    );
    const products = response.data.data;
    if (!Array.isArray(products)) return res.json(CACHE_DATA || []);

    const cleanData = products
      .filter(
        (p) =>
          p.category === "Games" &&
          p.buyer_product_status &&
          p.seller_product_status,
      )
      .map((p) => ({
        code: p.buyer_sku_code,
        name: p.product_name,
        brand: p.brand,
        price:
          Math.ceil((p.price + (p.price * CONFIG.profitMargin) / 100) / 100) *
          100,
      }));
    CACHE_DATA = cleanData;
    LAST_FETCH = now;
    res.json(cleanData);
  } catch (error) {
    res.json(CACHE_DATA || []);
  }
});

// 2. GET CHANNELS
app.get("/api/channels", async (req, res) => {
  try {
    const response = await axios.get(
      `${CONFIG.tripayUrl}/merchant/payment-channel`,
      {
        headers: { Authorization: "Bearer " + CONFIG.tripayApiKey },
      },
    );
    res.json(response.data.success ? response.data.data : []);
  } catch (error) {
    // Fallback Data jika API Key belum diset
    res.json([
      {
        code: "QRIS",
        name: "QRIS",
        group: "QR Code",
        icon_url: "https://tripay.co.id/images/payment-channel/qris.png",
      },
      {
        code: "OVO",
        name: "OVO",
        group: "E-Wallet",
        icon_url: "https://tripay.co.id/images/payment-channel/ovo.png",
      },
      {
        code: "BRIVA",
        name: "BRI Virtual Account",
        group: "Virtual Account",
        icon_url: "https://tripay.co.id/images/payment-channel/briva.png",
      },
    ]);
  }
});

// 3. CREATE TRANSACTION
app.post("/api/transaction", async (req, res) => {
  const { sku, uid, zone, price, name, method } = req.body;
  const refId = "INV-" + Date.now();
  const signature = crypto
    .createHmac("sha256", CONFIG.tripayPrivateKey)
    .update(CONFIG.tripayMerchantCode + refId + price)
    .digest("hex");

  try {
    const response = await axios.post(
      `${CONFIG.tripayUrl}/transaction/create`,
      {
        method: method,
        merchant_ref: refId,
        amount: price,
        customer_name: "Gamer",
        customer_email: "user@email.com",
        customer_phone: "08123456789",
        order_items: [{ sku: sku, name: name, price: price, quantity: 1 }],
        callback_url: "https://domain.com/callback",
        return_url: "http://localhost:3000",
        expired_time: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        signature: signature,
      },
      { headers: { Authorization: "Bearer " + CONFIG.tripayApiKey } },
    );

    const data = response.data.data;
    transactions.push({
      refId,
      tripayRef: data.reference,
      sku,
      uid,
      zone,
      price,
      status: "UNPAID",
    });

    res.json({
      status: "success",
      ref_id: refId,
      amount: data.amount,
      qr_url: data.qr_url,
      pay_code: data.pay_code,
      checkout_url: data.checkout_url,
    });
  } catch (err) {
    // Fallback Simulation
    const qr = await QRCode.toDataURL("SimulasiQRIS");
    transactions.push({ refId, sku, uid, zone, price, status: "UNPAID" });
    res.json({
      status: "success",
      ref_id: refId,
      amount: price,
      qr_url: qr,
      checkout_url: "#",
    });
  }
});

// 4. CHECK NICKNAME
app.post("/api/check-nickname", async (req, res) => {
  const { id, zone } = req.body;
  // Simulasi Cek Nickname agar cepat (Ganti dengan API Digiflazz asli jika saldo ada)
  return res.json({
    status: "success",
    name: `Player_${id.substring(0, 3)}`,
    region: zone || "Server",
  });
});

// 5. PROCESS & STATUS
app.post("/api/process-topup", (req, res) => {
  const trx = transactions.find((t) => t.refId === req.body.ref_id);
  if (trx) {
    trx.status = "SUCCESS";
    res.json({ status: "SUCCESS" });
  } else res.status(404).json({ error: "Not Found" });
});

app.get("/api/status/:ref_id", (req, res) => {
  const trx = transactions.find((t) => t.refId === req.params.ref_id);
  trx ? res.json(trx) : res.status(404).json({ status: "NOT_FOUND" });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`SERVER RUNNING ON PORT ${PORT}`));
