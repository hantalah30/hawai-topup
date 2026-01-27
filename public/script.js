// ==========================================
// 1. CONFIG & UTILS
// ==========================================
if (typeof API_URL === "undefined") var API_URL = "/api";

const CONFIG = {
  rewardPercent: 5, // Default, akan diupdate dari server
};

// --- AUDIO SYSTEM (Dari Script Lama) ---
const Sound = {
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  play: (f, t, d, v = 0.05) => {
    if (window.innerWidth < 768) return; // Hemat baterai di HP
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
  success: () => {
    Sound.play(600, "square", 0.1);
    setTimeout(() => Sound.play(1200, "square", 0.4), 100);
  },
};

// --- TEXT SCRAMBLE EFFECT (Dari Script Lama) ---
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
      this.queue.push({
        from,
        to,
        start: Math.floor(Math.random() * 40),
        end: Math.floor(Math.random() * 40) + 40,
      });
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
          char = this.chars[Math.floor(Math.random() * this.chars.length)];
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
}

// ==========================================
// 2. AUTH SYSTEM
// ==========================================
const Auth = {
  user: null,
  init: () => {
    if (!firebase.apps.length) return;
    firebase.auth().onAuthStateChanged(async (u) => {
      if (u) {
        try {
          const token = await u.getIdToken();
          const res = await fetch(`${API_URL}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: token }),
          });
          const data = await res.json();
          if (data.success) Auth.user = data.user;
          Auth.updateUI(true);
        } catch (e) {
          console.error("Auth Sync Error", e);
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
      .catch((e) => alert(e.message));
  },
  signOut: () => firebase.auth().signOut(),
  updateUI: (isLogin) => {
    const btn = document.getElementById("btnLogin");
    const info = document.getElementById("userInfo");
    if (isLogin && Auth.user) {
      btn.classList.add("hidden");
      info.classList.remove("hidden");
      document.getElementById("userName").innerText =
        Auth.user.name.split(" ")[0];
      document.getElementById("userCoins").innerText = (
        Auth.user.hawai_coins || 0
      ).toLocaleString();
      document.getElementById("userImg").src = Auth.user.picture;
    } else {
      btn.classList.remove("hidden");
      info.classList.add("hidden");
    }
  },
};

// ==========================================
// 3. MAIN APP LOGIC
// ==========================================
const App = {
  state: {
    products: [],
    games: [],
    channels: [],
    selectedItem: null,
    serverBanners: {},
  },

  init: async () => {
    Auth.init();
    Visuals.init(); // Menggunakan Visual Grid Cyberpunk yang lama

    // Listener Global Suara
    document.addEventListener("click", () => Sound.click());

    await Promise.all([App.fetchData(), App.fetchChannels()]);
    App.router("home");
  },

  fetchData: async () => {
    const res = await fetch(`${API_URL}/init-data`);
    const data = await res.json();
    App.state.products = data.products || [];
    App.state.serverBanners = data.banners || {};
    App.state.serverSliders = data.sliders || []; // Dipakai untuk Hero Slider
    if (data.reward_percent) CONFIG.rewardPercent = data.reward_percent;

    const brands = [...new Set(App.state.products.map((p) => p.brand))];
    App.state.games = brands.map((b) => ({
      id: b,
      name: b,
      img:
        App.state.products.find((p) => p.brand === b)?.image ||
        "assets/default.png",
      banner: App.state.serverBanners[b] || "assets/banner-def.png",
    }));
  },

  fetchChannels: async () => {
    try {
      const res = await fetch(`${API_URL}/channels`);
      const json = await res.json();
      App.state.channels = json.data || [];
    } catch (e) {}
  },

  router: (page, param) => {
    const vp = document.getElementById("viewport");
    vp.innerHTML = "";
    window.scrollTo(0, 0);

    // Animasi transisi sederhana (GSAP)
    if (typeof gsap !== "undefined")
      gsap.fromTo(
        vp,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.4 },
      );

    if (page === "home") App.renderHome(vp);
    else if (page === "order") App.renderOrder(vp, param);
  },

  // --- RENDER HOME (Hybrid: Struktur Baru + Efek Lama) ---
  renderHome: (c) => {
    let sliderHtml = "";
    // Jika ada slider dari server, pakai itu. Jika tidak, pakai default
    const sliders = App.state.serverSliders.length
      ? App.state.serverSliders
      : ["assets/banner-def.png"];

    // Hero Section dengan Text Scramble
    let html = `
        <div class="hero-section" style="background-image: url('${sliders[0]}')">
            <h1 class="hero-title glitch-text">HAWAI <span class="text-accent">STORE</span></h1>
            <p>Next Gen Gaming Topup Center</p>
        </div>
        <div class="container grid-games">`;

    App.state.games.forEach((g) => {
      let img =
        g.img.startsWith("http") || g.img.startsWith("data")
          ? g.img
          : `${API_URL.replace("/api", "")}/${g.img}`;

      // Tambahkan onmouseenter="App.tilt(this)" untuk efek 3D lama
      html += `
            <div class="game-card glass-panel" onclick="App.router('order', '${g.id}')" onmouseenter="App.tilt(this)">
                <img src="${img}" class="game-icon">
                <div class="game-info">
                    <h4>${g.name}</h4>
                    <span class="badge-online">Online</span>
                </div>
            </div>`;
    });
    html += `</div>`;
    c.innerHTML = html;

    // Init Text Scramble
    const title = c.querySelector(".glitch-text");
    if (title) new TextScramble(title).setText("HAWAI OMEGA");
  },

  // --- RENDER ORDER (Hybrid: Fitur Baru + Cek Nickname Lama) ---
  renderOrder: (c, brand) => {
    const items = App.state.products
      .filter((p) => p.brand === brand && p.is_active !== false)
      .sort((a, b) => a.price_sell - b.price_sell);

    const gameData = App.state.games.find((g) => g.id === brand);
    const bannerUrl = gameData ? gameData.banner : "";
    const isML = brand.toLowerCase().includes("mobile");

    // Input Zone hanya muncul jika Mobile Legends (Fitur Lama)
    const zoneInput = isML
      ? `<input id="zone" type="number" class="input-clean sm" placeholder="Zone" oninput="App.checkNickname('${brand}')">`
      : `<input id="zone" type="hidden" value="">`;

    c.innerHTML = `
        <div class="order-header" style="background-image: url('${bannerUrl}');">
            <div class="overlay-grad"></div>
            <div class="container relative z-10 pt-5">
                 <button onclick="App.router('home')" class="btn-back"><i class="fas fa-arrow-left"></i> Kembali</button>
                 <h2 class="page-title mt-2">${brand}</h2>
            </div>
        </div>

        <div class="container -mt-4 fade-in">
            <div class="section-box">
                <div class="step-num">1</div>
                <div class="form-group">
                    <label>Masukkan User ID</label>
                    <div class="input-group">
                        <input id="uid" type="number" class="input-clean" placeholder="ID Player" onchange="App.checkNickname('${brand}')">
                        ${zoneInput}
                    </div>
                    <div id="nick-result" class="mt-2 text-sm text-accent font-bold"></div>
                </div>
            </div>

            <div class="section-box">
                <div class="step-num">2</div>
                <label>Pilih Nominal</label>
                <div class="grid-items">
                    ${items
                      .map((p) => {
                        // Hitung Reward (Fitur Baru)
                        const point = Math.floor(
                          p.price_sell * (CONFIG.rewardPercent / 100),
                        );
                        return `
                        <div class="item-card" onclick="App.selectItem(this, '${p.sku}', ${p.price_sell}, '${p.name}', ${point})">
                            <div class="item-name">${p.name}</div>
                            <div class="item-price">Rp ${p.price_sell.toLocaleString()}</div>
                            <div class="item-bonus">
                                <i class="fas fa-gift"></i> +${point} Coins
                            </div>
                        </div>`;
                      })
                      .join("")}
                </div>
            </div>

            <div class="fixed-action">
                <div class="total-price">
                    <small>Total Bayar</small>
                    <span id="displayTotal">Rp 0</span>
                </div>
                <button class="btn-primary" onclick="App.openPayment('GAME')">BELI SEKARANG</button>
            </div>
        </div>`;
  },

  // --- CEK NICKNAME (Fitur Penting Script Lama) ---
  checkNickname: async (gameTitle) => {
    const uid = document.getElementById("uid").value;
    const zone = document.getElementById("zone").value;
    const resEl = document.getElementById("nick-result");

    if (uid.length < 4) {
      resEl.innerHTML = "";
      return;
    }
    if (gameTitle.toLowerCase().includes("mobile") && zone.length < 3) return;

    resEl.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Mengecek ID...`;

    try {
      const response = await fetch(`${API_URL}/check-nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: gameTitle, id: uid, zone: zone }),
      });
      const data = await response.json();
      if (data.success) {
        resEl.innerHTML = `<i class="fas fa-check-circle text-success"></i> ${data.name}`;
        Sound.success();
      } else {
        resEl.innerHTML = `<span class="text-danger">ID Tidak Ditemukan</span>`;
      }
    } catch (e) {
      resEl.innerHTML = `<span class="text-danger">Gagal Cek ID</span>`;
    }
  },

  selectItem: (el, sku, price, name, point) => {
    document
      .querySelectorAll(".item-card")
      .forEach((e) => e.classList.remove("active"));
    el.classList.add("active");
    App.state.selectedItem = { sku, price, name, point };
    document.getElementById("displayTotal").innerText =
      `Rp ${price.toLocaleString()}`;
    Sound.click();
  },

  // --- MODAL & PAYMENT LOGIC (Script Baru) ---
  openTopupModal: () => {
    if (!Auth.user) return alert("Silakan Login Dulu!");
    document.getElementById("coinModal").classList.remove("hidden");
    Sound.click();
  },

  selectCoin: (amount) => {
    document.getElementById("customCoin").value = amount;
    Sound.click();
  },

  processTopupCoin: () => {
    const amount = document.getElementById("customCoin").value;
    if (amount < 10000) return alert("Minimal Rp 10.000");
    App.state.selectedItem = {
      sku: "DEPOSIT",
      price: parseInt(amount),
      name: "Topup Coin",
    };
    App.closeModal("coinModal");
    App.openPayment("COIN");
  },

  openPayment: (type) => {
    const { selectedItem } = App.state;
    if (!selectedItem) return alert("Pilih Item Dulu");
    if (type === "GAME" && !document.getElementById("uid").value)
      return alert("Isi ID Dulu");

    const list = document.getElementById("paymentList");
    list.innerHTML = "";

    App.state.channels.forEach((ch) => {
      // Sembunyikan opsi Coin jika sedang Topup Coin
      if (type === "COIN" && ch.code === "HAWAI_COIN") return;

      let balanceInfo = "";
      let opacity = "1";
      let clickAction = `onclick="App.execPay('${ch.code}', '${type}')"`;

      // Logic Cek Saldo Coin
      if (ch.code === "HAWAI_COIN") {
        const bal = Auth.user ? Auth.user.hawai_coins : 0;
        if (!Auth.user) {
          balanceInfo = `<small class="text-danger">Login diperlukan</small>`;
          opacity = "0.5";
          clickAction = `onclick="alert('Harus login!')"`;
        } else if (bal < selectedItem.price) {
          balanceInfo = `<small class="text-danger">Saldo Kurang (${bal})</small>`;
          opacity = "0.5";
          clickAction = `onclick="alert('Saldo Kurang!')"`;
        } else {
          balanceInfo = `<small class="text-accent">Sisa Saldo: ${bal.toLocaleString()}</small>`;
        }
      }

      list.innerHTML += `
            <div class="pay-item" style="opacity:${opacity}" ${clickAction}>
                <img src="${ch.icon_url}" class="pay-icon">
                <div class="pay-info">
                    <b>${ch.name}</b>
                    ${balanceInfo}
                </div>
                <div class="pay-price">Rp ${selectedItem.price.toLocaleString()}</div>
            </div>`;
    });

    document.getElementById("paymentModal").classList.remove("hidden");
    Sound.click();
  },

  execPay: async (method, type) => {
    const { selectedItem } = App.state;
    let payload = {
      sku: selectedItem.sku,
      amount: selectedItem.price,
      method: method,
      user_uid: Auth.user ? Auth.user.uid : null,
      user_name: Auth.user ? Auth.user.name : "Guest",
    };

    let endpoint = "/transaction";

    if (type === "GAME") {
      const uid = document.getElementById("uid").value;
      const zone = document.getElementById("zone").value;
      payload.customer_no = uid + zone;
      payload.game = "Game";
    } else {
      endpoint = "/topup-coin";
    }

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        window.location.href = json.data.checkout_url;
      } else {
        throw new Error(json.message);
      }
    } catch (e) {
      alert("Gagal: " + e.message);
    }
  },

  closeModal: (id) => document.getElementById(id).classList.add("hidden"),

  // --- TILT EFFECT (Dari Script Lama - Untuk Card) ---
  tilt: (card) => {
    if (window.innerWidth < 768) return;
    Sound.hover();
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
  },
};

// ==========================================
// 4. VISUALS (GRID CYBERPUNK - Script Lama)
// ==========================================
// Kita pakai yang lama karena lebih keren dari partikel baru
const Visuals = {
  init: () => {
    const cvs = document.getElementById("webgl-canvas");
    if (!cvs) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020203, 0.025); // Fog hitam

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 3, 10);

    const renderer = new THREE.WebGLRenderer({ canvas: cvs, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Grid Effect
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

    // Stars Effect
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
      grid.position.z = (Date.now() * 0.005) % 3; // Grid bergerak maju
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
