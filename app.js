
window.showToast = function(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; max-width: 350px; width: calc(100% - 40px);';
    document.body.appendChild(container);
  }

  const card = document.createElement('div');
  card.className = `toast-card toast-${type}`;
  card.innerHTML = `
    <span>${message}</span>
    <button class="toast-close">&times;</button>
  `;

  const closeBtn = card.querySelector('.toast-close');
  const closeToast = () => {
    card.style.animation = 'toastSlideOut 0.3s ease forwards';
    setTimeout(() => { card.remove(); }, 300);
  };
  closeBtn.onclick = closeToast;

  setTimeout(closeToast, 4000);
  container.appendChild(card);
};
\n// app.js for LEGION STORE
const { createClient } = supabase;
const supabaseClient = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

let allProducts = [];
let selectedProduct = null;
let orderPollingInterval = null;
let depositPollingInterval = null;
let userProfile = null;
let authSession = null;

// UI References
const productsContainer = document.getElementById('products-container');
const categoriesContainer = document.getElementById('categories-container');
const purchaseModal = document.getElementById('purchase-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

const checkoutStage = document.getElementById('modal-checkout-stage');
const successStage = document.getElementById('modal-success-stage');
const fieldsContainer = document.getElementById('product-custom-fields-container');
const payBalanceBtn = document.getElementById('btn-pay-balance');
const redirectDepBtn = document.getElementById('btn-redirect-deposit');
const balanceWarning = document.getElementById('checkout-balance-warning');

// Navigation Tabs
const navShopLink = document.getElementById('nav-shop-link');
const navDepositLink = document.getElementById('nav-deposit-link');
const navHistoryLink = document.getElementById('nav-history-link');
const navBalanceWrapper = document.getElementById('nav-balance-wrapper');
const navUserBalance = document.getElementById('nav-user-balance');

const storeSection = document.getElementById('store-section');
const depositSection = document.getElementById('deposit-section');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');

// Init SPA
async function initShop() {
  await checkAuthSession();
  setupNavigation();
  await loadCategories();
  await loadProducts();
}

async function checkAuthSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  authSession = session;
  const authBtn = document.getElementById('nav-auth-btn');
  
  if (session) {
    authBtn.innerText = 'Đăng Xuất';
    navDepositLink.classList.remove('d-none');
    navHistoryLink.classList.remove('d-none');
    
    // Bind click to log out
    authBtn.onclick = async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      location.reload();
    };
    
    // Get user profile balance
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profile) {
      userProfile = profile;
      navUserBalance.innerText = `Ví: ${formatVND(profile.balance)}`;
      navBalanceWrapper.classList.remove('d-none');
    }
  } else {
    authBtn.innerText = 'Đăng Nhập';
    authBtn.onclick = () => location.href = '/login';
    navDepositLink.classList.add('d-none');
    navHistoryLink.classList.add('d-none');
    navBalanceWrapper.classList.add('d-none');
  }
}

// Navigation flow
function setupNavigation() {
  const activateTab = (tabLink, sectionToShow) => {
    [navShopLink, navDepositLink, navHistoryLink].forEach(link => link.classList.remove('active'));
    [storeSection, depositSection, historySection].forEach(sec => sec.classList.add('d-none'));
    
    tabLink.classList.add('active');
    sectionToShow.classList.remove('d-none');
  };

  navShopLink.onclick = (e) => {
    e.preventDefault();
    activateTab(navShopLink, storeSection);
  };

  navDepositLink.onclick = (e) => {
    e.preventDefault();
    activateTab(navDepositLink, depositSection);
    // Reset Deposit view to Step 1
    document.getElementById('dep-step-input').classList.remove('d-none');
    document.getElementById('dep-step-pay').classList.add('d-none');
    if (depositPollingInterval) clearInterval(depositPollingInterval);
  };

  navHistoryLink.onclick = (e) => {
    e.preventDefault();
    activateTab(navHistoryLink, historySection);
    if (authSession) loadPurchaseHistory(authSession.user.id);
  };

  // Handle SPA routing hashtags
  if (location.hash === '#deposit') {
    navDepositLink.click();
  } else if (location.hash === '#purchase-history') {
    navHistoryLink.click();
  }
}

// Load Categories
async function loadCategories() {
  const { data: categories, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('name');
  
  if (error) return;

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn';
    btn.innerText = cat.name;
    btn.setAttribute('data-category', cat.id);
    btn.onclick = () => filterByCategory(cat.id, btn);
    categoriesContainer.appendChild(btn);
  });
}

// Load Products
async function loadProducts() {
  const { data: products, error } = await supabaseClient
    .from('products')
    .select('*, categories(name)')
    .eq('status', 'active');
  
  if (error) {
    productsContainer.innerHTML = '<p style="color: var(--danger); text-align: center; grid-column: 1/-1;">Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại sau.</p>';
    return;
  }

  // Count items unsold for auto products
  const { data: items, error: itemsError } = await supabaseClient
    .from('items')
    .select('product_id')
    .eq('is_sold', false);

  const stockMap = {};
  if (!itemsError && items) {
    items.forEach(item => {
      stockMap[item.product_id] = (stockMap[item.product_id] || 0) + 1;
    });
  }

  allProducts = products.map(p => ({
    ...p,
    stock: p.product_type === 'auto' ? (stockMap[p.id] || 0) : (p.manual_stock || 0)
  }));

  renderProducts(allProducts);
}

function renderProducts(products) {
  productsContainer.innerHTML = '';
  if (products.length === 0) {
    productsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">Chưa có sản phẩm nào hoạt động.</p>';
    return;
  }

  products.forEach(p => {
    const isOutOfStock = p.stock === 0;
    const card = document.createElement('div');
    card.className = 'glass-panel product-card';
    card.innerHTML = `
      <img src="${p.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'}" class="product-img" alt="${p.name}">
      <div class="product-content">
        <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-primary); font-weight: 700; margin-bottom: 0.25rem;">${p.categories?.name || 'Sản phẩm'}</div>
        <h4 class="product-title" onclick="location.href='/san-pham/${p.slug}'" style="cursor: pointer;">${p.name}</h4>
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

function filterByCategory(categoryId, activeBtn) {
  document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
  activeBtn.classList.add('active');

  if (categoryId === 'all') {
    renderProducts(allProducts);
  } else {
    const filtered = allProducts.filter(p => p.category_id === categoryId);
    renderProducts(filtered);
  }
}

document.querySelector('.cat-btn[data-category="all"]').onclick = function() {
  filterByCategory('all', this);
};

// Purchase Modal Checkout flow
window.openPurchaseModal = function(productId) {
  if (!authSession) {
    showToast('Bạn cần đăng nhập tài khoản để thực hiện mua hàng bằng số dư.', 'warning');
    location.href = '/login';
    return;
  }

  selectedProduct = allProducts.find(p => p.id === productId);
  if (!selectedProduct || selectedProduct.stock === 0) return;

  document.getElementById('modal-product-title').innerText = `Mua: ${selectedProduct.name}`;
  document.getElementById('checkout-product-price').innerText = formatVND(selectedProduct.price);
  document.getElementById('checkout-user-balance').innerText = formatVND(userProfile.balance);

  // Render dynamic form fields
  fieldsContainer.innerHTML = '';
  const fields = selectedProduct.form_fields || [];
  if (fields.length > 0) {
    fields.forEach(fieldName => {
      fieldsContainer.innerHTML += `
        <div class="form-group">
          <label class="form-label">${fieldName} <span style="color: var(--danger);">*</span></label>
          <input type="text" class="form-control checkout-custom-field" data-field-name="${fieldName}" placeholder="Nhập ${fieldName} của bạn" required>
        </div>
      `;
    });
  }

  // Check balance
  if (userProfile.balance < selectedProduct.price) {
    balanceWarning.classList.remove('d-none');
    redirectDepBtn.classList.remove('d-none');
    payBalanceBtn.classList.add('d-none');
  } else {
    balanceWarning.classList.add('d-none');
    redirectDepBtn.classList.add('d-none');
    payBalanceBtn.classList.remove('d-none');
  }

  checkoutStage.classList.remove('d-none');
  successStage.classList.add('d-none');
  purchaseModal.classList.add('open');
};

modalCloseBtn.onclick = () => {
  purchaseModal.classList.remove('open');
};

redirectDepBtn.onclick = () => {
  purchaseModal.classList.remove('open');
  navDepositLink.click();
};

payBalanceBtn.onclick = async () => {
  // Collect custom inputs
  const inputs = [];
  const inputElements = document.querySelectorAll('.checkout-custom-field');
  let isValid = true;

  inputElements.forEach(el => {
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
    showToast('Vui lòng nhập đầy đủ các thông tin biểu mẫu yêu cầu.', 'warning');
    return;
  }

  payBalanceBtn.disabled = true;
  payBalanceBtn.innerText = 'Đang thanh toán...';

  try {
    // Call RPC purchase_product
    const { data: result, error } = await supabaseClient.rpc('purchase_product', {
      p_product_id: selectedProduct.id,
      p_customer_inputs: inputs
    });

    if (error) throw error;

    // Refresh balance display local and nav
    userProfile.balance -= selectedProduct.price;
    navUserBalance.innerText = `Ví: ${formatVND(userProfile.balance)}`;

    // Success Screen
    checkoutStage.classList.add('d-none');
    successStage.classList.remove('d-none');

    if (selectedProduct.product_type === 'manual') {
      document.getElementById('checkout-success-msg').innerText = 'Yêu cầu đã được gửi tới Admin. Vui lòng theo dõi trạng thái xử lý đơn cày thuê trong Lịch sử mua hàng.';
    } else {
      document.getElementById('checkout-success-msg').innerText = 'Thanh toán thành công! Key đã được giao, click xem lịch sử mua hàng để lấy ngay.';
    }

    // Refresh store stocks list
    await loadProducts();

  } catch (err) {
    showToast('Lỗi thanh toán: ' + err.message, 'error');
  } finally {
    payBalanceBtn.disabled = false;
    payBalanceBtn.innerText = 'Thanh Toán Bằng Số Dư';
  }
};

document.getElementById('btn-go-to-history').onclick = () => {
  purchaseModal.classList.remove('open');
  navHistoryLink.click();
};

// Purchase History list
async function loadPurchaseHistory(userId) {
  historyList.innerHTML = '<div class="loading-spinner"></div>';
  try {
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('*, products(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      historyList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Bạn chưa thực hiện giao dịch nào.</p>';
      return;
    }

    let html = '';
    orders.forEach(o => {
      const dateStr = new Date(o.created_at).toLocaleString('vi-VN');
      const isCompleted = o.status === 'completed';
      const isProcessing = o.status === 'processing';
      
      // Format dynamic inputs filled by customer
      let inputsHtml = '';
      if (o.customer_inputs && o.customer_inputs.length > 0) {
        inputsHtml = '<div style="margin-top: 0.5rem; font-size: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius: 6px;"><strong>Thông tin đã điền:</strong>';
        o.customer_inputs.forEach(inp => {
          inputsHtml += `<div>- ${inp.name}: <code>${inp.value}</code></div>`;
        });
        inputsHtml += '</div>';
      }

      html += `
        <div class="glass-panel" style="padding: 1.25rem; margin-bottom: 1rem; border-color: ${isCompleted ? 'var(--success)' : (isProcessing ? 'var(--accent-primary)' : 'var(--border-color)')};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-weight: 700; font-size: 1.1rem;">${o.products?.name || 'Sản phẩm đã xóa'}</span>
            <span class="badge badge-${o.status}">${o.status.toUpperCase()}</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
            <div>Mã đơn: <strong>${o.tx_ref}</strong></div>
            <div>Giá tiền: <strong>${formatVND(o.amount)}</strong></div>
            <div>Thời gian: ${dateStr}</div>
            ${inputsHtml}
          </div>
          ${isCompleted ? `
            <div style="background: var(--bg-primary); padding: 0.75rem; border-radius: 6px; font-family: monospace; font-size: 1rem; word-break: break-all; color: var(--text-primary); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <span id="hist-key-${o.id}">${o.key_content || 'Key/Account đang xử lý.'}</span>
              <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="copyText('hist-key-${o.id}')">Copy</button>
            </div>
          ` : `
            <div style="background: rgba(99, 102, 241, 0.05); border: 1px dashed var(--accent-primary); border-radius: 6px; padding: 0.75rem; font-size: 0.88rem; color: var(--text-secondary);">
              ⏳ Đơn hàng đang được Admin xử lý thủ công (Cày thuê / Nâng cấp tài khoản). Thông tin key kết quả sẽ cập nhật tại đây khi hoàn thành.
            </div>
          `}
        </div>
      `;
    });
    historyList.innerHTML = html;
  } catch (err) {
    historyList.innerHTML = `<p style="color: var(--danger); text-align: center;">Lỗi tải lịch sử đơn hàng: ${err.message}</p>`;
  }
}

// Deposit tab logic
let selectedDepositAmount = 10000;
window.setDepositAmount = function(amount) {
  selectedDepositAmount = amount;
  document.getElementById('deposit-amount-input').value = amount;
  
  // Highlight active button
  const btns = document.querySelectorAll('.quick-amt-btn');
  btns.forEach(btn => {
    const text = btn.innerText;
    if (text.includes('50k') && amount === 50000) btn.classList.add('active');
    else if (text.includes('100k') && amount === 100000) btn.classList.add('active');
    else if (text.includes('200k') && amount === 200000) btn.classList.add('active');
    else if (text.includes('500k') && amount === 500000) btn.classList.add('active');
    else if (text.includes('1M') && amount === 1000000) btn.classList.add('active');
    else if (text.includes('Khác') && [10000, 50000, 100000, 200000, 500000, 1000000].indexOf(amount) === -1) btn.classList.add('active');
    else btn.classList.remove('active');
  });
};

document.getElementById('deposit-amount-input').oninput = function() {
  const val = parseInt(this.value);
  selectedDepositAmount = isNaN(val) ? 0 : val;
};

// Confirm Deposit step 1 -> step 2
document.getElementById('btn-confirm-deposit-init').onclick = async () => {
  if (selectedDepositAmount < 10000) {
    showToast('Số tiền nạp tối thiểu (Min Deposit) là 10.000 VNĐ.', 'warning');
    return;
  }

  const confirmBtn = document.getElementById('btn-confirm-deposit-init');
  confirmBtn.disabled = true;
  confirmBtn.innerText = 'Đang khởi tạo hóa đơn nạp...';

  try {
    // 1. Fetch system bank settings
    const { data: bankSettingsRes } = await supabaseClient
      .from('settings')
      .select('value')
      .eq('key', 'bank_settings')
      .single();
    
    const bankVal = bankSettingsRes?.value || {
      bank_name: "MBBank",
      account_number: "123456789",
      account_name: "NGUYEN VAN A",
      qr_template: "https://api.vietqr.io/image/970422-{account_number}-compact2.jpg?amount={amount}&addInfo={memo}&accountName={account_name}"
    };

    // 2. Generate unique deposit memo (e.g. NAP17232323)
    const txRef = `NAP${Math.floor(Date.now() / 1000)}`;

    // 3. Create a pending deposit record in database
    const { data: deposit, error } = await supabaseClient
      .from('deposits')
      .insert({
        user_id: authSession.user.id,
        amount: selectedDepositAmount,
        status: 'pending',
        tx_ref: txRef
      })
      .select()
      .single();

    if (error) throw error;

    // 4. Fill Deposit details
    document.getElementById('dep-bank-name').innerText = bankVal.bank_name;
    document.getElementById('dep-acct-num').innerText = bankVal.account_number;
    document.getElementById('dep-acct-name').innerText = bankVal.account_name;
    document.getElementById('dep-pay-amount').innerText = formatVND(selectedDepositAmount);
    document.getElementById('dep-pay-memo').innerText = txRef;

    // 5. Generate QR VietQR
    let qrUrl = bankVal.qr_template
      .replace('{account_number}', bankVal.account_number)
      .replace('{amount}', selectedDepositAmount)
      .replace('{memo}', txRef)
      .replace('{account_name}', encodeURIComponent(bankVal.account_name));
    
    document.getElementById('deposit-qr-img').src = qrUrl;

    // Transition view
    document.getElementById('dep-step-input').classList.add('d-none');
    document.getElementById('dep-step-pay').classList.remove('d-none');

    // 6. Start Polling backend deposit status
    startDepositPolling(deposit.id);

  } catch (err) {
    showToast('Khởi tạo hóa đơn nạp thất bại: ' + err.message, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerText = 'Xác Nhận Nạp Tiền';
  }
};

function startDepositPolling(depositId) {
  if (depositPollingInterval) clearInterval(depositPollingInterval);
  
  const statusText = document.getElementById('deposit-status-text');
  const confirmBtn = document.getElementById('btn-check-deposit-now');
  let pollAttempts = 0;

  confirmBtn.disabled = false;
  confirmBtn.innerText = 'Tôi Đã Chuyển Khoản';

  const checkDepositOnce = async (isManual = false) => {
    if (isManual) {
      confirmBtn.disabled = true;
      confirmBtn.innerText = 'Đang kiểm tra giao dịch...';
    }

    try {
      const response = await fetch(`/api/check-deposit?deposit_id=${depositId}`);
      const data = await response.json();

      if (data.status === 'success') {
        clearInterval(depositPollingInterval);
        showToast('Nạp tiền thành công! Số tiền đã được cộng vào tài khoản của bạn.', 'success');
        
        // Refresh balance in UI and local profile
        await checkAuthSession();
        
        // Redirect back to shop tab
        navShopLink.click();
        return true;
      } else {
        if (isManual) {
          showToast('Hệ thống chưa nhận được tiền hoặc đang chờ ngân hàng phản hồi. Vui lòng đợi 1-2 phút.', 'warning');
        }
      }
    } catch (err) {
      console.error('Error checking deposit:', err);
      if (isManual) {
        showToast('Lỗi kết nối tới hệ thống kiểm tra nạp tiền.', 'error');
      }
    } finally {
      if (isManual) {
        confirmBtn.disabled = false;
        confirmBtn.innerText = 'Tôi Đã Chuyển Khoản';
      }
    }
    return false;
  };

  depositPollingInterval = setInterval(async () => {
    pollAttempts++;
    statusText.innerText = `Đang chờ quét giao dịch (Đã quét ${pollAttempts * 3}s)...`;
    await checkDepositOnce(false);
  }, 3000);

  // Manual check button
  confirmBtn.onclick = async () => {
    await checkDepositOnce(true);
  };
}

// Cancel Deposit Button
document.getElementById('btn-cancel-deposit').onclick = () => {
  if (confirm('Bạn chắc chắn muốn hủy hóa đơn nạp tiền này?')) {
    if (depositPollingInterval) clearInterval(depositPollingInterval);
    document.getElementById('dep-step-input').classList.remove('d-none');
    document.getElementById('dep-step-pay').classList.add('d-none');
  }
};

// Utilities
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

window.copyText = function(elementId) {
  const element = document.getElementById(elementId);
  const text = element.innerText || element.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    const originalText = element.innerText;
    if (elementId === 'dep-acct-num' || elementId === 'dep-pay-amount' || elementId === 'dep-pay-memo') {
      element.innerText = 'Đã sao chép!';
      setTimeout(() => element.innerText = originalText, 1000);
    } else {
      alert('Đã sao chép nội dung vào Clipboard!');
    }
  }).catch(err => {
    console.error('Không thể sao chép văn bản:', err);
  });
};

initShop();
