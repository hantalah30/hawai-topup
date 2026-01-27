const API_URL = "/api";

// --- PRESET & SOUND (Biarkan Sama) ---
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
  success: () => {
    Sound.play(600, "square", 0.1);
    setTimeout(() => Sound.play(1200, "square", 0.4), 100);
  },
};
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

const App = {
  state: {
    rawProducts: [],
    gamesList: [],
    paymentChannels: [],
    serverBanners: {},
    serverSliders: [],
    selectedItem: null,
    user: null, // Menyimpan data user login
  },

  init: async () => {
    // Cek Login State Firebase
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        // User Login, Ambil Data Saldo dari Backend
        try {
          const res = await fetch(`${API_URL}/user/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
            }),
          });
          const json = await res.json();
          if (json.success) {
            App.state.user = json.data;
            App.updateUIUser();
          }
        } catch (e) {
          console.error("Login Sync Error", e);
        }
      } else {
        App.state.user = null;
        App.updateUIUser();
      }
    });

    await Promise.all([App.fetchData(), App.fetchPaymentChannels()]);
    // LANGSUNG MASUK TANPA LOADING
    App.router("home");
  },

  updateUIUser: () => {
    const u = App.state.user;
    const navContainer = document.getElementById("user-nav-area");

    if (u) {
      // Tampilan SUDAH Login
      navContainer.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="text-end text-white">
                    <div class="fw-bold" style="font-size:0.9rem;">${u.displayName}</div>
                    <div class="text-warning small">
                        <i class="fas fa-coins"></i> Rp ${u.balance.toLocaleString()}
                    </div>
                </div>
                <img src="${u.photoURL || "assets/default-user.png"}" class="rounded-circle border border-secondary" style="width:35px;height:35px;">
                <button onclick="firebase.auth().signOut()" class="btn btn-sm btn-outline-danger"><i class="fas fa-sign-out-alt"></i></button>
            </div>
          `;
    } else {
      // Tampilan BELUM Login
      navContainer.innerHTML = `
            <button onclick="App.loginGoogle()" class="btn btn-outline-light btn-sm rounded-pill px-3">
                <i class="fab fa-google me-2"></i> Login
            </button>
          `;
    }
  },

  loginGoogle: () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase
      .auth()
      .signInWithPopup(provider)
      .catch((e) => alert(e.message));
  },

  fetchData: async () => {
    try {
      const res = await fetch(`${API_URL}/init-data`);
      const data = await res.json();
      App.state.rawProducts = data.products || [];
      App.state.serverSliders = data.sliders || [];
      App.state.serverBanners = data.banners || {};

      const uniqueBrands = [
        ...new Set(App.state.rawProducts.map((p) => p.brand)),
      ];
      App.state.gamesList = uniqueBrands
        .map((brand) => {
          if (!brand) return null;
          const preset = PRESET_ASSETS[brand] || {};
          return {
            id: brand,
            name: brand,
            img: preset.logo || DEFAULT_ASSETS.logo,
            banner:
              App.state.serverBanners[brand] ||
              preset.banner ||
              DEFAULT_ASSETS.banner,
            theme: preset.theme || "#fff",
          };
        })
        .filter((g) => g);
    } catch (e) {
      console.error(e);
    }
  },

  fetchPaymentChannels: async () => {
    try {
      const res = await fetch(`${API_URL}/channels`);
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        App.state.paymentChannels = json.data;
      }
    } catch (e) {}
  },

  router: (page, param) => {
    const vp = document.getElementById("viewport");
    if (!vp) return;
    vp.innerHTML = "";
    if (page === "home") App.renderHome(vp);
    else if (page === "order") App.renderOrderPage(vp, param);
  },

  renderHome: (container) => {
    if (App.sliderInterval) clearInterval(App.sliderInterval);
    let html = `
            <div class="hero-slider" id="home-slider" style="margin-top:20px;"></div>
            <div class="container mt-4">
                <h4 class="text-white mb-3" style="border-left: 4px solid #00f3ff; padding-left:10px;">POPULAR GAMES</h4>
                <div class="row">`;
    App.state.gamesList.forEach((g) => {
      html += `
            <div class="col-4 col-md-3 mb-3 p-1" onclick="App.router('order', '${g.id}')">
                <div class="game-card">
                    <img src="${g.img}" class="game-icon" onerror="this.src='assets/default.png'">
                    <div class="game-name">${g.name}</div>
                </div>
            </div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
    App.startSlider();
  },

  renderOrderPage: (container, brandName) => {
    const items = App.state.rawProducts
      .filter((p) => p.brand === brandName && p.is_active !== false)
      .sort((a, b) => a.price_sell - b.price_sell);
    const game = App.state.gamesList.find((g) => g.id === brandName) || {
      banner: DEFAULT_ASSETS.banner,
    };

    container.innerHTML = `
        <div class="game-banner" style="background-image: url('${game.banner}');"></div>
        <div class="container" style="margin-top: -50px; position: relative; z-index: 2;">
            
            <div class="card bg-dark border-0 shadow-lg mb-3">
                <div class="card-body p-3">
                    <h2 class="text-white fw-bold mb-0">${brandName}</h2>
                    <p class="text-muted small mb-0">Instant Process 24/7</p>
                </div>
            </div>

            <div class="card bg-dark border-secondary mb-3">
                <div class="card-header bg-transparent border-secondary text-white">1. Data Akun</div>
                <div class="card-body">
                    <div class="d-flex gap-2">
                        <input id="uid" class="form-control bg-secondary text-white border-0" placeholder="User ID">
                        <input id="zone" class="form-control bg-secondary text-white border-0" placeholder="Zone ID" style="max-width:100px;">
                    </div>
                    <div id="nick-result" class="mt-2 text-info small"></div>
                </div>
            </div>

            <div class="card bg-dark border-secondary mb-3">
                <div class="card-header bg-transparent border-secondary text-white">2. Pilih Item</div>
                <div class="card-body p-2">
                    <div class="row g-2">
                        ${items
                          .map(
                            (p) => `
                            <div class="col-6 col-md-4">
                                <div class="item-card btn btn-outline-secondary w-100 p-2 d-flex flex-column align-items-center" 
                                     onclick="App.selectItem(this, '${p.sku}', ${p.price_sell}, '${p.name}')">
                                    <div class="fw-bold small">${p.name}</div>
                                    <div class="text-warning small">Rp ${p.price_sell.toLocaleString()}</div>
                                </div>
                            </div>
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            </div>

            <div id="paymentModal" class="payment-modal" style="display:none;">
                <div class="payment-content bg-dark border border-secondary">
                    <div class="d-flex justify-content-between p-3 border-bottom border-secondary">
                        <h5 class="text-white m-0">Metode Pembayaran</h5>
                        <button onclick="Terminal.closeModal()" class="btn-close btn-close-white"></button>
                    </div>
                    <div id="paymentList" class="p-3" style="max-height:60vh; overflow-y:auto;"></div>
                </div>
            </div>

            <div class="fixed-bottom p-3 bg-dark border-top border-secondary">
                <button class="btn btn-primary w-100 fw-bold py-3 shadow-neon" onclick="Terminal.openPaymentSelect()">BELI SEKARANG</button>
            </div>
        </div>
    `;

    // Auto check nickname trigger
    document
      .getElementById("uid")
      .addEventListener("change", App.checkNickname);
    document
      .getElementById("zone")
      .addEventListener("change", App.checkNickname);
  },

  checkNickname: async () => {
    const uid = document.getElementById("uid").value;
    const zone = document.getElementById("zone").value;
    if (uid.length < 4) return;

    const resDiv = document.getElementById("nick-result");
    resDiv.innerHTML = "Mengecek ID...";

    const gameTitle = document.querySelector("h2").innerText;

    try {
      const res = await fetch(`${API_URL}/check-nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: gameTitle, id: uid, zone: zone }),
      });
      const data = await res.json();
      if (data.success)
        resDiv.innerHTML = `<span class="text-success">✅ ${data.name}</span>`;
      else
        resDiv.innerHTML = `<span class="text-danger">❌ ID Tidak Ditemukan</span>`;
    } catch (e) {
      resDiv.innerHTML = "";
    }
  },

  selectItem: (el, sku, price, name) => {
    document
      .querySelectorAll(".item-card")
      .forEach((b) => b.classList.remove("active", "bg-info", "text-dark"));
    el.classList.add("active", "bg-info", "text-dark");
    App.state.selectedItem = { sku, price, name };
    Sound.click();
  },

  startSlider: () => {
    const sliders =
      App.state.serverSliders.length > 0
        ? App.state.serverSliders
        : ["assets/slider1.png"];
    const wrapper = document.getElementById("home-slider");
    if (!wrapper) return;
    let curr = 0;
    const render = () => {
      wrapper.innerHTML = `<img src="${sliders[curr]}" class="w-100 rounded shadow" style="height:150px; object-fit:cover;">`;
    };
    render();
    App.sliderInterval = setInterval(() => {
      curr = (curr + 1) % sliders.length;
      render();
    }, 4000);
  },
};

const Terminal = {
  openPaymentSelect: () => {
    const { selectedItem, paymentChannels, user } = App.state;
    const uid = document.getElementById("uid").value;

    if (!uid) return alert("Masukkan User ID!");
    if (!selectedItem) return alert("Pilih Item!");

    const listDiv = document.getElementById("paymentList");
    listDiv.innerHTML = "";

    // 1. Opsi HAWAI COIN (Paling Atas)
    if (user) {
      const saldoCukup = user.balance >= selectedItem.price;
      listDiv.innerHTML += `
            <div class="d-flex align-items-center gap-3 p-3 border rounded mb-2 ${saldoCukup ? "bg-secondary text-white" : "bg-secondary text-muted"}" 
                 style="cursor:${saldoCukup ? "pointer" : "not-allowed"}; opacity: ${saldoCukup ? 1 : 0.6}"
                 onclick="${saldoCukup ? `Terminal.processTransaction('HAWAI_COIN')` : ""}">
                <i class="fas fa-coins text-warning fs-2"></i>
                <div class="flex-grow-1">
                    <div class="fw-bold">HAWAI COIN (Saldo: Rp ${user.balance.toLocaleString()})</div>
                    <small class="${saldoCukup ? "text-success" : "text-danger"}">
                        ${saldoCukup ? "Saldo Cukup - Proses Instan" : "Saldo Tidak Cukup"}
                    </small>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
            <hr class="border-secondary">
        `;
    } else {
      listDiv.innerHTML += `
            <div class="alert alert-info text-center small p-2" onclick="App.loginGoogle()" style="cursor:pointer">
                Login untuk bayar pakai Saldo Hawai Coin
            </div>`;
    }

    // 2. Opsi Tripay
    if (paymentChannels && paymentChannels.length > 0) {
      paymentChannels.forEach((ch) => {
        let total = selectedItem.price + (ch.total_fee?.flat || 0);
        listDiv.innerHTML += `
                <div class="d-flex align-items-center gap-3 p-3 border rounded mb-2 bg-secondary text-white" 
                     style="cursor:pointer;" 
                     onclick="Terminal.processTransaction('${ch.code}')">
                    <img src="${ch.icon_url}" style="width:40px; background:#fff; padding:2px; rounded;">
                    <div class="flex-grow-1">
                        <div class="fw-bold">${ch.name}</div>
                        <small class="text-warning">Rp ${total.toLocaleString()}</small>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>`;
      });
    } else {
      listDiv.innerHTML += `<div class="text-center text-muted">Loading channel pembayaran...</div>`;
    }

    document.getElementById("paymentModal").style.display = "flex";
  },

  closeModal: () => {
    document.getElementById("paymentModal").style.display = "none";
  },

  processTransaction: async (method) => {
    const { selectedItem, user } = App.state;
    const uid = document.getElementById("uid").value;
    const zone = document.getElementById("zone")
      ? document.getElementById("zone").value
      : "";

    const btn = document.querySelector(".btn-primary");
    btn.innerText = "Memproses...";
    btn.disabled = true;
    Terminal.closeModal();

    try {
      const res = await fetch(`${API_URL}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: selectedItem.sku,
          amount: selectedItem.price,
          customer_no: uid + (zone ? ` (${zone})` : ""),
          method: method,
          nickname: App.state.nickname || "User",
          game: "Game",
          uid: user ? user.uid : null, // Kirim UID user login
        }),
      });
      const json = await res.json();

      if (json.success) {
        window.location.href = json.data.checkout_url;
      } else {
        throw new Error(json.message || "Gagal");
      }
    } catch (e) {
      alert("Gagal: " + e.message);
      btn.innerText = "BELI SEKARANG";
      btn.disabled = false;
    }
  },
};

window.onload = App.init;
