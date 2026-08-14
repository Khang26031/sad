// app.js
const { createClient } = supabase;
const supabaseClient = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

let allProducts = [];
let selectedProduct = null;
let orderPollingInterval = null;

// UI References
const productsContainer = document.getElementById('products-container');
const categoriesContainer = document.getElementById('categories-container');
const purchaseModal = document.getElementById('purchase-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

const stepEmail = document.getElementById('step-email');
const stepPayment = document.getElementById('step-payment');
const stepSuccess = document.getElementById('step-success');

const submitEmailBtn = document.getElementById('submit-email-btn');
const lookupBtn = document.getElementById('lookup-btn');
const finishBtn = document.getElementById('finish-btn');

// Load Data
async function initShop() {
  await checkAuthSession();
  await loadCategories();
  await loadProducts();
}

async function checkAuthSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const authBtn = document.getElementById('nav-auth-btn');
  if (session) {
    authBtn.innerText = 'Bảng Điều Khiển';
    // Check role to redirect to admin or profile dashboard
    authBtn.onclick = async (e) => {
      e.preventDefault();
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (profile && profile.role === 'admin') {
        location.href = '/admin';
      } else {
        // user logout for simple app
        await supabaseClient.auth.signOut();
        location.reload();
      }
    };
  } else {
    authBtn.innerText = 'Đăng Nhập';
    authBtn.onclick = () => location.href = '/login';
  }
}

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

async function loadProducts() {
  const { data: products, error } = await supabaseClient
    .from('products')
    .select('*, categories(name)')
    .eq('status', 'active');
  
  if (error) {
    productsContainer.innerHTML = '<p style="color: var(--danger);">Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại sau.</p>';
    return;
  }

  // Fetch stocks count for all products
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
    stock: stockMap[p.id] || 0
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
        <h4 class="product-title">${p.name}</h4>
        <p class="product-desc">${p.description || 'Sản phẩm giao key tự động uy tín, chất lượng.'}</p>
        <div class="product-footer">
          <div>
            <div class="product-price">${formatVND(p.price)}</div>
            <div class="stock-badge ${isOutOfStock ? 'empty' : ''}">${isOutOfStock ? 'Hết hàng' : `Còn lại: ${p.stock}`}</div>
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

// Attach filter event to "All" button
document.querySelector('.cat-btn[data-category="all"]').onclick = function() {
  filterByCategory('all', this);
};

// Purchase Flow
window.openPurchaseModal = function(productId) {
  selectedProduct = allProducts.find(p => p.id === productId);
  if (!selectedProduct || selectedProduct.stock === 0) return;

  document.getElementById('modal-product-title').innerText = `Mua: ${selectedProduct.name}`;
  document.getElementById('modal-product-price').innerText = formatVND(selectedProduct.price);
  
  // Reset stages
  stepEmail.classList.remove('d-none');
  stepPayment.classList.add('d-none');
  stepSuccess.classList.add('d-none');
  
  purchaseModal.classList.add('open');
};

modalCloseBtn.onclick = () => {
  purchaseModal.classList.remove('open');
  if (orderPollingInterval) clearInterval(orderPollingInterval);
};

submitEmailBtn.onclick = async () => {
  const emailInput = document.getElementById('buyer-email');
  const email = emailInput.value.trim();
  
  if (!email || !validateEmail(email)) {
    alert('Vui lòng nhập địa chỉ email hợp lệ.');
    return;
  }

  submitEmailBtn.disabled = true;
  submitEmailBtn.innerText = 'Đang khởi tạo đơn hàng...';

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

    // 2. Generate a unique transaction memo (e.g. SHOP17232323)
    const txRef = `SHOP${Math.floor(Date.now() / 1000)}`;

    // Get current auth user ID if logged in
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userId = session ? session.user.id : null;

    // 3. Create a pending order in database
    const { data: order, error } = await supabaseClient
      .from('orders')
      .insert({
        user_id: userId,
        buyer_email: email,
        product_id: selectedProduct.id,
        amount: selectedProduct.price,
        status: 'pending',
        tx_ref: txRef
      })
      .select()
      .single();

    if (error) throw error;

    // 4. Fill Payment Instructions
    document.getElementById('pay-bank').innerText = bankVal.bank_name;
    document.getElementById('pay-account').innerText = bankVal.account_number;
    document.getElementById('pay-name').innerText = bankVal.account_name;
    document.getElementById('pay-amount').innerText = formatVND(selectedProduct.price);
    document.getElementById('pay-memo').innerText = txRef;

    // 5. Generate VietQR Link
    let qrUrl = bankVal.qr_template
      .replace('{account_number}', bankVal.account_number)
      .replace('{amount}', selectedProduct.price)
      .replace('{memo}', txRef)
      .replace('{account_name}', encodeURIComponent(bankVal.account_name));
    
    document.getElementById('payment-qr').src = qrUrl;

    // Transition Steps
    stepEmail.classList.add('d-none');
    stepPayment.classList.remove('d-none');

    // 6. Start Polling backend transaction checker
    startPolling(order.id);

  } catch (err) {
    alert(`Lỗi tạo đơn hàng: ${err.message || err}`);
  } finally {
    submitEmailBtn.disabled = false;
    submitEmailBtn.innerText = 'Tiến Hành Thanh Toán';
  }
};

function startPolling(orderId) {
  if (orderPollingInterval) clearInterval(orderPollingInterval);
  
  const statusText = document.getElementById('payment-status-text');
  let pollAttempts = 0;

  orderPollingInterval = setInterval(async () => {
    pollAttempts++;
    statusText.innerText = `Đang chờ thanh toán (Đã quét ${pollAttempts * 3}s)...`;

    try {
      // Call Vercel Python serverless function check_payment
      const response = await fetch(`/api/check-payment?order_id=${orderId}`);
      const data = await response.json();

      if (data.status === 'success') {
        clearInterval(orderPollingInterval);
        
        // Deliver Key
        document.getElementById('delivered-key').innerText = data.key;
        stepPayment.classList.add('d-none');
        stepSuccess.classList.remove('d-none');
        
        // Refresh products list stocks
        await loadProducts();
      } else if (data.status === 'failed') {
        clearInterval(orderPollingInterval);
        statusText.innerText = data.message;
        alert(data.message);
      }
    } catch (err) {
      console.error('Error polling payment status:', err);
    }
  }, 3000); // Poll every 3 seconds
}

finishBtn.onclick = () => {
  purchaseModal.classList.remove('open');
};

// Tra cứu đơn hàng
lookupBtn.onclick = async () => {
  const val = document.getElementById('lookup-input').value.trim();
  const resultsDiv = document.getElementById('lookup-results');
  
  if (!val) {
    alert('Vui lòng nhập Email hoặc Mã đơn hàng.');
    return;
  }

  lookupBtn.disabled = true;
  lookupBtn.innerText = 'Đang tìm...';
  resultsDiv.innerHTML = '<div class="loading-spinner"></div>';
  resultsDiv.style.display = 'block';

  try {
    let query = supabaseClient.from('orders').select('*, products(name)');
    
    if (val.toUpperCase().startsWith('SHOP')) {
      query = query.eq('tx_ref', val);
    } else {
      query = query.eq('buyer_email', val);
    }

    const { data: orders, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      resultsDiv.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Không tìm thấy đơn hàng nào.</p>';
      return;
    }

    let html = '<h4 style="margin-bottom: 1rem; font-weight: 700;">Kết quả tra cứu:</h4>';
    orders.forEach(o => {
      const dateStr = new Date(o.created_at).toLocaleString('vi-VN');
      const isCompleted = o.status === 'completed';
      
      html += `
        <div class="glass-panel" style="padding: 1rem; margin-bottom: 1rem; border-color: ${isCompleted ? 'var(--success)' : 'var(--border-color)'};">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-weight: 700;">${o.products?.name || 'Sản phẩm đã xóa'}</span>
            <span class="badge badge-${o.status}">${o.status.toUpperCase()}</span>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
            <div>Mã đơn: <strong>${o.tx_ref}</strong></div>
            <div>Thời gian: ${dateStr}</div>
            <div>Giá: ${formatVND(o.amount)}</div>
          </div>
          ${isCompleted ? `
            <div style="background: var(--bg-primary); padding: 0.75rem; border-radius: 6px; font-family: monospace; font-size: 1rem; word-break: break-all; color: var(--text-primary); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <span id="key-${o.id}">${o.key_content}</span>
              <button class="btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="copyText('key-${o.id}')">Copy</button>
            </div>
          ` : '<p style="font-size: 0.85rem; color: var(--warning);">Đơn hàng chưa hoàn thành thanh toán.</p>'}
        </div>
      `;
    });
    resultsDiv.innerHTML = html;
  } catch (err) {
    resultsDiv.innerHTML = `<p style="color: var(--danger);">Lỗi tra cứu: ${err.message}</p>`;
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.innerText = 'Tìm kiếm';
  }
};

// Utilities
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

window.copyText = function(elementId) {
  const element = document.getElementById(elementId);
  const text = element.innerText || element.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    const originalText = element.innerText;
    if (elementId === 'pay-account' || elementId === 'pay-amount' || elementId === 'pay-memo') {
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
