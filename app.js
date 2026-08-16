
// Toast notification system
window.showToast = function(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; max-width: 350px; width: calc(100% - 40px); pointer-events: none;';
    document.body.appendChild(container);
  }

  const card = document.createElement('div');
  card.className = `toast-card toast-${type}`;
  card.style.pointerEvents = 'auto';
  card.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" style="background:none;border:none;color:inherit;font-size:1.25rem;cursor:pointer;line-height:1;">&times;</button>
  `;

  const closeBtn = card.querySelector('.toast-close');
  const closeToast = () => {
    card.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => { card.remove(); }, 300);
  };
  if (closeBtn) closeBtn.onclick = closeToast;

  setTimeout(closeToast, 4000);
  container.appendChild(card);
};

// Supabase Init
const { createClient } = supabase;
window.supabaseClient = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
const supabaseClient = window.supabaseClient;

window.userProfile = null;
window.authSession = null;

// Currency Formatter
window.formatVND = function(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
};

// Global Auth Check & Navbar Sync
async function initGlobalAuth() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    window.authSession = session;

    const navAuthBtn = document.getElementById('nav-auth-btn');
    const drawerAuthBtn = document.getElementById('drawer-auth-btn');
    const navDepositLink = document.getElementById('nav-deposit-link');
    const navHistoryLink = document.getElementById('nav-history-link');
    const drawerDepositLink = document.getElementById('drawer-deposit-link');
    const drawerHistoryLink = document.getElementById('drawer-history-link');
    const navBalanceWrapper = document.getElementById('nav-balance-wrapper');
    const navUserBalance = document.getElementById('nav-user-balance');
    const drawerBalanceWrapper = document.getElementById('drawer-balance-wrapper');
    const drawerUserBalance = document.getElementById('drawer-user-balance');

    if (session) {
      // Fetch Profile
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      window.userProfile = profile || { balance: 0 };
      const balStr = `Ví: ${formatVND(window.userProfile.balance)}`;

      if (navUserBalance) navUserBalance.innerText = balStr;
      if (navBalanceWrapper) navBalanceWrapper.classList.remove('d-none');
      if (drawerUserBalance) drawerUserBalance.innerText = balStr;
      if (drawerBalanceWrapper) drawerBalanceWrapper.classList.remove('d-none');

      if (navDepositLink) navDepositLink.classList.remove('d-none');
      if (navHistoryLink) navHistoryLink.classList.remove('d-none');
      if (drawerDepositLink) drawerDepositLink.classList.remove('d-none');
      if (drawerHistoryLink) drawerHistoryLink.classList.remove('d-none');

      const logoutAction = async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        location.href = '/';
      };

      if (navAuthBtn) {
        navAuthBtn.innerText = 'Đăng Xuất';
        navAuthBtn.onclick = logoutAction;
      }
      if (drawerAuthBtn) {
        drawerAuthBtn.innerText = 'Đăng Xuất';
        drawerAuthBtn.onclick = logoutAction;
      }
    } else {
      if (navBalanceWrapper) navBalanceWrapper.classList.add('d-none');
      if (drawerBalanceWrapper) drawerBalanceWrapper.classList.add('d-none');

      const loginAction = (e) => {
        e.preventDefault();
        location.href = '/login.html';
      };

      if (navAuthBtn) {
        navAuthBtn.innerText = 'Đăng Nhập';
        navAuthBtn.onclick = loginAction;
      }
      if (drawerAuthBtn) {
        drawerAuthBtn.innerText = 'Đăng Nhập';
        drawerAuthBtn.onclick = loginAction;
      }
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }
}

// Drawer Setup
function setupDrawer() {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const navDrawer = document.getElementById('nav-drawer');
  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');

  function toggleDrawer(open) {
    if (!navDrawer || !drawerOverlay) return;
    if (open) {
      navDrawer.classList.add('open');
      drawerOverlay.classList.add('open');
    } else {
      navDrawer.classList.remove('open');
      drawerOverlay.classList.remove('open');
    }
  }

  if (hamburgerBtn) hamburgerBtn.onclick = () => toggleDrawer(true);
  if (drawerCloseBtn) drawerCloseBtn.onclick = () => toggleDrawer(false);
  if (drawerOverlay) drawerOverlay.onclick = () => toggleDrawer(false);
}

// Zalo Button Injector
function setupZaloButton() {
  if (document.getElementById('zalo-contact-btn')) return;
  const zaloBtn = document.createElement('a');
  zaloBtn.href = 'https://zalo.me/0349255864';
  zaloBtn.target = '_blank';
  zaloBtn.id = 'zalo-contact-btn';
  zaloBtn.title = 'Liên hệ Zalo: 0349255864';
  zaloBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 460.1 436.6">
      <path fill="#0068ff" d="M230.1 0C103 0 0 89.1 0 199.1c0 62.1 32 117.1 82.1 154.1v77.1c0 5 4 8.1 9 6.1l76.1-34.1c19 5.1 41 8.1 63 8.1 127.1 0 230.1-89.1 230.1-199.1S357.1 0 230.1 0z"/>
      <path fill="#fff" d="M330.1 262.1h-56.1c-5 0-9-4-9-9v-9c0-5 4-9 9-9h38.1v-27.1h-29.1c-17 0-31-13.1-31-30.1v-14.1c0-17 14-30.1 31-30.1h56.1c5 0 9 4 9 9v9c0 5-4 9-9 9h-38.1v27.1h29.1c17 0 31 13.1 31 30.1v14.1c0 17-14 30.1-31 30.1zM182.1 134.1h-16.1l-47.1 106.1c-1 3-5 5-8 5h-10c-6 0-9-7-6-12l51.1-105.1c3-6 9-10 16-10h20.1c5 0 9 4 9 9v9c0 5-4 9-9 9zM151.1 239.1c-8.8 0-16-7.2-16-16s7.2-16 16-16 16 7.2 16 16-7.2 16-16 16zm129 23h-52.1c-5 0-9-4-9-9v-9c0-5 4-9 9-9h52.1c5 0 9 4 9 9v9c0 5-4 9-9 9zM102.1 125.1h-54.1c-5 0-9 4-9 9v9c0 5 4 9 9 9h36.1v23.1h-36.1c-5 0-9 4-9 9v9c0 5 4 9 9 9h36.1v22.1h-36.1c-5 0-9 4-9 9v9c0 5 4 9 9 9h54.1c5 0 9-4 9-9v-100.1c0-5-4-9-9-9z"/>
    </svg>
  `;
  zaloBtn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;box-shadow:0 4px 15px rgba(0,104,255,0.4);z-index:9999;cursor:pointer;transition:transform 0.3s ease;display:flex;align-items:center;justify-content:center;background:#fff;border: 2px solid #0068ff;';
  zaloBtn.onmouseover = () => { zaloBtn.style.transform = 'scale(1.1)'; };
  zaloBtn.onmouseout = () => { zaloBtn.style.transform = 'scale(1)'; };
  document.body.appendChild(zaloBtn);
}

// Store / Product Catalog Logic (If on index page)
let allProducts = [];
let selectedProduct = null;

async function initIndexPage() {
  const productsContainer = document.getElementById('products-container');
  const categoriesContainer = document.getElementById('categories-container');
  if (!productsContainer) return;

  // Load Categories
  try {
    const { data: categories } = await supabaseClient
      .from('categories')
      .select('*')
      .order('name');

    if (categories && categoriesContainer) {
      categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn';
        btn.innerText = cat.name;
        btn.setAttribute('data-category', cat.id);
        btn.onclick = () => filterByCategory(cat.id, btn);
        categoriesContainer.appendChild(btn);
      });

      const allBtn = categoriesContainer.querySelector('[data-category="all"]');
      if (allBtn) {
        allBtn.onclick = () => filterByCategory('all', allBtn);
      }
    }
  } catch (err) {
    console.error('Error loading categories:', err);
  }

  // Load Products
  try {
    const { data: products, error } = await supabaseClient
      .from('products')
      .select('*, categories(name)')
      .eq('status', 'active');

    if (error || !products) {
      productsContainer.innerHTML = '<p style="color: var(--danger); text-align: center; grid-column: 1/-1;">Không thể tải danh sách sản phẩm. Vui lòng thử lại sau.</p>';
      return;
    }

    // Load Stock for Auto
    const { data: items } = await supabaseClient
      .from('items')
      .select('product_id')
      .eq('is_sold', false);

    const stockMap = {};
    if (items) {
      items.forEach(it => {
        stockMap[it.product_id] = (stockMap[it.product_id] || 0) + 1;
      });
    }

    allProducts = products.map(p => ({
      ...p,
      stock: p.product_type === 'auto' ? (stockMap[p.id] || 0) : (p.manual_stock || 0)
    }));

    renderProducts(allProducts);
  } catch (err) {
    console.error('Error loading products:', err);
    productsContainer.innerHTML = '<p style="color: var(--danger); text-align: center; grid-column: 1/-1;">Lỗi tải sản phẩm: ' + err.message + '</p>';
  }
}

function filterByCategory(categoryId, activeBtn) {
  const catButtons = document.querySelectorAll('.cat-btn');
  catButtons.forEach(btn => btn.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');

  if (categoryId === 'all') {
    renderProducts(allProducts);
  } else {
    const filtered = allProducts.filter(p => p.category_id === categoryId);
    renderProducts(filtered);
  }
}

function renderProducts(products) {
  const productsContainer = document.getElementById('products-container');
  if (!productsContainer) return;

  productsContainer.innerHTML = '';
  if (products.length === 0) {
    productsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 2rem;">Chưa có sản phẩm nào trong danh mục này.</p>';
    return;
  }

  products.forEach(p => {
    const isOutOfStock = p.stock === 0;
    const card = document.createElement('div');
    card.className = 'glass-panel product-card';
    card.style.cursor = 'pointer';
    card.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON') {
        location.href = '/san-pham/' + p.slug;
      }
    };

    card.innerHTML = `
      <img src="${p.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'}" class="product-img" alt="${p.name}">
      <div class="product-content">
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-primary); font-weight: 700; margin-bottom: 0.25rem;">${p.categories?.name || 'Sản phẩm'}</div>
        <h4 class="product-title">${p.name}</h4>
        <p class="product-desc">${p.description || 'Sản phẩm giao key tự động hoặc cày thuê uy tín.'}</p>
        <div class="product-footer">
          <div>
            <div class="product-price">${formatVND(p.price)}</div>
            <div class="stock-badge ${isOutOfStock ? 'empty' : ''}">${isOutOfStock ? 'Hết hàng' : `Kho: Còn lại ${p.stock}`}</div>
          </div>
          <button class="btn btn-primary" ${isOutOfStock ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''} onclick="openPurchaseModal('${p.id}')">
            ${isOutOfStock ? 'Hết hàng' : 'Mua Ngay'}
          </button>
        </div>
      </div>
    `;
    productsContainer.appendChild(card);
  });
}

// Modal Purchase Flow on Index
window.openPurchaseModal = function(productId) {
  selectedProduct = allProducts.find(p => p.id === productId);
  if (!selectedProduct) return;

  if (!window.authSession) {
    showToast('Bạn cần đăng nhập tài khoản để thực hiện mua hàng.', 'warning');
    setTimeout(() => location.href = '/login.html', 1500);
    return;
  }

  const modal = document.getElementById('purchase-modal');
  const title = document.getElementById('modal-product-title');
  const price = document.getElementById('checkout-product-price');
  const bal = document.getElementById('checkout-user-balance');
  const fieldsContainer = document.getElementById('product-custom-fields-container');
  const balWarning = document.getElementById('checkout-balance-warning');
  const redirectDepBtn = document.getElementById('btn-redirect-deposit');
  const payBtn = document.getElementById('btn-pay-balance');
  const checkoutStage = document.getElementById('modal-checkout-stage');
  const successStage = document.getElementById('modal-success-stage');

  if (!modal) return;

  if (title) title.innerText = `Mua: ${selectedProduct.name}`;
  if (price) price.innerText = formatVND(selectedProduct.price);
  if (bal) bal.innerText = formatVND(window.userProfile?.balance || 0);

  // Render fields
  if (fieldsContainer) {
    fieldsContainer.innerHTML = '';
    const fields = selectedProduct.form_fields || [];
    fields.forEach(f => {
      fieldsContainer.innerHTML += `
        <div class="form-group">
          <label class="form-label">${f} <span style="color: var(--danger);">*</span></label>
          <input type="text" class="form-control custom-input-field" data-field-name="${f}" placeholder="Nhập ${f} của bạn" required>
        </div>
      `;
    });
  }

  const hasEnough = (window.userProfile?.balance || 0) >= selectedProduct.price;
  if (hasEnough) {
    if (balWarning) balWarning.classList.add('d-none');
    if (redirectDepBtn) redirectDepBtn.classList.add('d-none');
    if (payBtn) payBtn.classList.remove('d-none');
  } else {
    if (balWarning) balWarning.classList.remove('d-none');
    if (redirectDepBtn) redirectDepBtn.classList.remove('d-none');
    if (payBtn) payBtn.classList.add('d-none');
  }

  if (checkoutStage) checkoutStage.classList.remove('d-none');
  if (successStage) successStage.classList.add('d-none');

  modal.classList.add('open');
};

function setupModalListeners() {
  const modal = document.getElementById('purchase-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const redirectDepBtn = document.getElementById('btn-redirect-deposit');
  const payBtn = document.getElementById('btn-pay-balance');
  const historyBtn = document.getElementById('btn-go-to-history');

  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.classList.remove('open');
  }

  if (redirectDepBtn) {
    redirectDepBtn.onclick = () => location.href = '/deposit.html';
  }

  if (historyBtn) {
    historyBtn.onclick = () => location.href = '/history.html';
  }

  if (payBtn) {
    payBtn.onclick = async () => {
      if (!selectedProduct) return;

      const inputs = [];
      const inputFields = document.querySelectorAll('.custom-input-field');
      let isValid = true;

      inputFields.forEach(el => {
        const val = el.value.trim();
        if (!val) {
          isValid = false;
          el.style.borderColor = 'var(--danger)';
        } else {
          el.style.borderColor = 'var(--border-color)';
          inputs.push({
            name: el.getAttribute('data-field-name'),
            value: val
          });
        }
      });

      if (!isValid) {
        showToast('Vui lòng điền đầy đủ các thông tin được yêu cầu.', 'warning');
        return;
      }

      payBtn.disabled = true;
      payBtn.innerText = 'Đang thanh toán...';

      try {
        const { data: resultKey, error } = await supabaseClient.rpc('purchase_product', {
          p_product_id: selectedProduct.id,
          p_customer_inputs: inputs
        });

        if (error) throw error;

        // Success transition
        const checkoutStage = document.getElementById('modal-checkout-stage');
        const successStage = document.getElementById('modal-success-stage');
        if (checkoutStage) checkoutStage.classList.add('d-none');
        if (successStage) successStage.classList.remove('d-none');

        await initGlobalAuth(); // Refresh balance
      } catch (err) {
        showToast('Thanh toán thất bại: ' + err.message, 'error');
      } finally {
        payBtn.disabled = false;
        payBtn.innerText = 'Thanh Toán Bằng Số Dư';
      }
    };
  }
}

// Master init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  setupDrawer();
  setupZaloButton();
  setupModalListeners();
  await initGlobalAuth();
  await initIndexPage();
});
