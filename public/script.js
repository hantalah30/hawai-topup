// MENJADI (Gunakan window agar aman jika dipanggil ganda):
if (typeof API_URL === "undefined") {
  var API_URL = "/api";
}
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
    refId: null,
  },

  init: async () => {
    // Cursor
    if (window.innerWidth > 768) {
      document.addEventListener("mousemove", (e) => {
        gsap.to(".cursor-dot", { x: e.clientX, y: e.clientY, duration: 0 });
        gsap.to(".cursor-ring", {
          x: e.clientX - 20,
          y: e.clientY - 20,
          duration: 0.15,
        });
      });
      await Promise.all([App.fetchData(), App.fetchPaymentChannels()]);
    }

    // Boot Loader
    let pct = 0;
    const int = setInterval(() => {
      pct += Math.floor(Math.random() * 5) + 3;
      if (pct > 100) pct = 100;
      const bar = document.getElementById("boot-bar");
      if (bar) bar.style.width = pct + "%";
      if (pct === 100) {
        clearInterval(int);
        setTimeout(() => {
          gsap.to("#boot-layer", {
            opacity: 0,
            duration: 1,
            onComplete: () => {
              document.getElementById("boot-layer").style.display = "none";
              if (typeof World !== "undefined") World.init();
              App.fetchData();
            },
          });
        }, 500);
      }
    }, 30);

    document.addEventListener("click", () => Sound.click());
  },

  fetchData: async () => {
    try {
      const res = await fetch(`${API_URL}/init-data`);
      const data = await res.json();

      App.state.rawProducts = data.products || [];
      App.state.serverSliders = data.sliders || [];
      App.state.serverBanners = data.banners || {};

      // Grouping Logic
      const uniqueBrands = [
        ...new Set(App.state.rawProducts.map((p) => p.brand)),
      ];

      App.state.gamesList = uniqueBrands
        .map((brandName) => {
          if (!brandName) return null;

          const preset = PRESET_ASSETS[brandName] || {};
          const adminBanner = App.state.serverBanners[brandName];
          // Cari gambar sample
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
    gsap.to(vp, {
      opacity: 0,
      y: 30,
      duration: 0.3,
      onComplete: () => {
        vp.innerHTML = "";
        window.scrollTo(0, 0);
        if (page === "home") App.renderHome(vp);
        else if (page === "order") App.renderOrderPage(vp, param);
        gsap.to(vp, { opacity: 1, y: 0, duration: 0.5 });
      },
    });
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

  // --- REVISI UTAMA: BAGIAN TOMBOL ---
  renderOrderPage: (container, brandName) => {
    const items = App.state.rawProducts
      .filter((p) => p.brand === brandName && p.is_active !== false) // Hanya tampilkan yang aktif
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

    // --- FILTER KATEGORI ---
    // 1. Ambil Promo Item
    const promoItems = items.filter((p) => p.is_promo === true);

    // 2. Sisa item (Non-Promo)
    const normalItems = items.filter((p) => !p.is_promo);

    // 3. Pisahkan Member & Diamond dari Normal Items
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
                            ? `
                        <div class="cat-label hot-label"><i class="fas fa-fire"></i> HOT PROMO</div>
                        <div class="item-grid mb-4">
                            ${promoItems.map((p) => App.renderItemCard(p)).join("")}
                        </div>`
                            : ""
                        }

                        ${
                          mem.length > 0
                            ? `
                        <div class="cat-label mt-3"><i class="fas fa-crown text-warning"></i> MEMBERSHIP</div>
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

                 <div id="paymentModal" class="payment-modal">
                <div class="payment-content">
                    <div class="pm-header">
                        <h5 class="m-0 text-white">PILIH METODE PEMBAYARAN</h5>
                        <button onclick="Terminal.closeModal()" style="background:none;border:none;color:#fff;font-size:1.5rem;">&times;</button>
                    </div>
                    <div class="pm-body" id="paymentList">
                        </div>
                </div>
            </div>

            <div id="invoiceModal" class="payment-modal">
                <div class="payment-content">
                    <div class="pm-header">
                        <h5 class="m-0 text-white">TAGIHAN PEMBAYARAN</h5>
                        <button onclick="location.reload()" style="background:none;border:none;color:#fff;">&times;</button>
                    </div>
                    <div class="pm-body" id="invoiceContent"></div>
                </div>
            </div>

            <div class="footer-action">
                <button class="btn-pay-now" onclick="Terminal.openPaymentSelect()">
                    BELI SEKARANG <i class="fas fa-wallet ml-2"></i>
                </button>
            </div>
            `;
  },

  renderItemCard: (p) => {
    // Logic Class (Promo vs Member vs Regular)
    let cardClass = "item-card";
    let badgeHtml = "";

    // Jika Promo
    if (p.is_promo) {
      cardClass += " card-promo"; // Style border merah
      badgeHtml = `<div class="hot-badge">HOT 🔥</div>`;
    }
    // Jika Membership (dan bukan promo)
    else if (
      p.name.toLowerCase().includes("member") ||
      p.name.toLowerCase().includes("pass")
    ) {
      cardClass += " card-premium"; // Style emas
    }

    // Logic Gambar
    let imgDisplay;
    if (p.image && !p.image.includes("default")) {
      imgDisplay = p.image.startsWith("http")
        ? p.image
        : `${API_URL.replace("/api", "")}/${p.image}`;
    } else {
      // Icon Fallback
      imgDisplay = DEFAULT_ASSETS.icons.diamond;
      if (p.name.toLowerCase().includes("member"))
        imgDisplay = DEFAULT_ASSETS.icons.member;
    }

    return `
        <div class="${cardClass}" onclick="App.selectItem(this, '${p.sku}', ${p.price_sell}, '${p.name}')">
            ${badgeHtml} <div class="i-content">
                <img src="${imgDisplay}" class="i-icon">
                <div class="i-name">${p.name}</div>
                <div class="i-price">Rp ${p.price_sell.toLocaleString()}</div>
            </div>
        </div>`;
  },

  // --- FITUR CEK NICKNAME ---
  checkNickname: async () => {
    const uid = document.getElementById("uid").value;
    const zoneInput = document.getElementById("zone");
    const zone = zoneInput ? zoneInput.value : "";
    const res = document.getElementById("nick-result");

    // Ambil nama game yang sedang aktif
    const gameTitleEl = document.querySelector(".game-title h1");
    const gameTitle = gameTitleEl ? gameTitleEl.innerText : "";

    // Validasi: Jangan request kalau ID kependekan (menghemat request server)
    if (uid.length < 4) {
      res.innerHTML = "";
      return;
    }

    // Khusus Mobile Legends, jangan cek kalau Zone belum diisi
    const isML = gameTitle.toLowerCase().includes("mobile");
    if (isML && zone.length < 3) {
      return;
    }

    // Tampilkan status Loading
    res.style.display = "block";
    res.innerHTML = `<span style="color:#00f3ff; font-size: 0.9rem;"><i class="fas fa-circle-notch fa-spin"></i> Mencari ID...</span>`;

    try {
      // Request ke Backend kita sendiri
      const response = await fetch(`${API_URL}/check-nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: gameTitle,
          id: uid,
          zone: zone,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Jika SUKSES (Nama ketemu)
        res.innerHTML = `
                    <div style="margin-top:8px; padding:5px 10px; background:rgba(0,255,0,0.2); border:1px solid #00ff00; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
                        <i class="fas fa-check-circle" style="color:#00ff00;"></i> 
                        <span style="color:#fff; font-weight:bold; font-size:0.9rem;">${data.name}</span>
                    </div>
                `;
        Sound.success();
        App.state.nickname = data.name; // Simpan nama untuk transaksi
      } else {
        // Jika GAGAL (ID Salah)
        res.innerHTML = `<span style="color:#ff4444; font-size:0.9rem; margin-top:5px; display:block;"><i class="fas fa-times-circle"></i> ID Tidak Ditemukan</span>`;
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

// --- LOGIC TRANSAKSI BARU ---
const Terminal = {
  // 1. Buka Modal Pilihan Pembayaran
  openPaymentSelect: () => {
    const { selectedItem, nickname } = App.state;
    const uid = document.getElementById("uid").value;

    if (!uid || !selectedItem)
      return alert("Lengkapi User ID dan Pilih Item dulu!");
    // if (!nickname) return alert("Tunggu proses cek ID selesai...");

    // Render List Channel
    const listDiv = document.getElementById("paymentList");
    listDiv.innerHTML = "";

    // Grouping Channel (VA, E-Wallet, Retail)
    const groups = {
      "Virtual Account": App.state.paymentChannels.filter(
        (c) => c.group === "Virtual Account",
      ),
      "E-Wallet": App.state.paymentChannels.filter(
        (c) => c.group === "E-Wallet" || c.code.includes("QRIS"),
      ),
      "Convenience Store": App.state.paymentChannels.filter(
        (c) => c.group === "Convenience Store",
      ),
    };

    // Render ke HTML
    for (const [groupName, channels] of Object.entries(groups)) {
      if (channels.length === 0) continue;
      listDiv.innerHTML += `<div class="pm-group-title">${groupName}</div>`;

      channels.forEach((ch) => {
        // Hitung Total (Harga Produk + Fee Tripay Flat/Percent)
        // Note: Ini estimasi kasar, tripay akan hitung fix di server
        let totalEst = App.state.selectedItem.price;

        listDiv.innerHTML += `
                    <div class="pm-item" onclick="Terminal.processTransaction('${ch.code}', '${ch.name}')">
                        <img src="${ch.icon_url}" alt="${ch.code}">
                        <div class="pm-item-info">
                            <div class="pm-name">${ch.name}</div>
                            <div class="pm-fee">Proses Otomatis</div>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                `;
      });
    }

    // Tampilkan Modal
    document.getElementById("paymentModal").style.display = "flex";
  },

  closeModal: () => {
    document.getElementById("paymentModal").style.display = "none";
  },

  // 2. Proses Transaksi ke Server
  processTransaction: async (methodCode, methodName) => {
    const { selectedItem, nickname } = App.state;
    const uid = document.getElementById("uid").value;
    // Ambil nama game dari judul
    const gameTitle = document.querySelector(".game-title h1").innerText;

    // Tampilkan Loading Swal/Alert
    Terminal.closeModal();
    const btn = document.querySelector(".btn-pay-now");
    const oldText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> MEMPROSES...`;
    btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: selectedItem.code,
          amount: selectedItem.price,
          customer_no: uid,
          method: methodCode,
          nickname: nickname, // Kirim Nickname
          game: gameTitle, // Kirim Nama Game
        }),
      });

      const json = await res.json();

      if (!json.success) throw new Error(json.message || "Gagal Transaksi");

      // --- REDIRECT KE HALAMAN INVOICE ---
      // Kita kirim Reference ID lewat URL
      window.location.href = `invoice.html?ref=${json.data.ref_id}`;
    } catch (e) {
      console.error(e);
      alert("Gagal: " + e.message);
      btn.innerHTML = oldText;
      btn.disabled = false;
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
