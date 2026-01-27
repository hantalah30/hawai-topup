const API_URL = "http://localhost:3000/api";

const ASSETS = {
  "Mobile Legends": {
    logo: "assets/lance2.png",
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

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (!ref) return (window.location.href = "index.html");

  loadData(ref);
  checkInt = setInterval(() => checkStatus(ref), 3000);

  initParticles();
  setupTiltEffect();
});

async function loadData(ref) {
  try {
    const res = await fetch(`${API_URL}/transaction/${ref}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    renderAll(json.data);
    document.getElementById("loader").style.display = "none";
    setTimeout(
      () => (document.getElementById("progFill").style.width = "50%"),
      500,
    );
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

  // 2. Data Text
  document.getElementById("dItem").innerText = data.product_name;
  document.getElementById("dUid").innerText = data.user_id;
  document.getElementById("dMethod").innerText = data.method;
  document.getElementById("dTotal").innerText =
    "Rp " + parseInt(data.amount).toLocaleString();

  // 3. ANIMASI NICKNAME
  // Jalankan efek decoding text pada nickname
  const finalNick = data.nickname || "User Game";
  animateNickname("dNick", finalNick);

  // 4. Status Check
  if (data.status === "PAID") {
    showSuccess(true);
  } else if (data.status === "EXPIRED") {
    showExpired();
  } else {
    renderPay(data);
    startTimer(data.created_at);
  }
}

// --- FITUR BARU: ANIMASI DECODING TEXT ---
function animateNickname(elementId, finalText) {
  const el = document.getElementById(elementId);
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
    iterations += 1 / 3; // Kecepatan decoding
  }, 30);
}

function renderPay(data) {
  const area = document.getElementById("paymentArea");
  if (data.qr_url) {
    area.innerHTML = `
            <div class="small text-muted mb-2 fw-bold text-uppercase">Scan QRIS</div>
            <div class="qr-wrapper"><div class="qr-laser"></div><img src="${data.qr_url}" width="180"></div>
            <div class="mt-2 text-muted small">Support: DANA, OVO, Shopee, LinkAja</div>
        `;
  } else if (data.pay_code) {
    area.innerHTML = `
            <div class="small text-muted mb-1 fw-bold text-uppercase">Nomor Virtual Account</div>
            <div class="va-display" onclick="copy('${data.pay_code}')">
                ${data.pay_code} <i class="far fa-copy text-primary ms-2 fs-5"></i>
                <span class="copy-tooltip">Salin!</span>
            </div>
            <div class="alert alert-info py-1 px-2 d-inline-block small mb-2 border-0">
                <i class="fas fa-info-circle"></i> Cek otomatis
            </div>
            <br>
            <a href="${data.checkout_url}" target="_blank" class="btn btn-outline-dark btn-sm rounded-pill px-3">Petunjuk</a>
        `;
  }
}

function showSuccess(isInstant = false) {
  clearInterval(checkInt);
  clearInterval(timerInt);
  document.getElementById("progFill").style.width = "100%";
  document.getElementById("stepPay").classList.add("completed");
  document.getElementById("stepPay").classList.remove("active");
  document.getElementById("stepDone").classList.add("completed", "active");

  if (!isInstant) {
    document.getElementById("sfx-success").play();
    confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
  }
  document.getElementById("successOverlay").style.display = "flex";
}

function showExpired() {
  clearInterval(checkInt);
  document.getElementById("paymentArea").style.opacity = "0.5";
  document.getElementById("paymentArea").innerHTML =
    `<h3 class="text-danger fw-bold py-4">WAKTU HABIS</h3>`;
  document.getElementById("countdown").innerText = "EXPIRED";
}

function startTimer(created) {
  const end = created + 24 * 3600 * 1000;
  timerInt = setInterval(() => {
    const diff = end - Date.now();
    if (diff <= 0) return showExpired();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById("countdown").innerText =
      `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, 1000);
}

function copy(txt) {
  navigator.clipboard.writeText(txt);
  document.getElementById("sfx-click").play();
  const el = document.querySelector(".copy-tooltip");
  el.innerText = "Tersalin!";
  el.style.opacity = 1;
  setTimeout(() => {
    el.style.opacity = 0;
    el.innerText = "Salin!";
  }, 1500);
}

async function checkStatus(ref) {
  try {
    const res = await fetch(`${API_URL}/transaction/${ref}`);
    const json = await res.json();
    if (json.success && json.data.status === "PAID") showSuccess();
  } catch (e) {}
}

function setupTiltEffect() {
  if (window.innerWidth < 768) return;
  const card = document.getElementById("visualSide");
  const logo = document.getElementById("logoWrap");
  card.addEventListener("mousemove", (e) => {
    const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
    const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
    logo.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
    document.getElementById("bgImg").style.transform = "scale(1.2)";
  });
  card.addEventListener("mouseleave", () => {
    logo.style.transform = `rotateY(0deg) rotateX(0deg)`;
    document.getElementById("bgImg").style.transform = "scale(1.1)";
  });
}

function initParticles() {
  const canvas = document.getElementById("particles");
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
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
