// Arahkan ke endpoint API relative path
const API_BASE_URL = "";

// Global State
let dbState = {
  config: { tripay: {}, digiflazz: {} },
  products: [],
  assets: { sliders: [], banners: {} },
};

// Global User Token (untuk dikirim ke backend jika perlu otentikasi server-side nanti)
let idToken = null;

// --- AUTH (FIREBASE CLIENT) ---
document.addEventListener("DOMContentLoaded", () => {
  // Cek status login saat load
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      // User sudah login
      document.getElementById("loginOverlay").style.display = "none";
      document.getElementById("adminPanel").style.display = "block";
      document.getElementById("adminName").innerText =
        user.displayName || user.email;

      // Simpan token
      idToken = await user.getIdToken();

      // Load Data
      loadData();
    } else {
      // Belum login
      document.getElementById("loginOverlay").style.display = "flex";
      document.getElementById("adminPanel").style.display = "none";
      document.getElementById("authStatus").innerText = "Silakan login.";
    }
  });
});

function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  document.getElementById("authStatus").innerText = "Membuka Popup...";

  firebase
    .auth()
    .signInWithPopup(provider)
    .catch((error) => {
      alert("Login Gagal: " + error.message);
      document.getElementById("authStatus").innerText = "Gagal.";
    });
}

function logout() {
  if (confirm("Keluar dari Admin Panel?")) {
    firebase
      .auth()
      .signOut()
      .then(() => location.reload());
  }
}

// --- CORE DATA LOADER ---
async function loadData() {
  try {
    // Ambil data tanpa validasi password backend (karena sudah lolos Firebase Auth di frontend)
    const res = await fetch(`${API_BASE_URL}/api/admin/config`);
    const data = await res.json();

    if (data) {
      if (data.config) dbState.config = data.config;
      if (data.products) dbState.products = data.products;
      if (data.assets) dbState.assets = data.assets;

      console.log("Data Loaded:", dbState.products.length, "products");
    }

    // ISI FORM CONFIG
    if (dbState.config.digiflazz) {
      setVal("digi_user", dbState.config.digiflazz.username);
      setVal("digi_api", dbState.config.digiflazz.api_key);
    }

    if (dbState.config.tripay) {
      setVal("tripay_merchant", dbState.config.tripay.merchant_code);
      setVal("tripay_api", dbState.config.tripay.api_key);
      setVal("tripay_private", dbState.config.tripay.private_key);
    }

    renderAssets();
    populateBrandFilter();

    // Tampilkan 100 produk pertama
    renderProductTable(dbState.products.slice(0, 100));
  } catch (e) {
    console.error("Gagal load data:", e);
    alert("Gagal memuat data dari server.");
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || "";
}

// --- PRODUCTS ---
function populateBrandFilter() {
  const brands = [
    ...new Set(dbState.products.map((p) => p.brand || "Lainnya")),
  ].sort();
  const select = document.getElementById("filterBrand");
  if (!select) return;

  select.innerHTML = '<option value="" disabled>-- Pilih Game --</option>';
  select.innerHTML += '<option value="ALL_DATA" selected>SEMUA DATA</option>';
  brands.forEach(
    (b) => (select.innerHTML += `<option value="${b}">${b}</option>`),
  );
}

function filterProducts() {
  const brandEl = document.getElementById("filterBrand");
  const searchEl = document.getElementById("searchSku");

  if (!brandEl || !searchEl) return;

  const brand = brandEl.value;
  const search = (searchEl.value || "").toLowerCase();

  const filtered = dbState.products.filter((p) => {
    const pBrand = p.brand || "Lainnya";
    const matchBrand = brand === "ALL_DATA" || !brand || pBrand === brand;
    const matchSearch =
      (p.sku || "").toLowerCase().includes(search) ||
      (p.name || "").toLowerCase().includes(search);
    return matchBrand && matchSearch;
  });

  renderProductTable(filtered.slice(0, 100));
}

function renderProductTable(data) {
  const tbody = document.getElementById("productTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center py-3">Produk tidak ditemukan.</td></tr>';
    return;
  }

  data.forEach((p) => {
    const realIndex = dbState.products.findIndex((item) => item.sku === p.sku);

    let imgUrl = "assets/default.png";
    if (p.image && !p.image.includes("default")) {
      imgUrl =
        p.image.startsWith("http") || p.image.startsWith("data:")
          ? p.image
          : `${API_BASE_URL}/${p.image}`;
    }

    const modal = parseInt(p.price_modal) || 0;
    const currentMarkup =
      p.markup !== undefined
        ? parseInt(p.markup)
        : parseInt(p.price_sell) - modal;
    const jual = modal + currentMarkup;

    const promoClass = p.is_promo
      ? "text-danger fa-beat"
      : "text-secondary opacity-25";

    tbody.innerHTML += `
            <tr class="${p.is_active ? "" : "table-light text-muted"}">
                <td class="text-center"><input type="checkbox" class="form-check-input prod-select" value="${realIndex}"></td>
                <td><img src="${imgUrl}" class="preview-img" onclick="triggerUpload(${realIndex})" title="Klik untuk ganti gambar"><input type="file" id="file-${realIndex}" class="d-none" onchange="uploadProdImg(this, ${realIndex})"></td>
                <td><div class="fw-bold text-truncate" style="max-width: 250px;">${p.name}</div><small class="sku-text">${p.sku} | ${p.brand}</small></td>
                <td class="text-center" style="cursor: pointer;" onclick="togglePromo(${realIndex})"><i class="fas fa-fire ${promoClass} fs-5"></i></td>
                <td>Rp ${modal.toLocaleString()}</td>
                <td><input type="number" class="form-control form-control-sm" style="width:80px" value="${currentMarkup}" onchange="updateMarkup(${realIndex}, this.value)"></td>
                <td class="fw-bold text-success" id="sell-${realIndex}">Rp ${jual.toLocaleString()}</td>
                <td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" ${p.is_active ? "checked" : ""} onchange="toggleActive(${realIndex}, this.checked)"></div></td>
            </tr>`;
  });
}

// --- ACTIONS & HELPERS ---
function toggleSelectAll(source) {
  document
    .querySelectorAll(".prod-select")
    .forEach((cb) => (cb.checked = source.checked));
}

function updateMarkup(idx, val) {
  if (dbState.products[idx]) {
    const markup = parseInt(val) || 0;
    dbState.products[idx].markup = markup;
    dbState.products[idx].price_sell =
      (parseInt(dbState.products[idx].price_modal) || 0) + markup;

    const sellElem = document.getElementById(`sell-${idx}`);
    if (sellElem)
      sellElem.innerText = `Rp ${dbState.products[idx].price_sell.toLocaleString()}`;
  }
}

function toggleActive(idx, checked) {
  if (dbState.products[idx]) dbState.products[idx].is_active = checked;
}

function triggerUpload(idx) {
  const input = document.getElementById(`file-${idx}`);
  if (input) input.click();
}

async function uploadProdImg(input, idx) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (dbState.products[idx]) {
      dbState.products[idx].image = data.filepath;
      filterProducts();
    }
  } catch (e) {
    alert("Gagal Upload Gambar");
  }
}

function togglePromo(idx) {
  if (dbState.products[idx]) {
    dbState.products[idx].is_promo = !dbState.products[idx].is_promo;
    filterProducts();
  }
}

// --- BULK ACTION ---
async function processBulkImage(input) {
  const file = input.files[0];
  if (!file) return;

  const checkboxes = document.querySelectorAll(".prod-select:checked");
  const selectedIndices = Array.from(checkboxes).map((cb) =>
    parseInt(cb.value),
  );

  if (selectedIndices.length === 0) return alert("Centang produk dulu!");

  if (
    !confirm(`Ganti gambar untuk ${selectedIndices.length} produk terpilih?`)
  ) {
    input.value = "";
    return;
  }

  const btn = document.querySelector('button[onclick*="bulkImgInput"]');
  if (btn) {
    btn.innerHTML = "⏳ Uploading...";
    btn.disabled = true;
  }

  try {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    selectedIndices.forEach((idx) => {
      if (dbState.products[idx]) dbState.products[idx].image = data.filepath;
    });

    await saveProducts(); // Auto Save
    filterProducts();
    alert("✅ Gambar berhasil diupdate!");
  } catch (e) {
    alert("Gagal update massal.");
  } finally {
    input.value = "";
    if (btn) {
      btn.innerHTML = '<i class="fas fa-images"></i> Bulk Img';
      btn.disabled = false;
    }
  }
}

// --- SERVER SYNC & SAVE ---
async function syncDigiflazz() {
  if (!confirm("Tarik data Digiflazz? Proses ini agak lama.")) return;
  const btn = document.getElementById("btnSync");
  const oldHtml = btn ? btn.innerHTML : "Sync";
  if (btn) {
    btn.innerHTML = "⏳ Syncing...";
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sync-digiflazz`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Server Error");
    alert(data.message);
    loadData();
  } catch (e) {
    alert("Gagal Sync: " + e.message);
  } finally {
    if (btn) {
      btn.innerHTML = oldHtml;
      btn.disabled = false;
    }
  }
}

async function saveProducts() {
  const btn = document.getElementById("btnSaveProd");
  const oldHtml = btn ? btn.innerHTML : "Save";
  if (btn) {
    btn.innerHTML = "Saving...";
    btn.disabled = true;
  }

  try {
    await fetch(`${API_BASE_URL}/api/admin/save-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dbState.products),
    });
    alert("✅ Data Produk Tersimpan!");
  } catch (e) {
    alert("Gagal menyimpan produk.");
  } finally {
    if (btn) {
      btn.innerHTML = oldHtml;
      btn.disabled = false;
    }
  }
}

async function saveConfig() {
  const cfg = {
    digiflazz: {
      username: document.getElementById("digi_user").value,
      api_key: document.getElementById("digi_api").value,
    },
    tripay: {
      merchant_code: document.getElementById("tripay_merchant").value,
      api_key: document.getElementById("tripay_api").value,
      private_key: document.getElementById("tripay_private").value,
    },
  };
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/save-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Unknown Server Error");
    alert("✅ Konfigurasi Tersimpan!");
    dbState.config = cfg;
  } catch (e) {
    alert("❌ ERROR: " + e.message);
  }
}

// --- ASSETS ---
function renderAssets() {
  const sDiv = document.getElementById("sliderContainer");
  if (sDiv) {
    sDiv.innerHTML = "";
    (dbState.assets.sliders || []).forEach((url, i) => {
      let disp = url.startsWith("http") ? url : `${API_BASE_URL}/${url}`;
      sDiv.innerHTML += `<div class="position-relative"><img src="${disp}" style="width:120px;height:70px;object-fit:cover;border-radius:5px;"><button onclick="delSlider(${i})" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0" style="border-radius:50%">&times;</button></div>`;
    });
  }
  const bDiv = document.getElementById("bannerContainer");
  if (bDiv) {
    bDiv.innerHTML = "";
    const brands = [
      ...new Set(dbState.products.map((p) => p.brand || "Lainnya")),
    ].sort();
    brands.forEach((b) => {
      const curr =
        (dbState.assets.banners && dbState.assets.banners[b]) ||
        "assets/default.png";
      const disp = curr.startsWith("http") ? curr : `${API_BASE_URL}/${curr}`;
      bDiv.innerHTML += `<div class="d-flex justify-content-between align-items-center mb-2 border p-2 rounded bg-white"><span class="small fw-bold text-dark">${b}</span><div class="d-flex gap-2 align-items-center"><img src="${disp}" style="width:60px;height:30px;object-fit:cover;"><label class="btn btn-sm btn-outline-primary py-0">Upload <input type="file" class="d-none" onchange="uploadBanner('${b}', this)"></label></div></div>`;
    });
  }
}

async function uploadNewSlider() {
  const input = document.getElementById("uploadSlider");
  if (!input) return;
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!dbState.assets.sliders) dbState.assets.sliders = [];
    dbState.assets.sliders.push(data.filepath);
    renderAssets();
    saveAssets(true);
  } catch (e) {}
}

function delSlider(i) {
  if (confirm("Hapus slider?")) {
    dbState.assets.sliders.splice(i, 1);
    renderAssets();
    saveAssets(true);
  }
}

async function uploadBanner(brand, input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!dbState.assets.banners) dbState.assets.banners = {};
    dbState.assets.banners[brand] = data.filepath;
    renderAssets();
    saveAssets(true);
  } catch (e) {}
}

async function saveAssets(silent = false) {
  try {
    await fetch(`${API_BASE_URL}/api/admin/save-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dbState.assets),
    });
    if (!silent) alert("Asset tersimpan!");
  } catch (e) {
    if (!silent) alert("Gagal simpan asset");
  }
}

// --- USER MANAGEMENT ---
async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/users`);
    const users = await res.json();
    const tbody = document.getElementById("userTableBody");
    if (tbody) {
      tbody.innerHTML = "";
      users.forEach((u) => {
        tbody.innerHTML += `<tr><td>${u.name || "User"}</td><td>${u.email || "-"}</td><td>${(u.hawai_coins || 0).toLocaleString()}</td><td><button class="btn btn-sm btn-primary" onclick="editBalance('${u.uid}')">Edit Saldo</button></td></tr>`;
      });
    }
  } catch (e) {
    console.error("Load Users Failed", e);
  }
}

async function editBalance(uid) {
  const newBal = prompt("Masukkan jumlah Coin baru:");
  if (newBal !== null) {
    try {
      await fetch(`${API_BASE_URL}/api/admin/update-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, newBalance: newBal }),
      });
      alert("Saldo berhasil diupdate");
      loadUsers();
    } catch (e) {
      alert("Gagal update");
    }
  }
}

// EXPOSE TO WINDOW
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
window.loadData = loadData;
window.loadUsers = loadUsers;
window.filterProducts = filterProducts;
window.triggerUpload = triggerUpload;
window.uploadProdImg = uploadProdImg;
window.togglePromo = togglePromo;
window.updateMarkup = updateMarkup;
window.toggleActive = toggleActive;
window.processBulkImage = processBulkImage;
window.syncDigiflazz = syncDigiflazz;
window.saveProducts = saveProducts;
window.saveAssets = saveAssets;
window.saveConfig = saveConfig;
window.uploadNewSlider = uploadNewSlider;
window.delSlider = delSlider;
window.uploadBanner = uploadBanner;
window.editBalance = editBalance;
window.toggleSelectAll = toggleSelectAll;
