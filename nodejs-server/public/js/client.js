// Client Dashboard Logic
let currentUser = null;
let currentBankAccounts = [];

window.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  await loadUserProfile();
  await loadBankAccounts();
});

// Load Current User Profile
async function loadUserProfile() {
  try {
    const res = await fetchWithAuth('/auth/profile');
    if (!res || res.status !== 'success' || !res.user) {
      clearAuth();
      return;
    }

    currentUser = res.user;
    document.getElementById('user-display-name').innerText = currentUser.username;
    document.getElementById('user-display-balance').innerText = formatMoney(currentUser.money);
    document.getElementById('stat-money').innerText = formatMoney(currentUser.money);
    document.getElementById('stat-time-momo').innerHTML = formatDaysRemaining(currentUser.timeMomo);
    document.getElementById('display-master-token').innerText = currentUser.token || 'Chưa tạo token';

    // Show Admin link if user is admin
    if (currentUser.level === '1' || currentUser.level === 'admin') {
      const adminNav = document.getElementById('nav-admin-wrapper');
      if (adminNav) adminNav.style.display = 'block';
      const badge = document.getElementById('user-badge');
      if (badge) {
        badge.innerText = 'Admin';
        badge.className = 'user-badge admin';
      }
    }

    // Set deposit syntax
    const depositSyntax = document.getElementById('deposit-syntax');
    if (depositSyntax) {
      depositSyntax.innerText = `NAPTIEN ${currentUser.username}`;
    }

    const profileUsername = document.getElementById('profile-username');
    if (profileUsername) {
      profileUsername.value = currentUser.username;
    }
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// Load Linked Bank Accounts
async function loadBankAccounts() {
  try {
    const res = await fetchWithAuth('/banks/accounts');
    if (!res || res.status !== 'success') return;

    currentBankAccounts = res.data || [];
    document.getElementById('stat-bank-count').innerText = currentBankAccounts.length;

    renderBankTables(currentBankAccounts);
    populateHistoryBankSelect(currentBankAccounts);
  } catch (err) {
    console.error('Failed to load banks:', err);
  }
}

// Render Tables in Dashboard and Banks Tab
function renderBankTables(accounts) {
  const dashboardTbody = document.getElementById('dashboard-bank-list');
  const fullTbody = document.getElementById('full-bank-list');

  if (!accounts.length) {
    const emptyRow = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">Chưa có tài khoản ngân hàng nào. Nhấn "+ Thêm Ngân Hàng" để bắt đầu.</td></tr>`;
    if (dashboardTbody) dashboardTbody.innerHTML = emptyRow;
    if (fullTbody) fullTbody.innerHTML = emptyRow;
    return;
  }

  const rowsHtml = accounts
    .map((acc) => {
      const bankCode = (acc.bankCode || 'mbbank').toLowerCase();
      const isSessionActive = acc.sessionStatus === 'active' || (!acc.sessionStatus && acc.status === 1);
      const statusPill = isSessionActive
        ? `<span class="status-pill status-active"><i class="fa-solid fa-circle" style="font-size: 7px;"></i> Còn hạn</span>`
        : `<span class="status-pill status-inactive" title="${acc.sessionError || 'Phiên hết hạn'}"><i class="fa-solid fa-circle-exclamation" style="font-size: 7px;"></i> Hết phiên</span>`;

      return `
      <tr>
        <td><span class="bank-badge bank-${bankCode}">${bankCode.toUpperCase()}</span></td>
        <td><b>${acc.accountNumber}</b></td>
        <td>${acc.accountName || '---'}</td>
        <td>
          <span style="font-family: monospace; font-size: 11px; color: var(--accent); background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px;">
            ${acc.token.substring(0, 10)}...
          </span>
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px; margin-left: 4px;" onclick="copyToClipboard('${acc.token}', 'Đã chép Token API!')" title="Sao chép Token">
            <i class="fa-regular fa-copy"></i>
          </button>
        </td>
        <td>${statusPill}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="viewBankHistory('${acc._id}')" title="Xem sao kê">
              <i class="fa-solid fa-receipt"></i> Sao kê
            </button>
            <button class="btn btn-secondary btn-sm" onclick="refreshToken('${acc._id}')" title="Đổi Token">
              <i class="fa-solid fa-arrows-rotate"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteBank('${acc._id}')" title="Xóa tài khoản">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');

  if (dashboardTbody) dashboardTbody.innerHTML = rowsHtml;
  if (fullTbody) fullTbody.innerHTML = rowsHtml;
}

// Populate History Select Dropdown
function populateHistoryBankSelect(accounts) {
  const select = document.getElementById('select-history-bank');
  if (!select) return;

  let optionsHtml = '<option value="">-- Chọn tài khoản ngân hàng --</option>';
  accounts.forEach((acc) => {
    optionsHtml += `<option value="${acc._id}">[${acc.bankCode.toUpperCase()}] ${acc.accountNumber} - ${acc.accountName}</option>`;
  });
  select.innerHTML = optionsHtml;
}

// Navigation Tabs Switcher
function switchNav(sectionName, element) {
  // Update nav link active state
  document.querySelectorAll('.nav-link').forEach((el) => el.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    const targetLink = document.querySelector(`.nav-link[onclick*="'${sectionName}'"]`);
    if (targetLink) targetLink.classList.add('active');
  }

  // Hide all sections
  document.querySelectorAll('.content-section').forEach((sec) => (sec.style.display = 'none'));

  // Show target section
  const targetSec = document.getElementById(`section-${sectionName}`);
  if (targetSec) targetSec.style.display = 'block';

  // Update Topbar Title
  const titles = {
    dashboard: { title: 'Bảng Điều Khiển', sub: 'Quản lý kết nối ngân hàng và tra cứu giao dịch tự động' },
    banks: { title: 'Tài Khoản Ngân Hàng', sub: 'Danh sách và trạng thái các cổng thanh toán đã liên kết' },
    history: { title: 'Lịch Sử Giao Dịch', sub: 'Tra cứu sao kê và biến động số dư tài khoản thời gian thực' },
    recharge: { title: 'Nạp Tiền & Gói Dịch Vụ', sub: 'Nâng cấp hạn dùng API và nạp tiền tự động' },
    docs: { title: 'Tài Liệu API', sub: 'Hướng dẫn tích hợp kết nối cho nhà phát triển' },
    profile: { title: 'Hồ Sơ Cá Nhân', sub: 'Quản lý mật khẩu và bảo mật tài khoản' },
  };

  if (titles[sectionName]) {
    document.getElementById('page-heading').innerText = titles[sectionName].title;
    document.getElementById('page-subheading').innerText = titles[sectionName].sub;
  }
}

// Modal Handlers
function openAddBankModal() {
  document.getElementById('modal-add-bank').classList.add('active');
}

function closeAddBankModal() {
  document.getElementById('modal-add-bank').classList.remove('active');
  const banner = document.getElementById('add-bank-status-banner');
  if (banner) {
    banner.style.display = 'none';
    banner.innerHTML = '';
  }
}

function selectBankOption(bankCode, element) {
  document.querySelectorAll('.bank-option').forEach((el) => el.classList.remove('selected'));
  element.classList.add('selected');
  document.getElementById('add-bank-code').value = bankCode;

  const label = document.getElementById('label-account-number');
  const cookieGroup = document.getElementById('group-add-cookie');
  if (bankCode === 'zalopay' || bankCode === 'viettel' || bankCode === 'thesieure') {
    label.innerText = 'Số Điện Thoại / Tên Tài Khoản Đăng Nhập:';
  } else if (bankCode === 'tpbank') {
    label.innerText = 'Số Điện Thoại / Tên Đăng Nhập TPBank eBank:';
  } else if (bankCode === 'timo') {
    label.innerText = 'Số Điện Thoại / Số Tài Khoản Timo (BVBank):';
  } else {
    label.innerText = 'Số Tài Khoản (STK):';
  }

  // Show cookie field for ZaloPay and Thẻ Siêu Rẻ
  if (cookieGroup) {
    if (bankCode === 'zalopay' || bankCode === 'thesieure') {
      cookieGroup.style.display = 'block';
    } else {
      cookieGroup.style.display = 'none';
    }
  }

  // Clear any previous error banner
  const banner = document.getElementById('add-bank-status-banner');
  if (banner) {
    banner.style.display = 'none';
    banner.innerHTML = '';
  }
}

// Add Bank Account Form Submission with Live API Verification
async function handleAddBankAccount(e) {
  e.preventDefault();
  const bankCode = document.getElementById('add-bank-code').value;
  const accountNumber = document.getElementById('add-account-number').value.trim();
  const accountName = document.getElementById('add-account-name').value.trim();
  const username = document.getElementById('add-username').value.trim();
  const password = document.getElementById('add-password').value;
  const cookieEl = document.getElementById('add-cookie');
  const cookie = cookieEl ? cookieEl.value.trim() : '';
  const skipVerifyEl = document.getElementById('add-skip-verify');
  const skipVerification = skipVerifyEl ? skipVerifyEl.checked : false;

  const btn = document.getElementById('btn-submit-add-bank');
  const banner = document.getElementById('add-bank-status-banner');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gọi API kiểm tra đăng nhập...';

  if (banner) {
    banner.style.display = 'block';
    banner.style.background = 'rgba(59, 130, 246, 0.15)';
    banner.style.border = '1px solid rgba(59, 130, 246, 0.35)';
    banner.style.color = '#93c5fd';
    banner.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi yêu cầu đăng nhập trực tiếp tới API <strong>${bankCode.toUpperCase()}</strong> để kiểm tra tính hợp lệ và lấy dữ liệu tài khoản...`;
  }

  let effectiveAccountNumber = accountNumber;
  let effectiveUsername = username;
  if (bankCode === 'viettel' || bankCode === 'viettelpay') {
    if (!effectiveAccountNumber && effectiveUsername) effectiveAccountNumber = effectiveUsername;
    if (!effectiveUsername && effectiveAccountNumber) effectiveUsername = effectiveAccountNumber;
  }

  try {
    const res = await fetchWithAuth('/banks/accounts', {
      method: 'POST',
      body: JSON.stringify({
        bankCode,
        accountNumber: effectiveAccountNumber,
        accountName,
        username: effectiveUsername,
        password,
        cookie,
        skipVerification,
        userToken: getToken(),
      }),
    });

    if (res && (res.status === 'requires_otp' || res.requiresOtp)) {
      if (banner) {
        banner.style.background = 'rgba(234, 179, 8, 0.15)';
        banner.style.border = '1px solid rgba(234, 179, 8, 0.35)';
        banner.style.color = '#fde047';
        banner.innerHTML = `<i class="fa-solid fa-key"></i> ${res.msg || 'Yêu cầu mã xác thực OTP'}`;
      }

      const isCurrentEximbank = (bankCode === 'eximbank' || bankCode === 'eib');
      if (isCurrentEximbank && typeof Swal !== 'undefined') {
        const qrSrc = res.qrUrl || (res.qrData ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=4&data=${encodeURIComponent(res.qrData)}` : '');
        let timerSeconds = res.expiresIn || 120;
        let countdownTimer = null;
        let pollTimer = null;

        Swal.fire({
          title: '<span style="font-size: 21px; font-weight: 700; color: #0f172a;">Xác thực đăng nhập</span>',
          html: `
            <div style="text-align: center; margin: 0 auto; max-width: 440px;">
              <p style="font-size: 14px; color: #475569; margin: 6px 0 12px 0; line-height: 1.5;">
                Quý khách vui lòng xác thực SmartOTP để thực hiện đăng nhập vào Eximbank EDigi
              </p>
              <div style="font-size: 14.5px; font-weight: 600; color: #64748b; margin-bottom: 12px;" id="swal-client-otp-timer-wrap">
                Thời gian hiệu lực còn <span id="swal-client-otp-countdown" style="color: #eab308; font-weight: 700; font-size: 19px;">${timerSeconds}</span> giây
              </div>
              
              ${qrSrc ? `
              <div style="background: #ffffff; padding: 14px; border-radius: 14px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.09); border: 1px solid #e2e8f0; margin-bottom: 14px;">
                <img src="${qrSrc}" alt="Eximbank SmartOTP QR" style="width: 220px; height: 220px; display: block; border-radius: 6px;" />
              </div>
              ` : `
              <div style="padding: 20px; color: #ef4444;">
                Không thể tạo mã QR. Vui lòng thử lại!
              </div>
              `}

              <div style="color: #0284c7; font-weight: 700; font-size: 14px; margin-bottom: 6px;">
                <i class="fa-solid fa-qrcode"></i> Hướng dẫn sử dụng Smart OTP
              </div>
              <div style="font-size: 12px; color: #475569; line-height: 1.6; text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px;">
                <p style="margin-bottom: 4px;">• Quý khách vui lòng <strong>KHÔNG</strong> tắt trình duyệt cho đến khi nhận được kết quả giao dịch trên Internet Banking. Xin cảm ơn!</p>
                <p style="margin-bottom: 0;">• Quý khách mở ứng dụng <strong>Eximbank EDigi</strong> trên điện thoại (không cần đăng nhập), chọn chức năng <strong>Smart OTP</strong> hoặc <strong>Quét QR</strong>, thực hiện quét mã và hoàn tất các bước xác thực.</p>
              </div>

              <div style="margin-top: 6px; display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: #0284c7; background: #e0f2fe; padding: 7px 16px; border-radius: 20px;">
                <i class="fa-solid fa-spinner fa-spin"></i> Đang chờ bạn quét mã QR trên điện thoại...
              </div>
            </div>
          `,
          showCloseButton: true,
          showConfirmButton: false,
          showCancelButton: true,
          cancelButtonText: '<i class="fa-solid fa-xmark"></i> Hủy Bỏ',
          cancelButtonColor: '#64748b',
          allowOutsideClick: false,
          didOpen: () => {
            const countEl = document.getElementById('swal-client-otp-countdown');
            const timerWrap = document.getElementById('swal-client-otp-timer-wrap');
            if (countdownTimer) clearInterval(countdownTimer);
            if (pollTimer) clearInterval(pollTimer);

            countdownTimer = setInterval(() => {
              timerSeconds--;
              if (timerSeconds <= 0) {
                clearInterval(countdownTimer);
                if (pollTimer) clearInterval(pollTimer);
                if (countEl) countEl.textContent = '0';
                if (timerWrap) {
                  timerWrap.innerHTML = '<span style="color: #dc2626; font-size: 13.5px;"><i class="fa-solid fa-triangle-exclamation"></i> Mã QR đã hết hạn. Vui lòng bấm [Hủy Bỏ] rồi đăng nhập lại.</span>';
                }
              } else {
                if (countEl) countEl.textContent = timerSeconds;
              }
            }, 1000);

            pollTimer = setInterval(async () => {
              try {
                const checkRes = await fetchWithAuth('/banks/check-confirm', {
                  method: 'POST',
                  body: JSON.stringify({
                    bankCode,
                    accountNumber: res.accountNumber || accountNumber,
                    username: res.username || username || accountNumber,
                    token: res.token || '',
                    otpToken: res.qrData || '',
                  }),
                });
                if (checkRes && checkRes.status === 'success') {
                  clearInterval(pollTimer);
                  if (countdownTimer) clearInterval(countdownTimer);
                  Swal.close();
                  showToast(checkRes.msg || 'Kết nối tài khoản thành công!', 'success');
                  closeAddBankModal();
                  await loadBankAccounts();
                } else if (checkRes && checkRes.status === 'expired') {
                  clearInterval(pollTimer);
                  if (countdownTimer) clearInterval(countdownTimer);
                  if (countEl) countEl.textContent = '0';
                  if (timerWrap) {
                    timerWrap.innerHTML = `<span style="color: #dc2626; font-size: 13.5px;"><i class="fa-solid fa-triangle-exclamation"></i> ${checkRes.msg || 'Mã QR đã hết hạn. Vui lòng bấm [Hủy Bỏ] rồi đăng nhập lại.'}</span>`;
                  }
                }
              } catch (_) {}
            }, 2000);
          },
          willClose: () => {
            if (countdownTimer) clearInterval(countdownTimer);
            if (pollTimer) clearInterval(pollTimer);
          },
        });

        return;
      }

      if (typeof Swal !== 'undefined') {
        const { value: otpVal } = await Swal.fire({
          title: 'XÁC THỰC MÃ OTP',
          html: `
            <div style="text-align: center; margin: 10px 0;">
              <p style="font-size: 14.5px; color: #cbd5e1; margin-bottom: 12px; line-height: 1.5;">
                ${res.msg || 'Vui lòng nhập mã OTP gửi về tin nhắn SMS của bạn:'}
              </p>
              <input type="text" id="swal-client-otp-input" class="swal2-input" placeholder="Nhập mã OTP..." style="font-size: 22px; font-weight: 800; letter-spacing: 5px; text-align: center; max-width: 280px; margin: 0 auto; color: #38bdf8;" autocomplete="off" autofocus />
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: 'Xác Nhận OTP',
          cancelButtonText: 'Hủy Bỏ',
          confirmButtonColor: '#0284c7',
          preConfirm: () => {
            const val = document.getElementById('swal-client-otp-input')?.value?.trim();
            if (!val) {
              Swal.showValidationMessage('Vui lòng nhập mã OTP!');
              return false;
            }
            return val;
          }
        });

        if (otpVal) {
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác thực OTP...';
          const verifyRes = await fetchWithAuth('/banks/verify-otp', {
            method: 'POST',
            body: JSON.stringify({
              bankCode,
              accountNumber: res.accountNumber || accountNumber,
              username: res.username || username || accountNumber,
              otp: otpVal,
            }),
          });

          if (verifyRes && verifyRes.status === 'success') {
            showToast(verifyRes.msg || 'Kết nối tài khoản thành công!', 'success');
            closeAddBankModal();
            await loadBankAccounts();
            return;
          } else {
            showToast(verifyRes?.msg || 'Mã OTP không hợp lệ hoặc đã hết hạn!', 'error');
            return;
          }
        }
      }
      return;
    }

    if (res && res.status === 'success') {
      if (banner) {
        banner.style.background = 'rgba(34, 197, 94, 0.15)';
        banner.style.border = '1px solid rgba(34, 197, 94, 0.35)';
        banner.style.color = '#4ade80';
        banner.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${res.msg || 'Xác thực tài khoản thành công!'}`;
      }
      showToast(res?.msg || 'Kết nối tài khoản ngân hàng thành công!', 'success');

      setTimeout(async () => {
        closeAddBankModal();
        document.getElementById('add-account-number').value = '';
        document.getElementById('add-account-name').value = '';
        document.getElementById('add-username').value = '';
        document.getElementById('add-password').value = '';
        if (cookieEl) cookieEl.value = '';
        if (skipVerifyEl) skipVerifyEl.checked = false;
        await loadBankAccounts();
      }, 1200);
    } else {
      const errorMsg = res?.msg || 'Đăng nhập không thành công. Ngân hàng từ chối kết nối.';
      if (banner) {
        banner.style.background = 'rgba(239, 68, 68, 0.15)';
        banner.style.border = '1px solid rgba(239, 68, 68, 0.35)';
        banner.style.color = '#f87171';
        banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Xác thực thất bại:</strong> ${errorMsg}`;
      }
      showToast(errorMsg, 'error');
    }
  } catch (err) {
    if (banner) {
      banner.style.background = 'rgba(239, 68, 68, 0.15)';
      banner.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      banner.style.color = '#f87171';
      banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Lỗi kết nối:</strong> Không thể kết nối tới server xử lý API`;
    }
    showToast('Lỗi khi kết nối ngân hàng', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-plug-circle-check"></i> Xác Thực & Kết Nối';
  }
}

// Refresh Bank Token
async function refreshToken(bankId) {
  if (!confirm('Bạn có chắc muốn làm mới Token API cho tài khoản này? Các hệ thống đang tích hợp bằng Token cũ sẽ phải đổi sang Token mới.')) {
    return;
  }
  try {
    const res = await fetchWithAuth(`/banks/accounts/${bankId}/refresh-token`, { method: 'POST' });
    if (res && res.status === 'success') {
      showToast('Làm mới Token thành công!', 'success');
      await loadBankAccounts();
    } else {
      showToast(res?.msg || 'Lỗi làm mới token', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// Delete Bank Account
async function deleteBank(bankId) {
  if (!confirm('Bạn có chắc chắn muốn xóa tài khoản ngân hàng này khỏi hệ thống?')) {
    return;
  }
  try {
    const res = await fetchWithAuth(`/banks/accounts/${bankId}`, { method: 'DELETE' });
    if (res && res.status === 'success') {
      showToast('Đã xóa tài khoản ngân hàng', 'success');
      await loadBankAccounts();
    } else {
      showToast(res?.msg || 'Xóa thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// View Bank History direct jump
function viewBankHistory(bankId) {
  switchNav('history');
  const select = document.getElementById('select-history-bank');
  if (select) {
    select.value = bankId;
    fetchTransactionHistory();
  }
}

// Fetch Transaction History
async function fetchTransactionHistory() {
  const bankId = document.getElementById('select-history-bank').value;
  const days = document.getElementById('select-history-days').value;
  const tbody = document.getElementById('transaction-history-table');

  if (!bankId) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim);">Vui lòng chọn tài khoản ngân hàng bên trên.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--accent); padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu sao kê từ máy chủ ngân hàng...</td></tr>`;

  try {
    const res = await fetchWithAuth(`/banks/accounts/${bankId}/history?days=${days}`);
    if (!res) return;

    if (res.status === 'success' && res.transactions) {
      document.getElementById('history-total-count').innerText = `${res.transactions.length} giao dịch`;
      if (!res.transactions.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 24px;">Không có giao dịch nào trong ${days} ngày qua.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.transactions
        .map((tx) => {
          const credit = tx.creditAmount > 0 ? `<b style="color: var(--success);">+${formatMoney(tx.creditAmount)}</b>` : '---';
          const debit = tx.debitAmount > 0 ? `<b style="color: var(--danger);">-${formatMoney(tx.debitAmount)}</b>` : '---';

          return `
          <tr>
            <td><span style="font-family: monospace; font-size: 12px; color: var(--accent);">${tx.refNo || '---'}</span></td>
            <td>${tx.transactionDate || tx.postingDate || '---'}</td>
            <td>${credit}</td>
            <td>${debit}</td>
            <td>${tx.description || '---'}</td>
            <td><b>${formatMoney(tx.availableBalance)}</b></td>
          </tr>
        `;
        })
        .join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--warning); padding: 20px;"><i class="fa-solid fa-triangle-exclamation"></i> ${res.message || 'Không thể lấy sao kê lúc này (phiên đăng nhập có thể đã hết hạn)'}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Lỗi kết nối khi tải sao kê</td></tr>`;
  }
}

// Quick Copy Master Token
function copyMasterToken() {
  if (currentUser && currentUser.token) {
    copyToClipboard(currentUser.token, 'Đã sao chép Token tài khoản của bạn!');
  }
}

// Buy Plan Simulation
function buyPlan(days, price) {
  if (!currentUser) return;
  if (currentUser.money < price) {
    showToast(`Số dư không đủ! Cần ${formatMoney(price)}, số dư hiện tại ${formatMoney(currentUser.money)}. Vui lòng nạp thêm tiền.`, 'error');
    return;
  }
  showToast('Tính năng thanh toán gói cước đã sẵn sàng!', 'info');
}

// Change Password
async function handleChangePassword(e) {
  e.preventDefault();
  const newPass = document.getElementById('profile-new-password').value;
  if (!newPass || newPass.length < 6) {
    showToast('Mật khẩu mới phải có tối thiểu 6 ký tự', 'error');
    return;
  }
  showToast('Đã gửi yêu cầu đổi mật khẩu!', 'success');
}
