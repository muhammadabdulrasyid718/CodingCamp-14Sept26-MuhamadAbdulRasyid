/* ==========================================
   EXPENSE & BUDGET VISUALIZER
   Vanilla JS — no frameworks
   ========================================== */

/* ------------------------------------------
   STATE
   ------------------------------------------ */
let transactions = [];      // { id, name, amount, category, date }
let customCategories = [];  // extra category names added by user
let spendingLimit = null;   // number or null
let sortOrder = 'date-desc';
let chartInstance = null;

/* ------------------------------------------
   LOCAL STORAGE HELPERS
   ------------------------------------------ */
const LS_KEYS = {
  transactions:     'ebv_transactions',
  customCategories: 'ebv_custom_categories',
  spendingLimit:    'ebv_spending_limit',
  theme:            'ebv_theme',
};

function saveAll() {
  localStorage.setItem(LS_KEYS.transactions,     JSON.stringify(transactions));
  localStorage.setItem(LS_KEYS.customCategories, JSON.stringify(customCategories));
  localStorage.setItem(LS_KEYS.spendingLimit,    JSON.stringify(spendingLimit));
}

function loadAll() {
  const t = localStorage.getItem(LS_KEYS.transactions);
  const c = localStorage.getItem(LS_KEYS.customCategories);
  const l = localStorage.getItem(LS_KEYS.spendingLimit);

  transactions     = t ? JSON.parse(t) : [];
  customCategories = c ? JSON.parse(c) : [];
  spendingLimit    = l ? JSON.parse(l) : null;
}

/* ------------------------------------------
   DOM REFERENCES
   ------------------------------------------ */
const totalBalanceEl      = document.getElementById('totalBalance');
const limitAlertEl        = document.getElementById('limitAlert');
const limitValueEl        = document.getElementById('limitValue');
const transactionForm     = document.getElementById('transactionForm');
const itemNameInput       = document.getElementById('itemName');
const amountInput         = document.getElementById('amount');
const categorySelect      = document.getElementById('category');
const nameError           = document.getElementById('nameError');
const amountError         = document.getElementById('amountError');
const categoryError       = document.getElementById('categoryError');
const transactionListEl   = document.getElementById('transactionList');
const emptyStateEl        = document.getElementById('emptyState');
const chartEmptyEl        = document.getElementById('chartEmpty');
const sortSelectEl        = document.getElementById('sortSelect');
const themeToggleBtn      = document.getElementById('themeToggle');
const customCategoryInput = document.getElementById('customCategoryName');
const addCategoryBtn      = document.getElementById('addCategoryBtn');
const spendingLimitInput  = document.getElementById('spendingLimit');
const setLimitBtn         = document.getElementById('setLimitBtn');
const clearLimitBtn       = document.getElementById('clearLimitBtn');
const currentLimitDisplay = document.getElementById('currentLimitDisplay');

/* ------------------------------------------
   CHART COLOURS
   ------------------------------------------ */
const CATEGORY_COLORS = {
  Food:      '#22c55e',
  Transport: '#3b82f6',
  Fun:       '#f97316',
};

function getCategoryColor(cat) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  // Generate a stable colour for custom categories using a simple hash
  let hash = 0;
  for (let i = 0; i < cat.length; i++) {
    hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 52%)`;
}

/* ------------------------------------------
   TOTAL BALANCE
   ------------------------------------------ */
function getTotalBalance() {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

function updateBalanceDisplay() {
  const total = getTotalBalance();
  totalBalanceEl.textContent = formatCurrency(total);
}

/* ------------------------------------------
   SPENDING LIMIT ALERT
   ------------------------------------------ */
function updateLimitAlert() {
  if (spendingLimit === null) {
    limitAlertEl.classList.add('hidden');
    return;
  }
  const total = getTotalBalance();
  if (total > spendingLimit) {
    limitValueEl.textContent = formatCurrency(spendingLimit);
    limitAlertEl.classList.remove('hidden');
  } else {
    limitAlertEl.classList.add('hidden');
  }
}

function updateLimitDisplay() {
  if (spendingLimit !== null) {
    currentLimitDisplay.textContent = `Current limit: ${formatCurrency(spendingLimit)}`;
    spendingLimitInput.value = spendingLimit;
  } else {
    currentLimitDisplay.textContent = 'No limit set.';
    spendingLimitInput.value = '';
  }
}

/* ------------------------------------------
   FORMAT HELPERS
   ------------------------------------------ */
function formatCurrency(val) {
  return '$' + Number(val).toFixed(2);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

/* ------------------------------------------
   SORT
   ------------------------------------------ */
function getSortedTransactions() {
  const arr = [...transactions];
  switch (sortOrder) {
    case 'date-desc':    return arr.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'date-asc':     return arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'amount-desc':  return arr.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':   return arr.sort((a, b) => a.amount - b.amount);
    case 'category':     return arr.sort((a, b) => a.category.localeCompare(b.category));
    default:             return arr;
  }
}

/* ------------------------------------------
   RENDER TRANSACTION LIST
   ------------------------------------------ */
function renderTransactions() {
  transactionListEl.innerHTML = '';
  const sorted = getSortedTransactions();

  if (sorted.length === 0) {
    emptyStateEl.classList.remove('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  const total = getTotalBalance();
  const overLimit = spendingLimit !== null && total > spendingLimit;

  sorted.forEach(t => {
    const li = document.createElement('li');
    li.className = 'transaction-item' + (overLimit ? ' over-limit' : '');
    li.dataset.id = t.id;

    // Badge class
    const defaultCats = ['Food', 'Transport', 'Fun'];
    const badgeClass = defaultCats.includes(t.category) ? `cat-${t.category}` : 'cat-custom';

    li.innerHTML = `
      <div class="transaction-info">
        <span class="transaction-name">${escapeHTML(t.name)}</span>
        <span class="transaction-amount">${formatCurrency(t.amount)}</span>
        <span class="transaction-category ${badgeClass}">${escapeHTML(t.category)}</span>
      </div>
      <button class="btn btn-danger delete-btn" data-id="${t.id}" aria-label="Delete ${escapeHTML(t.name)}">Delete</button>
    `;

    transactionListEl.appendChild(li);
  });
}

/* ------------------------------------------
   PIE CHART
   ------------------------------------------ */
function renderChart() {
  const ctx = document.getElementById('spendingChart').getContext('2d');

  // Aggregate totals by category
  const totals = {};
  transactions.forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map(getCategoryColor);

  if (labels.length === 0) {
    chartEmptyEl.classList.remove('hidden');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  chartEmptyEl.classList.add('hidden');

  if (chartInstance) {
    // Update existing chart in-place (no flicker)
    chartInstance.data.labels          = labels;
    chartInstance.data.datasets[0].data            = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 14,
            font: { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
            color: getComputedStyle(document.documentElement)
                     .getPropertyValue('--text').trim() || '#1a1d23',
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${formatCurrency(val)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/* ------------------------------------------
   FULL RENDER (call after every state change)
   ------------------------------------------ */
function renderAll() {
  updateBalanceDisplay();
  updateLimitAlert();
  renderTransactions();
  renderChart();
}

/* ------------------------------------------
   ADD TRANSACTION
   ------------------------------------------ */
function validateForm() {
  let valid = true;

  nameError.textContent     = '';
  amountError.textContent   = '';
  categoryError.textContent = '';
  itemNameInput.classList.remove('error');
  amountInput.classList.remove('error');
  categorySelect.classList.remove('error');

  if (!itemNameInput.value.trim()) {
    nameError.textContent = 'Item name is required.';
    itemNameInput.classList.add('error');
    valid = false;
  }

  const amt = parseFloat(amountInput.value);
  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    amountError.textContent = 'Enter a valid amount greater than 0.';
    amountInput.classList.add('error');
    valid = false;
  }

  if (!categorySelect.value) {
    categoryError.textContent = 'Please select a category.';
    categorySelect.classList.add('error');
    valid = false;
  }

  return valid;
}

transactionForm.addEventListener('submit', e => {
  e.preventDefault();

  if (!validateForm()) return;

  const newTransaction = {
    id:       crypto.randomUUID(),
    name:     itemNameInput.value.trim(),
    amount:   parseFloat(parseFloat(amountInput.value).toFixed(2)),
    category: categorySelect.value,
    date:     new Date().toISOString(),
  };

  transactions.push(newTransaction);
  saveAll();
  renderAll();

  // Reset form
  transactionForm.reset();
  nameError.textContent     = '';
  amountError.textContent   = '';
  categoryError.textContent = '';
});

/* ------------------------------------------
   DELETE TRANSACTION (event delegation)
   ------------------------------------------ */
transactionListEl.addEventListener('click', e => {
  const btn = e.target.closest('.delete-btn');
  if (!btn) return;

  const id = btn.dataset.id;
  transactions = transactions.filter(t => t.id !== id);
  saveAll();
  renderAll();
});

/* ------------------------------------------
   SORT
   ------------------------------------------ */
sortSelectEl.addEventListener('change', () => {
  sortOrder = sortSelectEl.value;
  renderTransactions();
});

/* ------------------------------------------
   DARK / LIGHT MODE TOGGLE
   ------------------------------------------ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  // Update chart legend colour if chart exists
  if (chartInstance) {
    chartInstance.options.plugins.legend.labels.color =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--text').trim();
    chartInstance.update();
  }
}

themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(LS_KEYS.theme, next);
  applyTheme(next);
});

function loadTheme() {
  const saved = localStorage.getItem(LS_KEYS.theme) || 'light';
  applyTheme(saved);
}

/* ------------------------------------------
   CUSTOM CATEGORIES
   ------------------------------------------ */
function renderCustomCategoryOptions() {
  // Remove old custom options
  const existing = categorySelect.querySelectorAll('.custom-option');
  existing.forEach(o => o.remove());

  customCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    opt.className = 'custom-option';
    categorySelect.appendChild(opt);
  });
}

addCategoryBtn.addEventListener('click', () => {
  const name = customCategoryInput.value.trim();
  if (!name) return;

  const allCats = ['Food', 'Transport', 'Fun', ...customCategories];
  if (allCats.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
    alert(`Category "${name}" already exists.`);
    return;
  }

  customCategories.push(name);
  saveAll();
  renderCustomCategoryOptions();
  customCategoryInput.value = '';
});

/* ------------------------------------------
   SPENDING LIMIT
   ------------------------------------------ */
setLimitBtn.addEventListener('click', () => {
  const val = parseFloat(spendingLimitInput.value);
  if (isNaN(val) || val <= 0) {
    alert('Please enter a valid limit greater than 0.');
    return;
  }
  spendingLimit = val;
  saveAll();
  updateLimitDisplay();
  updateLimitAlert();
  renderTransactions(); // re-render to apply/remove highlight
});

clearLimitBtn.addEventListener('click', () => {
  spendingLimit = null;
  saveAll();
  updateLimitDisplay();
  updateLimitAlert();
  renderTransactions();
});

/* ------------------------------------------
   SECURITY HELPER
   ------------------------------------------ */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------
   INIT
   ------------------------------------------ */
function init() {
  loadTheme();
  loadAll();
  renderCustomCategoryOptions();
  updateLimitDisplay();
  renderAll();
}

init();
