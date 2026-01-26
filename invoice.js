const API_URL = "http://localhost:3000/api";

const ASSETS = {
  "Mobile Legends": {
    logo: "assets/lance.png",
    banner: "assets/ml-banner.png",
  },
  "Free Fire": { logo: "assets/ff.jpg", banner: "assets/ff-banner.jpg" },
  "PUBG Mobile": {
    logo: "https://cdn-icons-png.flaticon.com/512/3408/3408506.png",
    banner: "https://wallpaperaccess.com/full/1239676.jpg",
  },
  Valorant: {
    logo: "https://img.icons8.com/color/480/valorant.png",
    banner: "https://images4.alphacoders.com/114/1149479.jpg",
  },
  DEFAULT: {
    logo: "assets/default.png",
    banner: "https://images.alphacoders.com/133/1336040.png",
  },
};

let checkInt, timerInt;

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (!ref) return (window.location.href = "index.html");

  loadData(ref);
  checkInt = setInterval(() => checkStatus(ref), 3000);

  // 3D TILT EFFECT (Desktop Only)
  const card = document.querySelector(".visual-side");
  const logo = document.getElementById("logoWrap");

  if (window.innerWidth > 768) {
    card.addEventListener("mousemove", (e) => {
      const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
      const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
      logo.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
    });
    card.addEventListener("mouseleave", () => {
      logo.style.transform = `rotateY(0deg) rotateX(0deg)`;
    });
  }
});

async function loadData(ref) {
  try {
    const res = await fetch(`${API_URL}/transaction/${ref}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    renderAll(json.data);
    document.getElementById("loader").style.display = "none";
  } catch (e) {
    alert("Error: " + e.message);
  }
}

function renderAll(data) {
  // 1. Visual
  let key = "DEFAULT";
  Object.keys(ASSETS).forEach((k) => {
    if ((data.game || "").toLowerCase().includes(k.toLowerCase())) key = k;
  });
  const asset = ASSETS[key];
  document.getElementById("bgImg").style.backgroundImage =
    `url('${asset.banner}')`;
  document.getElementById("gameLogo").src = asset.logo;
  document.getElementById("gameTitle").innerText = data.game;
  document.getElementById("refIdSmall").innerText = data.ref_id;

  // 2. Details
  document.getElementById("dItem").innerText = data.product_name;
  document.getElementById("dUid").innerText = data.user_id;
  document.getElementById("dNick").innerText = data.nickname || "-";
  document.getElementById("dMethod").innerText = data.method;
  document.getElementById("dTotal").innerText =
    "Rp " + parseInt(data.amount).toLocaleString();

  // 3. Status Logic
  if (data.status === "PAID") {
    showSuccess();
  } else if (data.status === "EXPIRED") {
    showExpired();
  } else {
    renderPay(data);
    startTimer(data.created_at);
  }
}

function renderPay(data) {
  const area = document.getElementById("paymentArea");
  if (data.qr_url) {
    area.innerHTML = `
            <div class="small text-muted mb-2 text-uppercase fw-bold">Scan QRIS</div>
            <div class="qr-box"><img src="${data.qr_url}" width="180"></div>
            <div class="mt-3">
                <a href="${data.qr_url}" download class="btn btn-dark btn-sm rounded-pill px-3">
                    <i class="fas fa-download me-1"></i> Simpan
                </a>
            </div>
        `;
  } else if (data.pay_code) {
    area.innerHTML = `
            <div class="small text-muted mb-1 text-uppercase fw-bold">Nomor Virtual Account</div>
            <div class="va-display" onclick="copy('${data.pay_code}')" title="Klik Copy">
                ${data.pay_code} <i class="far fa-copy text-primary fs-5 ms-2"></i>
            </div>
            <div class="small text-muted mb-3">Total: <b>Rp ${parseInt(data.amount).toLocaleString()}</b></div>
            <a href="${data.checkout_url}" target="_blank" class="btn btn-outline-primary btn-sm rounded-pill">Cara Bayar</a>
        `;
  }
}

function showSuccess() {
  clearInterval(checkInt);
  clearInterval(timerInt);

  // Update Timeline
  document.getElementById("stepPay").classList.add("completed");
  document.getElementById("stepPay").classList.remove("active");
  document.getElementById("stepDone").classList.add("completed", "active");

  // Hide Timer & Pay
  document.getElementById("alertBox").style.display = "none";

  const area = document.getElementById("paymentArea");
  area.style.background = "#d1e7dd";
  area.style.color = "#0f5132";
  area.innerHTML = `
        <i class="fas fa-check-circle fa-5x mb-3 text-success"></i>
        <h3 class="fw-bold">Pembayaran Berhasil!</h3>
        <p class="small">Pesanan Anda sedang diproses sistem.</p>
    `;

  // TRIGGER CONFETTI
  confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
}

function showExpired() {
  clearInterval(checkInt);
  document.getElementById("alertBox").className =
    "alert alert-danger border-0 text-center mb-4 small fw-bold";
  document.getElementById("alertBox").innerHTML = "WAKTU HABIS";

  const area = document.getElementById("paymentArea");
  area.style.opacity = "0.5";
  area.innerHTML = `<h3 class="text-danger fw-bold py-4">TRANSAKSI BATAL</h3>`;
}

function startTimer(created) {
  const end = created + 24 * 3600 * 1000;
  timerInt = setInterval(() => {
    const diff = end - Date.now();
    if (diff <= 0) {
      showExpired();
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById("timer").innerText = `${h}:${m}:${s}`;
  }, 1000);
}

function copy(txt) {
  navigator.clipboard.writeText(txt);
  const el = document.querySelector(".va-display");
  const ori = el.innerHTML;
  el.innerHTML = `<span class="text-success">TERSALIN!</span>`;
  setTimeout(() => (el.innerHTML = ori), 1000);
}

async function checkStatus(ref) {
  const res = await fetch(`${API_URL}/transaction/${ref}`);
  const json = await res.json();
  if (json.success && json.data.status === "PAID") showSuccess();
}
