const Admin = {
  dbKey: 'HAWAI_PROMO_DB',

  // Default Data Seeding
  defaults: {
    "HAWAI": { value: 0.1, type: "percent" },
    "CYBER": { value: 0.2, type: "percent" },
    "FLASH50": { value: 5000, type: "flat" },
    "GWGANTENG": { value: 0.5, type: "percent" } // Secret
  },

  init: () => {
    // Check if DB exists, if not seed it
    if (!localStorage.getItem(Admin.dbKey)) {
      localStorage.setItem(Admin.dbKey, JSON.stringify(Admin.defaults));
    }

    // Auto-login if previously auth in session (optional, kept simple for now)
  },

  login: () => {
    const pass = document.getElementById('adminPass').value;
    const msg = document.getElementById('authMsg');

    // Simple client-side gate (Not production secure, but fits the brief)
    if (pass === 'admin123') {
      document.getElementById('authLayer').classList.add('hidden');
      document.getElementById('dashboard').classList.remove('hidden');
      Admin.render();
      // FX Audio for cool effect
      if (typeof Sound !== 'undefined') Sound.success();
    } else {
      msg.innerText = "ACCESS DENIED. INCORRECT CREDENTIALS.";
      if (typeof Sound !== 'undefined') Sound.play(200, "sawtooth", 0.5);
      document.getElementById('adminPass').value = '';
    }
  },

  getData: () => {
    return JSON.parse(localStorage.getItem(Admin.dbKey) || '{}');
  },

  saveData: (data) => {
    localStorage.setItem(Admin.dbKey, JSON.stringify(data));
    Admin.render();
  },

  addVoucher: () => {
    const codeInput = document.getElementById('newCode');
    const typeInput = document.getElementById('newType');
    const valInput = document.getElementById('newValue');

    const code = codeInput.value.trim().toUpperCase().replace(/\s/g, '');
    const type = typeInput.value;
    const val = parseFloat(valInput.value);

    if (!code || isNaN(val)) {
      alert("Please fill all fields correctly.");
      return;
    }

    const data = Admin.getData();
    data[code] = { value: val, type: type };
    Admin.saveData(data);

    // Reset Form
    codeInput.value = '';
    valInput.value = '';

    if (typeof Sound !== 'undefined') Sound.success();
  },

  deleteVoucher: (code) => {
    if (confirm(`Revoke access for code [${code}]?`)) {
      const data = Admin.getData();
      delete data[code];
      Admin.saveData(data);
    }
  },

  render: () => {
    const tBody = document.getElementById('voucherTable');
    const data = Admin.getData();
    tBody.innerHTML = '';

    if (Object.keys(data).length === 0) {
      tBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">DATABASE EMPTY</td></tr>`;
      return;
    }

    Object.keys(data).forEach(code => {
      const item = data[code];
      let displayVal = item.type === 'percent'
        ? `${Math.round(item.value * 100)}%`
        : `Rp ${item.value.toLocaleString()}`;

      tBody.innerHTML += `
            <tr>
                <td class="text-neon" style="font-weight:bold;">${code}</td>
                <td style="text-transform:uppercase;">${item.type}</td>
                <td>${displayVal}</td>
                <td><span class="status-badge status-success">ACTIVE</span></td>
                <td>
                    <button class="btn-icon text-pink" onclick="Admin.deleteVoucher('${code}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    });
  }
};

// Initialize
window.onload = Admin.init;
