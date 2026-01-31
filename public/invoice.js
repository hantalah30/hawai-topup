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
    logo: "https://placehold.co/150/1a1a1a/00f3ff/png?text=GAME",
    banner: "https://images.alphacoders.com/133/1336040.png",
  },
};

let checkInt, timerInt;

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");

  if (!ref) {
    document.body.innerHTML =
      "<h2 class='text-pink text-center' style='padding-top:50px;'>Error: No Reference ID</h2>";
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
    // Not used in new layout but kept just in case
  } catch (e) {
    console.error("Load Data Error:", e);
    document.body.innerHTML = `<div class="text-center" style="padding-top:100px; color:#fff;">
        <h2 class="text-pink">Failed to Load Transaction</h2>
        <p>${e.message}</p>
        <a href="index.html" class="btn-neon">Return Home</a>
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
  const productName = data.productName || data.item || data.sku || "Unknown Item";

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
            <div class="text-muted mb-2 fw-bold" style="font-size:0.9rem;">SCAN QR CODE</div>
            <div style="position:relative; display:inline-block; border: 5px solid #fff; border-radius:10px; overflow:hidden;">
                <img src="${data.qr_url}" width="200" alt="QR Code">
                <div style="position:absolute; top:0; left:0; width:100%; height:5px; background:red; animation:scan 2s infinite ease-in-out; box-shadow:0 0 10px red;"></div>
            </div>
            <div class="mt-3 text-muted" style="font-size:0.8rem;">Supported: DANA, OVO, Shopee, LinkAja</div>
            <br>
            <a href="${data.checkout_url}" target="_blank" class="btn-neon" style="font-size:0.8rem;">
                Open in Browser <i class="fas fa-external-link-alt ms-1"></i>
            </a>
        `;
    // Inject animation style if needed
    const style = document.createElement('style');
    style.innerHTML = `@keyframes scan { 0%,100% { top:0; } 50% { top:100%; } }`;
    document.head.appendChild(style);

  } else if (data.pay_code) {
    // Virtual Account
    area.innerHTML = `
            <div class="text-muted mb-2 fw-bold" style="font-size:0.9rem;">VIRTUAL ACCOUNT NUMBER</div>
            <div class="va-num text-neon" onclick="copy('${data.pay_code}')" style="font-size: 2rem; cursor:pointer;">
                ${data.pay_code} <i class="far fa-copy ms-2" style="font-size:1rem;"></i>
            </div>
            <div class="text-pink small mb-3"><i class="fas fa-info-circle"></i> Click to Copy</div>
            
            <a href="${data.checkout_url}" target="_blank" class="btn-neon" style="font-size:0.8rem;">
                View Instructions
            </a>
        `;
  } else if (data.checkout_url) {
    // Fallback URL
    area.innerHTML = `
          <div class="mb-3 text-white">Complete payment via link below:</div>
          <a href="${data.checkout_url}" target="_blank" class="btn-neon" style="width:100%; display:block; text-align:center;">
              PAY NOW <i class="fas fa-arrow-right ms-2"></i>
          </a>
      `;
  }
}

function showSuccess(isInstant = false) {
  if (checkInt) clearInterval(checkInt);
  if (timerInt) clearInterval(timerInt);

  const stepPay = document.getElementById("stepPay");
  if (stepPay) {
    stepPay.classList.remove("active");
    stepPay.classList.add("done");
  }

  const stepDone = document.getElementById("stepDone");
  if (stepDone) stepDone.classList.add("done", "active");

  if (!isInstant) {
    if (typeof confetti !== "undefined") {
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
    }
  }

  const successOverlay = document.getElementById("successOverlay");
  if (successOverlay) successOverlay.classList.add("active");
}

function showExpired() {
  if (checkInt) clearInterval(checkInt);

  const area = document.getElementById("paymentArea");
  if (area) {
    area.style.opacity = "0.5";
    area.innerHTML = `<h3 class="text-pink fw-bold py-4"><i class="fas fa-times-circle"></i> EXPIRED</h3>`;
  }

  const countdown = document.getElementById("countdown");
  if (countdown) {
    countdown.innerText = "EXPIRED";
    countdown.style.color = "#ff0055";
    countdown.style.borderColor = "#ff0055";
  }
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
  navigator.clipboard.writeText(txt)
    .then(() => {
      alert("Copied to clipboard!");
    })
    .catch((err) => {
      console.error("Failed to copy:", err);
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
  const logo = document.getElementById("gameLogo");
  const bgImg = document.getElementById("bgImg");

  if (!card || !logo || !bgImg) return;

  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    // Slight movement
    logo.style.transform = `translate(${x * 0.05}px, ${y * 0.05}px)`;
    bgImg.style.transform = `scale(1.1) translate(${x * -0.02}px, ${y * -0.02}px)`;
  });

  card.addEventListener("mouseleave", () => {
    logo.style.transform = `translate(0,0)`;
    bgImg.style.transform = "scale(1)";
  });
}

function initParticles() {
  // Simplified particle effect if canvas exists
  // ... (Optional, kept minimal)
}
