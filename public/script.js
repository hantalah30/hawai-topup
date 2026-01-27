// Gunakan window agar aman jika dipanggil ganda
if (typeof API_URL === "undefined") {
  var API_URL = "/api";
}

// Konfigurasi Global
const CONFIG = {
  rewardPercent: 5,
};

// --- AUTH SYSTEM ---
const Auth = {
  user: null,

  init: () => {
    if (!firebase.apps.length) {
      console.error("Firebase belum di-init! Cek file firebase-config.js");
      return;
    }

    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const idToken = await user.getIdToken();
          const res = await fetch(`${API_URL}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });
          const data = await res.json();

          if (data.success) {
            Auth.user = data.user;
            Auth.updateUI(true);
          }
        } catch (e) {
          console.error("Auth Backend Error:", e);
        }
      } else {
        Auth.user = null;
        Auth.updateUI(false);
      }
    });
  },

  signIn: () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase
      .auth()
      .signInWithPopup(provider)
      .catch((error) => {
        alert("Login Gagal: " + error.message);
      });
  },

  signOut: () => {
    firebase.auth().signOut();
  },

  updateUI: (isLoggedIn) => {
    const btn = document.getElementById("btnLogin");
    const info = document.getElementById("userInfo");

    if (isLoggedIn && Auth.user) {
      if (btn) btn.style.display = "none";
      if (info) {
        info.style.display = "flex";
        document.getElementById("userName").innerText =
          Auth.user.name.split(" ")[0];
        document.getElementById("userCoins").innerText = (
          Auth.user.hawai_coins || 0
        ).toLocaleString();
        document.getElementById("userImg").src = Auth.user.picture;
      }
    } else {
      if (btn) btn.style.display = "flex";
      if (info) info.style.display = "none";
    }
  },
};

// --- PRESET ASSETS ---
const PRESET_ASSETS = {
  "MOBILE LEGENDS": {
    logo: "assets/lance2.png",
    banner: "assets/ml-banner.png",
    theme: "#00f3ff",
  },
  "Free Fire": {
    logo: "assets/ff.jpg",
    banner: "assets/ff-banner.jpg",
    theme: "#ff9900",
  },
  "PUBG Mobile": {
    logo: "https://cdn-icons-png.flaticon.com/512/3408/3408506.png",
    banner: "https://wallpaperaccess.com/full/1239676.jpg",
    theme: "#f2a900",
  },
  Valorant: {
    logo: "https://img.icons8.com/color/480/valorant.png",
    banner: "https://images4.alphacoders.com/114/1149479.jpg",
    theme: "#ff4655",
  },
};

const DEFAULT_ASSETS = {
  banner: "https://images.alphacoders.com/133/1336040.png",
  logo: "https://placehold.co/150/1a1a1a/FFFFFF/png?text=GAME",
  color: "#ffffff",
  icons: {
    member: "https://cdn-icons-png.flaticon.com/512/5727/5727270.png",
    diamond: "https://cdn-icons-png.flaticon.com/512/4442/4442898.png",
  },
};

// --- AUDIO SYSTEM ---
const Sound = {
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  play: (f, t, d, v = 0.05) => {
    if (window.innerWidth < 768) return;
    if (Sound.ctx.state === "suspended") Sound.ctx.resume();
    const o = Sound.ctx.createOscillator();
    const g = Sound.ctx.createGain();
    o.type = t;
    o.frequency.setValueAtTime(f, Sound.ctx.currentTime);
    g.gain.setValueAtTime(v, Sound.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, Sound.ctx.currentTime + d);
    o.connect(g);
    g.connect(Sound.ctx.destination);
    o.start();
    o.stop(Sound.ctx.currentTime + d);
  },
  hover: () => Sound.play(300, "triangle", 0.05, 0.02),
  click: () => Sound.play(800, "sine", 0.1, 0.05),
  type: () => Sound.play(600, "square", 0.03, 0.03),
  success: () => {
    Sound.play(600, "square", 0.1);
    setTimeout(() => Sound.play(1200, "square", 0.4), 100);
  },
};

// --- TEXT SCRAMBLER ---
class TextScramble {
  constructor(el) {
    this.el = el;
    this.chars = "!<>-_\\/[]{}—=+*^?#________";
    this.update = this.update.bind(this);
  }
  setText(newText) {
    const oldText = this.el.innerText;
    const length = Math.max(oldText.length, newText.length);
    const promise = new Promise((resolve) => (this.resolve = resolve));
    this.queue = [];
    for (let i = 0; i < length; i++) {
      const from = oldText[i] || "";
      const to = newText[i] || "";
      const start = Math.floor(Math.random() * 40);
      const end = start + Math.floor(Math.random() * 40);
      this.queue.push({ from, to, start, end });
    }
    cancelAnimationFrame(this.frameRequest);
    this.frame = 0;
    this.update();
    return promise;
  }
  update() {
    let output = "";
    let complete = 0;
    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i];
      if (this.frame >= end) {
        complete++;
        output += to;
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.randomChar();
          this.queue[i].char = char;
        }
        output += `<span class="dud">${char}</span>`;
      } else {
        output += from;
      }
    }
    this.el.innerHTML = output;
    if (complete === this.queue.length) this.resolve();
    else {
      this.frameRequest = requestAnimationFrame(this.update);
      this.frame++;
    }
  }
  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)];
  }
}

// --- APP ENGINE ---
const App = {
  state: {
    rawProducts: [],
    gamesList: [],
    paymentChannels: [],
    serverBanners: {},
    serverSliders: [],
    selectedItem: null,
    transactionType: "GAME",
    refId: null,
    nickname: null,
  },

  init: async () => {
    Auth.init();

    if (window.innerWidth > 768) {
      document.addEventListener("mousemove", (e) => {
        gsap.to(".cursor-dot", { x: e.clientX, y: e.clientY, duration: 0 });
        gsap.to(".cursor-ring", {
          x: e.clientX - 20,
          y: e.clientY - 20,
          duration: 0.15,
        });
      });
    }

    await Promise.all([App.fetchData(), App.fetchPaymentChannels()]);

    const bootLayer = document.getElementById("boot-layer");
    if (bootLayer) bootLayer.style.display = "none";

    if (typeof World !== "undefined") World.init();

    App.router("home");
    document.addEventListener("click", () => Sound.click());
  },

  fetchData: async () => {
    try {
      const res = await fetch(`${API_URL}/init-data`);
      const data = await res.json();

      App.state.rawProducts = data.products || [];
      App.state.serverSliders = data.sliders || [];
      App.state.serverBanners = data.banners || {};

      if (data.reward_percent) CONFIG.rewardPercent = data.reward_percent;

      const uniqueBrands = [
        ...new Set(App.state.rawProducts.map((p) => p.brand)),
      ];

      App.state.gamesList = uniqueBrands
        .map((brandName) => {
          if (!brandName) return null;
          const preset = PRESET_ASSETS[brandName] || {};
          const adminBanner = App.state.serverBanners[brandName];
          const sampleProduct = App.state.rawProducts.find(
            (p) => p.brand === brandName && !p.image.includes("default"),
          );
          const serverImg = sampleProduct ? sampleProduct.image : null;

          return {
            id: brandName,
            name: brandName,
            img: preset.logo || serverImg || DEFAULT_ASSETS.logo,
            banner: adminBanner || preset.banner || DEFAULT_ASSETS.banner,
            theme: preset.theme || DEFAULT_ASSETS.color,
          };
        })
        .filter((g) => g !== null);

      App.router("home");
    } catch (e) {
      console.error("Fetch Error:", e);
    }
  },

  fetchPaymentChannels: async () => {
    try {
      const res = await fetch(`${API_URL}/channels`);
      const json = await res.json();
      if (json.success && json.data) {
        App.state.paymentChannels = json.data;
      }
    } catch (e) {
      console.error("Gagal load channel pembayaran");
    }
  },

  router: (page, param = null) => {
    const vp = document.getElementById("viewport");
    if (!vp) return;

    vp.innerHTML = "";
    window.scrollTo(0, 0);
    if (page === "home") App.renderHome(vp);
    else if (page === "order") App.renderOrderPage(vp, param);
  },

  openTopupModal: () => {
    if (!Auth.user) return alert("Silakan Login terlebih dahulu!");
    const modal = document.getElementById("coinModal");
    if (modal) modal.classList.remove("hidden");
  },

  selectCoin: (amount) => {
    document.getElementById("customCoin").value = amount;
  },

  closeModal: (id) => {
    document.getElementById(id).classList.add("hidden");
  },

  processTopupCoin: () => {
    const amountInput = document.getElementById("customCoin");
    const amount = parseInt(amountInput.value);

    if (isNaN(amount) || amount < 10000) {
      return alert("Minimal Topup Rp 10.000");
    }

    App.state.selectedItem = {
      code: "DEPOSIT",
      price: amount,
      name: "Topup Coin",
    };
    App.state.transactionType = "COIN";

    App.closeModal("coinModal");
    Terminal.openPaymentSelect();
  },

  renderHome: (container) => {
    if (App.sliderInterval) clearInterval(App.sliderInterval);

    let html = `
            <div class="hero-slider" id="home-slider"><div class="slider-timer"></div></div>
            <div class="container">
                <h2 class="section-title">POPULAR GAMES</h2>
                <div class="grid">`;

    App.state.gamesList.forEach((g) => {
      html += `
                <div class="tilt-card" onclick="App.router('order', '${g.id}')" onmouseenter="App.tilt(this)" style="background-image: url('${g.banner}');">
                    <div class="card-overlay">
                        <div class="d-flex align-items-center gap-2">
                            <img src="${g.img}" class="mini-logo" onerror="this.style.display='none'">
                            <div class="card-info">
                                <h3>${g.name}</h3>
                                <p>● SERVER ONLINE</p>
                            </div>
                        </div>
                    </div>
                </div>`;
    });

    if (App.state.gamesList.length === 0) {
      html += `<div style="text-align:center; padding:50px; color:#fff;">LOADING GAMES...</div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
    App.startSlider();
  },

  renderOrderPage: (container, brandName) => {
    App.state.transactionType = "GAME";
    App.state.nickname = null; // Reset nickname

    const items = App.state.rawProducts
      .filter((p) => p.brand === brandName && p.is_active !== false)
      .sort((a, b) => a.price_sell - b.price_sell);

    const gameData = App.state.gamesList.find((g) => g.id === brandName) || {
      banner: DEFAULT_ASSETS.banner,
      img: DEFAULT_ASSETS.logo,
      theme: "#fff",
    };

    const isML = brandName.toLowerCase().includes("mobile");
    const zoneInput = isML
      ? `<input type="number" id="zone" class="input-neon" placeholder="Zone (4 Angka)" oninput="App.checkNickname()">`
      : `<input type="hidden" id="zone" value="">`;

    const promoItems = items.filter((p) => p.is_promo === true);
    const normalItems = items.filter((p) => !p.is_promo);
    const mem = normalItems.filter(
      (p) =>
        p.name.toLowerCase().includes("member") ||
        p.name.toLowerCase().includes("pass"),
    );
    const dia = normalItems.filter((p) => !mem.includes(p));

    container.innerHTML = `
            <div class="game-hero" style="background-image: url('${gameData.banner}'), url('${DEFAULT_ASSETS.banner}');"></div>
            <div class="container">
                <div class="game-header-wrap">
                    <img src="${gameData.img}" class="game-poster-img" style="border: 4px solid ${gameData.theme}; box-shadow: 0 0 30px ${gameData.theme}40;">
                    <div class="game-title">
                        <h1 style="color:#fff; text-shadow: 0 0 20px ${gameData.theme};">${brandName}</h1>
                        <p style="color:#ddd;">Instant Delivery System</p>
                    </div>
                </div>

                <div class="cyber-form">
                    <div class="form-section">
                        <span class="sec-title">01 // ACCOUNT DATA</span>
                        <div class="input-row">
                            <input type="number" id="uid" class="input-neon" placeholder="User ID" onchange="App.checkNickname()">
                            ${zoneInput}
                        </div>
                        <div id="nick-result" class="nick-res"></div>
                    </div>

                    <div class="form-section">
                        <span class="sec-title">02 // PILIH PRODUK</span>
                        ${
                          promoItems.length > 0
                            ? `<div class="cat-label hot-label"><i class="fas fa-fire"></i> HOT PROMO</div>
                        <div class="item-grid mb-4">
                            ${promoItems.map((p) => App.renderItemCard(p)).join("")}
                        </div>`
                            : ""
                        }
                        ${
                          mem.length > 0
                            ? `<div class="cat-label mt-3"><i class="fas fa-crown text-warning"></i> MEMBERSHIP</div>
                        <div class="item-grid">
                            ${mem.map((p) => App.renderItemCard(p)).join("")}
                        </div>`
                            : ""
                        }
                        <div class="cat-label mt-4"><i class="fas fa-gem" style="color:${gameData.theme}"></i> TOP UP</div>
                        <div class="item-grid">
                            ${dia.map((p) => App.renderItemCard(p)).join("")}
                        </div>
                    </div>
                    
                    <div class="footer-action">
                        <button class="btn-pay-now" onclick="Terminal.openPaymentSelect()">
                            BELI SEKARANG <i class="fas fa-wallet ml-2"></i>
                        </button>
                    </div>
                </div>
            </div>`;
  },

  renderItemCard: (p) => {
    let cardClass = "item-card";
    let badgeHtml = "";
    const points = Math.floor(p.price_sell * (CONFIG.rewardPercent / 100));

    if (p.is_promo) {
      cardClass += " card-promo";
      badgeHtml = `<div class="hot-badge">HOT 🔥</div>`;
    } else if (
      p.name.toLowerCase().includes("member") ||
      p.name.toLowerCase().includes("pass")
    ) {
      cardClass += " card-premium";
    }

    let imgDisplay;
    if (p.image && !p.image.includes("default")) {
      if (p.image.startsWith("http") || p.image.startsWith("data:")) {
        imgDisplay = p.image;
      } else {
        imgDisplay = `${API_URL.replace("/api", "")}/${p.image}`;
      }
    } else {
      imgDisplay = DEFAULT_ASSETS.icons.diamond;
      if (p.name.toLowerCase().includes("member"))
        imgDisplay = DEFAULT_ASSETS.icons.member;
    }

    return `
        <div class="${cardClass}" onclick="App.selectItem(this, '${p.sku}', ${p.price_sell}, '${p.name}')">
            ${badgeHtml} <div class="i-content">
                <img src="${imgDisplay}" class="i-icon" loading="lazy">
                <div class="i-name">${p.name}</div>
                <div class="i-price">Rp ${p.price_sell.toLocaleString()}</div>
                <div style="font-size:0.7rem; color:#00f3ff; margin-top:3px;">
                   <i class="fas fa-plus-circle"></i> ${points} Coins
                </div>
            </div>
        </div>`;
  },

  checkNickname: async () => {
    const uid = document.getElementById("uid").value;
    const zoneInput = document.getElementById("zone");
    const zone = zoneInput ? zoneInput.value : "";
    const res = document.getElementById("nick-result");
    const gameTitleEl = document.querySelector(".game-title h1");
    const gameTitle = gameTitleEl ? gameTitleEl.innerText : "";

    if (uid.length < 4) {
      res.innerHTML = "";
      return;
    }
    const isML = gameTitle.toLowerCase().includes("mobile");
    if (isML && zone.length < 3) return;

    res.style.display = "block";
    res.innerHTML = `<span style="color:#00f3ff; font-size: 0.9rem;"><i class="fas fa-circle-notch fa-spin"></i> Mencari ID...</span>`;

    try {
      const response = await fetch(`${API_URL}/check-nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: gameTitle, id: uid, zone: zone }),
      });
      const data = await response.json();
      if (data.success) {
        res.innerHTML = `
                    <div style="margin-top:8px; padding:5px 10px; background:rgba(0,255,0,0.2); border:1px solid #00ff00; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
                        <i class="fas fa-check-circle" style="color:#00ff00;"></i> 
                        <span style="color:#fff; font-weight:bold; font-size:0.9rem;">${data.name}</span>
                    </div>`;
        Sound.success();
        App.state.nickname = data.name;
      } else {
        res.innerHTML = `<span style="color:#ff4444; font-size:0.9rem; margin-top:5px; display:block;"><i class="fas fa-times-circle"></i> ID Tidak Ditemukan</span>`;
        App.state.nickname = null;
      }
    } catch (e) {
      console.error(e);
      res.innerHTML = `<span style="color:red">Gagal koneksi</span>`;
    }
  },

  selectItem: (el, code, price, name) => {
    document
      .querySelectorAll(".item-card")
      .forEach((i) => i.classList.remove("active"));
    el.classList.add("active");
    App.state.selectedItem = { code, price, name };
    App.state.transactionType = "GAME";
    Sound.click();
  },

  tilt: (card) => {
    if (window.innerWidth < 768) return;
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      card.style.transform = `perspective(1000px) rotateX(${((y - cy) / cy) * -5}deg) rotateY(${((x - cx) / cx) * 5}deg) scale(1.02)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
    });
    Sound.hover();
  },

  startSlider: () => {
    const sliders =
      App.state.serverSliders.length > 0
        ? App.state.serverSliders
        : ["assets/slider1.png"];
    const wrapper = document.getElementById("home-slider");
    if (!wrapper) return;
    wrapper.innerHTML = '<div class="slider-timer"></div>';
    let curr = 0;
    const render = (idx) => {
      const imgUrl = sliders[idx];
      const div = document.createElement("div");
      div.className = "slide active";
      div.innerHTML = `
                <div class="slide-bg" style="background-image: url('${imgUrl}'), url('${DEFAULT_ASSETS.banner}')"></div>
                <div class="slide-ui">
                    <div class="cyber-pane">
                        <h1 class="glitch-title">HAWAI STORE</h1>
                        <div class="slide-sub">GAME TOPUP CENTER</div>
                    </div>
                </div>`;
      const old = wrapper.querySelector(".slide");
      if (old) {
        old.classList.remove("active");
        setTimeout(() => old.remove(), 1000);
      }
      wrapper.appendChild(div);
      if (window.innerWidth > 768) {
        const t = div.querySelector(".glitch-title");
        if (t) new TextScramble(t).setText("HAWAI OMEGA");
      }
    };
    render(0);
    App.sliderInterval = setInterval(() => {
      curr = (curr + 1) % sliders.length;
      render(curr);
      const bar = document.querySelector(".slider-timer");
      if (bar) {
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = "progress 5s linear forwards";
      }
    }, 5000);
  },
};

// --- LOGIC TRANSAKSI (FIXED REDIRECT) ---
const Terminal = {
  openPaymentSelect: () => {
    const { selectedItem, paymentChannels, transactionType } = App.state;

    if (transactionType === "GAME") {
      const uid = document.getElementById("uid").value;
      if (!uid) return alert("Masukkan User ID dulu!");
    }

    if (!selectedItem) return alert("Pilih Item dulu!");

    const listDiv = document.getElementById("paymentList");
    listDiv.innerHTML = "";

    if (!paymentChannels || paymentChannels.length === 0) {
      listDiv.innerHTML = `<div class="alert alert-danger text-center">Metode Pembayaran Tidak Tersedia.</div>`;
    } else {
      paymentChannels.forEach((ch) => {
        if (transactionType === "COIN" && ch.code === "HAWAI_COIN") return;

        let fee = ch.total_fee?.flat || 0;
        let total = selectedItem.price + fee;
        let balanceCheck = "";

        if (ch.code === "HAWAI_COIN") {
          const userBalance = Auth.user ? Auth.user.hawai_coins : 0;
          if (!Auth.user) {
            balanceCheck = `<small class="text-danger d-block">Login required</small>`;
          } else if (userBalance < total) {
            balanceCheck = `<small class="text-danger d-block">Saldo kurang (Sisa: ${userBalance})</small>`;
          } else {
            balanceCheck = `<small class="text-success d-block">Saldo cukup (Sisa: ${userBalance})</small>`;
          }
        }

        listDiv.innerHTML += `
                <div class="d-flex align-items-center gap-3 p-3 border rounded bg-secondary text-white mb-2" 
                     style="cursor:pointer;" 
                     onclick="Terminal.processTransaction('${ch.code}')">
                    <img src="${ch.icon_url}" style="width:50px; background:white; border-radius:5px;">
                    <div class="flex-grow-1">
                        <div class="fw-bold">${ch.name}</div>
                        <small class="text-warning">Total: Rp ${total.toLocaleString()}</small>
                        ${balanceCheck}
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>`;
      });
    }

    document.getElementById("paymentModal").classList.remove("hidden");
  },

  processTransaction: async (method) => {
    const { selectedItem, transactionType } = App.state;

    const payload = {
      sku: selectedItem.code,
      amount: selectedItem.price,
      method: method,
      user_uid: Auth.user ? Auth.user.uid : null,
      user_name: Auth.user ? Auth.user.name : "Guest",
    };

    let endpoint = "/transaction";

    if (transactionType === "GAME") {
      const uid = document.getElementById("uid").value;
      const zone = document.getElementById("zone")
        ? document.getElementById("zone").value
        : "";
      payload.customer_no = uid + (zone ? ` (${zone})` : "");
      payload.game = "Game";

      let finalNickname = App.state.nickname;
      if (!finalNickname) {
        const nickElement = document.querySelector("#nick-result span span");
        if (nickElement) finalNickname = nickElement.innerText;
      }
      payload.nickname = finalNickname || "-";

      if (method === "HAWAI_COIN" && !Auth.user) {
        alert("Silakan Login terlebih dahulu.");
        return;
      }
    } else if (transactionType === "COIN") {
      endpoint = "/topup-coin";
    }

    const btn =
      document.querySelector(".btn-pay-now") ||
      document.querySelector("button.sp-btn");
    if (btn) {
      btn.innerHTML = "Memproses...";
      btn.disabled = true;
    }

    App.closeModal("paymentModal");

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        // [FIXED] Redirect ke invoice.html internal, bukan checkout_url Tripay
        window.location.href = `/invoice.html?ref=${json.data.reference}`;
      } else {
        throw new Error(json.message || "Gagal Transaksi");
      }
    } catch (e) {
      alert("Error: " + e.message);
      if (btn) {
        btn.innerHTML = "BELI SEKARANG";
        btn.disabled = false;
      }
    }
  },
};

const Receipt = {
  show: () => {
    const d = App.state.selectedItem;
    const u = document.getElementById("uid").value;
    document.getElementById("modal-receipt").classList.remove("hidden");
    document.getElementById("receipt-data").innerHTML =
      `<div class="rc-row"><span>ITEM</span><span>${d.name}</span></div><div class="rc-row"><span>ID</span><span>${u}</span></div><div class="rc-row fw-bold"><span>TOTAL</span><span>Rp ${d.price.toLocaleString()}</span></div>`;
  },
  close: () => {
    document.getElementById("modal-receipt").classList.add("hidden");
    App.router("home");
  },
};

// --- 3D WORLD ---
const World = {
  init: () => {
    const cvs = document.getElementById("webgl-canvas");
    if (!cvs) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020203, 0.025);
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 3, 10);
    const renderer = new THREE.WebGLRenderer({ canvas: cvs, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const gridGeo = new THREE.PlaneGeometry(200, 200, 60, 60);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    scene.add(grid);
    const starGeo = new THREE.BufferGeometry();
    const count = window.innerWidth < 768 ? 300 : 1000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 120;
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xff0055, size: 0.1 }),
    );
    scene.add(stars);
    function animate() {
      requestAnimationFrame(animate);
      grid.position.z = (Date.now() * 0.005) % 3;
      stars.rotation.y += 0.0005;
      renderer.render(scene, camera);
    }
    animate();
    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  },
};

window.onload = App.init;
