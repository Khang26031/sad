
// deposit.js - Logic for Nạp tiền

const depositAmountInput = document.getElementById('deposit-amount-input');
const btnCreateDeposit = document.getElementById('btn-create-deposit');
const btnCancelDeposit = document.getElementById('btn-cancel-deposit');
const depositWaiting = document.getElementById('deposit-waiting');
const depositQrSection = document.getElementById('deposit-qr-section');
const qrImage = document.getElementById('qr-image');
const qrBankName = document.getElementById('qr-bank-name');
const qrAccNumber = document.getElementById('qr-acc-number');
const qrAccName = document.getElementById('qr-acc-name');
const qrAmount = document.getElementById('qr-amount');
const qrMemo = document.getElementById('qr-memo');
const countdownTimer = document.getElementById('countdown-timer');
const depositHistoryBody = document.getElementById('deposit-history-body');

let currentDepositId = null;
let currentMemo = '';
let currentAmount = 0;
let depositPollingInterval = null;
let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for authSession
  let attempts = 0;
  while (!authSession && attempts < 20) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  if (!authSession) {
    showToast('Vui lòng đăng nhập để nạp tiền.', 'warning');
    setTimeout(() => location.href = '/login', 2000);
    return;
  }

  loadDepositHistory();
});

btnCreateDeposit.onclick = async () => {
  const amount = parseInt(depositAmountInput.value);
  if (isNaN(amount) || amount < 10000) {
    showToast('Số tiền nạp tối thiểu là 10.000 VNĐ', 'warning');
    return;
  }

  btnCreateDeposit.disabled = true;
  btnCreateDeposit.innerText = 'Đang tạo...';

  try {
    // Lấy Bank Settings
    const { data: settingData, error: settingErr } = await supabaseClient
      .from('settings').select('value').eq('key', 'bank_settings').single();
    
    if (settingErr || !settingData) throw new Error('Không lấy được cấu hình ngân hàng');
    
    const bankConfig = settingData.value;
    const uid = authSession.user.id;
    // Memo: LEGION + 6 kí tự id + random
    const memo = `LEGION${uid.substring(0, 6).toUpperCase()}${Math.floor(Math.random()*1000)}`;

    // Tạo record trong deposits table
    const { data: newDeposit, error: insertErr } = await supabaseClient
      .from('deposits')
      .insert({
        user_id: uid,
        amount: amount,
        status: 'pending',
        tx_ref: memo
      })
      .select().single();

    if (insertErr) throw insertErr;

    currentDepositId = newDeposit.id;
    currentMemo = memo;
    currentAmount = amount;

    // Hiển thị QR
    const qrUrl = bankConfig.qr_template
      .replace('{account_number}', bankConfig.account_number)
      .replace('{amount}', amount)
      .replace('{memo}', memo)
      .replace('{account_name}', encodeURIComponent(bankConfig.account_name));

    qrImage.src = qrUrl;
    qrBankName.innerText = bankConfig.bank_name;
    qrAccNumber.innerText = bankConfig.account_number;
    qrAccName.innerText = bankConfig.account_name;
    qrAmount.innerText = formatVND(amount);
    qrMemo.innerText = memo;

    depositWaiting.classList.add('d-none');
    depositQrSection.classList.remove('d-none');
    
    startCountdown(newDeposit.created_at);
    startDepositPolling();
    loadDepositHistory();

  } catch (err) {
    showToast('Lỗi tạo lệnh: ' + err.message, 'error');
  } finally {
    btnCreateDeposit.disabled = false;
    btnCreateDeposit.innerText = 'Tạo Lệnh Nạp';
  }
};

btnCancelDeposit.onclick = async () => {
  if (!currentDepositId) return;
  try {
    await supabaseClient.from('deposits').update({ status: 'cancelled' }).eq('id', currentDepositId);
    resetDepositView();
    showToast('Đã hủy lệnh nạp', 'info');
    loadDepositHistory();
  } catch (err) {
    showToast('Lỗi hủy lệnh', 'error');
  }
};

function resetDepositView() {
  clearInterval(depositPollingInterval);
  clearInterval(countdownInterval);
  currentDepositId = null;
  depositWaiting.classList.remove('d-none');
  depositQrSection.classList.add('d-none');
}

function startCountdown(createdAtIso) {
  clearInterval(countdownInterval);
  const createdTime = new Date(createdAtIso).getTime();
  const expireTime = createdTime + 15 * 60 * 1000;

  countdownInterval = setInterval(async () => {
    const now = new Date().getTime();
    const distance = expireTime - now;

    if (distance <= 0) {
      clearInterval(countdownInterval);
      countdownTimer.innerText = "00:00 (Hết hạn)";
      // Tự động hủy nếu đang pending
      if (currentDepositId) {
        await supabaseClient.from('deposits').update({ status: 'expired' }).eq('id', currentDepositId);
        resetDepositView();
        showToast('Lệnh nạp đã hết hạn.', 'warning');
        loadDepositHistory();
      }
      return;
    }

    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((distance % (1000 * 60)) / 1000);
    countdownTimer.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

function startDepositPolling() {
  clearInterval(depositPollingInterval);
  depositPollingInterval = setInterval(async () => {
    if (!currentDepositId) return;

    try {
      // 1. Kiểm tra trạng thái trong DB trước
      const { data: dep } = await supabaseClient.from('deposits').select('status').eq('id', currentDepositId).single();
      if (dep && dep.status === 'completed') {
        clearInterval(depositPollingInterval);
        showToast('Nạp tiền thành công! Đã cộng số dư.', 'success');
        resetDepositView();
        loadDepositHistory();
        return;
      }

      // 2. Gọi API để check MBBank API
      const res = await fetch(`/api/check-deposit?amount=${currentAmount}&content=${currentMemo}&deposit_id=${currentDepositId}`);
      const result = await res.json();
      
      if (result.success && result.paid) {
        clearInterval(depositPollingInterval);
        showToast('Nạp tiền thành công! Đã cộng số dư.', 'success');
        resetDepositView();
        loadDepositHistory();
      }
    } catch (err) {
      console.log('Polling error:', err);
    }
  }, 15000); // 15 seconds
}

async function loadDepositHistory() {
  if (!authSession) return;
  try {
    const { data: deposits, error } = await supabaseClient
      .from('deposits')
      .select('*')
      .eq('user_id', authSession.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    depositHistoryBody.innerHTML = '';
    if (!deposits || deposits.length === 0) {
      depositHistoryBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Chưa có lệnh nạp nào.</td></tr>';
      return;
    }

    const now = new Date().getTime();

    for (let dep of deposits) {
      // Check auto expire for older pending items
      const createdTime = new Date(dep.created_at).getTime();
      if (dep.status === 'pending' && (now - createdTime) > 15 * 60 * 1000) {
        dep.status = 'expired';
        // Background update, no need to wait
        supabaseClient.from('deposits').update({ status: 'expired' }).eq('id', dep.id).then();
      }

      let statusBadge = '';
      if (dep.status === 'completed') statusBadge = '<span class="status-badge success">Thành công</span>';
      else if (dep.status === 'pending') statusBadge = '<span class="status-badge warning">Chờ TT</span>';
      else if (dep.status === 'expired') statusBadge = '<span class="status-badge" style="background: rgba(255,255,255,0.1);">Hết hạn</span>';
      else statusBadge = '<span class="status-badge error">Đã hủy</span>';

      depositHistoryBody.innerHTML += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 1rem; font-family: monospace;">${dep.id.split('-')[0]}</td>
          <td style="padding: 1rem; color: var(--accent-primary); font-weight: bold;">${formatVND(dep.amount)}</td>
          <td style="padding: 1rem; font-family: monospace;">${dep.tx_ref || ''}</td>
          <td style="padding: 1rem;">${new Date(dep.created_at).toLocaleString('vi-VN')}</td>
          <td style="padding: 1rem;">${statusBadge}</td>
        </tr>
      `;
    }
  } catch (err) {
    console.error('Lỗi tải lịch sử nạp:', err);
  }
}
