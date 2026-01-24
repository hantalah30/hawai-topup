/**
 * HAWAI OMEGA SYSTEM v12
 * FEATURES: 3D Terrain, Swipe Gestures, Mobile Optimization
 */

const API_URL = "http://localhost:3000/api";

const ASSETS = {
  "Mobile Legends": {
    banner: "assets/lance-banner.jpg",
    logo: "assets/lance.png",
    color: "#00f3ff",
    icons: {
      member: "https://cdn-icons-png.flaticon.com/512/6532/6532936.png",
      diamond: "https://cdn-icons-png.flaticon.com/512/3914/3914438.png",
    },
  },
  "Free Fire": {
    banner: "assets/ff-banner.jpg",
    logo: "assets/ff.jpg",
    color: "#ffaa00",
    icons: {
      member: "https://cdn-icons-png.flaticon.com/512/1077/1077976.png",
      diamond: "https://cdn-icons-png.flaticon.com/512/2150/2150150.png",
    },
  },
  Valorant: {
    banner: "https://images4.alphacoders.com/114/1149479.jpg",
    logo: "https://placehold.co/150/ff4444/fff?text=VAL",
    color: "#ff4444",
    icons: {
      member: "",
      diamond: "https://cdn-icons-png.flaticon.com/512/8044/8044237.png",
    },
  },
  DEFAULT: {
    banner: "https://images.alphacoders.com/133/1336040.png",
    logo: "https://placehold.co/150/white/000?text=GAME",
    color: "#ffffff",
    icons: {
      member: "https://cdn-icons-png.flaticon.com/512/5727/5727270.png",
      diamond: "https://cdn-icons-png.flaticon.com/512/4442/4442898.png",
    },
  },
};

// --- AUDIO ---
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

const App = {
  state: {
    rawProducts: [],
    gamesList: [],
    selectedItem: null,
    nickname: null,
    refId: null,
  },

  init: async () => {
    // Desktop Cursor
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

    // Boot
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
      const res = await fetch(`${API_URL}/pricelist`);
      const data = await res.json();
      App.state.rawProducts = data;
      const brands = [...new Set(data.map((item) => item.brand))];

      App.state.gamesList = brands
        .map((brandName) => {
          if (!brandName) return null;
          const lower = brandName.toLowerCase();
          let key = "DEFAULT";
          if (lower.includes("mobile")) key = "Mobile Legends";
          else if (lower.includes("free")) key = "Free Fire";
          else if (lower.includes("valorant")) key = "Valorant";
          else if (lower.includes("pubg")) key = "PUBG";
          else if (lower.includes("genshin")) key = "Genshin Impact";
          const asset = ASSETS[key] || ASSETS["DEFAULT"];
          return {
            id: brandName,
            name: brandName,
            img: asset.logo,
            banner: asset.banner,
            theme: asset.color,
            icons: asset.icons || ASSETS["DEFAULT"].icons,
          };
        })
        .filter((item) => item !== null);

      App.router("home");
    } catch (e) {
      console.error(e);
      alert("Server Error");
    }
  },

  router: (page, param = null) => {
    const vp = document.getElementById("viewport");
    document
      .querySelectorAll(".dock-btn")
      .forEach((n) => n.classList.remove("active"));
    const nav = document.querySelector(`.dock-btn[data-page="${page}"]`);
    if (nav) nav.classList.add("active");

    document.getElementById("sticky-pay").classList.add("hidden");

    gsap.to(vp, {
      opacity: 0,
      y: 30,
      duration: 0.3,
      onComplete: () => {
        vp.innerHTML = "";
        window.scrollTo(0, 0);
        if (page === "home") App.renderHome(vp);
        else if (page === "order") App.renderOrderPage(vp, param);
        else if (page === "history")
          vp.innerHTML = `<div class="container" style="padding-top:150px"><h1>SYSTEM LOGS</h1><p>Buffer empty.</p></div>`;
        gsap.to(vp, { opacity: 1, y: 0, duration: 0.5 });
      },
    });
  },

  renderHome: (container) => {
    if (App.sliderInterval) clearInterval(App.sliderInterval);

    let html = `
        <div class="hero-slider" id="home-slider"><div class="slider-timer"></div></div>
        <div class="container">
            <h2 class="section-title">ACTIVE PROTOCOLS</h2>
            <div class="grid">`;

    App.state.gamesList.forEach((g) => {
      html += `
            <div class="tilt-card" onclick="App.router('order', '${g.id}')" onmouseenter="App.tilt(this)">
                <img src="${g.img}" class="card-img" onerror="this.src='${ASSETS.DEFAULT.logo}'">
                <div class="card-info">
                    <h3>${g.name}</h3>
                    <p>● SERVER ONLINE</p>
                </div>
            </div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
    App.startSlider();
  },

  tilt: (card) => {
    if (window.innerWidth < 768) return;
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rotateX = ((y - cy) / cy) * -10;
      const rotateY = ((x - cx) / cx) * 10;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
    });
    Sound.hover();
  },

  startSlider: () => {
    const data = [
      {
        t: "HAWAI PROTOCOL",
        s: "MOBILE LEGENDS // INFINITE BATTLE",
        i: "assets/slider1.png",
      },
      {
        t: "HAWAI ARSENAL",
        s: "PUBG & FREE FIRE // BATTLE READY",
        i: "assets/slider3.png",
      },
      {
        t: "HAWAI UNIVERSE",
        s: "GENSHIN IMPACT // OPEN WORLD",
        i: "assets/slider2.png",
      },
    ];
    const wrapper = document.getElementById("home-slider");
    if (!wrapper) return;
    let curr = 0;

    const render = (idx) => {
      const d = data[idx];
      const div = document.createElement("div");
      div.className = "slide active";
      div.innerHTML = `
                <div class="slide-bg" style="background-image: url('${d.i}'), url('https://images.alphacoders.com/133/1336040.png')"></div>
                <div class="slide-ui">
                    <div class="cyber-pane">
                        <h1 class="glitch-title"></h1>
                        <div class="slide-sub">${d.s}</div>
                    </div>
                </div>`;
      const old = wrapper.querySelector(".slide");
      if (old) {
        old.classList.remove("active");
        setTimeout(() => old.remove(), 1000);
      }
      wrapper.appendChild(div);
      if (window.innerWidth > 768) {
        const s = new TextScramble(div.querySelector(".glitch-title"));
        s.setText(d.t);
      } else {
        div.querySelector(".glitch-title").innerText = d.t;
      }
    };
    render(0);

    // Touch Swipe
    let startX = 0;
    wrapper.addEventListener(
      "touchstart",
      (e) => (startX = e.touches[0].clientX),
    );
    wrapper.addEventListener("touchend", (e) => {
      const endX = e.changedTouches[0].clientX;
      if (startX - endX > 50) {
        curr = (curr + 1) % data.length;
        render(curr);
      } // Swipe Left
      if (endX - startX > 50) {
        curr = (curr - 1 + data.length) % data.length;
        render(curr);
      } // Swipe Right
    });

    App.sliderInterval = setInterval(() => {
      curr = (curr + 1) % data.length;
      render(curr);
      const bar = document.querySelector(".slider-timer");
      if (bar) {
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = "progress 5s linear forwards";
      }
    }, 5000);
  },

  renderOrderPage: (container, brand) => {
    const all = App.state.rawProducts
      .filter((p) => p.brand === brand)
      .sort((a, b) => a.price - b.price);
    const g = App.state.gamesList.find((x) => x.id === brand) || {
      banner: ASSETS.DEFAULT.banner,
      img: ASSETS.DEFAULT.logo,
      theme: "#fff",
      icons: ASSETS.DEFAULT.icons,
    };
    const isML = brand.toLowerCase().includes("mobile");
    const zoneInput = isML
      ? `<input type="text" id="zone" class="input-neon" placeholder="Zone ID" onchange="App.checkNickname()">`
      : `<input type="hidden" id="zone" value="">`;

    const mem = all.filter((p) => {
      const n = p.name.toLowerCase();
      return n.includes("weekly") || n.includes("pass") || n.includes("member");
    });
    const dia = all.filter((p) => !mem.includes(p));

    container.innerHTML = `
        <div style="background: url('${g.banner}'), url('${ASSETS.DEFAULT.banner}'); background-size: cover; height: 400px; mask-image: linear-gradient(to bottom, black, transparent);"></div>
        <div class="container order-stage">
            <div class="game-poster-wrap"><img src="${g.img}" class="game-poster" style="border-color:${g.theme}"></div>
            <div class="cyber-form">
                <div class="form-section">
                    <span class="sec-title">01 // PLAYER ID</span>
                    <div class="input-row">
                        <input type="text" id="uid" class="input-neon" placeholder="User ID" onchange="App.checkNickname()">
                        ${zoneInput}
                    </div>
                    <div id="nick-result" class="nick-res"></div>
                </div>
                <div class="form-section">
                    <span class="sec-title">02 // SELECT ASSET</span>
                    ${
                      mem.length > 0
                        ? `
                    <div style="margin-bottom:20px; font-weight:bold; color:#fff"><i class="fas fa-crown text-neon"></i> MEMBERSHIP</div>
                    <div class="item-grid" style="margin-bottom:30px">
                        ${mem
                          .map(
                            (p) => `
                        <div class="item-card" onclick="App.selectItem(this, '${p.code}', ${p.price}, '${p.name}')">
                            <img src="${g.icons.member}" class="i-icon"><div class="i-name">${p.name}</div><div class="i-price">Rp ${p.price.toLocaleString()}</div>
                        </div>`,
                          )
                          .join("")}
                    </div>`
                        : ""
                    }
                    <div style="margin-bottom:20px; font-weight:bold; color:#fff"><i class="fas fa-gem text-neon"></i> CURRENCY</div>
                    <div class="item-grid">
                        ${dia
                          .map(
                            (p) => `
                        <div class="item-card" onclick="App.selectItem(this, '${p.code}', ${p.price}, '${p.name}')">
                            <img src="${g.icons.diamond}" class="i-icon"><div class="i-name">${p.name}</div><div class="i-price">Rp ${p.price.toLocaleString()}</div>
                        </div>`,
                          )
                          .join("")}
                    </div>
                </div>
                <div class="desktop-only">
                    <button class="btn-glitch" onclick="Terminal.process()">INITIATE PAYMENT</button>
                </div>
            </div>
        </div>`;
  },

  checkNickname: async () => {
    const uid = document.getElementById("uid").value;
    const zone = document.getElementById("zone").value;
    const res = document.getElementById("nick-result");
    if (uid.length > 4 && zone.length >= 4) {
      res.style.display = "flex";
      res.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> SCANNING...`;
      try {
        const apiRes = await fetch(`${API_URL}/check-nickname`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: uid, zone: zone }),
        });
        const data = await apiRes.json();
        if (data.status === "success") {
          res.innerHTML = `<span class="text-green">✔ ${data.name}</span> <span style="color:#666">[${data.region}]</span>`;
          App.state.nickname = data.name;
          Sound.success();
        } else {
          res.innerHTML = `<span class="text-red">✘ NOT FOUND</span>`;
        }
      } catch (e) {
        res.innerHTML = `ERROR`;
      }
    }
  },

  selectItem: (el, code, price, name) => {
    document
      .querySelectorAll(".item-card")
      .forEach((i) => i.classList.remove("active"));
    el.classList.add("active");
    App.state.selectedItem = { code, price, name };

    // Update Mobile Sticky Bar
    const bar = document.getElementById("sticky-pay");
    if (bar) {
      bar.classList.remove("hidden");
      document.getElementById("sp-item").innerText = name;
      document.getElementById("sp-price").innerText =
        `Rp ${price.toLocaleString()}`;
    }
    Sound.click();
  },
};

const Terminal = {
  process: async () => {
    const { selectedItem } = App.state;
    const uid = document.getElementById("uid").value;
    const zone = document.getElementById("zone").value;
    if (!uid || !selectedItem) {
      alert("DATA INCOMPLETE");
      return;
    }

    const overlay = document.getElementById("modal-terminal");
    const con = document.getElementById("term-log");
    overlay.classList.remove("hidden");
    con.innerHTML = "";

    const type = (m, d) =>
      new Promise((r) =>
        setTimeout(() => {
          con.innerHTML += `> ${m}<br>`;
          con.scrollTop = con.scrollHeight;
          Sound.type();
          r();
        }, d),
      );

    await type("ESTABLISHING SECURE HANDSHAKE...", 100);
    await type(`TARGET: ${uid}`, 300);
    await type(`PACKET: ${selectedItem.name}`, 300);

    try {
      const res = await fetch(`${API_URL}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: selectedItem.code,
          uid: uid,
          zone: zone,
          price: selectedItem.price,
        }),
      });
      const data = await res.json();
      App.state.refId = data.ref_id;

      await type(`INVOICE: ${data.ref_id}`, 200);
      await type(`QR MATRIX GENERATED.`, 200);

      con.innerHTML += `<div style="text-align:center; margin:20px;"><img src="${data.qr_image}" width="180" style="border:5px solid #fff; border-radius:10px"></div>`;
      con.innerHTML += `<button onclick="Terminal.payTest('${data.ref_id}')" style="width:100%; padding:15px; background:red; color:#fff; border:none; cursor:pointer; font-weight:bold; font-family:var(--font-hud)">[DEV] FORCE SUCCESS</button>`;

      Terminal.poll();
    } catch (e) {
      type("FATAL ERROR: CONNECTION REFUSED", 0);
    }
  },

  payTest: async (id) => {
    await fetch(`${API_URL}/process-topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref_id: id }),
    });
  },

  poll: () => {
    const int = setInterval(async () => {
      if (!App.state.refId) {
        clearInterval(int);
        return;
      }
      const res = await fetch(`${API_URL}/status/${App.state.refId}`);
      const data = await res.json();
      if (data.status === "SUCCESS") {
        clearInterval(int);
        Sound.success();
        document.getElementById("modal-terminal").classList.add("hidden");
        Receipt.show({
          ...App.state.selectedItem,
          uid: document.getElementById("uid").value,
        });
      }
    }, 3000);
  },
};

const Receipt = {
  show: (data) => {
    document.getElementById("modal-receipt").classList.remove("hidden");
    document.getElementById("receipt-data").innerHTML = `
            <div class="rc-row"><span>ITEM</span><span>${data.name}</span></div>
            <div class="rc-row"><span>UID</span><span>${data.uid}</span></div>
            <div class="rc-row" style="margin-top:10px; font-weight:bold; color:var(--primary); font-size:16px;"><span>TOTAL</span><span>Rp ${data.price.toLocaleString()}</span></div>
        `;
  },
  close: () => {
    document.getElementById("modal-receipt").classList.add("hidden");
    App.router("home");
  },
};

// --- 3D ENGINE ---
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

    // Less particles on mobile
    const isMobile = window.innerWidth < 768;
    const starGeo = new THREE.BufferGeometry();
    const count = isMobile ? 300 : 1000;
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
