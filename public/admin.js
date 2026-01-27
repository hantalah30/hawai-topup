// Arahkan ke endpoint API relative path
const API_BASE_URL = "";

// Default state biar gak undefined
let db = {
  config: {
    tripay: {},
    digiflazz: {},
    admin_password: "admin",
  },
  products: [],
  assets: { sliders: [], banners: {} },
};

// --- AUTH ---
async function login() {
  const pass = document.getElementById("adminPass").value;
  const btn = document.querySelector("#loginOverlay button");
  const originalText = btn.innerText;

  btn.innerText = "Loading...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("loginOverlay").style.display = "none";
      document.getElementById("adminPanel").style.display = "block";
      loadData();
    } else {
      alert("Password Salah");
    }
  } catch (e) {
    alert("Server Error / Koneksi Gagal");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

function logout() {
  location.reload();
}

async function loadData() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/config`);
    const data = await res.json();

    // Merge data dari server ke local state
    if (data) {
      db.config = data.config || db.config;
      db.products = data.products || [];
      db.assets = data.assets || { sliders: [], banners: {} };
    }

    // Fill Config Inputs (Safe Navigation)
    if (db.config.digiflazz) {
      document.getElementById("digi_user").value =
        db.config.digiflazz.username || "";
      document.getElementById("digi_api").value =
        db.config.digiflazz.api_key || "";
    }

    if (db.config.tripay) {
      document.getElementById("tripay_merchant").value =
        db.config.tripay.merchant_code || "";
      document.getElementById("tripay_api").value =
        db.config.tripay.api_key || "";
      document.getElementById("tripay_private").value =
        db.config.tripay.private_key || "";
    }

    renderAssets();
    populateBrandFilter();

    // Tampilkan Produk Awal (Opsional, agar tidak kosong melompong)
    // renderProductTable(db.products.slice(0, 50));
  } catch (e) {
    console.error("Gagal load data:", e);
    alert("Gagal memuat data dari server.");
  }
}

// --- PRODUCTS ---
function populateBrandFilter() {
  const brands = [
    ...new Set(db.products.map((p) => p.brand || "Lainnya")),
  ].sort();
  const select = document.getElementById("filterBrand");

  // Reset opsi
  select.innerHTML =
    '<option value="" disabled selected>-- Pilih Game --</option>';
  select.innerHTML += '<option value="ALL_DATA">SEMUA DATA (BERAT)</option>';

  brands.forEach(
    (b) => (select.innerHTML += `<option value="${b}">${b}</option>`),
  );
}

function filterProducts() {
  const brand = document.getElementById("filterBrand").value;
  const search = (
    document.getElementById("searchSku").value || ""
  ).toLowerCase();

  if (!brand && !search) return;

  // Reset Checkbox Header
  const selectAll = document.getElementById("selectAll");
  if (selectAll) selectAll.checked = false;

  const filtered = db.products.filter((p) => {
    const pBrand = p.brand || "Lainnya";
    const matchBrand = brand === "ALL_DATA" || !brand || pBrand === brand;
    const matchSearch =
      (p.sku || "").toLowerCase().includes(search) ||
      (p.name || "").toLowerCase().includes(search);
    return matchBrand && matchSearch;
  });

  renderProductTable(filtered.slice(0, 200)); // Limit display 200 item agar browser tidak lag
}

function renderProductTable(data) {
  const tbody = document.getElementById("productTable");
  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center py-3">Produk tidak ditemukan.</td></tr>';
    return;
  }

  data.forEach((p) => {
    // Cari index asli di array global db.products untuk referensi update
    const realIndex = db.products.findIndex((item) => item.sku === p.sku);

    let imgUrl = "assets/default.png";
    if (p.image && !p.image.includes("default")) {
      imgUrl = p.image.startsWith("http")
        ? p.image
        : `${API_BASE_URL}/${p.image}`;
    }

    const modal = parseInt(p.price_modal) || 0;
    const markup = parseInt(p.markup) || 0;
    const jual = modal + markup;

    const promoClass = p.is_promo
      ? "text-danger fa-beat"
      : "text-secondary opacity-25";

    tbody.innerHTML += `
            <tr class="${p.is_active ? "" : "table-light text-muted"}">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input prod-select" value="${realIndex}">
                </td>
                <td>
                    <img src="${imgUrl}" class="preview-img" onclick="triggerUpload(${realIndex})">
                    <input type="file" id="file-${realIndex}" class="d-none" onchange="uploadProdImg(this, ${realIndex})">
                </td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 200px;">${p.name}</div>
                    <small class="sku-text">${p.sku} | ${p.brand}</small>
                </td>
                
                <td class="text-center" style="cursor: pointer;" onclick="togglePromo(${realIndex})" title="Jadikan Hot Deal">
                    <i class="fas fa-fire ${promoClass} fs-5"></i>
                </td>

                <td>
                    <input type="number" class="form-control form-control-sm" style="width:80px" 
                        value="${markup}" onchange="updateMarkup(${realIndex}, this.value)">
                </td>
                <td class="fw-bold text-success" id="sell-${realIndex}">Rp ${jual.toLocaleString()}</td>
                <td>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" ${p.is_active ? "checked" : ""} onchange="toggleActive(${realIndex}, this.checked)">
                    </div>
                </td>
            </tr>
        `;
  });
}

// --- ACTIONS ---

function toggleSelectAll(source) {
  const checkboxes = document.querySelectorAll(".prod-select");
  checkboxes.forEach((cb) => (cb.checked = source.checked));
}

function updateMarkup(idx, val) {
  if (db.products[idx]) {
    const markup = parseInt(val) || 0;
    db.products[idx].markup = markup;
    db.products[idx].price_sell = (db.products[idx].price_modal || 0) + markup;

    const sellElem = document.getElementById(`sell-${idx}`);
    if (sellElem)
      sellElem.innerText = `Rp ${db.products[idx].price_sell.toLocaleString()}`;
  }
}

function toggleActive(idx, checked) {
  if (db.products[idx]) db.products[idx].is_active = checked;
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
    // Ubah ikon jadi loading sementara
    const imgTag = document.querySelector(
      `img[onclick="triggerUpload(${idx})"]`,
    );
    const oldSrc = imgTag.src;
    imgTag.style.opacity = "0.5";

    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();

    if (db.products[idx]) {
      db.products[idx].image = data.filepath;
      imgTag.src = data.filepath;
      imgTag.style.opacity = "1";
    }
  } catch (e) {
    alert("Gagal Upload Gambar");
  }
}

function togglePromo(idx) {
  if (db.products[idx]) {
    db.products[idx].is_promo = !db.products[idx].is_promo;
    // Refresh baris ini saja atau semua (untuk simplifikasi refresh semua filter)
    filterProducts();
  }
}

// --- BULK UPDATE IMAGE ---
async function processBulkImage(input) {
  const file = input.files[0];
  if (!file) return;

  const checkboxes = document.querySelectorAll(".prod-select:checked");
  const selectedIndices = Array.from(checkboxes).map((cb) =>
    parseInt(cb.value),
  );

  if (selectedIndices.length === 0) {
    const currentBrand = document.getElementById("filterBrand").value;
    if (!currentBrand) return alert("Pilih Game atau centang produk!");

    if (
      !confirm(
        `⚠️ Ganti gambar untuk SEMUA PRODUK di kategori ${currentBrand}?`,
      )
    ) {
      input.value = "";
      return;
    }

    // Ambil semua yg tampil
    document
      .querySelectorAll(".prod-select")
      .forEach((cb) => selectedIndices.push(parseInt(cb.value)));
  } else {
    if (
      !confirm(`Ganti gambar untuk ${selectedIndices.length} produk terpilih?`)
    ) {
      input.value = "";
      return;
    }
  }

  const btn = document.querySelector('button[onclick*="bulkImgInput"]');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = "⏳ Uploading...";
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    const newImg = data.filepath;

    selectedIndices.forEach((idx) => {
      if (db.products[idx]) db.products[idx].image = newImg;
    });

    await saveProducts(); // Auto save
    filterProducts(); // Refresh UI
    alert(`✅ ${selectedIndices.length} produk diperbarui!`);
  } catch (e) {
    console.error(e);
    alert("Gagal update massal.");
  } finally {
    input.value = "";
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

// --- SYNC & SAVE ---
async function syncDigiflazz() {
  if (!confirm("Tarik data Digiflazz? (Harga modal akan terupdate)")) return;

  const btn = document.getElementById("btnSync");
  const oldHtml = btn.innerHTML;
  btn.innerHTML = "⏳ Syncing...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sync-digiflazz`, {
      method: "POST",
    });

    // Cek status code
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || "Gagal Sync");
    }

    const data = await res.json();
    alert(data.message);
    loadData(); // Reload data tanpa refresh halaman
  } catch (e) {
    alert("Error: " + e.message);
  } finally {
    btn.innerHTML = oldHtml;
    btn.disabled = false;
  }
}

async function deleteAllProducts() {
  if (!confirm("⚠️ BAHAYA: Hapus SEMUA produk?")) return;
  try {
    // Pastikan endpoint ini ada di backend (kalau belum ada, buat dulu)
    // Untuk saat ini kita skip implementasi backend delete-all agar aman
    alert("Fitur reset dimatikan demi keamanan.");
  } catch (e) {
    alert("Error");
  }
}

async function saveProducts() {
  const btn = document.getElementById("btnSaveProd");
  const oldHtml = btn.innerHTML;
  btn.innerHTML = "Saving...";
  btn.disabled = true;

  try {
    await fetch(`${API_BASE_URL}/api/admin/save-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(db.products),
    });
    alert("✅ Data Produk Tersimpan!");
  } catch (e) {
    alert("Gagal menyimpan produk.");
  } finally {
    btn.innerHTML = oldHtml;
    btn.disabled = false;
  }
}

// --- ASSETS ---
function renderAssets() {
  const sDiv = document.getElementById("sliderContainer");
  if (sDiv) {
    sDiv.innerHTML = "";
    (db.assets.sliders || []).forEach((url, i) => {
      let disp = url.startsWith("http") ? url : `${API_BASE_URL}/${url}`;
      sDiv.innerHTML += `
            <div class="position-relative">
                <img src="${disp}" style="width:120px;height:70px;object-fit:cover;border-radius:5px;border:1px solid #ddd;">
                <button onclick="delSlider(${i})" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 px-2" style="transform:translate(30%,-30%);border-radius:50%;">&times;</button>
            </div>`;
    });
  }

  const bDiv = document.getElementById("bannerContainer");
  if (bDiv) {
    bDiv.innerHTML = "";
    const brands = [
      ...new Set(db.products.map((p) => p.brand || "Lainnya")),
    ].sort();

    brands.forEach((b) => {
      const curr =
        (db.assets.banners && db.assets.banners[b]) || "assets/default.png";
      const disp = curr.startsWith("http") ? curr : `${API_BASE_URL}/${curr}`;
      bDiv.innerHTML += `
                <div class="d-flex justify-content-between align-items-center mb-2 border p-2 rounded bg-white">
                    <span class="small fw-bold text-dark">${b}</span>
                    <div class="d-flex gap-2 align-items-center">
                        <img src="${disp}" style="width:60px;height:30px;object-fit:cover;border-radius:4px;border:1px solid #eee;">
                        <label class="btn btn-sm btn-outline-primary py-0" style="cursor:pointer;">
                            Upload <input type="file" class="d-none" onchange="uploadBanner('${b}', this)">
                        </label>
                    </div>
                </div>`;
    });
  }
}

async function uploadNewSlider() {
  const file = document.getElementById("uploadSlider").files[0];
  if (!file) return alert("Pilih file gambar slider dulu");

  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!db.assets.sliders) db.assets.sliders = [];
    db.assets.sliders.push(data.filepath);
    renderAssets();
    // Auto save asset
    saveAssets(true);
  } catch (e) {
    alert("Gagal upload slider");
  }
}

function delSlider(i) {
  if (confirm("Hapus slider ini?")) {
    db.assets.sliders.splice(i, 1);
    renderAssets();
    saveAssets(true); // Auto save
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
    if (!db.assets.banners) db.assets.banners = {};
    db.assets.banners[brand] = data.filepath;
    renderAssets();
    saveAssets(true); // Auto save
  } catch (e) {
    alert("Gagal upload banner");
  }
}

async function saveAssets(silent = false) {
  try {
    await fetch(`${API_BASE_URL}/api/admin/save-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(db.assets),
    });
    if (!silent) alert("Asset tersimpan!");
  } catch (e) {
    if (!silent) alert("Gagal simpan asset");
  }
}

// --- FIX UTAMA ERROR ---
async function saveConfig() {
  // Ambil password lama jika user tidak mengisi/mengubah
  // Pastikan properti ada meskipun kosong
  const currentAdminPass =
    db.config && db.config.admin_password ? db.config.admin_password : "admin";

  const cfg = {
    digiflazz: {
      username: document.getElementById("digi_user").value || "",
      api_key: document.getElementById("digi_api").value || "",
    },
    tripay: {
      merchant_code: document.getElementById("tripay_merchant").value || "",
      api_key: document.getElementById("tripay_api").value || "",
      private_key: document.getElementById("tripay_private").value || "",
    },
    admin_password: currentAdminPass,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/save-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });

    const json = await res.json();
    if (json.success) {
      alert("✅ Konfigurasi Tersimpan!");
      // Update local state
      db.config = cfg;
    } else {
      alert("Gagal menyimpan.");
    }
  } catch (e) {
    console.error(e);
    alert("Error Saving Config");
  }
}
