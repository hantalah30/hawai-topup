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
    if (!firebase.apps.length) return;

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
    firebase.auth().signInWithPopup(provider).catch((error) => {
      App.showToast("Login Gagal: " + error.message, "error");
    });
  },

  signOut: () => { firebase.auth().signOut(); },

  updateUI: (isLoggedIn) => {
    const btn = document.getElementById("btnLogin");
    const info = document.getElementById("userInfo");

    if (isLoggedIn && Auth.user) {
      if (btn) btn.classList.add("hidden");
      if (info) {
        info.classList.remove("hidden");
        document.getElementById("userName").innerText = Auth.user.name.split(" ")[0];
        document.getElementById("userCoins").innerText = (Auth.user.hawai_coins || 0).toLocaleString();
        document.getElementById("userImg").src = Auth.user.picture;

        // UPGRADE: Update XP Bar
        FX.updateXP(Auth.user.hawai_coins || 0);
      }
    } else {
      if (btn) btn.classList.remove("hidden");
      if (info) info.classList.add("hidden");
    }
  },
};

// --- PRESET ASSETS ---
const PRESET_ASSETS = {
  "MOBILE LEGENDS": { logo: "assets/lance2.png", banner: "assets/ml-banner.png", theme: "#00f3ff" },
  "Free Fire": { logo: "assets/ff.jpg", banner: "assets/ff-banner.jpg", theme: "#ff9900" },
  "PUBG Mobile": { logo: "https://cdn-icons-png.flaticon.com/512/3408/3408506.png", banner: "https://wallpaperaccess.com/full/1239676.jpg", theme: "#f2a900" },
  "Valorant": { logo: "https://img.icons8.com/color/480/valorant.png", banner: "https://images4.alphacoders.com/114/1149479.jpg", theme: "#ff4655" },
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
    if (Sound.ctx.state === "suspended") Sound.ctx.resume().catch(() => { });

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

// --- FX ENGINE (GOD TIER) ---
const FX = {
  init: () => {
    FX.initCursor();
    FX.initTicker();
    FX.initTilt();
  },

  initCursor: () => {
    if (window.innerWidth < 768) return; // Disable on mobile

    const cursor = document.createElement("div");
    cursor.className = "custom-cursor";
    document.body.appendChild(cursor);

    const trail = document.createElement("div");
    trail.className = "cursor-trail";
    document.body.appendChild(trail);

    document.addEventListener("mousemove", (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";

      // Trail delay
      setTimeout(() => {
        trail.style.left = e.clientX - 3 + "px";
        trail.style.top = e.clientY - 3 + "px";
      }, 50);

      // Hover effect
      const target = e.target;
      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('.game-card') || target.closest('.item-card')) {
        cursor.classList.add("hovered");
      } else {
        cursor.classList.remove("hovered");
      }
    });
  },

  scrambleText: (el) => {
    const original = el.innerText;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";
    let iterations = 0;

    const interval = setInterval(() => {
      el.innerText = original.split("").map((letter, index) => {
        if (index < iterations) return original[index];
        return chars[Math.floor(Math.random() * chars.length)];
      }).join("");

      if (iterations >= original.length) clearInterval(interval);
      iterations += 1 / 3;
    }, 30);
  },

  initTicker: () => {
    // Inject ticker into header if not present
    const header = document.querySelector('.cyber-header');
    if (header && !document.querySelector('.ticker-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'ticker-wrap';
      wrap.innerHTML = `<div class="ticker" id="liveTicker"></div>`;
      header.prepend(wrap);

      // Feed data
      const names = ["Zuxxy", "Ryzen", "Lemon", "Jess", "Oura", "Donkey", "R7", "Alberttt"];
      const items = ["366 Diamonds", "Weekly Diamond Pass", "Twilight Pass", "1000 CP", "Starlight Member"];
      const ticker = document.getElementById("liveTicker");

      // Generate content
      let content = "";
      for (let i = 0; i < 10; i++) {
        let n = names[Math.floor(Math.random() * names.length)];
        let item = items[Math.floor(Math.random() * items.length)];
        content += `<div class="ticker-item"><i class="fas fa-shopping-cart"></i> ${n} bought ${item} <span class="text-muted">Just now</span></div>`;
      }
      ticker.innerHTML = content + content; // Duplicate for smooth loop
    }
  },

  updateXP: (coins) => {
    // Max Level at 100,000 coins
    const max = 100000;
    const pct = Math.min((coins / max) * 100, 100);

    const panel = document.querySelector('.user-panel');
    if (panel) {
      let bar = panel.querySelector('.xp-bg');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'xp-bg';
        panel.appendChild(bar);
      }
      setTimeout(() => bar.style.width = pct + "%", 500);
    }
  },

  initTilt: () => {
    // Simple Vanilla Tilt implementation for 3D Cards
    document.addEventListener("mousemove", (e) => {
      document.querySelectorAll('.game-card, .item-card, .form-panel').forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if mouse is near/over element
        if (x > -50 && x < rect.width + 50 && y > -50 && y < rect.height + 50) {
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotateX = ((y - centerY) / centerY) * -10; // Max 10deg
          const rotateY = ((x - centerX) / centerX) * 10;

          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
        } else {
          card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
        }
      });
    });
  }
};

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
    activeBrand: null,
    refId: null,
    nickname: null,
    displayedGames: [], // For filtering
  },

  init: async () => {
    Auth.init();
    await Promise.all([App.fetchData(), App.fetchPaymentChannels()]);

    if (typeof World !== "undefined") World.init();
    FX.init(); // Initialize God Tier FX

    App.router("home");
    document.addEventListener("click", () => Sound.click());

    // Inject Footer if not present
    if (!document.getElementById('mainFooter')) {
      const vp = document.getElementById("viewport");
      if (vp) {
        const footer = document.createElement("footer");
        footer.className = "cyber-footer";
        footer.id = "mainFooter";
        footer.innerHTML = `
           <div class="container">
             <div class="footer-grid">
               <div class="footer-brand">
                 <h2 class="text-neon" onmouseover="FX.scrambleText(this)">HAWAI TOPUP</h2>
                 <p class="text-muted">The Next Gen Topup Platform. Instant, Secure, and Aesthetic.</p>
               </div>
               <div class="footer-links">
                 <h4>QUICK LINKS</h4>
                 <ul>
                    <li><a href="#" onclick="App.router('home')">Home</a></li>
                    <li><a href="#" onclick="App.router('history')">History</a></li>
                    <li><a href="#" onclick="App.openTopupModal()">Top Up Coins</a></li>
                 </ul>
               </div>
               <div class="footer-links">
                 <h4>SUPPORT</h4>
                 <ul>
                    <li><a href="#">Contact Us</a></li>
                    <li><a href="#">Terms of Service</a></li>
                    <li><a href="#">Privacy Policy</a></li>
                 </ul>
               </div>
             </div>
             <div class="copy-bar text-center">
               &copy; 2024 Hawai Topup Team. All Rights Reserved.
             </div>
           </div>`;
        vp.after(footer);
      }
    }
  },

  showToast: (msg, type = "success") => {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "cyber-toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `cyber-toast ${type}`;
    const icon = type === "error" ? "fa-exclamation-triangle" : "fa-check-circle";
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;
    container.appendChild(toast);

    // Sound Effect
    if (type === "error") Sound.play(150, "sawtooth", 0.3);
    else Sound.success();

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  fetchData: async () => {
    try {
      const res = await fetch(`${API_URL}/init-data`);
      const data = await res.json();

      App.state.rawProducts = data.products || [];
      App.state.serverSliders = data.sliders || [];
      App.state.serverBanners = data.banners || {};

      if (data.reward_percent) CONFIG.rewardPercent = data.reward_percent;

      const uniqueBrands = [...new Set(App.state.rawProducts.map((p) => p.brand))];

      App.state.gamesList = uniqueBrands
        .map((brandName) => {
          if (!brandName) return null;
          const preset = PRESET_ASSETS[brandName] || {};
          const adminBanner = App.state.serverBanners[brandName];
          const sampleProduct = App.state.rawProducts.find(
            (p) => p.brand === brandName && !p.image.includes("default")
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

      App.state.displayedGames = [...App.state.gamesList]; // Init Displayed
      App.router("home");
    } catch (e) {
      console.error("Fetch Error:", e);
    }
  },

  fetchPaymentChannels: async () => {
    try {
      const res = await fetch(`${API_URL}/channels`);
      const json = await res.json();
      if (json.success && json.data) App.state.paymentChannels = json.data;
    } catch (e) { console.error("Gagal load channel pembayaran"); }
  },

  router: (page, param = null) => {
    const vp = document.getElementById("viewport");
    if (!vp) return;
    window.scrollTo(0, 0);
    // Remove active class from modals on navigation
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));

    if (page === "home") App.renderHome(vp);
    else if (page === "order") App.renderOrderPage(vp, param);
    else if (page === "history") App.renderHistory(vp);
  },

  openTopupModal: () => {
    if (!Auth.user) return App.showToast("Please Login First!", "error");
    const modal = document.getElementById("coinModal");
    if (modal) modal.classList.add("active");
  },

  selectCoin: (amount) => document.getElementById("customCoin").value = amount,
  closeModal: (id) => document.getElementById(id).classList.remove("active"),

  processTopupCoin: () => {
    const amountInput = document.getElementById("customCoin");
    const amount = parseInt(amountInput.value);

    if (isNaN(amount) || amount < 10000) return App.showToast("Min Topup Rp 10.000", "error");

    App.state.selectedItem = { code: "DEPOSIT", price: amount, name: "Topup Coin" };
    App.state.transactionType = "COIN";

    App.closeModal("coinModal");
    Terminal.openPaymentSelect();
  },

  filterGames: (query) => {
    const q = query.toLowerCase();
    App.state.displayedGames = App.state.gamesList.filter(g => g.name.toLowerCase().includes(q));

    // Re-render only Grid
    const grid = document.getElementById('games-grid-container');
    if (grid) {
      if (App.state.displayedGames.length === 0) {
        grid.innerHTML = `<div class="text-center text-muted" style="grid-column: 1/-1; padding: 50px;">NO GAMES FOUND</div>`;
      } else {
        grid.innerHTML = App.state.displayedGames.map(g => `
                <div class="game-card" onclick="App.router('order', '${g.id}')">
                    <div class="gc-bg" style="background-image: url('${g.banner}');"></div>
                    <div class="gc-info">
                        <div class="gc-name">${g.name}</div>
                        <div class="gc-status">● SERVER ONLINE</div>
                    </div>
                </div>`).join('');
      }
    }
  },

  renderHome: (container) => {
    if (App.sliderInterval) clearInterval(App.sliderInterval);

    // Reset filtering
    App.state.displayedGames = [...App.state.gamesList];

    let html = `
            <div class="hero-slider" id="home-slider"></div>
            <div class="container">
                <h2 class="section-title" onmouseover="FX.scrambleText(this)">TRENDING GAMES</h2>
                
                <!-- SEARCH BAR -->
                <div class="search-wrapper">
                    <i class="fas fa-search search-icon"></i>
                    <input type="text" class="input-holo" placeholder="Search Games..." oninput="App.filterGames(this.value)">
                </div>

                <div class="grid-games" id="games-grid-container">`;

    if (App.state.gamesList.length === 0) {
      html += `<div class="text-center text-muted" style="grid-column: 1/-1; padding: 50px;">LOADING GAMES...</div>`;
    } else {
      App.state.gamesList.forEach((g) => {
        html += `
                    <div class="game-card" onclick="App.router('order', '${g.id}')">
                        <div class="gc-bg" style="background-image: url('${g.banner}');"></div>
                        <div class="gc-info">
                            <div class="gc-name">${g.name}</div>
                            <div class="gc-status">● SERVER ONLINE</div>
                        </div>
                    </div>`;
      });
    }

    html += `</div></div>`;
    container.innerHTML = html;
    App.startSlider();
  },

  renderHistory: async (container) => {
    if (!Auth.user) {
      container.innerHTML = `<div class="container text-center" style="padding-top:100px;">
            <i class="fas fa-lock fa-3x text-pink mb-3"></i>
            <h2>LOGIN REQUIRED</h2>
            <p class="text-muted">Please login to view your mission log.</p>
            <button class="btn-neon mt-3" onclick="Auth.signIn()">Login with Google</button>
          </div>`;
      return;
    }

    container.innerHTML = `<div class="container text-center" style="padding-top:100px;"><i class="fas fa-circle-notch fa-spin fa-2x text-neon"></i><p>Accessing Database...</p></div>`;

    try {
      const res = await fetch(`${API_URL}/transactions?uid=${Auth.user.uid}`);
      let transactions = [];
      if (res.ok) {
        const json = await res.json();
        transactions = json.data || [];
      }

      let html = `
          <div class="container" style="padding-top: 50px;">
              <h2 class="section-title" onmouseover="FX.scrambleText(this)">TRANSACTION LOGS</h2>
              <table class="history-table">
                  <thead>
                      <tr>
                          <th>Date</th>
                          <th>Ref ID</th>
                          <th>Item</th>
                          <th>Price</th>
                          <th>Status</th>
                          <th>Action</th>
                      </tr>
                  </thead>
                  <tbody>`;

      if (transactions.length === 0) {
        html += `<tr><td colspan="6" class="text-center">No transaction data found.</td></tr>`;
      } else {
        transactions.forEach(t => {
          let statusClass = "status-pending";
          if (t.status === "PAID" || t.status === "SUCCESS") statusClass = "status-success";
          if (t.status === "EXPIRED" || t.status === "FAILED") statusClass = "status-failed";

          html += `
                  <tr>
                      <td>${new Date(t.created_at).toLocaleDateString()}</td>
                      <td class="text-neon">#${t.reference}</td>
                      <td>${t.item_name}</td>
                      <td>Rp ${t.amount.toLocaleString()}</td>
                      <td><span class="status-badge ${statusClass}">${t.status}</span></td>
                      <td><a href="/invoice.html?ref=${t.reference}" class="btn-icon"><i class="fas fa-receipt"></i></a></td>
                  </tr>`;
        });
      }

      html += `</tbody></table></div>`;
      container.innerHTML = html;

    } catch (e) {
      container.innerHTML = `<div class="container text-center" style="padding-top:100px;">
            <i class="fas fa-exclamation-triangle fa-3x text-pink mb-3"></i>
            <h2>SYSTEM ERROR</h2>
            <p class="text-muted">Failed to retrieve data logs.</p>
          </div>`;
    }
  },

  renderOrderPage: (container, brandName) => {
    App.state.transactionType = "GAME";
    App.state.nickname = null;
    App.state.activeBrand = brandName;

    const items = App.state.rawProducts
      .filter((p) => p.brand === brandName && p.is_active !== false)
      .sort((a, b) => a.price_sell - b.price_sell);

    // --- CATEGORIZATION LOGIC ---
    const promos = [];
    const members = [];
    const diamonds = [];

    items.forEach((p) => {
      const name = p.name.toLowerCase();
      // 1. PRIORITY: Admin "Hot Deals" Flag (Fire Logo)
      if (p.is_promo === true) {
        promos.push(p);
      }
      // 2. Membership / Pass
      else if (
        name.includes("member") ||
        name.includes("starlight") ||
        name.includes("pass") ||
        name.includes("wdp") ||
        name.includes("bulanan") ||
        name.includes("mingguan") ||
        name.includes("twilight")
      ) {
        members.push(p);
      }
      // 3. Regular (Diamonds)
      else {
        diamonds.push(p);
      }
    });

    const gameData = App.state.gamesList.find((g) => g.id === brandName) || {
      banner: DEFAULT_ASSETS.banner,
      img: DEFAULT_ASSETS.logo,
      theme: "#fff",
    };

    const isML = brandName.toLowerCase().includes("mobile");
    const zoneInput = isML
      ? `<input type="number" id="zone" class="input-cyber" placeholder="Zone" oninput="App.checkNickname()" style="flex:1;">`
      : `<input type="hidden" id="zone" value="">`;

    container.innerHTML = `
            <div class="game-hero-banner" style="background-image: url('${gameData.banner}');"></div>
            
            <div class="container">
                <div class="order-header">
                    <img src="${gameData.img}" class="game-poster">
                    <div class="game-meta" style="flex:1; padding-top:20px;">
                        <h1 class="text-neon" onmouseover="FX.scrambleText(this)">${brandName}</h1>
                        <p class="text-muted">Instant Delivery • Secure Payment • 24/7 Support</p>
                    </div>
                </div>

                <div class="form-panel">
                    <span class="panel-num">01</span>
                    <h3 class="mb-3">ACCOUNT DATA</h3>
                    <div class="d-flex gap-2">
                        <input type="text" id="uid" class="input-cyber" placeholder="User ID" onchange="App.checkNickname()" style="flex:2;">
                        ${zoneInput}
                    </div>
                    <div id="nick-result" class="mt-2 text-neon" style="font-size:0.9rem; min-height:20px;"></div>
                </div>

                <div class="form-panel">
                    <span class="panel-num">02</span>
                    <h3 class="mb-3">SELECT ITEM</h3>
                    
                    ${promos.length > 0 ? `
                        <div class="cat-header cat-hot">
                            <div class="cat-icon"><i class="fas fa-fire"></i></div>
                            <div class="cat-title">HOT DEALS</div>
                        </div>
                        <div class="items-grid">
                            ${promos.map((p) => App.renderItemCard(p, "hot")).join("")}
                        </div>` : ""}

                    ${members.length > 0 ? `
                        <div class="cat-header cat-mem">
                            <div class="cat-icon"><i class="fas fa-crown"></i></div>
                            <div class="cat-title">MEMBERSHIP / PASS</div>
                        </div>
                        <div class="items-grid">
                            ${members.map((p) => App.renderItemCard(p, "member")).join("")}
                        </div>` : ""}

                    <div class="cat-header cat-dia">
                        <div class="cat-icon"><i class="far fa-gem"></i></div>
                        <div class="cat-title">TOP UP</div>
                    </div>
                    <div class="items-grid">
                        ${diamonds.map((p) => App.renderItemCard(p, "diamond")).join("")}
                    </div>
                </div>
                
                <div class="text-end mb-5">
                    <button class="btn-neon" style="padding: 15px 40px; font-size: 1.1rem;" onclick="Terminal.openPaymentSelect()">
                        PROCEED TO PAYMENT <i class="fas fa-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>`;
  },

  renderItemCard: (p, type = "diamond") => {
    // Determine Class based on Type
    let cardClass = "item-card";
    if (type === "hot") cardClass += " card-hot";
    else if (type === "member") cardClass += " card-member";
    else cardClass += " card-diamond";

    const points = Math.floor(p.price_sell * (CONFIG.rewardPercent / 100));

    // Handle Image Source
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
            <!-- Background FX Layer -->
            <div class="item-bg-fx"></div>
            
            <div class="item-content">
                <div class="d-flex align-center gap-2 mb-2">
                    <img src="${imgDisplay}" class="item-icon" loading="lazy">
                    <div class="item-name">${p.name}</div>
                </div>
                <div class="item-price">Rp ${p.price_sell.toLocaleString()}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); margin-top:3px;">
                    +${points} Coins
                </div>
            </div>
        </div>`;
  },

  checkNickname: async () => {
    const uid = document.getElementById("uid").value;
    const zoneInput = document.getElementById("zone");
    const zone = zoneInput ? zoneInput.value : "";
    const res = document.getElementById("nick-result");
    const game = App.state.activeBrand || "";

    if (uid.length < 4) {
      res.innerHTML = "";
      return;
    }

    res.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Checking ID...`;

    try {
      const response = await fetch(`${API_URL}/check-nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: game, id: uid, zone: zone }),
      });
      const data = await response.json();
      if (data.success) {
        res.innerHTML = `<span class="text-neon"><i class="fas fa-check-circle"></i> ${data.name}</span>`;
        Sound.success();
        App.state.nickname = data.name;
      } else {
        res.innerHTML = `<span class="text-pink"><i class="fas fa-times-circle"></i> Not Found</span>`;
        App.state.nickname = null;
      }
    } catch (e) {
      res.innerHTML = `<span class="text-muted">Offline Mode / Check Ignored</span>`;
    }
  },

  selectItem: (el, code, price, name) => {
    document.querySelectorAll(".item-card").forEach((i) => i.classList.remove("active"));
    el.classList.add("active");
    App.state.selectedItem = { code, price, name };
    Sound.click();
  },

  startSlider: () => {
    const sliders = App.state.serverSliders.length > 0 ? App.state.serverSliders : ["assets/slider1.png"];
    const wrapper = document.getElementById("home-slider");
    if (!wrapper) return;

    wrapper.innerHTML = "";
    let curr = 0;

    const render = (idx) => {
      const imgUrl = sliders[idx];
      const div = document.createElement("div");
      div.className = "slide active";
      div.innerHTML = `
                <div class="slide-bg" style="background-image: url('${imgUrl}'), url('${DEFAULT_ASSETS.banner}')"></div>
                <div class="slide-content">
                    <span class="hero-tag">FEATURED</span>
                    <h1 class="hero-title">TOP UP <br> <span class="text-neon">LEVEL UP</span></h1>
                </div>`;

      const old = wrapper.querySelector(".slide");
      if (old) {
        old.classList.remove("active");
        setTimeout(() => old.remove(), 1000);
      }
      wrapper.appendChild(div);
    };

    render(0);
    App.sliderInterval = setInterval(() => {
      curr = (curr + 1) % sliders.length;
      render(curr);
    }, 5000);
  },
};

// --- LOGIC TRANSAKSI ---
const Terminal = {
  openPaymentSelect: () => {
    const { selectedItem, paymentChannels, transactionType } = App.state;

    if (transactionType === "GAME") {
      const uid = document.getElementById("uid").value;
      if (!uid) return App.showToast("Fill User ID First!", "error");
    }

    if (!selectedItem) return App.showToast("Select Item First!", "error");

    const listDiv = document.getElementById("paymentList");
    listDiv.innerHTML = "";

    if (!paymentChannels || paymentChannels.length === 0) {
      listDiv.innerHTML = `<div class="text-pink text-center p-3">No payment channels available</div>`;
    } else {
      paymentChannels.forEach((ch) => {
        if (transactionType === "COIN" && ch.code === "HAWAI_COIN") return;

        let fee = ch.total_fee?.flat || 0;
        let total = selectedItem.price + fee;
        let balanceCheck = "";

        if (ch.code === "HAWAI_COIN") {
          const userBal = Auth.user ? Auth.user.hawai_coins : 0;
          if (!Auth.user) balanceCheck = `<small class="text-pink">Login Required</small>`;
          else if (userBal < total) balanceCheck = `<small class="text-pink">Insufficient Balance</small>`;
          else balanceCheck = `<small class="text-neon">Balance Available</small>`;
        }

        listDiv.innerHTML += `
            <div class="pay-item" onclick="Terminal.processTransaction('${ch.code}')">
                <img src="${ch.icon_url}" class="pay-logo">
                <div style="flex:1;">
                    <div style="font-weight:bold;">${ch.name}</div>
                    <div class="text-muted" style="font-size:0.8rem;">Total: Rp ${total.toLocaleString()}</div>
                    ${balanceCheck}
                </div>
                <i class="fas fa-chevron-right text-muted"></i>
            </div>`;
      });
    }

    document.getElementById("paymentModal").classList.add("active");
  },

  processTransaction: async (method) => {
    const { selectedItem, transactionType, activeBrand } = App.state;

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
      const zone = document.getElementById("zone") ? document.getElementById("zone").value : "";
      payload.customer_no = uid + (zone ? ` (${zone})` : "");
      payload.game = activeBrand || "Game";

      let finalNickname = App.state.nickname || "-";
      payload.nickname = finalNickname;

      if (method === "HAWAI_COIN" && !Auth.user) {
        App.showToast("Please Login First", "error");
        return;
      }
    } else if (transactionType === "COIN") {
      endpoint = "/topup-coin";
    }

    // Lock UI (Optional)
    const modalBody = document.querySelector('#paymentList');
    if (modalBody) modalBody.innerHTML = `<div class="text-center p-5"><i class="fas fa-circle-notch fa-spin fa-2x text-neon"></i><p>Processing...</p></div>`;

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      document.getElementById("paymentModal").classList.remove("active");

      if (json.success) {
        window.location.href = `/invoice.html?ref=${json.data.reference}`;
      } else {
        App.showToast(json.message || "Transaction Failed", "error");
      }
    } catch (e) {
      App.showToast("Error: " + e.message, "error");
      document.getElementById("paymentModal").classList.remove("active");
    }
  },
};

// --- 3D WORLD (Simplified for Performance) ---
const World = {
  init: () => {
    const cvs = document.getElementById("webgl-canvas");
    if (!cvs) return;

    if (typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.02);

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    const renderer = new THREE.WebGLRenderer({ canvas: cvs, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const gridGeo = new THREE.PlaneGeometry(300, 300, 50, 50);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, wireframe: true, transparent: true, opacity: 0.1 });
    const grid = new THREE.Mesh(gridGeo, gridMat);
    grid.rotation.x = -Math.PI / 2;
    scene.add(grid);

    const starGeo = new THREE.BufferGeometry();
    const count = 500;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 150;
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xff0055, size: 0.2, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    function animate() {
      requestAnimationFrame(animate);
      grid.position.z = (Date.now() * 0.005) % 6;
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
