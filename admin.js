const API_BASE_URL = "http://localhost:3000";

let db = { config: {}, products: [], assets: { sliders: [], banners: {} } };

// --- AUTH ---
async function login() {
  const pass = document.getElementById("adminPass").value;
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
    } else alert("Password Salah");
  } catch (e) {
    alert("Server Error");
  }
}

function logout() {
  location.reload();
}

async function loadData() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/config`);
    db = await res.json();

    // Fill Config Inputs
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
  } catch (e) {
    console.error(e);
  }
}

// --- PRODUCTS ---
function populateBrandFilter() {
  const brands = [
    ...new Set(db.products.map((p) => p.brand || "Lainnya")),
  ].sort();
  const select = document.getElementById("filterBrand");
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

  if (!brand) return;

  // Reset Checkbox Header
  document.getElementById("selectAll").checked = false;

  const filtered = db.products.filter((p) => {
    const pBrand = p.brand || "Lainnya";
    const matchBrand = brand === "ALL_DATA" || pBrand === brand;
    const matchSearch =
      (p.sku || "").toLowerCase().includes(search) ||
      (p.name || "").toLowerCase().includes(search);
    return matchBrand && matchSearch;
  });

  renderProductTable(filtered.slice(0, 200)); // Limit display 200 item
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
    const realIndex = db.products.indexOf(p);
    let imgUrl = "assets/default.png";
    if (p.image && !p.image.includes("default")) {
      imgUrl = p.image.startsWith("http")
        ? p.image
        : `${API_BASE_URL}/${p.image}`;
    }

    const modal = parseInt(p.price_modal) || 0;
    const markup = parseInt(p.markup) || 0;
    const jual = modal + markup;

    // Tentukan warna api (Merah = Promo Aktif, Abu = Mati)
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
                    <div class="fw-bold">${p.name}</div>
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

// Fitur Pilih Semua
function toggleSelectAll(source) {
  const checkboxes = document.querySelectorAll(".prod-select");
  checkboxes.forEach((cb) => (cb.checked = source.checked));
}

function updateMarkup(idx, val) {
  const markup = parseInt(val) || 0;
  db.products[idx].markup = markup;
  db.products[idx].price_sell = (db.products[idx].price_modal || 0) + markup;
  document.getElementById(`sell-${idx}`).innerText =
    `Rp ${db.products[idx].price_sell.toLocaleString()}`;
}

function toggleActive(idx, checked) {
  db.products[idx].is_active = checked;
}

function triggerUpload(idx) {
  document.getElementById(`file-${idx}`).click();
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
    db.products[idx].image = data.filepath;
    filterProducts(); // Refresh
  } catch (e) {
    alert("Gagal Upload");
  }
}

function togglePromo(idx) {
  // Toggle status promo (true/false)
  db.products[idx].is_promo = !db.products[idx].is_promo;

  // Auto save agar admin tidak lupa simpan
  saveProducts();

  // Refresh tabel untuk melihat perubahan warna api
  filterProducts();
}

// --- BULK UPDATE IMAGE LOGIC ---
async function processBulkImage(input) {
  const file = input.files[0];
  if (!file) return;

  // 1. Ambil ID dari produk yang DICENTANG saja
  const checkboxes = document.querySelectorAll(".prod-select:checked");
  const selectedIndices = Array.from(checkboxes).map((cb) =>
    parseInt(cb.value),
  );

  // 2. Validasi Seleksi
  if (selectedIndices.length === 0) {
    // Fallback: Jika tidak ada yg dicentang, tawarkan update SEMUA yg ada di filter saat ini
    const currentBrand = document.getElementById("filterBrand").value;
    if (!currentBrand) return alert("Pilih Game dulu atau centang produk!");

    if (
      !confirm(
        `⚠️ Tidak ada produk yang dicentang.\n\nApakah Anda ingin mengganti gambar untuk SEMUA PRODUK yang sedang tampil (${currentBrand})?`,
      )
    ) {
      input.value = "";
      return;
    }

    // Ambil semua index yang sedang tampil (karena user setuju update semua)
    const allVisible = document.querySelectorAll(".prod-select");
    allVisible.forEach((cb) => selectedIndices.push(parseInt(cb.value)));
  } else {
    if (
      !confirm(
        `Ganti gambar untuk ${selectedIndices.length} produk yang dipilih?`,
      )
    ) {
      input.value = "";
      return;
    }
  }

  // 3. Upload Gambar Sekali
  const btn = document.querySelector('button[onclick*="bulkImgInput"]');
  const originalText = btn.innerHTML;
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

    // 4. Terapkan gambar ke list index yang sudah didapat
    selectedIndices.forEach((idx) => {
      if (db.products[idx]) db.products[idx].image = newImg;
    });

    // 5. Simpan Otomatis
    await saveProducts();
    alert(`✅ Sukses! ${selectedIndices.length} produk diperbarui.`);

    // 6. Reset & Refresh
    filterProducts();
  } catch (e) {
    console.error(e);
    alert("Gagal melakukan update massal.");
  } finally {
    input.value = "";
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// --- SERVER SYNC & SAVE ---
async function syncDigiflazz() {
  if (!confirm("Tarik data Digiflazz? Harga modal akan diupdate.")) return;
  document.getElementById("btnSync").innerHTML = "⏳...";
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/sync-digiflazz`, {
      method: "POST",
    });
    const data = await res.json();
    alert(data.message);
    location.reload();
  } catch (e) {
    alert("Sync Error");
  }
  document.getElementById("btnSync").innerHTML =
    `<i class="fas fa-sync"></i> Sync`;
}

async function deleteAllProducts() {
  if (!confirm("⚠️ Yakin hapus SEMUA produk?")) return;
  try {
    await fetch(`${API_BASE_URL}/api/admin/delete-all-products`, {
      method: "POST",
    });
    location.reload();
  } catch (e) {
    alert("Error Delete");
  }
}

async function saveProducts() {
  const btn = document.getElementById("btnSaveProd");
  btn.innerHTML = "Saving...";
  await fetch(`${API_BASE_URL}/api/admin/save-products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db.products),
  });
  alert("Tersimpan!");
  btn.innerHTML = `<i class="fas fa-save"></i> SIMPAN`;
}

// --- ASSETS ---
function renderAssets() {
  const sDiv = document.getElementById("sliderContainer");
  sDiv.innerHTML = "";
  (db.assets.sliders || []).forEach((url, i) => {
    let disp = url.startsWith("http") ? url : `${API_BASE_URL}/${url}`;
    sDiv.innerHTML += `<div class="position-relative"><img src="${disp}" style="width:120px;height:70px;object-fit:cover;border-radius:5px;"><button onclick="delSlider(${i})" class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 px-1">&times;</button></div>`;
  });

  const bDiv = document.getElementById("bannerContainer");
  bDiv.innerHTML = "";
  const brands = [
    ...new Set(db.products.map((p) => p.brand || "Lainnya")),
  ].sort();
  brands.forEach((b) => {
    const curr =
      (db.assets.banners && db.assets.banners[b]) || "assets/default.png";
    const disp = curr.startsWith("http") ? curr : `${API_BASE_URL}/${curr}`;
    bDiv.innerHTML += `
            <div class="d-flex justify-content-between align-items-center mb-2 border p-2 rounded">
                <span class="small fw-bold">${b}</span>
                <div class="d-flex gap-2">
                    <img src="${disp}" style="width:60px;height:30px;object-fit:cover;border-radius:4px;">
                    <input type="file" class="form-control form-control-sm" style="width:80px" onchange="uploadBanner('${b}', this)">
                </div>
            </div>`;
  });
}

async function uploadNewSlider() {
  const file = document.getElementById("uploadSlider").files[0];
  if (!file) return alert("Pilih file");
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  db.assets.sliders.push(data.filepath);
  renderAssets();
}

function delSlider(i) {
  if (confirm("Hapus slider?")) {
    db.assets.sliders.splice(i, 1);
    renderAssets();
  }
}

async function uploadBanner(brand, input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${API_BASE_URL}/api/admin/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!db.assets.banners) db.assets.banners = {};
  db.assets.banners[brand] = data.filepath;
  saveAssets();
  renderAssets();
}

async function saveAssets() {
  await fetch(`${API_BASE_URL}/api/admin/save-assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(db.assets),
  });
  alert("Asset tersimpan");
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
    admin_password: db.config.admin_password,
  };
  await fetch(`${API_BASE_URL}/api/admin/save-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  alert("Config tersimpan");
}
