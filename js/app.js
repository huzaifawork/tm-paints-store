/* =====================================================
   TM Paints & Sanitary Store — App Logic
   Supabase-powered with localStorage cache
   ===================================================== */

// ===== SUPABASE CONFIG =====
const SUPABASE_URL = 'https://jzuhoazxpgjfsuokpluu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6dWhvYXp4cGdqZnN1b2twbHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDYzODksImV4cCI6MjA5MjY4MjM4OX0.k291zntUVm2vWKntbUbG4DKxPvb41SQQIjy7Z8cTja4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== STATE =====
let products = [];
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';
let editingId = null;
let viewingId = null;
let deleteTargetId = null;
let isLoading = false;

// ===== SIZES CONFIG =====
const PAINTS_SIZES = ['Quarter', 'Gallon', 'Drum', 'Drumy', 'Empty', '1 Litre', '4 Litres', '16 Litres'];
const SANITARY_SIZES = ['1/2 inch', '3/4 inch', '1 inch', '2 inch', '3 inch', '4 inch', '100 Litres (Tank)', '500 Litres (Tank)', '1000 Litres (Tank)', '1 foot', '2 feet', 'Piece', 'Dozen'];

// ===== DB → APP FORMAT MAPPING =====
function fromDb(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    size: row.size,
    price: parseFloat(row.price) || 0,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toDb(data) {
  return {
    name: data.name,
    category: data.category,
    size: data.size || null,
    price: data.price,
    description: data.description || null
  };
}

// ===== STORE (Supabase + localStorage cache) =====
const CACHE_KEY = 'tm_paints_products';

const Store = {
  // Cache helpers
  getCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || [];
    } catch { return []; }
  },

  setCache(items) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  },

  // Fetch all from Supabase
  async getAll() {
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = data.map(fromDb);
      this.setCache(mapped);
      return mapped;
    } catch (err) {
      console.warn('Supabase fetch failed, using cache:', err.message);
      return this.getCache();
    }
  },

  // Add product
  async add(productData) {
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .insert([toDb(productData)])
        .select();

      if (error) throw error;

      const newProduct = fromDb(data[0]);
      // Update cache
      const cache = this.getCache();
      cache.unshift(newProduct);
      this.setCache(cache);
      return newProduct;
    } catch (err) {
      console.error('Add failed:', err.message);
      // Fallback: add to cache only
      const fallback = {
        ...productData,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const cache = this.getCache();
      cache.unshift(fallback);
      this.setCache(cache);
      return fallback;
    }
  },

  // Update product
  async update(id, productData) {
    try {
      const { data, error } = await supabaseClient
        .from('products')
        .update({ ...toDb(productData), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();

      if (error) throw error;

      const updated = fromDb(data[0]);
      // Update cache
      const cache = this.getCache();
      const idx = cache.findIndex(p => p.id === id);
      if (idx !== -1) cache[idx] = updated;
      this.setCache(cache);
      return updated;
    } catch (err) {
      console.error('Update failed:', err.message);
      // Fallback: update cache only
      const cache = this.getCache();
      const idx = cache.findIndex(p => p.id === id);
      if (idx !== -1) {
        cache[idx] = { ...cache[idx], ...productData, updatedAt: new Date().toISOString() };
        this.setCache(cache);
        return cache[idx];
      }
      return null;
    }
  },

  // Delete product
  async delete(id) {
    try {
      const { error } = await supabaseClient
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Delete failed:', err.message);
    }

    // Always update cache
    const cache = this.getCache().filter(p => p.id !== id);
    this.setCache(cache);
  }
};

// ===== DOM REFERENCES =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  splash: $('#screen-splash'),
  home: $('#screen-home'),
  form: $('#screen-form'),
  detail: $('#screen-detail'),

  productList: $('#product-list'),
  emptyState: $('#empty-state'),
  statsBar: $('#stats-bar'),

  searchBar: $('#search-bar'),
  searchInput: $('#search-input'),

  formEl: $('#product-form'),
  formTitle: $('#form-title'),
  inputName: $('#input-name'),
  inputSize: $('#input-size'),
  inputPrice: $('#input-price'),
  inputDesc: $('#input-desc'),
  inputId: $('#input-id'),
  btnSubmit: $('#btn-submit'),
  sizesList: $('#sizes-list'),

  detailContent: $('#detail-content'),

  sortOverlay: $('#sort-overlay'),
  deleteOverlay: $('#delete-overlay'),
  deleteProductName: $('#delete-product-name'),

  toast: $('#toast'),
  toastMsg: $('#toast-msg'),
  toastIcon: $('#toast-icon'),

  statTotal: $('#stat-total'),
  statPaints: $('#stat-paints'),
  statSanitary: $('#stat-sanitary'),
};

// ===== SIZES DROPDOWN =====
function updateSizeDropdown(category) {
  const sizes = category === 'paints' ? PAINTS_SIZES : SANITARY_SIZES;
  DOM.sizesList.innerHTML = sizes.map(s => `<option value="${s}"></option>`).join('');
}


// ===== NAVIGATION =====
function navigate(screenId) {
  const screens = $$('.screen:not(#screen-splash)');
  screens.forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });

  const target = $(`#screen-${screenId}`);
  if (target) {
    target.style.display = 'flex';
    // Double rAF to ensure display:flex is applied before adding active class
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.classList.add('active');
      });
    });
  }

  // Scroll to top
  window.scrollTo(0, 0);
}

// ===== RENDER PRODUCTS =====
async function renderProducts() {
  // Show loading on first load
  if (products.length === 0 && !isLoading) {
    isLoading = true;
    // Show cached data first (instant)
    products = Store.getCache();
    renderProductList();

    // Then fetch fresh from Supabase
    products = await Store.getAll();
    renderProductList();
    isLoading = false;
  } else if (!isLoading) {
    products = await Store.getAll();
    renderProductList();
  } else {
    renderProductList();
  }
}

function renderProductList() {
  // Apply filter
  let filtered = [...products];
  if (currentFilter !== 'all') {
    filtered = filtered.filter(p => p.category === currentFilter);
  }

  // Apply search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  // Apply sort
  filtered = sortProducts(filtered, currentSort);

  // Update stats
  updateStats();

  // Render
  if (filtered.length === 0) {
    DOM.productList.style.display = 'none';
    DOM.emptyState.style.display = 'flex';

    if (products.length > 0 && (searchQuery || currentFilter !== 'all')) {
      DOM.emptyState.querySelector('h2').textContent = 'No Results Found';
      DOM.emptyState.querySelector('p').innerHTML = 'Try a different search or filter';
      DOM.emptyState.querySelector('.empty-icon').textContent = 'search_off';
    } else {
      DOM.emptyState.querySelector('h2').textContent = 'No Products Yet';
      DOM.emptyState.querySelector('p').innerHTML = 'Tap the <strong>+</strong> button below to add your first product';
      DOM.emptyState.querySelector('.empty-icon').textContent = 'inventory_2';
    }
  } else {
    DOM.productList.style.display = 'flex';
    DOM.emptyState.style.display = 'none';

    DOM.productList.innerHTML = filtered.map((p, i) => `
      <div class="product-card cat-${p.category}" data-id="${p.id}" style="animation-delay: ${i * 0.05}s">
        <div class="card-icon">
          <span class="material-icons-round">${p.category === 'paints' ? 'format_paint' : 'plumbing'}</span>
        </div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(p.name)}</div>
          <div class="card-meta">
            ${p.size ? `
              <span class="card-badge">
                <span class="material-icons-round">inventory_2</span>
                ${escapeHtml(p.size)}
              </span>
            ` : ''}
            <span class="card-badge">
              <span class="material-icons-round">${p.category === 'paints' ? 'format_paint' : 'plumbing'}</span>
              ${p.category === 'paints' ? 'Paint' : 'Sanitary'}
            </span>
          </div>
          ${p.description ? `<div class="card-desc">${escapeHtml(p.description)}</div>` : ''}
          <div class="card-actions">
            <button class="card-action-btn edit" onclick="event.stopPropagation(); editProduct('${p.id}')">
              <span class="material-icons-round">edit</span>
              Edit
            </button>
            <button class="card-action-btn delete" onclick="event.stopPropagation(); confirmDelete('${p.id}')">
              <span class="material-icons-round">delete</span>
              Delete
            </button>
          </div>
        </div>
        <div class="card-price">
          <div class="price-currency">PKR</div>
          <div class="price-amount">${formatPrice(p.price)}</div>
        </div>
      </div>
    `).join('');

    // Add click handlers for detail view
    DOM.productList.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        showDetail(id);
      });
    });
  }
}

// ===== SORT =====
function sortProducts(items, sortType) {
  const sorted = [...items];
  switch (sortType) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'price-low':
      return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
    case 'price-high':
      return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    default:
      return sorted;
  }
}

// ===== UPDATE STATS =====
function updateStats() {
  const all = products.length;
  const paints = products.filter(p => p.category === 'paints').length;
  const sanitary = products.filter(p => p.category === 'sanitary').length;

  animateNumber(DOM.statTotal, all);
  animateNumber(DOM.statPaints, paints);
  animateNumber(DOM.statSanitary, sanitary);
}

function animateNumber(el, target) {
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  const duration = 400;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ===== SHOW DETAIL =====
function showDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  viewingId = id;

  DOM.detailContent.innerHTML = `
    <div class="detail-category-badge ${product.category}">
      <span class="material-icons-round">${product.category === 'paints' ? 'format_paint' : 'plumbing'}</span>
      ${product.category === 'paints' ? 'Paints' : 'Sanitary'}
    </div>
    <h1 class="detail-name">${escapeHtml(product.name)}</h1>
    <div class="detail-price"><span>Rs. </span>${formatPrice(product.price)}</div>

    ${product.size ? `
      <div class="detail-section">
        <div class="detail-section-title">Size / Packaging</div>
        <div class="detail-info-card">
          <span class="material-icons-round">inventory_2</span>
          <div>
            <div class="detail-info-text">${escapeHtml(product.size)}</div>
            <div class="detail-info-label">Current selection/amount</div>
          </div>
        </div>
      </div>
    ` : ''}

    ${product.description ? `
      <div class="detail-section">
        <div class="detail-section-title">Description</div>
        <div class="detail-desc">${escapeHtml(product.description)}</div>
      </div>
    ` : ''}

    <div class="detail-date">
      <span class="material-icons-round">schedule</span>
      Added ${formatDate(product.createdAt)}
      ${product.updatedAt !== product.createdAt ? ` · Updated ${formatDate(product.updatedAt)}` : ''}
    </div>
  `;

  navigate('detail');
}

// ===== EDIT PRODUCT =====
function editProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  editingId = id;
  DOM.formTitle.textContent = 'Edit Product';
  DOM.btnSubmit.innerHTML = '<span class="material-icons-round">save</span> Update Product';

  // Fill form
  DOM.inputName.value = product.name;
  DOM.inputSize.value = product.size || '';
  DOM.inputPrice.value = product.price || '';
  DOM.inputDesc.value = product.description || '';
  DOM.inputId.value = id;

  // Set category
  $$('#category-select .cat-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === product.category);
  });
  updateSizeDropdown(product.category);

  navigate('form');
}

// ===== ADD PRODUCT (open form) =====
function openAddForm() {
  editingId = null;
  DOM.formTitle.textContent = 'Add Product';
  DOM.btnSubmit.innerHTML = '<span class="material-icons-round">save</span> Save Product';

  // Reset form
  DOM.formEl.reset();
  DOM.inputId.value = '';

  // Reset category to paints
  $$('#category-select .cat-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'paints');
  });
  updateSizeDropdown('paints');

  // Clear errors
  $$('.form-group').forEach(g => g.classList.remove('error'));

  navigate('form');
}

// ===== SAVE PRODUCT =====
async function saveProduct(e) {
  e.preventDefault();

  // Clear previous errors
  $$('.form-group').forEach(g => g.classList.remove('error'));

  const name = DOM.inputName.value.trim();
  const category = $('#category-select .cat-option.active')?.dataset.value || 'paints';
  const size = DOM.inputSize.value.trim() || null;
  const price = DOM.inputPrice.value ? parseFloat(DOM.inputPrice.value) : null;
  const description = DOM.inputDesc.value.trim();

  // Validation
  let valid = true;
  if (!name) {
    DOM.inputName.closest('.form-group').classList.add('error');
    valid = false;
  }
  if (!price && price !== 0) {
    DOM.inputPrice.closest('.form-group').classList.add('error');
    valid = false;
  }

  if (!valid) {
    showToast('Please fill required fields', 'error');
    return;
  }

  // Disable button while saving
  DOM.btnSubmit.disabled = true;
  DOM.btnSubmit.innerHTML = '<span class="material-icons-round">hourglass_top</span> Saving...';

  const data = { name, category, size, price, description };

  try {
    if (editingId) {
      await Store.update(editingId, data);
      showToast('Product updated!', 'success');
    } else {
      await Store.add(data);
      showToast('Product added!', 'success');
    }

    editingId = null;
    await renderProducts();
    navigate('home');
  } catch (err) {
    showToast('Error saving product', 'error');
  } finally {
    DOM.btnSubmit.disabled = false;
    DOM.btnSubmit.innerHTML = '<span class="material-icons-round">save</span> Save Product';
  }
}

// ===== DELETE =====
function confirmDelete(id) {
  deleteTargetId = id;
  const product = products.find(p => p.id === id);
  DOM.deleteProductName.textContent = `Are you sure you want to delete "${product?.name}"?`;
  DOM.deleteOverlay.classList.add('open');
}

async function executeDelete() {
  if (deleteTargetId) {
    await Store.delete(deleteTargetId);
    showToast('Product deleted', 'success');
    deleteTargetId = null;
    await renderProducts();
    navigate('home');
  }
  DOM.deleteOverlay.classList.remove('open');
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  DOM.toast.className = `toast ${type}`;
  DOM.toastMsg.textContent = msg;
  DOM.toastIcon.textContent = type === 'success' ? 'check_circle' : 'error';

  requestAnimationFrame(() => {
    DOM.toast.classList.add('show');
  });

  setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, 2500);
}

// ===== HELPERS =====
function formatPrice(price) {
  if (!price && price !== 0) return '0';
  return new Intl.NumberFormat('en-PK').format(price);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== EVENT LISTENERS =====
function initEvents() {
  // FAB — Add Product
  $('#btn-add').addEventListener('click', openAddForm);

  // Form Submit
  DOM.formEl.addEventListener('submit', saveProduct);

  // Back buttons
  $('#btn-form-back').addEventListener('click', () => {
    editingId = null;
    navigate('home');
  });

  $('#btn-detail-back').addEventListener('click', () => {
    viewingId = null;
    navigate('home');
  });

  // Detail actions
  $('#btn-detail-edit').addEventListener('click', () => {
    if (viewingId) editProduct(viewingId);
  });

  $('#btn-edit-product').addEventListener('click', () => {
    if (viewingId) editProduct(viewingId);
  });

  $('#btn-delete-product').addEventListener('click', () => {
    if (viewingId) confirmDelete(viewingId);
  });

  // Search
  $('#btn-search').addEventListener('click', () => {
    DOM.searchBar.classList.add('open');
    DOM.searchInput.focus();
  });

  $('#btn-search-close').addEventListener('click', () => {
    DOM.searchBar.classList.remove('open');
    DOM.searchInput.value = '';
    searchQuery = '';
    renderProductList(); // Use sync render for search (data already loaded)
  });

  DOM.searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderProductList(); // Use sync render for search
  });

  // Category Tabs
  $$('.category-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.category-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.category;
      renderProductList(); // Use sync render for filter
    });
  });

  // Category Select (form)
  $$('#category-select .cat-option').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#category-select .cat-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSizeDropdown(btn.dataset.value);
    });
  });

  // Sort
  $('#btn-sort').addEventListener('click', () => {
    DOM.sortOverlay.classList.add('open');
  });

  DOM.sortOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.sortOverlay) {
      DOM.sortOverlay.classList.remove('open');
    }
  });

  $$('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.sort-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      currentSort = opt.dataset.sort;
      renderProductList(); // Use sync render for sort
      DOM.sortOverlay.classList.remove('open');
    });
  });

  // Delete Confirm
  $('#btn-delete-cancel').addEventListener('click', () => {
    deleteTargetId = null;
    DOM.deleteOverlay.classList.remove('open');
  });

  $('#btn-delete-confirm').addEventListener('click', executeDelete);

  DOM.deleteOverlay.addEventListener('click', (e) => {
    if (e.target === DOM.deleteOverlay) {
      deleteTargetId = null;
      DOM.deleteOverlay.classList.remove('open');
    }
  });

  // Hardware back button (Android)
  window.addEventListener('popstate', () => {
    const activeScreen = document.querySelector('.screen.active:not(#screen-splash)');
    if (activeScreen?.id === 'screen-form' || activeScreen?.id === 'screen-detail') {
      navigate('home');
    }
  });

  // Handle form input clearing errors on type
  DOM.inputName.addEventListener('input', () => {
    DOM.inputName.closest('.form-group').classList.remove('error');
  });

  DOM.inputPrice.addEventListener('input', () => {
    DOM.inputPrice.closest('.form-group').classList.remove('error');
  });
}

// ===== SPLASH SCREEN =====
function hideSplash() {
  setTimeout(() => {
    DOM.splash.style.opacity = '0';
    DOM.splash.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      DOM.splash.style.display = 'none';
      DOM.splash.classList.remove('active');
      navigate('home');
    }, 500);
  }, 1800);
}

// ===== PWA REGISTRATION =====
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — running locally
    });
  }
}

// ===== INIT =====
async function init() {
  registerSW();
  initEvents();
  await renderProducts();
  hideSplash();

  // Push state for back button handling
  history.pushState({ screen: 'home' }, '', '');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
