// admin.js
const { createClient } = supabase;
const supabaseClient = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

let activeAdminSession = null;
let productsList = [];

// Init Admin Dashboard
async function initAdmin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (!session) {
    alert('Bạn cần đăng nhập để truy cập trang quản trị.');
    location.href = '/login';
    return;
  }

  // Check role is admin
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    alert('Bạn không có quyền truy cập trang quản trị.');
    location.href = '/';
    return;
  }

  activeAdminSession = session;
  document.getElementById('admin-user-email').innerText = `Admin: ${session.user.email}`;

  setupSidebar();
  setupProductModal();
  setupSettingsTab();
  
  // Load Default Tab
  loadDashboardData();
}

// Sidebar Navigation
function setupSidebar() {
  const menuItems = document.querySelectorAll('.admin-menu-item');
  const sections = document.querySelectorAll('.admin-tab-section');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      menuItems.forEach(i => i.classList.remove('active'));
      sections.forEach(s => s.classList.add('d-none'));

      item.classList.add('active');
      const targetTab = item.getAttribute('data-tab');
      document.getElementById(targetTab).classList.remove('d-none');

      // Load correct data based on tab selected
      if (targetTab === 'tab-dashboard') loadDashboardData();
      else if (targetTab === 'tab-products') loadProductsData();
      else if (targetTab === 'tab-keys') loadKeysData();
      else if (targetTab === 'tab-orders') loadOrdersData();
      else if (targetTab === 'tab-settings') loadSettingsData();
    });
  });

  document.getElementById('admin-logout-btn').onclick = async () => {
    await supabaseClient.auth.signOut();
    location.href = '/login';
  };
}

// FORMAT UTIL
function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// ================= DASHBOARD DATA =================
async function loadDashboardData() {
  // Load stats
  const { data: completedOrders } = await supabaseClient
    .from('orders')
    .select('amount')
    .eq('status', 'completed');
  
  const revenue = completedOrders ? completedOrders.reduce((sum, o) => sum + parseFloat(o.amount), 0) : 0;
  const completedCount = completedOrders ? completedOrders.length : 0;

  document.getElementById('stat-revenue').innerText = formatVND(revenue);
  document.getElementById('stat-orders-completed').innerText = completedCount;

  // Products count
  const { count: prodCount } = await supabaseClient
    .from('products')
    .select('*', { count: 'exact', head: true });
  document.getElementById('stat-products-count').innerText = prodCount || 0;

  // Unsold keys count
  const { count: keysCount } = await supabaseClient
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('is_sold', false);
  document.getElementById('stat-keys-unsold').innerText = keysCount || 0;

  // Load 10 recent orders
  const { data: recentOrders } = await supabaseClient
    .from('orders')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
    .limit(10);

  const tbody = document.getElementById('recent-orders-table');
  tbody.innerHTML = '';

  if (!recentOrders || recentOrders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Chưa có đơn hàng nào.</td></tr>';
    return;
  }

  recentOrders.forEach(o => {
    const dateStr = new Date(o.created_at).toLocaleString('vi-VN');
    tbody.innerHTML += `
      <tr>
        <td><strong>${o.tx_ref}</strong></td>
        <td>${o.buyer_email}</td>
        <td>${o.products?.name || 'Đã xóa'}</td>
        <td>${formatVND(o.amount)}</td>
        <td><span class="badge badge-${o.status}">${o.status.toUpperCase()}</span></td>
        <td>${dateStr}</td>
      </tr>
    `;
  });
}

// ================= PRODUCTS TAB =================
async function loadProductsData() {
  const { data: products } = await supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  // Get items stock count
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

  productsList = products || [];
  const tbody = document.getElementById('products-table');
  tbody.innerHTML = '';

  productsList.forEach(p => {
    const stock = stockMap[p.id] || 0;
    tbody.innerHTML += `
      <tr>
        <td><strong>${p.name}</strong></td>
        <td>${formatVND(p.price)}</td>
        <td><span class="stock-badge ${stock === 0 ? 'empty' : ''}">${stock} key còn lại</span></td>
        <td><span class="badge ${p.status === 'active' ? 'badge-completed' : 'badge-failed'}">${p.status}</span></td>
        <td>
          <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="editProduct('${p.id}')">Sửa</button>
          <button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="deleteProduct('${p.id}')">Xóa</button>
        </td>
      </tr>
    `;
  });
}

function setupProductModal() {
  const modal = document.getElementById('product-modal');
  const closeBtn = document.getElementById('product-modal-close');
  const addBtn = document.getElementById('add-product-btn');
  const form = document.getElementById('product-form');

  addBtn.onclick = () => {
    document.getElementById('p-id').value = '';
    form.reset();
    document.getElementById('product-modal-title').innerText = 'Thêm Sản Phẩm Mới';
    modal.classList.add('open');
  };

  closeBtn.onclick = () => modal.classList.remove('open');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('p-id').value;
    const name = document.getElementById('p-name').value;
    const desc = document.getElementById('p-desc').value;
    const price = parseFloat(document.getElementById('p-price').value);
    const imageUrl = document.getElementById('p-image').value;
    const status = document.getElementById('p-status').value;

    const payload = { name, description: desc, price, image_url: imageUrl, status };

    try {
      if (id) {
        // Edit Product
        const { error } = await supabaseClient.from('products').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        // Add Product
        const { error } = await supabaseClient.from('products').insert(payload);
        if (error) throw error;
      }
      modal.classList.remove('open');
      loadProductsData();
    } catch (err) {
      alert(`Lỗi lưu sản phẩm: ${err.message}`);
    }
  };
}

window.editProduct = function(id) {
  const p = productsList.find(prod => prod.id === id);
  if (!p) return;

  document.getElementById('p-id').value = p.id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-desc').value = p.description || '';
  document.getElementById('p-price').value = p.price;
  document.getElementById('p-image').value = p.image_url || '';
  document.getElementById('p-status').value = p.status;

  document.getElementById('product-modal-title').innerText = 'Chỉnh Sửa Sản Phẩm';
  document.getElementById('product-modal').classList.add('open');
};

window.deleteProduct = async function(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa sản phẩm này? Tất cả key liên quan cũng sẽ bị xóa.')) return;
  try {
    const { error } = await supabaseClient.from('products').delete().eq('id', id);
    if (error) throw error;
    loadProductsData();
  } catch (err) {
    alert(`Lỗi xóa sản phẩm: ${err.message}`);
  }
};

// ================= KEYS TAB =================
async function loadKeysData() {
  const { data: products } = await supabaseClient.from('products').select('*').eq('status', 'active');
  const select = document.getElementById('key-product-select');
  select.innerHTML = '';
  
  if (products) {
    products.forEach(p => {
      select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
    });
  }

  // Fetch stocks breakdown stats
  const { data: itemsStats } = await supabaseClient.from('items').select('product_id, is_sold');
  const { data: productsAll } = await supabaseClient.from('products').select('id, name');

  const prodStats = {};
  if (productsAll) {
    productsAll.forEach(p => {
      prodStats[p.id] = { name: p.name, unsold: 0, sold: 0 };
    });
  }

  if (itemsStats) {
    itemsStats.forEach(it => {
      if (prodStats[it.product_id]) {
        if (it.is_sold) prodStats[it.product_id].sold++;
        else prodStats[it.product_id].unsold++;
      }
    });
  }

  const tbody = document.getElementById('keys-stats-table');
  tbody.innerHTML = '';

  Object.values(prodStats).forEach(st => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${st.name}</strong></td>
        <td style="color: var(--success);">${st.unsold} key chưa bán</td>
        <td style="color: var(--text-secondary);">${st.sold} key đã bán</td>
        <td><strong>${st.unsold + st.sold}</strong></td>
      </tr>
    `;
  });
}

document.getElementById('import-keys-btn').onclick = async () => {
  const productId = document.getElementById('key-product-select').value;
  const keysText = document.getElementById('keys-input').value.trim();

  if (!productId) {
    alert('Vui lòng chọn sản phẩm.');
    return;
  }
  if (!keysText) {
    alert('Vui lòng nhập danh sách key.');
    return;
  }

  const lines = keysText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const itemsToInsert = lines.map(content => ({
    product_id: productId,
    content: content,
    is_sold: false
  }));

  try {
    const { error } = await supabaseClient.from('items').insert(itemsToInsert);
    if (error) throw error;

    alert(`Đã nhập thành công ${itemsToInsert.length} key vào kho!`);
    document.getElementById('keys-input').value = '';
    loadKeysData();
  } catch (err) {
    alert(`Lỗi nhập key: ${err.message}`);
  }
};

// ================= ORDERS TAB =================
async function loadOrdersData() {
  const { data: orders } = await supabaseClient
    .from('orders')
    .select('*, products(name)')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('all-orders-table');
  tbody.innerHTML = '';

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Chưa có đơn hàng nào.</td></tr>';
    return;
  }

  orders.forEach(o => {
    const dateStr = new Date(o.created_at).toLocaleString('vi-VN');
    tbody.innerHTML += `
      <tr>
        <td><strong>${o.tx_ref}</strong></td>
        <td>${o.buyer_email}</td>
        <td>${o.products?.name || 'Đã xóa'}</td>
        <td>${formatVND(o.amount)}</td>
        <td><span class="badge badge-${o.status}">${o.status.toUpperCase()}</span></td>
        <td><code style="font-family: monospace; font-size: 0.85rem; word-break: break-all;">${o.key_content || '-'}</code></td>
        <td>${dateStr}</td>
      </tr>
    `;
  });
}

// ================= SETTINGS TAB =================
async function loadSettingsData() {
  const { data: settings } = await supabaseClient
    .from('settings')
    .select('*')
    .eq('key', 'bank_settings')
    .single();

  if (settings && settings.value) {
    const val = settings.value;
    document.getElementById('cfg-bank-name').value = val.bank_name || 'MBBank';
    document.getElementById('cfg-bank-account').value = val.account_number || '';
    document.getElementById('cfg-bank-name-owner').value = val.account_name || '';
    
    document.getElementById('cfg-mb-username').value = val.mb_username || '';
    document.getElementById('cfg-mb-password').value = val.mb_password || '';
  }
}

function setupSettingsTab() {
  document.getElementById('save-settings-btn').onclick = async () => {
    const bankName = document.getElementById('cfg-bank-name').value.trim();
    const bankAccount = document.getElementById('cfg-bank-account').value.trim();
    const bankNameOwner = document.getElementById('cfg-bank-name-owner').value.trim();
    const mbUser = document.getElementById('cfg-mb-username').value.trim();
    const mbPass = document.getElementById('cfg-mb-password').value.trim();

    if (!bankAccount || !bankNameOwner) {
      alert('Vui lòng điền đầy đủ số tài khoản và tên chủ tài khoản nhận tiền.');
      return;
    }

    const valuePayload = {
      bank_name: bankName,
      account_number: bankAccount,
      account_name: bankNameOwner,
      mb_username: mbUser,
      mb_password: mbPass,
      qr_template: "https://api.vietqr.io/image/970422-{account_number}-compact2.jpg?amount={amount}&addInfo={memo}&accountName={account_name}"
    };

    try {
      const { error } = await supabaseClient
        .from('settings')
        .upsert({
          key: 'bank_settings',
          value: valuePayload,
          updated_at: new Date()
        });

      if (error) throw error;
      alert('Đã lưu cài đặt hệ thống thành công!');
    } catch (err) {
      alert(`Lỗi lưu cài đặt: ${err.message}`);
    }
  };
}

initAdmin();
