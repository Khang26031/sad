
// history.js - Logic for Lịch sử mua hàng

const historyTableBody = document.getElementById('history-table-body');
const historyLoader = document.getElementById('history-loader');
const historyContent = document.getElementById('history-content');
const keyModal = document.getElementById('key-modal');

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for authSession from app.js
  let attempts = 0;
  while (!authSession && attempts < 20) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (!authSession) {
    historyLoader.innerHTML = '<p style="color: var(--danger);">Vui lòng đăng nhập để xem lịch sử.</p>';
    setTimeout(() => location.href = '/login', 2000);
    return;
  }

  loadHistory();
});

async function loadHistory() {
  try {
    const { data: orders, error } = await supabaseClient
      .rpc('get_orders_by_email', { p_email: authSession.user.email });

    if (error) throw error;

    historyLoader.classList.add('d-none');
    historyContent.classList.remove('d-none');

    if (!orders || orders.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Chưa có đơn hàng nào.</td></tr>';
      return;
    }

    // Sort by date desc
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    historyTableBody.innerHTML = '';
    orders.forEach(order => {
      let statusBadge = '';
      if (order.status === 'completed') statusBadge = '<span class="status-badge success">Hoàn thành</span>';
      else if (order.status === 'processing') statusBadge = '<span class="status-badge warning">Đang xử lý</span>';
      else statusBadge = `<span class="status-badge error">${order.status}</span>`;

      // The eye icon logic
      let keyAction = '-';
      if (order.status === 'completed' && order.key_content) {
        // Encode key_content to pass it safely to onclick
        const safeKey = btoa(unescape(encodeURIComponent(order.key_content || '')));
        keyAction = `<button class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.9rem;" onclick="showKeyModal('${order.tx_ref}', '${safeKey}')"><i class="fa-solid fa-eye"></i> Xem</button>`;
      } else if (order.status === 'processing') {
        keyAction = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Đang chờ Admin</span>';
      }

      historyTableBody.innerHTML += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 1rem; font-family: monospace;">${order.tx_ref || order.id.split('-')[0]}</td>
          <td style="padding: 1rem; font-weight: bold; color: var(--accent-primary);">${order.product_name || 'Sản phẩm đã xóa'}</td>
          <td style="padding: 1rem;">${new Date(order.created_at).toLocaleString('vi-VN')}</td>
          <td style="padding: 1rem;">${formatVND(order.amount)}</td>
          <td style="padding: 1rem;">${statusBadge}</td>
          <td style="padding: 1rem; text-align: center;">${keyAction}</td>
        </tr>
      `;
    });
  } catch (err) {
    historyLoader.innerHTML = `<p style="color: var(--danger);">Lỗi khi tải lịch sử: ${err.message}</p>`;
  }
}

let currentKeyContent = '';
window.showKeyModal = function(txRef, base64Key) {
  currentKeyContent = decodeURIComponent(escape(atob(base64Key)));
  document.getElementById('modal-key-id').innerText = txRef;
  document.getElementById('modal-key-content').innerText = currentKeyContent;
  keyModal.classList.add('open');
};

document.getElementById('key-modal-close').onclick = () => {
  keyModal.classList.remove('open');
};

window.copyKeyContent = function() {
  navigator.clipboard.writeText(currentKeyContent).then(() => {
    showToast('Đã sao chép vào khay nhớ tạm', 'success');
  }).catch(err => {
    showToast('Lỗi khi sao chép', 'error');
  });
};
