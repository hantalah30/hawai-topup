// Arahkan ke endpoint API relative path
const API_URL = "/api";

// Definisi Aset Game
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
  DEFAULT: {
    // [FIX] Menggunakan URL Placeholder online agar tidak 404
    logo: "https://placehold.co/150/1a1a1a/00f3ff/png?text=GAME",
    banner: "https://images.alphacoders.com/133/1336040.png",
  },
};

let checkInt, timerInt;

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");

  if (!ref) {
    // Alert dihapus agar tidak mengganggu, langsung redirect atau tampilkan pesan HTML
    document.body.innerHTML =
      "<h2 style='color:white;text-align:center;margin-top:50px;'>Error: No Reference ID</h2>";
    return;
  }

  loadData(ref);
  checkInt = setInterval(() => checkStatus(ref), 3000); // Polling status setiap 3 detik

  initParticles();
  setupTiltEffect();
});

async function loadData(ref) {
  try {
    const res = await fetch(`${API_URL}/transaction/${ref}`);
    const json = await res.json();

    if (!json.success) throw new Error(json.message);

    renderAll(json.data);

    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";

    const progFill = document.getElementById("progFill");
    if (progFill) setTimeout(() => (progFill.style.width = "50%"), 500);
  } catch (e) {
    console.error("Load Data Error:", e);
    document.body.innerHTML = `<div style="color:white;text-align:center;margin-top:50px;">
        <h2>Gagal Memuat Transaksi</h2>
        <p>${e.message}</p>
        <a href="index.html" style="color:#00f3ff;">Kembali ke Home</a>
    </div>`;
  }
}

function renderAll(data) {
  // 1. Logika Visual (Logo & Banner)
  let key = "DEFAULT";
  const gameName = data.game || "";

  Object.keys(ASSETS).forEach((k) => {
    if (k !== "DEFAULT" && gameName.toLowerCase().includes(k.toLowerCase())) {
      key = k;
    }
  });

  const asset = ASSETS[key];

  const bgImg = document.getElementById("bgImg");
  if (bgImg) bgImg.style.backgroundImage = `url('${asset.banner}')`;

  const gameLogo = document.getElementById("gameLogo");
  if (gameLogo) {
    gameLogo.src = asset.logo;
    // [FIX] Fallback handler yang aman agar tidak looping
    gameLogo.onerror = function () {
      this.onerror = null;
      this.src = ASSETS.DEFAULT.logo;
    };
  }

  const gameTitle = document.getElementById("gameTitle");
  if (gameTitle) gameTitle.innerText = gameName || "Transaction";

  const refIdSmall = document.getElementById("refIdSmall");
  if (refIdSmall) refIdSmall.innerText = data.ref_id;

  // 2. Data Text Detail
  const productName =
    data.productName || data.item || data.sku || "Unknown Item";

  setText("dItem", productName);
  setText("dUid", data.user_id || "-");
  setText("dMethod", data.method || "-");
  setText("dTotal", "Rp " + parseInt(data.amount || 0).toLocaleString());

  // 3. Animasi Nickname
  const finalNick = data.nickname || "User";
  animateNickname("dNick", finalNick);

  // 4. Status Check & Rendering Area Pembayaran
  if (data.status === "PAID" || data.status === "SUCCESS") {
    showSuccess(true);
  } else if (data.status === "EXPIRED" || data.status === "FAILED") {
    showExpired();
  } else {
    renderPay(data);
    startTimer(data.created_at);
  }
}

// Helper aman untuk set text
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

// --- ANIMASI DECODING TEXT ---
function animateNickname(elementId, finalText) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";
  let iterations = 0;

  const interval = setInterval(() => {
    el.innerText = finalText
      .split("")
      .map((letter, index) => {
        if (index < iterations) return finalText[index];
        return chars[Math.floor(Math.random() * chars.length)];
      })
      .join("");

    if (iterations >= finalText.length) clearInterval(interval);
    iterations += 1 / 3;
  }, 30);
}

function renderPay(data) {
  const area = document.getElementById("paymentArea");
  if (!area) return;

  if (data.qr_url) {
    // Tampilan QRIS
    area.innerHTML = `
            <div class="small text-muted mb-2 fw-bold text-uppercase">Scan QRIS</div>
            <div class="qr-wrapper">
                <div class="qr-laser"></div>
                <img src="${data.qr_url}" width="180" alt="QR Code" style="border-radius:10px;">
            </div>
            <div class="mt-2 text-muted small">Support: DANA, OVO, Shopee, LinkAja</div>
            <br>
            <a href="${data.checkout_url}" target="_blank" class="btn btn-outline-primary btn-sm rounded-pill px-4">
                Buka di Browser <i class="fas fa-external-link-alt ms-1"></i>
            </a>
        `;
  } else if (data.pay_code) {
    // Tampilan Virtual Account / Kode Bayar
    area.innerHTML = `
            <div class="small text-muted mb-1 fw-bold text-uppercase">Nomor Virtual Account / Kode Bayar</div>
            <div class="va-display" onclick="copy('${data.pay_code}')">
                ${data.pay_code} <i class="far fa-copy text-primary ms-2 fs-5"></i>
                <span class="copy-tooltip">Salin!</span>
            </div>
            <div class="alert alert-info py-1 px-2 d-inline-block small mb-2 border-0" style="background: rgba(0, 243, 255, 0.1); color: #00f3ff;">
                <i class="fas fa-info-circle"></i> Cek otomatis
            </div>
            <br>
            <a href="${data.checkout_url}" target="_blank" class="btn btn-outline-light btn-sm rounded-pill px-3 mt-2">
                Lihat Petunjuk Pembayaran
            </a>
        `;
  } else if (data.checkout_url) {
    // Fallback
    area.innerHTML = `
          <div class="mb-3">Silakan selesaikan pembayaran melalui link di bawah:</div>
          <a href="${data.checkout_url}" target="_blank" class="btn btn-primary rounded-pill w-100 py-3 fw-bold">
              BAYAR SEKARANG <i class="fas fa-arrow-right ms-2"></i>
          </a>
      `;
  }
}

function showSuccess(isInstant = false) {
  if (checkInt) clearInterval(checkInt);
  if (timerInt) clearInterval(timerInt);

  const progFill = document.getElementById("progFill");
  if (progFill) progFill.style.width = "100%";

  const stepPay = document.getElementById("stepPay");
  if (stepPay) {
    stepPay.classList.add("completed");
    stepPay.classList.remove("active");
  }

  const stepDone = document.getElementById("stepDone");
  if (stepDone) stepDone.classList.add("completed", "active");

  if (!isInstant) {
    const sfx = document.getElementById("sfx-success");
    if (sfx) sfx.play().catch((e) => console.log("Audio play blocked"));

    if (typeof confetti !== "undefined") {
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
    }
  }

  const successOverlay = document.getElementById("successOverlay");
  if (successOverlay) successOverlay.style.display = "flex";
}

function showExpired() {
  if (checkInt) clearInterval(checkInt);

  const area = document.getElementById("paymentArea");
  if (area) {
    area.style.opacity = "0.5";
    area.innerHTML = `<h3 class="text-danger fw-bold py-4"><i class="fas fa-times-circle"></i> WAKTU HABIS</h3>`;
  }

  const countdown = document.getElementById("countdown");
  if (countdown) countdown.innerText = "EXPIRED";
  if (countdown) countdown.style.color = "#ff0055";
}

function startTimer(created) {
  let startTime = created;
  if (created && created._seconds) {
    startTime = created._seconds * 1000;
  }

  const end = startTime + 24 * 3600 * 1000;

  timerInt = setInterval(() => {
    const diff = end - Date.now();
    if (diff <= 0) {
      clearInterval(timerInt);
      return showExpired();
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    const countdown = document.getElementById("countdown");
    if (countdown) {
      countdown.innerText = `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
  }, 1000);
}

function copy(txt) {
  navigator.clipboard
    .writeText(txt)
    .then(() => {
      const sfx = document.getElementById("sfx-click");
      if (sfx) sfx.play().catch(() => {});

      const el = document.querySelector(".copy-tooltip");
      if (el) {
        el.innerText = "Tersalin!";
        el.style.opacity = 1;
        setTimeout(() => {
          el.style.opacity = 0;
          el.innerText = "Salin!";
        }, 1500);
      }
    })
    .catch((err) => {
      console.error("Gagal menyalin:", err);
      alert("Gagal menyalin. Silakan copy manual.");
    });
}

async function checkStatus(ref) {
  try {
    const res = await fetch(`${API_URL}/transaction/${ref}`);
    const json = await res.json();
    if (json.success) {
      if (json.data.status === "PAID" || json.data.status === "SUCCESS") {
        showSuccess();
      } else if (
        json.data.status === "EXPIRED" ||
        json.data.status === "FAILED"
      ) {
        showExpired();
      }
    }
  } catch (e) {
    // Silent error
  }
}

function setupTiltEffect() {
  if (window.innerWidth < 768) return;

  const card = document.getElementById("visualSide");
  const logo = document.getElementById("logoWrap");
  const bgImg = document.getElementById("bgImg");

  if (!card || !logo || !bgImg) return;

  card.addEventListener("mousemove", (e) => {
    const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
    const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
    logo.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
    bgImg.style.transform = "scale(1.2)";
  });

  card.addEventListener("mouseleave", () => {
    logo.style.transform = `rotateY(0deg) rotateX(0deg)`;
    bgImg.style.transform = "scale(1.1)";
  });
}

function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const resize = () => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  };

  window.addEventListener("resize", resize);
  resize();

  let particles = [];
  for (let i = 0; i < 50; i++)
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2,
      speedY: Math.random() * 0.5 + 0.1,
    });

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    particles.forEach((p) => {
      p.y -= p.speedY;
      if (p.y < 0) p.y = canvas.height;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(animate);
  }
  animate();
}
