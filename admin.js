
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
\n// admin.js for LEGION STORE
const { createClient } = supabase;
const supabaseClient = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

let categories = [];
let editProductId = null;
let currentTab = 'products';

// Check Auth & Role
async function checkAdminAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    location.href = '/login';
    return;
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    showToast('Truy cập bị từ chối. Bạn không phải là Admin.', 'error');
    location.href = '/';
  } else {
    initAdminPanel();
  }
}

// Initialize Panel
function initAdminPanel() {
  setupSidebar();
  loadAllData();
  
  // Bind form submissions
  document.getElementById('product-form').onsubmit = handleProductSubmit;
  document.getElementById('btn-create-category').onclick = handleCategoryCreate;
  document.getElementById('btn-add-keys').onclick = handleAddKeys;
  document.getElementById('bank-settings-form').onsubmit = handleBankSettingsSubmit;
  document.getElementById('btn-adjust-balance').onclick = handleAdjustBalance;
  document.getElementById('btn-admin-submit-complete').onclick = handleAdminSubmitManualOrder;
  document.getElementById('btn-cancel-edit').onclick = resetProductForm;
  
  // Auto slug generator on title change
  document.getElementById('prod-name').oninput = function() {
    if (!editProductId) {
      document.getElementById('prod-slug').value = slugify(this.value);
    }
  };
}

// Tabs Switching
function setupSidebar() {
  const tabs = ['products', 'orders-auto', 'orders-manual', 'deposits', 'customers', 'bank'];
  
  tabs.forEach(tab => {
    document.getElementById(`menu-${tab}`).onclick = () => {
      tabs.forEach(t => {
        document.getElementById(`menu-${t}`).classList.remove('active');
        document.getElementById(`sec-${t}`).classList.add('d-none');
      });
      document.getElementById(`menu-${tab}`).classList.add('active');
      document.getElementById(`sec-${tab}`).classList.remove('d-none');
      currentTab = tab;
      loadTabSpecificData(tab);
    };
  });
}

function loadAllData() {
  loadCategories();
  loadTabSpecificData(currentTab);
}

function loadTabSpecificData(tab) {
  if (tab === 'products') {
    loadProductsList();
  } else if (tab === 'orders-auto') {
    loadAutoOrders();
  } else if (tab === 'orders-manual') {
    loadManualOrders();
  } else if (tab === 'deposits') {
    loadDepositsList();
  } else if (tab === 'customers') {
    loadCustomersList();
  } else if (tab === 'bank') {
    loadBankSettings();
  }
}

// Categories Management
async function loadCategories() {
  const catSelect = document.getElementById('prod-category');
  const keyCatSelect = document.getElementById('key-prod-select');
  catSelect.innerHTML = '';
  
  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('name');

  if (error) return;
  categories = data;

  categories.forEach(cat => {
    catSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });
}

async function handleCategoryCreate() {
  const catInput = document.getElementById('cat-name-input');
  const name = catInput.value.trim();
  if (!name) return;

  const { error } = await supabaseClient
    .from('categories')
    .insert({ name });

  if (error) {
    showToast('Lỗi tạo danh mục: ' + error.message, 'error');
  } else {
    showToast('Tạo danh mục thành công!', 'success');
    catInput.value = '';
    loadCategories();
  }
}

// Product add/edit
async function loadProductsList() {
  const tbody = document.getElementById('tbl-products-body');
  const keySelect = document.getElementById('key-prod-select');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Đang tải...</td></tr>';
  keySelect.innerHTML = '';

  const { data: products, error } = await supabaseClient
    .from('products')
    .select('*, categories(name)')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);">Lỗi tải sản phẩm.</td></tr>';
    return;
  }

  // Count items unsold for auto products
  const { data: items } = await supabaseClient
    .from('items')
    .select('product_id')
    .eq('is_sold', false);

  const stockMap = {};
  if (items) {
    items.forEach(item => {
      stockMap[item.product_id] = (stockMap[item.product_id] || 0) + 1;
    });
  }

  tbody.innerHTML = '';
  products.forEach(p => {
    const isAuto = p.product_type === 'auto';
    const stock = isAuto ? (stockMap[p.id] || 0) : (p.manual_stock || 0);
    
    if (isAuto) {
      keySelect.innerHTML += `<option value="${p.id}">${p.name} (Còn lại: ${stock} key)</option>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><img src="${p.image_url || ''}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 6px;"></td>
        <td><strong>${p.name}</strong><br><small style="color:var(--text-secondary);">Slug: ${p.slug}</small></td>
        <td>${p.categories?.name || '-'}</td>
        <td>${formatVND(p.price)}</td>
        <td><span class="badge ${isAuto ? 'badge-completed' : 'badge-pending'}">${isAuto ? 'Auto' : 'Manual'}</span></td>
        <td><span class="stock-badge ${stock === 0 ? 'empty' : ''}">${stock === 0 ? 'Hết hàng' : `Còn lại: ${stock}`}</span></td>
        <td><span class="badge ${p.status === 'active' ? 'badge-completed' : 'badge-failed'}">${p.status}</span></td>
        <td class="action-btn-group">
          <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="editProduct('${p.id}')">Sửa</button>
          <button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteProduct('${p.id}')">Xóa</button>
        </td>
      </tr>
    `;
  });
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('prod-name').value.trim();
  const slug = document.getElementById('prod-slug').value.trim();
  const categoryId = document.getElementById('prod-category').value;
  const price = document.getElementById('prod-price').value;
  const imageUrl = document.getElementById('prod-image').value.trim();
  const type = document.getElementById('prod-type').value;
  const manualStock = document.getElementById('prod-manual-stock').value;
  const status = document.getElementById('prod-status').value;
  const desc = document.getElementById('prod-desc').value.trim();
  
  // Format custom fields
  const fieldsRaw = document.getElementById('prod-fields').value.trim();
  const fields = fieldsRaw ? fieldsRaw.split(',').map(f => f.trim()).filter(f => f) : [];

  const payload = {
    name,
    slug,
    category_id: categoryId,
    price: parseFloat(price),
    image_url: imageUrl || null,
    product_type: type,
    manual_stock: parseInt(manualStock) || 0,
    status,
    form_fields: fields,
    description: desc || null
  };

  try {
    if (editProductId) {
      const { error } = await supabaseClient
        .from('products')
        .update(payload)
        .eq('id', editProductId);
      if (error) throw error;
      showToast('Cập nhật sản phẩm thành công!', 'success');
    } else {
      const { error } = await supabaseClient
        .from('products')
        .insert(payload);
      if (error) throw error;
      showToast('Đăng sản phẩm mới thành công!', 'success');
    }

    resetProductForm();
    loadProductsList();
  } catch (err) {
    showToast('Lỗi lưu sản phẩm: ' + err.message, 'error');
  }
}

window.editProduct = async function(id) {
  const { data: p, error } = await supabaseClient
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !p) return;

  editProductId = p.id;
  document.getElementById('product-form-title').innerText = 'Chỉnh Sửa Sản Phẩm';
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-slug').value = p.slug;
  document.getElementById('prod-category').value = p.category_id;
  document.getElementById('prod-price').value = p.price;
  document.getElementById('prod-image').value = p.image_url || '';
  document.getElementById('prod-type').value = p.product_type;
  document.getElementById('prod-manual-stock').value = p.manual_stock;
  document.getElementById('prod-status').value = p.status;
  document.getElementById('prod-fields').value = p.form_fields ? p.form_fields.join(', ') : '';
  document.getElementById('prod-desc').value = p.description || '';

  document.getElementById('btn-cancel-edit').classList.remove('d-none');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetProductForm() {
  editProductId = null;
  document.getElementById('product-form-title').innerText = 'Đăng Sản Phẩm Mới';
  document.getElementById('product-form').reset();
  document.getElementById('btn-cancel-edit').classList.add('d-none');
}

window.deleteProduct = async function(id) {
  if (!confirm('Bạn chắc chắn muốn xóa sản phẩm này? Tất cả các key liên quan trong kho cũng sẽ bị xóa.')) return;
  const { error } = await supabaseClient.from('products').delete().eq('id', id);
  if (error) showToast('Lỗi xóa sản phẩm: ' + error.message, 'error');
  else loadProductsList();
};

// Add keys to stock
async function handleAddKeys() {
  const productId = document.getElementById('key-prod-select').value;
  const keysText = document.getElementById('keys-input').value.trim();
  
  if (!productId || !keysText) {
    showToast('Vui lòng chọn sản phẩm và nhập key.', 'warning');
    return;
  }

  const keys = keysText.split('\n').map(k => k.trim()).filter(k => k);
  const rows = keys.map(k => ({ product_id: productId, content: k, is_sold: false }));

  const btn = document.getElementById('btn-add-keys');
  btn.disabled = true;
  btn.innerText = 'Đang nạp key...';

  const { error } = await supabaseClient.from('items').insert(rows);
  btn.disabled = false;
  btn.innerText = 'Thêm Key Vào Kho';

  if (error) {
    showToast('Lỗi nạp key: ' + error.message, 'error');
  } else {
    showToast(`Nạp thành công ${rows.length} key vào kho!`, 'success');
    document.getElementById('keys-input').value = '';
    loadProductsList();
  }
}

// Tab 2: Auto Orders
async function loadAutoOrders() {
  const tbody = document.getElementById('tbl-orders-auto-body');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Đang tải...</td></tr>';

  const { data: orders, error } = await supabaseClient
    .from('orders')
    .select('*, products(name, product_type)')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger);">Lỗi tải đơn hàng.</td></tr>';
    return;
  }

  // Filter auto orders
  const autoOrders = orders.filter(o => o.products?.product_type === 'auto');

  tbody.innerHTML = '';
  autoOrders.forEach(o => {
    const dateStr = new Date(o.created_at).toLocaleString('vi-VN');
    tbody.innerHTML += `
      <tr>
        <td><strong>${o.tx_ref}</strong></td>
        <td>${o.buyer_email}</td>
        <td>${o.products?.name || 'Sản phẩm đã xóa'}</td>
        <td>${formatVND(o.amount)}</td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td>
        <td><code style="font-family:monospace;font-size:0.8rem;word-break:break-all;">${o.key_content || '-'}</code></td>
        <td>${dateStr}</td>
      </tr>
    `;
  });
}

// Tab 3: Manual Orders cày thuê
async function loadManualOrders() {
  const tbody = document.getElementById('tbl-orders-manual-body');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Đang tải...</td></tr>';

  const { data: orders, error } = await supabaseClient
    .from('orders')
    .select('*, products(name, product_type)')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);">Lỗi tải đơn hàng.</td></tr>';
    return;
  }

  const manualOrders = orders.filter(o => o.products?.product_type === 'manual');

  tbody.innerHTML = '';
  manualOrders.forEach(o => {
    const dateStr = new Date(o.created_at).toLocaleString('vi-VN');
    const isProcessing = o.status === 'processing';
    
    // Format custom inputs
    let inputsHtml = '';
    if (o.customer_inputs && o.customer_inputs.length > 0) {
      o.customer_inputs.forEach(inp => {
        inputsHtml += `<div><strong>${inp.name}</strong>: <code>${inp.value}</code></div>`;
      });
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>${o.tx_ref}</strong></td>
        <td>${o.buyer_email}</td>
        <td>${o.products?.name || 'Sản phẩm đã xóa'}</td>
        <td>${formatVND(o.amount)}</td>
        <td style="font-size: 0.8rem; line-height: 1.4;">${inputsHtml || '-'}</td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td>
        <td><code style="font-family:monospace;font-size:0.8rem;word-break:break-all;">${o.key_content || '-'}</code></td>
        <td>
          ${isProcessing ? `
            <button class="btn btn-success" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="openAdminOrderModal('${o.id}')">Hoàn Thành Đơn</button>
          ` : '-'}
        </td>
      </tr>
    `;
  });
}

// Complete manual cày thuê order modal
const adminOrderModal = document.getElementById('admin-order-modal');

window.openAdminOrderModal = function(orderId) {
  document.getElementById('admin-modal-order-id').value = orderId;
  document.getElementById('admin-modal-key-content').value = '';
  adminOrderModal.classList.add('open');
};

window.closeAdminOrderModal = function() {
  adminOrderModal.classList.remove('open');
};

async function handleAdminSubmitManualOrder() {
  const orderId = document.getElementById('admin-modal-order-id').value;
  const keyContent = document.getElementById('admin-modal-key-content').value.trim();

  if (!keyContent) {
    showToast('Vui lòng nhập kết quả key/tài khoản bàn giao.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-admin-submit-complete');
  btn.disabled = true;
  btn.innerText = 'Đang lưu kết quả...';

  try {
    // Call Supabase RPC admin_complete_manual_order
    const { data, error } = await supabaseClient.rpc('admin_complete_manual_order', {
      p_order_id: orderId,
      p_key_content: keyContent
    });

    if (error) throw error;
    
    showToast('Đơn cày thuê đã hoàn thành!', 'success');
    closeAdminOrderModal();
    loadManualOrders();
  } catch (err) {
    showToast('Lỗi cập nhật đơn hàng: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Xác Nhận & Gửi';
  }
}

// Tab 4: Deposits (Nạp Tiền)
async function loadDepositsList() {
  const tbody = document.getElementById('tbl-deposits-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Đang tải...</td></tr>';

  const { data: deposits, error } = await supabaseClient
    .from('deposits')
    .select('*, profiles(email)')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);">Lỗi tải hóa đơn nạp.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  deposits.forEach(d => {
    const dateStr = new Date(d.created_at).toLocaleString('vi-VN');
    const isPending = d.status === 'pending';
    
    tbody.innerHTML += `
      <tr>
        <td><strong>${d.tx_ref}</strong></td>
        <td>${d.profiles?.email || 'Người dùng đã xóa'}</td>
        <td>${formatVND(d.amount)}</td>
        <td><span class="badge badge-${d.status}">${d.status}</span></td>
        <td>${dateStr}</td>
        <td class="action-btn-group">
          ${isPending ? `
            <button class="btn btn-success" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="approveDeposit('${d.id}')">Duyệt Nạp</button>
          ` : ''}
          <button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteDeposit('${d.id}')">Xóa</button>
        </td>
      </tr>
    `;
  });
}

window.approveDeposit = async function(id) {
  if (!confirm('Bạn chắc chắn muốn duyệt hóa đơn nạp tiền này thủ công? Hệ thống sẽ cộng tiền cho người dùng.')) return;
  const { data, error } = await supabaseClient.rpc('process_deposit', { p_deposit_id: id });
  if (error) showToast('Lỗi duyệt nạp tiền: ' + error.message, 'error');
  else loadDepositsList();
};

window.deleteDeposit = async function(id) {
  if (!confirm('Bạn chắc chắn muốn xóa hóa đơn nạp này?')) return;
  const { error } = await supabaseClient.from('deposits').delete().eq('id', id);
  if (error) showToast('Lỗi xóa hóa đơn: ' + error.message, 'error');
  else loadDepositsList();
};

// Tab 5: Customers
async function loadCustomersList() {
  const tbody = document.getElementById('tbl-customers-body');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Đang tải...</td></tr>';

  const { data: customers, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);">Lỗi tải người dùng.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  customers.forEach(c => {
    const dateStr = new Date(c.created_at).toLocaleString('vi-VN');
    tbody.innerHTML += `
      <tr>
        <td><code style="font-size:0.8rem;">${c.id}</code></td>
        <td><strong>${c.email}</strong></td>
        <td><span class="badge ${c.role === 'admin' ? 'badge-completed' : 'badge-pending'}">${c.role}</span></td>
        <td><strong style="color:var(--success);">${formatVND(c.balance)}</strong></td>
        <td>${dateStr}</td>
        <td class="action-btn-group">
          <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="copyCustId('${c.id}')">Chọn Nạp</button>
          <button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteCustomer('${c.id}')">Xóa</button>
        </td>
      </tr>
    `;
  });
}

window.copyCustId = function(id) {
  document.getElementById('cust-id-input').value = id;
  document.getElementById('cust-amount-input').focus();
};

async function handleAdjustBalance() {
  const userId = document.getElementById('cust-id-input').value.trim();
  const amountStr = document.getElementById('cust-amount-input').value;
  const amount = parseFloat(amountStr);

  if (!userId || isNaN(amount)) {
    showToast('Nhập UUID khách hàng và số tiền hợp lệ.', 'warning');
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc('admin_adjust_balance', {
      p_user_id: userId,
      p_amount: amount
    });

    if (error) throw error;

    showToast('Cập nhật ví khách hàng thành công!', 'success');
    document.getElementById('cust-id-input').value = '';
    document.getElementById('cust-amount-input').value = '';
    loadCustomersList();
  } catch (err) {
    showToast('Lỗi cập nhật ví: ' + err.message, 'error');
  }
}

window.deleteCustomer = async function(id) {
  if (!confirm('Bạn chắc chắn muốn xóa tài khoản khách hàng này ra khỏi bảng profiles?')) return;
  const { error } = await supabaseClient.from('profiles').delete().eq('id', id);
  if (error) showToast('Lỗi xóa khách hàng: ' + error.message, 'error');
  else loadCustomersList();
};

// Tab 6: Bank settings
async function loadBankSettings() {
  const { data: bankSettingsRes } = await supabaseClient
    .from('settings')
    .select('value')
    .eq('key', 'bank_settings')
    .single();

  if (bankSettingsRes && bankSettingsRes.value) {
    const v = bankSettingsRes.value;
    document.getElementById('cfg-bank-name').value = v.bank_name || '';
    document.getElementById('cfg-bank-account').value = v.account_number || '';
    document.getElementById('cfg-bank-name-owner').value = v.account_name || '';
    document.getElementById('cfg-mb-username').value = v.mb_username || '';
    document.getElementById('cfg-mb-password').value = v.mb_password || '';
  }
}

async function handleBankSettingsSubmit(e) {
  e.preventDefault();
  const bankName = document.getElementById('cfg-bank-name').value.trim();
  const bankAccount = document.getElementById('cfg-bank-account').value.trim();
  const bankNameOwner = document.getElementById('cfg-bank-name-owner').value.trim();
  const mbUser = document.getElementById('cfg-mb-username').value.trim();
  const mbPass = document.getElementById('cfg-mb-password').value.trim();

  const valuePayload = {
    bank_name: bankName,
    account_number: bankAccount,
    account_name: bankNameOwner,
    mb_username: mbUser,
    mb_password: mbPass,
    qr_template: "https://api.vietqr.io/image/970422-{account_number}-compact2.jpg?amount={amount}&addInfo={memo}&accountName={account_name}"
  };

  const { error } = await supabaseClient
    .from('settings')
    .upsert({
      key: 'bank_settings',
      value: valuePayload,
      updated_at: new Date()
    });

  if (error) {
    showToast('Lỗi lưu cấu hình bank: ' + error.message, 'error');
  } else {
    showToast('Cập nhật cấu hình tài khoản nhận tiền thành công!', 'success');
    loadBankSettings();
  }
}

// Helpers
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .normalize('NFD') // separate accent marks
    .replace(/[\u0300-\u036f]/g, '') // remove accent marks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[^a-z0-9 -]/g, '') // remove non-alphanumeric chars
    .replace(/\s+/g, '-') // replace spaces with -
    .replace(/-+/g, '-'); // collapse multiple -
}

checkAdminAuth();
