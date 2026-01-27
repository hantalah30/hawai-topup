// Arahkan ke endpoint API relative path
if (typeof API_URL === "undefined") {
  var API_URL = "/api";
}

// Preset Aset Game (Sama seperti di script.js)
const ASSETS = {
  "MOBILE LEGENDS": {
    logo: "assets/lance2.png",
    banner: "assets/ml-banner.png",
  },
  "Free Fire": {
    logo: "assets/ff.jpg",
    banner: "assets/ff-banner.jpg",
  },
  "PUBG Mobile": {
    logo: "https://cdn-icons-png.flaticon.com/512/3408/3408506.png",
    banner: "https://wallpaperaccess.com/full/1239676.jpg",
  },
  Valorant: {
    logo: "https://img.icons8.com/color/480/valorant.png",
    banner: "https://images4.alphacoders.com/114/1149479.jpg",
  },
};

const DEFAULT_BANNER = "https://images.alphacoders.com/133/1336040.png";

// Fungsi Utama
async function initInvoice() {
  const params = new URLSearchParams(window.location.search);
  const refId = params.get("ref");

  if (!refId) {
    document.body.innerHTML =
      "<h2 style='color:white;text-align:center;margin-top:50px;'>No Reference ID</h2>";
    return;
  }

  // Set No Invoice di UI
  document.getElementById("inv-no").innerText = "#" + refId;

  try {
    const res = await fetch(`${API_URL}/transaction/${refId}`);
    const json = await res.json();

    if (!json.success) throw new Error(json.message);

    const data = json.data;
    renderInvoice(data);
  } catch (error) {
    console.error(error);
    alert("Gagal memuat transaksi: " + error.message);
  }
}

function renderInvoice(data) {
  // 1. Set Status
  const statusEl = document.getElementById("status-badge");
  statusEl.innerText = data.status;

  if (data.status === "PAID") {
    statusEl.className = "badge-status status-success";
    document.getElementById("qr-container").style.display = "none";
    document.getElementById("pay-guide").innerHTML = `
        <div style="text-align:center; padding:20px; border:1px solid #0f0; border-radius:10px; background:rgba(0,255,0,0.1);">
            <h3 style="color:#0f0;">PEMBAYARAN BERHASIL</h3>
            <p>Terima kasih! Item Anda sedang diproses sistem.</p>
        </div>
    `;
  } else if (data.status === "EXPIRED") {
    statusEl.className = "badge-status status-failed";
    document.getElementById("qr-container").style.display = "none";
  } else {
    statusEl.className = "badge-status status-pending";
  }

  // 2. Set Detail Produk (Item Name Fix)
  // Backend mengirim 'productName', tapi invoice.js mungkin mencari 'item'
  const itemName = data.productName || data.item || data.sku;
  document.getElementById("item-name").innerText = itemName;

  document.getElementById("user-id").innerText = data.user_id || "-";
  document.getElementById("nick").innerText = data.nickname || "-";
  document.getElementById("amount").innerText =
    "Rp " + (data.amount || 0).toLocaleString();
  document.getElementById("method").innerText = data.method;

  // 3. Set Gambar Banner & Logo (Case Insensitive Fix)
  const gameKey = Object.keys(ASSETS).find(
    (key) => key.toLowerCase() === (data.game || "").toLowerCase(),
  );
  const gameAssets = ASSETS[gameKey] || {};

  document.getElementById("game-banner").src =
    gameAssets.banner || DEFAULT_BANNER;

  // Jika ada elemen logo
  const logoEl = document.getElementById("game-logo");
  if (logoEl) logoEl.src = gameAssets.logo || "";

  // 4. QR Code & Pay Code
  if (data.qr_url && data.status === "UNPAID") {
    const qrImg = document.getElementById("qr-img");
    if (qrImg) qrImg.src = data.qr_url;
  }

  // Virtual Account / Pay Code
  if (data.pay_code && data.status === "UNPAID") {
    const vaEl = document.getElementById("va-code");
    if (vaEl) {
      vaEl.innerText = data.pay_code;
      vaEl.parentElement.style.display = "block"; // Tampilkan container VA
    }
  }

  // 5. Expired Timer (Optional)
  if (data.status === "UNPAID") {
    startTimer(data.created_at);
  }
}

function startTimer(createdAt) {
  const expireTime = createdAt + 24 * 60 * 60 * 1000; // 24 Jam
  const timerEl = document.getElementById("expiry-timer");

  if (!timerEl) return;

  setInterval(() => {
    const now = Date.now();
    const diff = expireTime - now;

    if (diff <= 0) {
      timerEl.innerText = "EXPIRED";
      return;
    }

    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    timerEl.innerText = `${hours}h ${minutes}m ${seconds}s`;
  }, 1000);
}

// Jalankan
window.onload = initInvoice;
