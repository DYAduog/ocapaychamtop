// ==========================================================================
// 7BANK MASTER CONTROL - ADMIN PORTAL LOGIC (v3.0)
// ==========================================================================

let allUsersCache = [];
let allBanksCache = [];
let allGatewaysCache = [];
let currentAdminTab = 'stats';

// Supported Banks Metadata for visual display
const BANK_META = {
  timo: { name: 'Timo Digital Bank', color: '#a855f7', logo: '/images/timo.png' },
  tpbank: { name: 'TPBank', color: '#a855f7', logo: '/images/tpbank.png' },
  mbbank: { name: 'MBBank Quân Đội', color: '#005baa', logo: '/images/mbbank.png' },
  mb: { name: 'MBBank Quân Đội', color: '#005baa', logo: '/images/mbbank.png' },
  vcb: { name: 'Vietcombank', color: '#008a00', logo: '/images/vietcombank.png' },
  vietcombank: { name: 'Vietcombank', color: '#008a00', logo: '/images/vietcombank.png' },
  acb: { name: 'ACB Á Châu', color: '#008fe5', logo: '/images/acb.png' },
  bidv: { name: 'BIDV SmartBanking', color: '#0066b3', logo: '/images/bidv.png' },
  viettin: { name: 'VietinBank iPay', color: '#005baa', logo: '/images/vietinbank.png' },
  vietinbank: { name: 'VietinBank iPay', color: '#005baa', logo: '/images/vietinbank.png' },
  techcombank: { name: 'Techcombank Mobile', color: '#ea0029', logo: '/images/techcombank.jpg' },
  zalopay: { name: 'Ví ZaloPay', color: '#008fe5', logo: '/images/zalopay.png' },
  viettel: { name: 'Viettel Money', color: '#ee0033', logo: '/images/viettel.png' },
  viettelpay: { name: 'Viettel Money', color: '#ee0033', logo: '/images/viettel.png' },
  msb: { name: 'MSB Bank', color: '#ea580c', logo: '/images/msb.png' },
  ocb: { name: 'OCB Omni', color: '#16a34a', logo: '/images/ocb.png' },
  bvbank: { name: 'BVBank (Bản Việt)', color: '#0284c7', logo: '/images/bvbank.png' },
  pgbank: { name: 'PGBank Omni', color: '#0083ca', logo: '/images/pgbank.png' },
  pg: { name: 'PGBank Omni', color: '#0083ca', logo: '/images/pgbank.png' },
  eximbank: { name: 'Eximbank Edigi', color: '#005baa', logo: '/images/eximbank.png' },
  eib: { name: 'Eximbank Edigi', color: '#005baa', logo: '/images/eximbank.png' }
};

// 1. DOM Content Loaded Entrypoint
window.addEventListener('DOMContentLoaded', async () => {
  startLiveClock();

  const token = localStorage.getItem('auth_token') || localStorage.getItem('7bank_token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  // Verify Admin Permissions
  try {
    const profileRes = await fetchWithAuth('/auth/profile');
    if (!profileRes || profileRes.status !== 'success' || !profileRes.user) {
      clearAuth();
      return;
    }

    const u = profileRes.user;
    const isAdmin = u.isAdmin || u.level === '1' || u.level === 'admin' || (u.email && u.email.toLowerCase() === 'duongle26.1025@gmail.com');
    if (!isAdmin) {
      alert('⚠️ Bạn không có quyền truy cập trang quản trị! Đang quay lại trang cá nhân...');
      window.location.href = '/index.html';
      return;
    }

    // Set User Profile Display
    const nameEl = document.getElementById('admin-user-name');
    const avatarEl = document.getElementById('admin-avatar-char');
    if (nameEl) nameEl.textContent = u.username || 'Admin';
    if (avatarEl) {
      const initial = (u.username || 'AD').substring(0, 2).toUpperCase();
      avatarEl.textContent = initial;
    }

    // Load Initial Data
    await loadAdminStats();
    await loadAdminUsers();
    await loadAdminGateways();
    await loadAdminBanks();
    await loadAdminDepositAccounts();
    await loadAdminSettings();
    await loadAdminLogs();
    await loadSystemVersionInfo();

  } catch (err) {
    console.error('Lỗi xác thực quyền admin:', err);
    window.location.href = '/login.html';
  }
});

// Live Digital Clock
function startLiveClock() {
  const clockEl = document.getElementById('admin-live-clock');
  function tick() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('vi-VN') + ' • ' + now.toLocaleDateString('vi-VN');
    }
  }
  tick();
  setInterval(tick, 1000);
}

// Sidebar Drawer Toggle for Mobile
function toggleAdminSidebar() {
  const sidebar = document.getElementById('admin-sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// Navigation Tab Switcher
function switchAdminNav(tabKey, element) {
  currentAdminTab = tabKey;

  // Update Nav Links
  document.querySelectorAll('.admin-nav-link').forEach(el => el.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    const target = document.querySelector(`.admin-nav-link[onclick*="'${tabKey}'"]`);
    if (target) target.classList.add('active');
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('admin-sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Hide all sections
  const sections = ['stats', 'users', 'gateways', 'banks', 'deposit-accounts', 'plans', 'logs', 'captcha', 'settings'];
  sections.forEach(s => {
    const secEl = document.getElementById(`sec-admin-${s}`);
    if (secEl) secEl.style.display = s === tabKey ? 'block' : 'none';
  });

  // Update Topbar Titles
  const titleMap = {
    stats: { title: 'Tổng Quan & Phân Tích Hệ Thống', sub: 'Báo cáo thời gian thực về thành viên, doanh thu và 11 cổng API' },
    users: { title: 'Quản Lý Thành Viên & Phân Quyền', sub: 'Xem danh sách, nạp/trừ tiền trực tiếp, gia hạn và phân quyền admin' },
    gateways: { title: 'Quản Lý Trạng Thái Cổng API (11 Cổng)', sub: 'Chỉnh trực tiếp trạng thái Hoạt động, Bảo trì hoặc Sắp ra mắt cho các cổng ngân hàng & ví điện tử' },
    banks: { title: 'Tất Cả Tài Khoản Kết Nối', sub: 'Giám sát 11 cổng ngân hàng (Timo, TPBank, MB, VCB, ACB, BIDV...)' },
    'deposit-accounts': { title: 'Cấu Hình Tài Khoản Nạp Tiền Hệ Thống (Auto VietQR)', sub: 'Quản lý các tài khoản nhận nạp tiền riêng biệt, hoàn toàn độc lập với tài khoản người dùng thêm ở web' },
    plans: { title: 'Quản Lý Các Gói Dịch Vụ API', sub: 'Chỉnh sửa giá gói theo tháng, số cổng được phép dùng và số tài khoản của gói' },
    logs: { title: 'Nhật Ký Biến Động & Audit Logs', sub: 'Theo dõi toàn bộ lịch sử cộng trừ tiền ví và tác vụ quản trị' },
    captcha: { title: 'Quản Lý Thuê API Giải Captcha OCR (AI Neural Network)', sub: 'Bảng điều khiển kinh doanh API Captcha, tùy chỉnh cước phí mỗi lượt và xem nhật ký giao dịch' },
    settings: { title: 'Cấu Hình Máy Chủ & Khóa API', sub: 'Tùy chỉnh thông số API Captcha OCR, Pusher và tài khoản nhận nạp' }
  };

  if (titleMap[tabKey]) {
    document.getElementById('admin-heading-title').textContent = titleMap[tabKey].title;
    document.getElementById('admin-heading-sub').textContent = titleMap[tabKey].sub;
  }

  if (tabKey === 'deposit-accounts') {
    loadAdminDepositAccounts();
  } else if (tabKey === 'plans') {
    loadAdminPlans();
  } else if (tabKey === 'captcha') {
    loadAdminCaptchaLogs();
  }
}

// Quick Refresh Button Handler
async function refreshAdminData() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('fa-spin');
  try {
    if (currentAdminTab === 'stats') await loadAdminStats();
    else if (currentAdminTab === 'users') await loadAdminUsers();
    else if (currentAdminTab === 'gateways') await loadAdminGateways();
    else if (currentAdminTab === 'banks') await loadAdminBanks();
    else if (currentAdminTab === 'deposit-accounts') await loadAdminDepositAccounts();
    else if (currentAdminTab === 'plans') await loadAdminPlans();
    else if (currentAdminTab === 'logs') await loadAdminLogs();
    else if (currentAdminTab === 'settings') await loadAdminSettings();
    showToast('✨ Đã làm mới dữ liệu thành công!', 'success');
  } catch (_) {
    showToast('Lỗi khi làm mới dữ liệu', 'error');
  } finally {
    if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 600);
  }
}

// ==========================================================================
// 1. TAB 1: THỐNG KÊ & ANALYTICS (STATS)
// ==========================================================================
async function loadAdminStats() {
  try {
    const res = await fetchWithAuth('/admin/stats');
    if (!res || res.status !== 'success' || !res.data) return;
    const d = res.data;

    // Update KPIs
    setText('stat-total-users', d.totalUsers || 0);
    setText('badge-total-users', d.totalUsers || 0);
    setText('stat-admin-count', `${d.adminUsersCount || 0} Admin`);
    setText('stat-banned-count', `${d.bannedUsers || 0} Bị khóa`);

    setText('stat-total-banks', d.totalBankAccounts || 0);
    setText('badge-total-banks', d.totalBankAccounts || 0);
    setText('stat-active-banks', `${d.activeBankAccounts || 0} cổng Online 24/7`);

    setText('stat-total-money', formatMoney(d.totalMoney || 0));
    setText('stat-total-deposited', formatMoney(d.totalDeposited || 0));

    // Server Health
    const uptimeSec = Math.floor(d.uptime || 0);
    const uptimeHrs = Math.floor(uptimeSec / 3600);
    const uptimeMins = Math.floor((uptimeSec % 3600) / 60);
    setText('server-uptime', `${uptimeHrs}h ${uptimeMins}m (${uptimeSec}s)`);

    const memRssMB = d.memoryUsage?.rss ? Math.round(d.memoryUsage.rss / 1024 / 1024) : '--';
    setText('server-memory', `${memRssMB} MB`);
    setText('server-node-ver', `${d.nodeVersion || 'v20'} (${d.platform || 'win32'})`);

    // Render Bank Distribution List
    renderBankDistribution(d.bankAgg || []);

    // Render Recent Users
    renderRecentUsers(d.recentUsers || []);

  } catch (err) {
    console.error('Lỗi nạp thống kê admin:', err);
  }
}

function renderBankDistribution(bankAgg) {
  const container = document.getElementById('bank-distribution-list');
  if (!container) return;

  const banksSupported = ['timo', 'tpbank', 'mbbank', 'vcb', 'acb', 'bidv', 'viettin', 'techcombank', 'msb', 'zalopay', 'viettel', 'ocb', 'bvbank', 'pgbank', 'eximbank'];
  
  const map = {};
  bankAgg.forEach(item => {
    const code = (item._id || '').toLowerCase();
    map[code] = item;
  });

  const total = bankAgg.reduce((acc, curr) => acc + (curr.count || 0), 0) || 1;

  container.innerHTML = banksSupported.map(code => {
    const meta = BANK_META[code] || { name: code.toUpperCase(), color: '#38bdf8', logo: '/images/bank.png' };
    const stat = map[code] || { count: 0, activeCount: 0 };
    const pct = Math.round((stat.count / total) * 100);

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px;">
        <div style="display: flex; align-items: center; gap: 8px; width: 160px;">
          <img src="${meta.logo}" style="width: 20px; height: 20px; object-fit: contain; border-radius: 4px;" alt="${meta.name}">
          <span style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--admin-text-main);">${meta.name}</span>
        </div>
        <div style="flex: 1; background: #e2e8f0; height: 6px; border-radius: 4px; overflow: hidden; position: relative;">
          <div style="width: ${stat.count ? Math.max(pct, 5) : 0}%; background: ${meta.color}; height: 100%; border-radius: 4px;"></div>
        </div>
        <div style="font-family: var(--admin-font-mono); font-size: 12px; width: 85px; text-align: right;">
          <b style="color: var(--admin-text-main);">${stat.count}</b> <span style="color: #00a65a; font-size: 11px; font-weight: 700;">(${stat.activeCount} on)</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderRecentUsers(recent) {
  const container = document.getElementById('recent-users-list');
  if (!container) return;

  if (!recent.length) {
    container.innerHTML = `<div style="text-align: center; color: var(--admin-text-dim); padding: 16px;">Chưa có thành viên mới.</div>`;
    return;
  }

  container.innerHTML = recent.map(u => {
    const roleBadge = (u.level === 'admin' || u.level === '1')
      ? `<span class="badge-pill badge-pill-admin">ADMIN</span>`
      : `<span class="badge-pill badge-pill-info">MEMBER</span>`;

    const initial = (u.username || 'U').substring(0, 2).toUpperCase();
    const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'Mới';

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 34px; height: 34px; border-radius: 8px; background: #f0fdf4; border: 1px solid #a7f3d0; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: #00a65a;">
            ${initial}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 13px; color: var(--admin-text-main);">${u.username}</div>
            <div style="font-size: 11px; color: var(--admin-text-dim);">${u.email || 'Chưa có email'}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${roleBadge}
          <span style="font-size: 11px; color: var(--admin-text-muted); font-family: var(--admin-font-mono);">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// 2. TAB 2: QUẢN LÝ THÀNH VIÊN (USERS)
// ==========================================================================
async function loadAdminUsers() {
  try {
    const res = await fetchWithAuth('/admin/users');
    if (!res || res.status !== 'success' || !res.data) return;
    allUsersCache = res.data || [];
    applyUserFilters();
  } catch (err) {
    console.error('Lỗi nạp danh sách user:', err);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('admin-users-tbody');
  const countBadge = document.getElementById('user-count-badge');
  if (countBadge) countBadge.textContent = `${users.length} thành viên`;
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--admin-text-dim);">
          <i class="fa-solid fa-user-slash" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          Không tìm thấy thành viên phù hợp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isAdmin = u.level === 'admin' || u.level === '1' || (u.email && u.email.toLowerCase() === 'duongle26.1025@gmail.com');
    const isBanned = u.banned === 1;

    const roleBadge = isAdmin
      ? `<span class="badge-pill badge-pill-admin"><i class="fa-solid fa-shield-halved"></i> Admin</span>`
      : `<span class="badge-pill badge-pill-info">Thành viên</span>`;

    const statusBadge = isBanned
      ? `<span class="badge-pill badge-pill-danger"><i class="fa-solid fa-lock"></i> Đã khóa</span>`
      : `<span class="badge-pill badge-pill-success"><i class="fa-solid fa-circle-check"></i> Hoạt động</span>`;

    // Time Momo Expiry
    const now = Math.floor(Date.now() / 1000);
    const exp = u.timeMomo || 0;
    let expDisplay = '';
    if (exp <= now) {
      expDisplay = `<span style="color: #f87171; font-weight: 700; font-size: 12px;">Hết hạn</span>`;
    } else {
      const daysLeft = Math.ceil((exp - now) / 86400);
      expDisplay = `<span style="color: ${daysLeft > 10 ? '#34d399' : '#fbbf24'}; font-weight: 700; font-family: var(--admin-font-mono);">Còn ${daysLeft} ngày</span>`;
    }

    const initial = (u.username || 'U').substring(0, 2).toUpperCase();

    // Cấu hình trạng thái thông báo Tele / Zalo / Cả hai
    const teleOn = !!u.telegramNotifyEnabled;
    const teleHasChatId = !!u.telegramChatId;
    const zaloOn = !!u.zaloNotifyEnabled;
    const zaloHasChatId = !!u.zaloChatId;
    const allOn = teleOn && zaloOn;

    const teleTooltip = teleHasChatId
      ? `Telegram: ${teleOn ? 'Đang BẬT' : 'Đang TẮT'} (Chat ID: ${escapeHtml(u.telegramChatId)}) - Bấm để ${teleOn ? 'TẮT' : 'BẬT'}`
      : `Telegram: ${teleOn ? 'Đang BẬT' : 'Đang TẮT'} (Chưa kết nối Chat ID) - Bấm để ${teleOn ? 'TẮT' : 'BẬT'}`;

    const zaloTooltip = zaloHasChatId
      ? `Zalo Bot: ${zaloOn ? 'Đang BẬT' : 'Đang TẮT'} (Chat ID: ${escapeHtml(u.zaloChatId)}) - Bấm để ${zaloOn ? 'TẮT' : 'BẬT'}`
      : `Zalo Bot: ${zaloOn ? 'Đang BẬT' : 'Đang TẮT'} (Chưa kết nối Chat ID) - Bấm để ${zaloOn ? 'TẮT' : 'BẬT'}`;

    const bothTooltip = allOn
      ? 'Cả hai kênh Tele & Zalo đang BẬT - Bấm để TẮT CẢ HAI'
      : 'Bấm để BẬT CẢ HAI kênh thông báo Tele & Zalo';

    const notifyControlsHtml = `
      <div class="notify-toggle-group">
        <button type="button" class="btn-notify-pill ${teleOn ? 'active' : 'off'} tele" onclick="toggleUserNotify('${u._id}', 'telegram')" title="${teleTooltip}">
          <i class="fa-brands fa-telegram"></i> <span>Tele</span>
          ${teleOn ? '<i class="fa-solid fa-check" style="font-size: 9px;"></i>' : '<i class="fa-solid fa-xmark" style="font-size: 9px; opacity: 0.6;"></i>'}
          ${!teleHasChatId ? '<span class="badge-no-chatid" title="Chưa liên kết Telegram Chat ID">!</span>' : ''}
        </button>

        <button type="button" class="btn-notify-pill ${zaloOn ? 'active' : 'off'} zalo" onclick="toggleUserNotify('${u._id}', 'zalo')" title="${zaloTooltip}">
          <i class="fa-solid fa-comment-dots"></i> <span>Zalo</span>
          ${zaloOn ? '<i class="fa-solid fa-check" style="font-size: 9px;"></i>' : '<i class="fa-solid fa-xmark" style="font-size: 9px; opacity: 0.6;"></i>'}
          ${!zaloHasChatId ? '<span class="badge-no-chatid" title="Chưa liên kết Zalo Chat ID">!</span>' : ''}
        </button>

        <button type="button" class="btn-notify-both ${allOn ? 'all-on' : 'has-off'}" onclick="toggleUserNotify('${u._id}', 'both')" title="${bothTooltip}">
          ${allOn ? '<i class="fa-solid fa-toggle-on"></i> Cả 2' : '<i class="fa-solid fa-toggle-off"></i> Cả 2'}
        </button>
      </div>
    `;

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; border-radius: 9px; background: ${isAdmin ? '#fee2e2' : '#f0fdf4'}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: ${isAdmin ? '#b91c1c' : '#00a65a'}; border: 1px solid ${isAdmin ? '#fca5a5' : '#a7f3d0'};">
              ${initial}
            </div>
            <div>
              <div style="font-weight: 700; color: var(--admin-text-main);">${escapeHtml(u.username)}</div>
              <div style="font-size: 11px; color: var(--admin-text-dim); font-family: var(--admin-font-mono);">ID: ${u._id.slice(-6)}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="font-size: 13px; color: var(--admin-text-body); font-weight: 500;">${u.email ? escapeHtml(u.email) : '<span style="color: var(--admin-text-dim);">---</span>'}</div>
          <div style="font-size: 11px; color: var(--admin-text-dim); font-family: var(--admin-font-mono);">${u.phone ? escapeHtml(u.phone) : ''}</div>
        </td>
        <td>
          <span style="font-size: 14px; font-weight: 800; color: #00a65a; font-family: var(--admin-font-mono);">${formatMoney(u.money || 0)}</span>
        </td>
        <td>${expDisplay}</td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">${notifyControlsHtml}</td>
        <td>
          <div class="table-btn-group">
            <button class="btn-mini btn-mini-green" onclick="openAdjustBalanceModal('${u._id}')" title="Cộng / Trừ tiền">
              <i class="fa-solid fa-coins"></i> Nạp/Trừ
            </button>
            <button class="btn-mini btn-mini-amber" onclick="openExtendModal('${u._id}')" title="Gia hạn ngày">
              <i class="fa-solid fa-clock"></i> +Ngày
            </button>
            <button class="btn-mini" onclick="toggleAdminRole('${u._id}')" title="${isAdmin ? 'Hạ cấp xuống Member' : 'Nâng cấp lên Admin'}">
              <i class="fa-solid fa-crown" style="color: ${isAdmin ? '#f59e0b' : '#94a3b8'};"></i>
            </button>
            <button class="btn-mini ${isBanned ? 'btn-mini-green' : 'btn-mini-danger'}" onclick="toggleBanUser('${u._id}')" title="${isBanned ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}">
              <i class="fa-solid ${isBanned ? 'fa-lock-open' : 'fa-lock'}"></i>
            </button>
            <button class="btn-mini" onclick="openEditUserModal('${u._id}')" title="Chỉnh sửa thông tin">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-mini btn-mini-danger" onclick="deleteUser('${u._id}', '${escapeHtml(u.username)}')" title="Xóa tài khoản">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function handleUserSearch(query) {
  applyUserFilters();
}

function applyUserFilters() {
  const query = (document.getElementById('user-search-input')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('user-filter-role')?.value || 'all';
  const statusFilter = document.getElementById('user-filter-status')?.value || 'all';

  let filtered = allUsersCache.filter(u => {
    // Search
    const matchQuery = !query ||
      (u.username && u.username.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.phone && u.phone.includes(query));

    // Role
    const isAdmin = u.level === 'admin' || u.level === '1' || (u.email && u.email.toLowerCase() === 'duongle26.1025@gmail.com');
    const matchRole = roleFilter === 'all' ||
      (roleFilter === 'admin' && isAdmin) ||
      (roleFilter === 'member' && !isAdmin);

    // Status
    const isBanned = u.banned === 1;
    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && !isBanned) ||
      (statusFilter === 'banned' && isBanned);

    return matchQuery && matchRole && matchStatus;
  });

  renderUsersTable(filtered);
}

// User Actions: Adjust Balance Modal
function openAdjustBalanceModal(userId) {
  const user = allUsersCache.find(u => u._id === userId);
  if (!user) return;

  document.getElementById('adjust-user-id').value = user._id;
  document.getElementById('adjust-username-label').textContent = user.username;
  document.getElementById('adjust-current-balance-label').textContent = formatMoney(user.money || 0);
  document.getElementById('adjust-amount').value = '';
  document.getElementById('adjust-reason').value = '';
  document.getElementById('adjust-type').value = 'add';

  document.getElementById('modal-adjust-balance').classList.add('active');
}

function closeAdjustBalanceModal() {
  document.getElementById('modal-adjust-balance').classList.remove('active');
}

async function submitAdjustBalance(e) {
  e.preventDefault();
  const id = document.getElementById('adjust-user-id').value;
  const type = document.getElementById('adjust-type').value;
  const amount = document.getElementById('adjust-amount').value;
  const reason = document.getElementById('adjust-reason').value.trim();

  try {
    const res = await fetchWithAuth(`/admin/users/${id}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify({ amount, type, reason })
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã cập nhật số dư ví thành công!', 'success');
      closeAdjustBalanceModal();
      await loadAdminUsers();
      await loadAdminStats();
      await loadAdminLogs();
    } else {
      showToast(res?.msg || 'Cập nhật số dư thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi cập nhật số dư', 'error');
  }
}

// User Actions: Extend Subscription Modal
function openExtendModal(userId) {
  const user = allUsersCache.find(u => u._id === userId);
  if (!user) return;

  const now = Math.floor(Date.now() / 1000);
  const exp = user.timeMomo || 0;
  const daysLeft = exp > now ? Math.ceil((exp - now) / 86400) : 0;

  document.getElementById('extend-user-id').value = user._id;
  document.getElementById('extend-username-label').textContent = user.username;
  document.getElementById('extend-expiry-label').textContent = daysLeft > 0 ? `Còn ${daysLeft} ngày` : 'Đã hết hạn';
  document.getElementById('extend-days').value = '30';

  document.getElementById('modal-extend-subscription').classList.add('active');
}

function closeExtendModal() {
  document.getElementById('modal-extend-subscription').classList.remove('active');
}

async function submitExtendSubscription(e) {
  e.preventDefault();
  const id = document.getElementById('extend-user-id').value;
  const days = document.getElementById('extend-days').value;

  try {
    const res = await fetchWithAuth(`/admin/users/${id}/extend-subscription`, {
      method: 'POST',
      body: JSON.stringify({ days })
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã gia hạn cước thành công!', 'success');
      closeExtendModal();
      await loadAdminUsers();
    } else {
      showToast(res?.msg || 'Gia hạn thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi gia hạn cước', 'error');
  }
}

// Toggle Admin Role
async function toggleAdminRole(userId) {
  const user = allUsersCache.find(u => u._id === userId);
  if (!user) return;
  const willBeAdmin = !(user.level === 'admin' || user.level === '1');
  if (!confirm(`Bạn có chắc muốn ${willBeAdmin ? 'CẤP QUYỀN ADMIN' : 'HỦY QUYỀN ADMIN'} cho "${user.username}"?`)) return;

  try {
    const res = await fetchWithAuth(`/admin/users/${userId}/toggle-role`, { method: 'POST' });
    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã cập nhật cấp bậc thành viên!', 'success');
      await loadAdminUsers();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Thao tác thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// Toggle Ban / Unban
async function toggleBanUser(userId) {
  const user = allUsersCache.find(u => u._id === userId);
  if (!user) return;
  const actionText = user.banned === 1 ? 'MỞ KHÓA' : 'KHÓA';
  if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${user.username}"?`)) return;

  try {
    const res = await fetchWithAuth(`/admin/users/${userId}/toggle-ban`, { method: 'POST' });
    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã cập nhật trạng thái tài khoản!', 'success');
      await loadAdminUsers();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Thao tác thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// Bật / Tắt thông báo biến động số dư (Tele / Zalo / Cả hai) tức thì từ bảng
async function toggleUserNotify(userId, channel) {
  const user = allUsersCache.find(u => u._id === userId);
  if (!user) return;

  try {
    const res = await fetchWithAuth(`/admin/users/${userId}/toggle-notify`, {
      method: 'POST',
      body: JSON.stringify({ channel })
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã cập nhật trạng thái nhận thông báo!', 'success');
      if (res.data) {
        user.telegramNotifyEnabled = res.data.telegramNotifyEnabled;
        user.zaloNotifyEnabled = res.data.zaloNotifyEnabled;
      }
      applyUserFilters();
    } else {
      showToast(res?.msg || 'Cập nhật trạng thái thông báo thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi cập nhật thông báo', 'error');
  }
}

// Edit User Full Info Modal
function openEditUserModal(userId) {
  const user = allUsersCache.find(u => u._id === userId);
  if (!user) return;

  document.getElementById('edit-user-id').value = user._id;
  document.getElementById('edit-user-username').value = user.username;
  document.getElementById('edit-user-email').value = user.email || '';
  document.getElementById('edit-user-phone').value = user.phone || '';
  document.getElementById('edit-user-level').value = (user.level === '1' || user.level === 'admin') ? 'admin' : 'member';
  document.getElementById('edit-user-banned').value = user.banned || 0;
  document.getElementById('edit-user-password').value = '';

  // Nạp trạng thái Telegram và Zalo Bot
  const teleSelect = document.getElementById('edit-user-telegram-notify');
  if (teleSelect) teleSelect.value = user.telegramNotifyEnabled ? '1' : '0';
  const teleHint = document.getElementById('edit-user-telegram-hint');
  if (teleHint) {
    teleHint.innerHTML = user.telegramChatId 
      ? `<span style="color: #38bdf8;">Chat ID: <b>${escapeHtml(user.telegramChatId)}</b></span>`
      : `<span style="color: #fbbf24;">⚠️ Chưa liên kết Telegram</span>`;
  }

  const zaloSelect = document.getElementById('edit-user-zalo-notify');
  if (zaloSelect) zaloSelect.value = user.zaloNotifyEnabled ? '1' : '0';
  const zaloHint = document.getElementById('edit-user-zalo-hint');
  if (zaloHint) {
    zaloHint.innerHTML = user.zaloChatId 
      ? `<span style="color: #60a5fa;">Chat ID: <b>${escapeHtml(user.zaloChatId)}</b></span>`
      : `<span style="color: #fbbf24;">⚠️ Chưa liên kết Zalo</span>`;
  }

  document.getElementById('modal-edit-user').classList.add('active');
}

function closeEditUserModal() {
  document.getElementById('modal-edit-user').classList.remove('active');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('edit-user-id').value;
  const email = document.getElementById('edit-user-email').value.trim();
  const phone = document.getElementById('edit-user-phone').value.trim();
  const level = document.getElementById('edit-user-level').value;
  const banned = document.getElementById('edit-user-banned').value;
  const password = document.getElementById('edit-user-password').value;

  const teleSelect = document.getElementById('edit-user-telegram-notify');
  const zaloSelect = document.getElementById('edit-user-zalo-notify');

  const payload = {
    email,
    phone,
    level,
    banned,
    telegramNotifyEnabled: teleSelect ? teleSelect.value === '1' : false,
    zaloNotifyEnabled: zaloSelect ? zaloSelect.value === '1' : false,
  };
  if (password) payload.password = password;

  try {
    const res = await fetchWithAuth(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (res && res.status === 'success') {
      showToast('Cập nhật thông tin thành viên thành công!', 'success');
      closeEditUserModal();
      await loadAdminUsers();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Cập nhật thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi cập nhật', 'error');
  }
}

// Create User Directly
function openCreateUserModal() {
  document.getElementById('create-user-username').value = '';
  document.getElementById('create-user-email').value = '';
  document.getElementById('create-user-phone').value = '';
  document.getElementById('create-user-password').value = '';
  document.getElementById('create-user-level').value = 'member';
  document.getElementById('modal-create-user').classList.add('active');
}

function closeCreateUserModal() {
  document.getElementById('modal-create-user').classList.remove('active');
}

async function handleCreateUser(e) {
  e.preventDefault();
  const username = document.getElementById('create-user-username').value.trim();
  const email = document.getElementById('create-user-email').value.trim();
  const phone = document.getElementById('create-user-phone').value.trim();
  const password = document.getElementById('create-user-password').value;
  const level = document.getElementById('create-user-level').value;

  try {
    const res = await fetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, phone, password })
    });
    const data = await res.json();

    if (data && data.status === 'success') {
      const newId = data.data?.id;
      if (newId && level === 'admin') {
        await fetchWithAuth(`/admin/users/${newId}/toggle-role`, { method: 'POST' });
      }
      showToast(`🎉 Tạo thành viên "${username}" thành công!`, 'success');
      closeCreateUserModal();
      await loadAdminUsers();
      await loadAdminStats();
    } else {
      showToast(data.msg || 'Tạo thành viên thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi tạo thành viên', 'error');
  }
}

// Delete User
async function deleteUser(userId, username) {
  if (!confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA VĨNH VIỄN thành viên "${username}" và toàn bộ tài khoản ngân hàng liên kết?`)) {
    return;
  }

  try {
    const res = await fetchWithAuth(`/admin/users/${userId}`, { method: 'DELETE' });
    if (res && res.status === 'success') {
      showToast(`Đã xóa thành viên "${username}" khỏi hệ thống`, 'success');
      await loadAdminUsers();
      await loadAdminStats();
      await loadAdminBanks();
    } else {
      showToast(res?.msg || 'Xóa thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// ==========================================================================
// QUẢN LÝ TRẠNG THÁI CỔNG API (11 CỔNG: HOẠT ĐỘNG / BẢO TRÌ / SẮP RA MẮT)
// ==========================================================================
async function loadAdminGateways() {
  try {
    const res = await fetchWithAuth('/admin/gateways');
    if (!res || res.status !== 'success' || !res.data) return;
    allGatewaysCache = res.data || [];

    // Calculate metrics
    const total = allGatewaysCache.length;
    const activeCount = allGatewaysCache.filter(g => g.status === 'active').length;
    const maintCount = allGatewaysCache.filter(g => g.status === 'maintenance').length;
    const comingCount = allGatewaysCache.filter(g => g.status === 'coming_soon').length;
    const disabledCount = allGatewaysCache.filter(g => g.status === 'disabled').length;

    setText('gw-stat-total', total);
    setText('gw-stat-active', `${activeCount} Cổng`);
    setText('gw-stat-maintenance', `${maintCount} Cổng`);
    setText('gw-stat-coming-soon', `${comingCount} Cổng`);
    setText('gw-stat-disabled', `${disabledCount} Cổng`);
    setText('gw-badge-count', `${total} cổng`);

    const badgeStatus = document.getElementById('badge-gateways-status');
    if (badgeStatus) {
      badgeStatus.textContent = `${activeCount}/${total}`;
      if (disabledCount > 0) {
        badgeStatus.style.background = 'rgba(239, 68, 68, 0.2)';
        badgeStatus.style.color = '#f87171';
      } else if (maintCount > 0) {
        badgeStatus.style.background = 'rgba(245, 158, 11, 0.2)';
        badgeStatus.style.color = '#fbbf24';
      } else {
        badgeStatus.style.background = 'rgba(16, 185, 129, 0.2)';
        badgeStatus.style.color = '#34d399';
      }
    }

    filterGateways();
  } catch (err) {
    console.error('Lỗi nạp danh sách cổng API:', err);
  }
}

function renderGatewaysTable(gateways) {
  const tbody = document.getElementById('admin-gateways-tbody');
  if (!tbody) return;

  if (!gateways.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 36px; color: var(--admin-text-dim);">
          <i class="fa-solid fa-network-wired" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          Không tìm thấy cổng nào khớp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = gateways.map(g => {
    const code = g.code;
    const logo = g.logo || `/images/${code}.png`;
    const fallbackLogo = g.fallbackLogo || '/images/bank.png';
    const status = g.status || 'active';
    const notice = g.notice || '';
    const connectedCount = g.connectedCount || 0;

    let badgeHtml = '';
    if (status === 'active') {
      badgeHtml = `<span class="badge-pill badge-pill-success"><span class="status-pulse-dot dot-active"></span> Hoạt Động</span>`;
    } else if (status === 'maintenance') {
      badgeHtml = `<span class="badge-pill badge-pill-warning"><span class="status-pulse-dot dot-maintenance"></span> Bảo Trì</span>`;
    } else if (status === 'coming_soon') {
      badgeHtml = `<span class="badge-pill badge-pill-purple"><span class="status-pulse-dot dot-coming_soon"></span> Sắp Ra Mắt</span>`;
    } else if (status === 'disabled') {
      badgeHtml = `<span class="badge-pill badge-pill-danger"><span class="status-pulse-dot dot-disabled"></span> Tắt (Ẩn Cổng)</span>`;
    }

    return `
      <tr id="gw-row-${code}">
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${logo}" onerror="this.src='${fallbackLogo}'" style="width: 28px; height: 28px; object-fit: contain; border-radius: 7px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px;" alt="${g.name}">
            <div>
              <div style="font-weight: 700; color: var(--admin-text-main); font-size: 13.5px;">${escapeHtml(g.name)}</div>
              <div style="font-size: 11px; color: var(--admin-text-dim);">${escapeHtml(g.fullName || g.name)}</div>
            </div>
          </div>
        </td>
        <td>
          <code style="font-family: var(--admin-font-mono); font-size: 12px; color: var(--admin-primary); background: #f0fdf4; border: 1px solid #a7f3d0; padding: 2px 7px; border-radius: 5px; font-weight: 700;">${code}</code>
        </td>
        <td>
          <span style="font-family: var(--admin-font-mono); font-weight: 700; font-size: 13px; color: var(--admin-text-body);">${connectedCount} tài khoản</span>
        </td>
        <td id="gw-badge-cell-${code}">
          ${badgeHtml}
        </td>
        <td>
          <select id="gw-select-${code}" class="admin-select" style="font-size: 12px; padding: 6px 10px; font-weight: 600; min-width: 155px;" onchange="handleGatewayQuickChange('${code}', this.value)">
            <option value="active" ${status === 'active' ? 'selected' : ''}>🟢 Hoạt Động</option>
            <option value="maintenance" ${status === 'maintenance' ? 'selected' : ''}>🟡 Bảo Trì</option>
            <option value="coming_soon" ${status === 'coming_soon' ? 'selected' : ''}>🟣 Sắp Ra Mắt</option>
            <option value="disabled" ${status === 'disabled' ? 'selected' : ''}>🔴 Tắt (Ẩn Cổng)</option>
          </select>
        </td>
        <td>
          <input type="text" id="gw-notice-${code}" class="admin-search-input" style="min-width: 190px; padding: 6px 12px; background-image: none; font-size: 12px;" placeholder="Lý do bảo trì hoặc thông báo..." value="${escapeHtml(notice)}">
        </td>
        <td>
          <div class="table-btn-group">
            <button class="btn-mini btn-mini-green" onclick="saveGateway('${code}')" title="Lưu thay đổi cho cổng ${g.name}">
              <i class="fa-solid fa-floppy-disk"></i> Lưu
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterGateways() {
  const query = (document.getElementById('gw-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('gw-filter-status')?.value || 'all';

  const filtered = allGatewaysCache.filter(g => {
    const matchQuery = !query || g.name.toLowerCase().includes(query) || g.code.toLowerCase().includes(query) || (g.fullName && g.fullName.toLowerCase().includes(query));
    const matchStatus = statusFilter === 'all' || g.status === statusFilter;
    return matchQuery && matchStatus;
  });

  renderGatewaysTable(filtered);
}

function handleGatewayQuickChange(code, newStatus) {
  const badgeCell = document.getElementById(`gw-badge-cell-${code}`);
  if (badgeCell) {
    if (newStatus === 'active') {
      badgeCell.innerHTML = `<span class="badge-pill badge-pill-success"><span class="status-pulse-dot dot-active"></span> Hoạt Động</span>`;
    } else if (newStatus === 'maintenance') {
      badgeCell.innerHTML = `<span class="badge-pill badge-pill-warning"><span class="status-pulse-dot dot-maintenance"></span> Bảo Trì</span>`;
    } else if (newStatus === 'coming_soon') {
      badgeCell.innerHTML = `<span class="badge-pill badge-pill-purple"><span class="status-pulse-dot dot-coming_soon"></span> Sắp Ra Mắt</span>`;
    } else if (newStatus === 'disabled') {
      badgeCell.innerHTML = `<span class="badge-pill badge-pill-danger"><span class="status-pulse-dot dot-disabled"></span> Tắt (Ẩn Cổng)</span>`;
    }
  }
}

async function saveGateway(code) {
  const g = allGatewaysCache.find(x => x.code === code);
  const selectEl = document.getElementById(`gw-select-${code}`);
  const noticeEl = document.getElementById(`gw-notice-${code}`);
  if (!selectEl) return;

  const status = selectEl.value;
  const notice = noticeEl ? noticeEl.value.trim() : '';

  try {
    const res = await fetchWithAuth(`/admin/gateways/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ status, notice })
    });

    if (res && res.status === 'success') {
      showToast(res.msg || `Đã cập nhật trạng thái cổng ${g?.name || code}!`, 'success');
      await loadAdminGateways();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Lỗi khi cập nhật trạng thái cổng', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi cập nhật cổng', 'error');
  }
}

async function setAllGatewaysStatus(status) {
  const statusTextMap = { active: 'HOẠT ĐỘNG', maintenance: 'BẢO TRÌ', coming_soon: 'SẮP RA MẮT', disabled: 'TẮT (ẨN CỔNG)' };
  const label = statusTextMap[status] || status;
  if (!confirm(`Bạn có chắc chắn muốn chuyển TẤT CẢ 11 cổng ngân hàng sang trạng thái "${label}"?`)) return;

  try {
    const res = await fetchWithAuth('/admin/gateways/bulk', {
      method: 'POST',
      body: JSON.stringify({ status })
    });

    if (res && res.status === 'success') {
      showToast(res.msg || `Đã chuyển tất cả cổng sang trạng thái "${label}"!`, 'success');
      await loadAdminGateways();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Lỗi khi cập nhật trạng thái các cổng', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// ==========================================================================
// 3. TAB 3: TÀI KHOẢN NGÂN HÀNG KẾT NỐI (BANKS)
// ==========================================================================
async function loadAdminBanks() {
  try {
    const res = await fetchWithAuth('/admin/banks');
    if (!res || res.status !== 'success' || !res.data) return;
    allBanksCache = res.data || [];
    applyBankFilters();
  } catch (err) {
    console.error('Lỗi nạp danh sách ngân hàng:', err);
  }
}

function renderBanksTable(banks) {
  const tbody = document.getElementById('admin-banks-tbody');
  const countBadge = document.getElementById('bank-count-badge');
  if (countBadge) countBadge.textContent = `${banks.length} tài khoản`;
  if (!tbody) return;

  if (!banks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 36px; color: var(--admin-text-dim);">
          <i class="fa-solid fa-building-columns" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          Chưa có tài khoản ngân hàng nào khớp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = banks.map(b => {
    const owner = b.userId ? (b.userId.username || 'User') : `ID: ${b.legacyUserId || '---'}`;
    const ownerEmail = b.userId?.email || '';
    const bankCode = (b.bankCode || 'timo').toLowerCase();
    const meta = BANK_META[bankCode] || { name: bankCode.toUpperCase(), color: '#38bdf8', logo: '/images/bank.png' };
    const isOnline = b.status === 1;

    const statusBadge = isOnline
      ? `<span class="badge-pill badge-pill-success"><i class="fa-solid fa-circle" style="font-size: 7px;"></i> Online 24/7</span>`
      : `<span class="badge-pill badge-pill-danger"><i class="fa-solid fa-circle" style="font-size: 7px;"></i> Offline</span>`;

    const maskedToken = b.token ? `${b.token.substring(0, 10)}••••••••` : '---';

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--admin-text-main);">${escapeHtml(owner)}</div>
          <div style="font-size: 11px; color: var(--admin-text-dim);">${escapeHtml(ownerEmail)}</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="${meta.logo}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 6px;" alt="${meta.name}">
            <span style="font-weight: 700; color: ${meta.color};">${meta.name}</span>
          </div>
        </td>
        <td>
          <span style="font-family: var(--admin-font-mono); font-weight: 700; font-size: 14px; color: var(--admin-text-main);">${escapeHtml(b.accountNumber)}</span>
        </td>
        <td>
          <span style="font-weight: 600; color: var(--admin-text-body);">${b.accountName ? escapeHtml(b.accountName) : '<span style="color: var(--admin-text-dim);">---</span>'}</span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-family: var(--admin-font-mono); font-size: 11px; color: var(--admin-text-dim);">${maskedToken}</span>
            <button class="btn-mini" onclick="copyToClipboard('${b.token}', 'Đã sao chép Token ngân hàng!')" title="Sao chép Token">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="table-btn-group">
            <button class="btn-mini ${isOnline ? 'btn-mini-amber' : 'btn-mini-green'}" onclick="toggleBankStatus('${b._id}')" title="${isOnline ? 'Tạm dừng kết nối' : 'Kích hoạt lại'}">
              <i class="fa-solid ${isOnline ? 'fa-pause' : 'fa-play'}"></i> ${isOnline ? 'Tạm Dừng' : 'Bật Online'}
            </button>
            <button class="btn-mini btn-mini-danger" onclick="adminDeleteBank('${b._id}')" title="Xóa tài khoản">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function applyBankFilters() {
  const codeFilter = document.getElementById('bank-filter-code')?.value || 'all';
  const statusFilter = document.getElementById('bank-filter-status')?.value || 'all';

  let filtered = allBanksCache.filter(b => {
    const code = (b.bankCode || '').toLowerCase();
    const matchCode = codeFilter === 'all' || code === codeFilter;
    const matchStatus = statusFilter === 'all' || String(b.status) === statusFilter;
    return matchCode && matchStatus;
  });

  renderBanksTable(filtered);
}

async function toggleBankStatus(bankId) {
  try {
    const res = await fetchWithAuth(`/admin/banks/${bankId}/toggle-status`, { method: 'PUT' });
    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã thay đổi trạng thái cổng ngân hàng', 'success');
      await loadAdminBanks();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Thao tác thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ', 'error');
  }
}

async function adminDeleteBank(bankId) {
  if (!confirm('Bạn có chắc chắn muốn XÓA kết nối tài khoản ngân hàng này?')) return;
  try {
    const res = await fetchWithAuth(`/admin/banks/${bankId}`, { method: 'DELETE' });
    if (res && res.status === 'success') {
      showToast('Đã xóa tài khoản ngân hàng', 'success');
      await loadAdminBanks();
      await loadAdminStats();
    } else {
      showToast(res?.msg || 'Xóa thất bại', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// ==========================================================================
// 4. TAB 4: NHẬT KÝ BIẾN ĐỘNG & AUDIT LOGS (LOGS)
// ==========================================================================
async function loadAdminLogs() {
  try {
    const res = await fetchWithAuth('/admin/logs');
    if (!res || res.status !== 'success' || !res.data) return;

    const container = document.getElementById('admin-balance-logs-list');
    if (!container) return;

    const balanceLogs = res.data.balanceLogs || [];
    if (!balanceLogs.length) {
      container.innerHTML = `<div style="text-align: center; color: var(--admin-text-dim); padding: 24px;">Chưa có biến động số dư nào được ghi nhận.</div>`;
      return;
    }

    container.innerHTML = balanceLogs.map(l => {
      const isPlus = (l.moneyChange || 0) >= 0;
      const username = l.userId?.username || `ID: ${l.legacyUserId || '---'}`;
      const timeStr = l.createdAt ? new Date(l.createdAt).toLocaleString('vi-VN') : '---';

      return `
        <div class="audit-item">
          <div class="audit-info">
            <div class="audit-icon" style="background: ${isPlus ? '#ecfdf5' : '#fef2f2'}; color: ${isPlus ? '#00a65a' : '#ef4444'}; border: 1px solid ${isPlus ? '#a7f3d0' : '#fecaca'};">
              <i class="fa-solid ${isPlus ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
            </div>
            <div>
              <div style="font-weight: 700; color: var(--admin-text-main);">${escapeHtml(username)} <span style="font-size: 12px; font-weight: normal; color: var(--admin-text-muted);">— ${escapeHtml(l.note || 'Biến động ví')}</span></div>
              <div style="font-size: 11px; color: var(--admin-text-dim); font-family: var(--admin-font-mono); margin-top: 2px;">
                ${timeStr} • Trước: ${formatMoney(l.moneyBefore || 0)} ➔ Sau: ${formatMoney(l.moneyAfter || 0)}
              </div>
            </div>
          </div>
          <div class="${isPlus ? 'audit-delta-plus' : 'audit-delta-minus'}" style="font-size: 15px;">
            ${isPlus ? '+' : ''}${formatMoney(l.moneyChange || 0)}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Lỗi nạp nhật ký admin:', err);
  }
}

// ==========================================================================
// 5. TÀI KHOẢN NẠP TIỀN RIÊNG BIỆT (DEPOSIT ACCOUNTS) - ĐỘC LẬP VỚI WEB
// ==========================================================================
let allDepositAccountsCache = [];

async function loadAdminDepositAccounts() {
  try {
    const res = await fetchWithAuth('/admin/deposit-accounts');
    if (!res || res.status !== 'success' || !res.data) return;

    const { accounts, settings } = res.data;
    allDepositAccountsCache = accounts || [];

    // Update badges
    setText('badge-total-deposit-accounts', allDepositAccountsCache.length);
    setText('settings-deposit-count', allDepositAccountsCache.length);

    // Update general settings fields in both tabs
    if (settings) {
      setVal('dep-set-memo-prefix', settings.memo_prefix || 'NAPTIEN');
      setVal('dep-set-min-amount', settings.min_amount || 10000);
      setVal('set-deposit-memo-prefix', settings.memo_prefix || 'NAPTIEN');
      setVal('set-deposit-min-amount', settings.min_amount || 10000);
    }

    const tbody = document.getElementById('admin-deposit-accounts-tbody');
    if (!tbody) return;

    if (!allDepositAccountsCache.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 40px; color: var(--admin-text-muted);">
            <div style="font-size: 24px; margin-bottom: 8px;">💳</div>
            Chưa có tài khoản nạp tiền riêng nào.<br>
            <button class="btn-admin-action btn-admin-primary" onclick="openAddDepositAccountModal()" style="margin-top: 12px; font-size: 12px; padding: 6px 14px;">
              <i class="fa-solid fa-plus"></i> Thêm tài khoản nạp đầu tiên
            </button>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = allDepositAccountsCache.map(acc => {
      const code = (acc.bankCode || 'techcombank').toLowerCase();
      const meta = BANK_META[code] || { name: acc.bankName || code.toUpperCase(), logo: `/images/${code}.png` };
      const logoUrl = meta.logo || `/images/${code}.png`;
      const isEnabled = acc.status === 1;

      // Login status badge
      let loginBadge = '';
      if (acc.loginStatus === 'active') {
        loginBadge = `<span class="admin-badge badge-active"><i class="fa-solid fa-circle-check"></i> Đang kết nối</span>`;
      } else if (acc.loginStatus === 'pending_approval') {
        loginBadge = `<span class="admin-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;"><i class="fa-solid fa-bell"></i> Chờ OTP App</span>`;
      } else {
        const errTitle = escapeHtml(acc.loginError || 'Lỗi phiên hoặc chưa đăng nhập');
        loginBadge = `<span class="admin-badge badge-paused" title="${errTitle}"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi phiên</span>`;
      }

      // Status toggle button
      const statusBtn = isEnabled
        ? `<button class="btn-mini btn-mini-green" onclick="toggleAdminDepositAccount('${acc._id}')" title="Bấm để tắt nhận nạp"><i class="fa-solid fa-toggle-on"></i> Đang bật</button>`
        : `<button class="btn-mini" style="background: rgba(255, 255, 255, 0.08); color: var(--admin-text-muted);" onclick="toggleAdminDepositAccount('${acc._id}')" title="Bấm để bật nhận nạp"><i class="fa-solid fa-toggle-off"></i> Đã tắt</button>`;

      const lastSyncStr = acc.lastSyncAt ? new Date(acc.lastSyncAt).toLocaleString('vi-VN') : '<span style="color: var(--admin-text-dim);">Chưa quét</span>';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="${logoUrl}" style="width: 28px; height: 28px; border-radius: 6px; object-fit: contain; background: #f8fafc; border: 1px solid #e2e8f0; padding: 1px;" onerror="this.src='/images/bank.png'">
              <div>
                <div style="font-weight: 700; color: var(--admin-text-main); font-size: 13.5px;">${escapeHtml(acc.bankName || meta.name)}</div>
                <div style="font-size: 11px; color: var(--admin-text-dim);">BIN: ${acc.bin || '---'}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-family: var(--admin-font-mono); font-weight: 700; font-size: 13.5px; color: var(--admin-primary);">${escapeHtml(acc.accountNumber)}</div>
          </td>
          <td>
            <div style="font-weight: 600; text-transform: uppercase; font-size: 13px; color: var(--admin-text-main);">${escapeHtml(acc.accountName || '---')}</div>
          </td>
          <td>
            <div style="font-family: var(--admin-font-mono); font-size: 12.5px; color: var(--admin-text-main);">${escapeHtml(acc.username || acc.accountNumber)}</div>
          </td>
          <td>${loginBadge}</td>
          <td>${statusBtn}</td>
          <td style="font-size: 11.5px; color: var(--admin-text-muted);">${lastSyncStr}</td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn-mini btn-mini-green" onclick="adminSyncDepositAccount('${acc._id}', this)" title="Quét đối soát giao dịch ngay">
                <i class="fa-solid fa-arrows-rotate"></i> Quét ngay
              </button>
              <button class="btn-mini btn-mini-blue" onclick="openReloginDepositAccountModal('${acc._id}')" title="Đăng nhập lại phiên Internet Banking">
                <i class="fa-solid fa-key"></i> Đăng nhập
              </button>
              <button class="btn-mini" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;" onclick="openEditDepositAccountModal('${acc._id}')" title="Chỉnh sửa">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-mini btn-mini-red" onclick="deleteAdminDepositAccount('${acc._id}')" title="Xóa tài khoản này">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Lỗi nạp danh sách tài khoản nạp riêng:', err);
  }
}

// Modal: Thêm tài khoản nạp riêng
function openAddDepositAccountModal() {
  const modal = document.getElementById('modal-add-deposit-account');
  if (modal) {
    modal.classList.add('active');
    setVal('add-dep-stk', '');
    setVal('add-dep-name', '');
    setVal('add-dep-username', '');
    setVal('add-dep-password', '');
    document.getElementById('add-dep-stk')?.focus();
  }
}

function closeAddDepositAccountModal() {
  const modal = document.getElementById('modal-add-deposit-account');
  if (modal) modal.classList.remove('active');
}

async function handleCreateDepositAccount(e) {
  e.preventDefault();
  const bankCode = document.getElementById('add-dep-bank-code')?.value;
  const accountNumber = document.getElementById('add-dep-stk')?.value.trim();
  const accountName = document.getElementById('add-dep-name')?.value.trim().toUpperCase();
  const username = document.getElementById('add-dep-username')?.value.trim();
  const password = document.getElementById('add-dep-password')?.value;

  if (!bankCode || !accountNumber || !accountName) {
    showToast('Vui lòng điền đủ ngân hàng, STK và tên chủ tài khoản', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-add-dep');
  const originalHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang thêm & xác thực...';
  }

  try {
    const res = await fetchWithAuth('/admin/deposit-accounts', {
      method: 'POST',
      body: JSON.stringify({ bankCode, accountNumber, accountName, username, password }),
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Thêm tài khoản nhận nạp riêng thành công!', 'success');
      closeAddDepositAccountModal();
      await loadAdminDepositAccounts();
    } else {
      showToast(res?.msg || 'Lỗi thêm tài khoản nhận nạp', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi thêm tài khoản', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Modal: Chỉnh sửa tài khoản nạp riêng
function openEditDepositAccountModal(id) {
  const acc = allDepositAccountsCache.find(a => String(a._id) === String(id));
  if (!acc) return;

  setVal('edit-dep-id', acc._id);
  setVal('edit-dep-bank-info', `[${(acc.bankName || acc.bankCode).toUpperCase()}] STK: ${acc.accountNumber}`);
  setVal('edit-dep-name', acc.accountName || '');
  setVal('edit-dep-username', acc.username || acc.accountNumber);
  setVal('edit-dep-password', '');
  setVal('edit-dep-status', acc.status !== undefined ? acc.status : 1);

  const modal = document.getElementById('modal-edit-deposit-account');
  if (modal) modal.classList.add('active');
}

function closeEditDepositAccountModal() {
  const modal = document.getElementById('modal-edit-deposit-account');
  if (modal) modal.classList.remove('active');
}

async function handleUpdateDepositAccount(e) {
  e.preventDefault();
  const id = document.getElementById('edit-dep-id')?.value;
  if (!id) return;

  const payload = {
    accountName: document.getElementById('edit-dep-name')?.value.trim().toUpperCase(),
    username: document.getElementById('edit-dep-username')?.value.trim(),
    password: document.getElementById('edit-dep-password')?.value,
    status: document.getElementById('edit-dep-status')?.value,
  };

  try {
    const res = await fetchWithAuth(`/admin/deposit-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Cập nhật tài khoản nạp thành công!', 'success');
      closeEditDepositAccountModal();
      await loadAdminDepositAccounts();
    } else {
      showToast(res?.msg || 'Lỗi cập nhật', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi cập nhật', 'error');
  }
}

// Bật / Tắt nhận nạp
async function toggleAdminDepositAccount(id) {
  try {
    const res = await fetchWithAuth(`/admin/deposit-accounts/${id}/toggle`, { method: 'POST' });
    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã thay đổi trạng thái nhận nạp!', 'success');
      await loadAdminDepositAccounts();
    } else {
      showToast(res?.msg || 'Lỗi thay đổi trạng thái', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ', 'error');
  }
}

// Xóa tài khoản nạp riêng
async function deleteAdminDepositAccount(id) {
  const acc = allDepositAccountsCache.find(a => String(a._id) === String(id));
  const desc = acc ? `[${acc.bankName} - ${acc.accountNumber}]` : '';
  if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản nhận nạp ${desc} khỏi hệ thống không?`)) {
    return;
  }

  try {
    const res = await fetchWithAuth(`/admin/deposit-accounts/${id}`, { method: 'DELETE' });
    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã xóa tài khoản nhận nạp!', 'success');
      await loadAdminDepositAccounts();
    } else {
      showToast(res?.msg || 'Lỗi khi xóa', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi xóa', 'error');
  }
}

// Modal: Đăng nhập lại phiên IB
function openReloginDepositAccountModal(id) {
  const acc = allDepositAccountsCache.find(a => String(a._id) === String(id));
  if (!acc) return;

  const code = (acc.bankCode || 'techcombank').toLowerCase();
  const meta = BANK_META[code] || { name: acc.bankName || code.toUpperCase(), logo: `/images/${code}.png` };

  setVal('relogin-dep-id', acc._id);
  setText('relogin-dep-bank-name', acc.bankName || meta.name);
  setText('relogin-dep-stk', `STK: ${acc.accountNumber}`);
  setText('relogin-dep-username', acc.username || acc.accountNumber);
  setVal('relogin-dep-password', '');

  const logoImg = document.getElementById('relogin-dep-logo');
  if (logoImg) logoImg.src = meta.logo || `/images/${code}.png`;

  const statusBox = document.getElementById('relogin-dep-status-box');
  if (statusBox) {
    statusBox.style.display = 'none';
    statusBox.innerHTML = '';
  }

  const modal = document.getElementById('modal-relogin-deposit-account');
  if (modal) modal.classList.add('active');
}

function closeReloginDepositAccountModal() {
  const modal = document.getElementById('modal-relogin-deposit-account');
  if (modal) modal.classList.remove('active');
}

async function handleReloginDepositAccount(e) {
  e.preventDefault();
  const id = document.getElementById('relogin-dep-id')?.value;
  const password = document.getElementById('relogin-dep-password')?.value;
  const statusBox = document.getElementById('relogin-dep-status-box');
  const btn = document.getElementById('btn-submit-relogin-dep');

  if (statusBox) {
    statusBox.style.display = 'block';
    statusBox.style.background = 'rgba(56, 189, 248, 0.1)';
    statusBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
    statusBox.style.color = '#38bdf8';
    statusBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối tới máy chủ ngân hàng & xác thực phiên...';
  }

  const originalHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng nhập...';
  }

  try {
    const res = await fetchWithAuth(`/admin/deposit-accounts/${id}/relogin`, {
      method: 'POST',
      body: JSON.stringify({ password: password || undefined }),
    });

    if (res && res.status === 'success') {
      if (statusBox) {
        statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        statusBox.style.color = '#34d399';
        statusBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${res.msg || 'Đăng nhập thành công, phiên kết nối đã sẵn sàng!'}`;
      }
      showToast(res.msg || 'Đăng nhập thành công!', 'success');
      setTimeout(async () => {
        closeReloginDepositAccountModal();
        await loadAdminDepositAccounts();
      }, 1200);
    } else {
      if (statusBox) {
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        statusBox.style.color = '#f87171';
        statusBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${res?.msg || 'Đăng nhập thất bại'}`;
      }
      showToast(res?.msg || 'Đăng nhập thất bại', 'error');
    }
  } catch (err) {
    if (statusBox) {
      statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
      statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      statusBox.style.color = '#f87171';
      statusBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối: ${err.message}`;
    }
    showToast('Lỗi máy chủ', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Quét đối soát một tài khoản nạp riêng
async function adminSyncDepositAccount(id, btn) {
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Quét...`;
  btn.disabled = true;

  try {
    const res = await fetchWithAuth(`/admin/deposit-accounts/${id}/sync`, { method: 'POST' });
    if (res && res.status === 'success') {
      showToast(res.msg || 'Quét giao dịch hoàn tất!', 'success');
      await loadAdminDepositAccounts();
      if (res.data?.newlyCreditedCount > 0) {
        await loadAdminStats();
        await loadAdminLogs();
      }
    } else {
      showToast(res?.msg || 'Lỗi quét giao dịch', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi quét', 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

// Quét đối soát tất cả tài khoản nạp riêng
async function adminSyncAllDepositAccounts(btn) {
  if (!allDepositAccountsCache.length) {
    showToast('Chưa có tài khoản nạp riêng nào để quét', 'info');
    return;
  }

  const originalHtml = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang quét tất cả cổng...';
  }

  let totalNew = 0;
  for (const acc of allDepositAccountsCache) {
    if (acc.status === 1) {
      try {
        const res = await fetchWithAuth(`/admin/deposit-accounts/${acc._id}/sync`, { method: 'POST' });
        if (res?.data?.newlyCreditedCount) {
          totalNew += res.data.newlyCreditedCount;
        }
      } catch (_) {}
    }
  }

  showToast(`🎉 Đã quét toàn bộ các cổng nạp! Nạp mới: ${totalNew} GD`, 'success');
  await loadAdminDepositAccounts();
  if (totalNew > 0) {
    await loadAdminStats();
    await loadAdminLogs();
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// Lưu cài đặt chung nạp tiền (Cú pháp, mức nạp tối thiểu)
async function handleSaveDepositGeneralSettings(e) {
  e.preventDefault();
  const memoPrefix = document.getElementById('dep-set-memo-prefix')?.value.trim().toUpperCase() || 'NAPTIEN';
  const minAmount = parseInt(document.getElementById('dep-set-min-amount')?.value) || 10000;

  try {
    const res = await fetchWithAuth('/admin/deposit-settings', {
      method: 'POST',
      body: JSON.stringify({ memo_prefix: memoPrefix, min_amount: minAmount }),
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã lưu cấu hình nạp tiền hệ thống!', 'success');
      setVal('set-deposit-memo-prefix', memoPrefix);
      setVal('set-deposit-min-amount', minAmount);
    } else {
      showToast(res?.msg || 'Lỗi lưu cấu hình', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi lưu cấu hình', 'error');
  }
}

// ==========================================================================
// 5.5. TAB 5.5: QUẢN LÝ CÁC GÓI API & BẢNG GIÁ CỔNG BANK (PLANS)
// ==========================================================================
let allPlansCache = [];
let activePlanCode = 'starter';

const ALL_PLAN_BANK_CODES = [
  'tpbank', 'mbbank', 'vcb', 'acb', 'bidv', 'viettin', 'techcombank',
  'msb', 'timo', 'zalopay', 'viettel', 'ocb', 'bvbank', 'pgbank', 'eximbank'
];

async function loadAdminPlans() {
  const container = document.getElementById('active-plan-editor');
  const tabsContainer = document.getElementById('plan-tabs-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--admin-text-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--admin-primary);"></i>
        <p style="margin-top: 10px; font-weight: 600;">Đang tải danh sách các gói dịch vụ API & bảng giá cổng bank...</p>
      </div>
    `;
  }

  try {
    const res = await fetchWithAuth('/admin/plans');
    if (res && res.status === 'success' && Array.isArray(res.data)) {
      allPlansCache = res.data;

      // Update KPI
      setText('stat-total-plans', `${allPlansCache.length} Gói`);
      setText('badge-total-plans', allPlansCache.length);

      // Render plan tabs
      renderPlanTabs();

      // Ensure activePlanCode exists
      if (!allPlansCache.some(p => p.code === activePlanCode)) {
        activePlanCode = allPlansCache[0]?.code || 'starter';
      }

      renderActivePlanEditor();
    } else {
      if (container) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: #ef4444;">Không thể nạp dữ liệu các gói API (${res?.msg || 'Lỗi không xác định'})</div>`;
      }
    }
  } catch (err) {
    console.error('Lỗi nạp plans:', err);
    if (container) {
      container.innerHTML = `<div style="text-align: center; padding: 30px; color: #ef4444;">Lỗi kết nối máy chủ khi nạp gói API</div>`;
    }
  }
}

function renderPlanTabs() {
  const tabsContainer = document.getElementById('plan-tabs-container');
  if (!tabsContainer) return;

  tabsContainer.innerHTML = allPlansCache.map(p => {
    const isActive = p.code === activePlanCode;
    const badgeHtml = p.badge ? `<span class="plan-pill-badge" style="background: ${isActive ? 'rgba(0,166,90,0.2)' : '#e2e8f0'}; color: ${isActive ? '#00a65a' : '#475569'};">${escapeHtml(p.badge)}</span>` : '';
    return `
      <button type="button" class="plan-tab-btn ${isActive ? 'active' : ''}" onclick="switchActivePlan('${p.code}')">
        <i class="fa-solid fa-cube" style="color: ${p.color || '#00a65a'};"></i>
        <span>${escapeHtml(p.name)}</span>
        ${badgeHtml}
      </button>
    `;
  }).join('') + `
    <button type="button" class="plan-tab-btn" onclick="openAddPlanModal()" style="border-style: dashed; color: var(--admin-primary); background: #f0fdf4;">
      <i class="fa-solid fa-plus"></i>
      <span>+ Tạo Gói Mới</span>
    </button>
  `;
}

function switchActivePlan(code) {
  activePlanCode = code;
  renderPlanTabs();
  renderActivePlanEditor();
}

function renderActivePlanEditor() {
  const container = document.getElementById('active-plan-editor');
  if (!container) return;

  const plan = allPlansCache.find(p => p.code === activePlanCode);
  if (!plan) {
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--admin-text-muted);">Vui lòng chọn một gói dịch vụ để chỉnh sửa.</div>`;
    return;
  }

  // Map bank prices for quick lookup
  const bpMap = {};
  if (Array.isArray(plan.bankPrices)) {
    plan.bankPrices.forEach(bp => {
      bpMap[bp.bankCode.toLowerCase()] = bp;
    });
  }

  // Generate Bank Rows: Chỉ hiển thị Cổng ngân hàng + Được dùng trong gói + Giới hạn số TK mỗi cổng
  const bankRowsHtml = ALL_PLAN_BANK_CODES.map(bCode => {
    const meta = BANK_META[bCode] || { name: bCode.toUpperCase(), logo: '/images/tpbank.svg' };
    const bp = bpMap[bCode] || {
      bankCode: bCode,
      bankName: meta.name,
      enabled: true,
    };

    const isEnabled = bp.enabled !== false;
    const accountsLimit = plan.accountsPerBank || 1;

    return `
      <tr data-bank="${bCode}" id="row-bank-${bCode}" style="${!isEnabled ? 'opacity: 0.55; background: #fafafa;' : ''}">
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${meta.logo}" class="bank-logo-img" onerror="this.src='/images/tpbank.svg'" alt="${meta.name}">
            <div>
              <strong style="font-size: 13.5px; color: var(--admin-text-main);">${escapeHtml(meta.name)}</strong>
              <div style="font-size: 11px; color: var(--admin-text-muted); font-family: var(--admin-font-mono);">${bCode.toUpperCase()}</div>
            </div>
          </div>
        </td>
        <td style="text-align: center;">
          <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" class="bank-check-toggle" id="bp-enabled-${bCode}" ${isEnabled ? 'checked' : ''} onchange="toggleBankRowStyle('${bCode}')" title="Kích hoạt/tắt cổng này trong gói">
            <span id="label-bank-enabled-${bCode}" style="font-size: 12.5px; font-weight: 700; color: ${isEnabled ? '#15803d' : '#64748b'};">
              ${isEnabled ? 'Có trong gói' : 'Không có'}
            </span>
          </label>
        </td>
        <td style="text-align: center;">
          <span class="plan-pill-badge badge-bank-limit" style="background: rgba(0,166,90,0.12); color: #00a65a; font-weight: 700; padding: 5px 14px; border-radius: 6px; font-size: 12.5px;">
            <i class="fa-solid fa-shield-halved" style="font-size: 11px;"></i> Tối đa <strong class="val-acc-per-bank">${accountsLimit}</strong> TK
          </span>
        </td>
        <td>
          <span style="font-size: 12px; color: var(--admin-text-muted);">
            <i class="fa-solid fa-circle-check" style="color: #00a65a;"></i> Đã bao gồm trong gói cước
          </span>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Top Configuration Block of Plan -->
    <div style="background: #f8fafc; border: 1px solid var(--admin-border); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid var(--admin-border-light);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 44px; height: 44px; border-radius: 10px; background: #ffffff; border: 1px solid var(--admin-border); display: flex; align-items: center; justify-content: center; font-size: 20px; color: ${plan.color || '#00a65a'};">
            <i class="fa-solid fa-cube"></i>
          </div>
          <div>
            <h3 style="font-size: 16px; font-weight: 800; color: var(--admin-text-main);">${escapeHtml(plan.name)}</h3>
            <span style="font-size: 12px; color: var(--admin-text-muted); font-family: var(--admin-font-mono);">Mã định danh: <strong>${plan.code}</strong></span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          ${!['starter', 'pro', 'enterprise'].includes(plan.code) ? `
            <button type="button" class="btn-admin-action" onclick="deleteCurrentPlan('${plan.code}')" style="background: #fef2f2; color: #dc2626; border-color: #fca5a5;">
              <i class="fa-solid fa-trash"></i> Xóa Gói
            </button>
          ` : ''}
          <button type="button" class="btn-admin-action btn-admin-primary" onclick="saveCurrentPlanConfig()" id="btn-save-plan">
            <i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình Gói Này
          </button>
        </div>
      </div>

      <!-- General Settings Grid: Tinh Gọn & Rõ Ràng -->
      <div class="form-group-grid" style="grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin-bottom: 0;">
        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label">Tên Hiển Thị Của Gói:</label>
          <input type="text" id="cur-plan-name" class="form-control-admin" value="${escapeHtml(plan.name)}" required>
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label" style="font-weight: 700; color: #0284c7;">
            <i class="fa-solid fa-calendar-days"></i> Giá Gói / Tháng (VNĐ):
          </label>
          <input type="number" id="cur-plan-price-month" class="form-control-admin" style="font-weight: 800; font-size: 15px; color: #0284c7;" value="${plan.priceMonth || 0}" min="0" step="10000" required>
          <span style="font-size: 11px; color: var(--admin-text-muted);">Đơn giá thanh toán trọn gói theo tháng</span>
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label" style="font-weight: 700;">
            <i class="fa-solid fa-network-wired"></i> Số Cổng Được Phép Dùng:
          </label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" id="cur-plan-max-gateways" class="form-control-admin" style="font-weight: 800;" value="${plan.maxGateways || 2}" min="1" max="16" required>
            <span style="font-size: 12px; color: var(--admin-text-muted); white-space: nowrap;">Cổng tối đa</span>
          </div>
          <span style="font-size: 11px; color: var(--admin-text-muted);">Khách được chọn dùng tối đa N cổng ngân hàng</span>
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label" style="color: #00a65a; font-weight: 800;">
            <i class="fa-solid fa-users-gear"></i> Số Lượng TK Của Gói (Mỗi Cổng):
          </label>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" id="cur-plan-accounts-per-bank" class="form-control-admin" style="font-weight: 800; color: #00a65a; border-color: #86efac; background: #f0fdf4;" value="${plan.accountsPerBank || 1}" min="1" max="99" oninput="onAccountsPerBankChange(this.value)" required>
            <span style="font-size: 12px; color: #00a65a; font-weight: 700; white-space: nowrap;">TK / mỗi cổng</span>
          </div>
          <span style="font-size: 11px; color: #15803d; font-weight: 600;">Tất cả các cổng trong gói này chỉ thêm N tài khoản mỗi cổng</span>
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label">Huy Hiệu (Badge):</label>
          <input type="text" id="cur-plan-badge" class="form-control-admin" value="${escapeHtml(plan.badge || '')}" placeholder="vd: Cơ Bản, Bán Chạy, VIP...">
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label">Tần Suất Quét / Webhook:</label>
          <input type="text" id="cur-plan-scan-speed" class="form-control-admin" value="${escapeHtml(plan.scanSpeed || '10s / lần quét')}">
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label">Trạng Thái Hiển Thị:</label>
          <select id="cur-plan-status" class="admin-select" style="width: 100%;">
            <option value="active" ${plan.status === 'active' ? 'selected' : ''}>🟢 Đang Mở (Hiển thị trang khách)</option>
            <option value="hidden" ${plan.status === 'hidden' ? 'selected' : ''}>⚪ Tạm Ẩn (Không nhận mua mới)</option>
          </select>
        </div>

        <div class="form-item" style="margin-bottom: 0;">
          <label class="form-label">Màu Chủ Đạo:</label>
          <input type="color" id="cur-plan-color" class="form-control-admin" value="${plan.color || '#00a65a'}" style="height: 44px; padding: 4px;">
        </div>
      </div>

      <div class="form-item" style="margin-top: 14px; margin-bottom: 0;">
        <label class="form-label">Mô Tả Tóm Tắt Gói:</label>
        <input type="text" id="cur-plan-desc" class="form-control-admin" value="${escapeHtml(plan.description || '')}" placeholder="Mô tả tóm tắt quyền lợi của gói...">
      </div>
    </div>

    <!-- Bank Gateway Selection Table Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
      <div>
        <h4 style="font-size: 15px; font-weight: 800; color: var(--admin-text-main); display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-list-check" style="color: #00a65a;"></i> Danh Sách Cổng Ngân Hàng Được Phép Dùng Trong Gói Này
        </h4>
        <p style="font-size: 12.5px; color: var(--admin-text-muted); margin-top: 2px;">
          Tích chọn các cổng ngân hàng được bao gồm trong <strong>${escapeHtml(plan.name)}</strong>. Khách mua gói sẽ được dùng các cổng đã chọn, mỗi cổng được thêm tối đa <strong><span class="val-acc-per-bank">${plan.accountsPerBank || 1}</span> tài khoản</strong>.
        </p>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <button type="button" class="btn-mini btn-mini-green" onclick="bulkToggleBankGateways(true)"><i class="fa-solid fa-check-double"></i> Chọn Tất Cả 16 Cổng</button>
        <button type="button" class="btn-mini" onclick="bulkToggleBankGateways(false)"><i class="fa-solid fa-xmark"></i> Bỏ Chọn Hết</button>
      </div>
    </div>

    <!-- Table of Bank Gateways: Gọn Gàng, Rõ Ràng -->
    <div class="table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th style="min-width: 220px;">Cổng Ngân Hàng</th>
            <th style="text-align: center; min-width: 160px;">Được Dùng Trong Gói</th>
            <th style="text-align: center; min-width: 180px;">Số TK Được Thêm Mỗi Cổng</th>
            <th style="min-width: 180px;">Quyền Lợi</th>
          </tr>
        </thead>
        <tbody>
          ${bankRowsHtml}
        </tbody>
      </table>
    </div>

    <!-- Bottom Save Action Banner -->
    <div style="margin-top: 20px; padding: 16px 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
      <div style="display: flex; align-items: center; gap: 10px; color: #166534; font-size: 13px;">
        <i class="fa-solid fa-circle-check" style="font-size: 18px; color: #00a65a;"></i>
        <span>Các cổng được chọn và số lượng tài khoản mỗi cổng sẽ tự động áp dụng ngay khi bạn nhấn <strong>"Lưu Cấu Hình Gói Này"</strong>.</span>
      </div>
      <button type="button" class="btn-admin-action btn-admin-primary" onclick="saveCurrentPlanConfig()" style="padding: 10px 24px; font-weight: 800;">
        <i class="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình Gói Này
      </button>
    </div>
  `;
}

function onAccountsPerBankChange(val) {
  const num = parseInt(val) || 1;
  document.querySelectorAll('.val-acc-per-bank').forEach(el => {
    el.textContent = num;
  });
}

function bulkToggleBankGateways(enable) {
  ALL_PLAN_BANK_CODES.forEach(bCode => {
    const chk = document.getElementById(`bp-enabled-${bCode}`);
    if (chk) {
      chk.checked = enable;
      toggleBankRowStyle(bCode);
    }
  });
  showToast(enable ? 'Đã bật tất cả 16 cổng trong gói này' : 'Đã bỏ chọn tất cả các cổng trong gói', 'info');
}

function toggleBankRowStyle(bCode) {
  const row = document.getElementById(`row-bank-${bCode}`);
  const chk = document.getElementById(`bp-enabled-${bCode}`);
  const label = document.getElementById(`label-bank-enabled-${bCode}`);
  if (row && chk) {
    if (chk.checked) {
      row.style.opacity = '1';
      row.style.background = '#ffffff';
      if (label) {
        label.textContent = 'Có trong gói';
        label.style.color = '#15803d';
      }
    } else {
      row.style.opacity = '0.55';
      row.style.background = '#fafafa';
      if (label) {
        label.textContent = 'Không có';
        label.style.color = '#64748b';
      }
    }
  }
}

async function saveCurrentPlanConfig() {
  const btn = document.getElementById('btn-save-plan');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  }

  try {
    const name = document.getElementById('cur-plan-name')?.value.trim();
    const badge = document.getElementById('cur-plan-badge')?.value.trim();
    const maxGateways = parseInt(document.getElementById('cur-plan-max-gateways')?.value) || 2;
    const accountsPerBank = parseInt(document.getElementById('cur-plan-accounts-per-bank')?.value) || 1;
    const maxAccounts = maxGateways * accountsPerBank;
    const scanSpeed = document.getElementById('cur-plan-scan-speed')?.value.trim() || '10s / lần';
    const priceMonth = parseInt(document.getElementById('cur-plan-price-month')?.value) || 0;
    const price3Month = Math.round(priceMonth * 3 * 0.85);
    const priceYear = Math.round(priceMonth * 12 * 0.7);
    const status = document.getElementById('cur-plan-status')?.value || 'active';
    const color = document.getElementById('cur-plan-color')?.value || '#00a65a';
    const description = document.getElementById('cur-plan-desc')?.value.trim();

    if (!name) {
      showToast('Tên gói không được để trống!', 'warning');
      return;
    }

    // Collect bank status and limits (không thu thập giá riêng từng cổng vì đã mua trọn gói)
    const bankPrices = ALL_PLAN_BANK_CODES.map(bCode => {
      const meta = BANK_META[bCode] || { name: bCode.toUpperCase() };
      const enabled = document.getElementById(`bp-enabled-${bCode}`)?.checked ?? true;

      return {
        bankCode: bCode,
        bankName: meta.name,
        priceMonth: 0,
        price3Month: 0,
        priceYear: 0,
        maxAccountsPerBank: accountsPerBank, // Tất cả các cổng chỉ thêm N tài khoản mỗi cổng theo gói
        enabled,
        note: '',
      };
    });

    const payload = {
      name,
      badge,
      maxAccounts,
      maxGateways,
      accountsPerBank,
      scanSpeed,
      priceMonth,
      price3Month,
      priceYear,
      status,
      color,
      description,
      bankPrices,
    };

    const res = await fetchWithAuth(`/admin/plans/${activePlanCode}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (res && res.status === 'success') {
      showToast(res.msg || `Đã lưu cấu hình "${name}" thành công!`, 'success');
      // Update local cache
      const idx = allPlansCache.findIndex(p => p.code === activePlanCode);
      if (idx !== -1 && res.data) {
        allPlansCache[idx] = res.data;
      }
      renderPlanTabs();
      renderActivePlanEditor();
    } else {
      showToast(res?.msg || 'Lỗi lưu cấu hình gói', 'error');
    }
  } catch (err) {
    console.error('Lỗi lưu gói:', err);
    showToast('Lỗi kết nối máy chủ khi lưu gói', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

function openAddPlanModal() {
  const modal = document.getElementById('modal-add-plan');
  if (modal) modal.classList.add('active');
}

function closeAddPlanModal() {
  const modal = document.getElementById('modal-add-plan');
  if (modal) modal.classList.remove('active');
}

async function submitCreatePlan(e) {
  e.preventDefault();
  const code = document.getElementById('add-plan-code')?.value.trim().toLowerCase();
  const name = document.getElementById('add-plan-name')?.value.trim();
  const badge = document.getElementById('add-plan-badge')?.value.trim();
  const color = document.getElementById('add-plan-color')?.value || '#00a65a';
  const maxGateways = parseInt(document.getElementById('add-plan-max-gateways')?.value) || 2;
  const accountsPerBank = parseInt(document.getElementById('add-plan-accounts-per-bank')?.value) || 1;
  const maxAccounts = maxGateways * accountsPerBank;
  const priceMonth = parseInt(document.getElementById('add-plan-price-month')?.value) || 0;
  const scanSpeed = document.getElementById('add-plan-scan-speed')?.value.trim() || '5s / lần quét';
  const description = document.getElementById('add-plan-desc')?.value.trim();

  if (!code || !name) {
    showToast('Vui lòng điền đủ mã gói và tên gói!', 'warning');
    return;
  }

  try {
    const res = await fetchWithAuth('/admin/plans', {
      method: 'POST',
      body: JSON.stringify({
        code,
        name,
        badge,
        color,
        maxGateways,
        accountsPerBank,
        maxAccounts,
        priceMonth,
        price3Month: Math.round(priceMonth * 3 * 0.85),
        priceYear: Math.round(priceMonth * 12 * 0.7),
        scanSpeed,
        description,
      }),
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Tạo gói mới thành công!', 'success');
      closeAddPlanModal();
      activePlanCode = code;
      await loadAdminPlans();
    } else {
      showToast(res?.msg || 'Lỗi khi tạo gói mới', 'error');
    }
  } catch (err) {
    console.error('Lỗi tạo gói:', err);
    showToast('Lỗi kết nối máy chủ khi tạo gói', 'error');
  }
}

async function deleteCurrentPlan(code) {
  if (!confirm(`Bạn có chắc chắn muốn xóa gói "${code}" này không? Thao tác này không thể hoàn tác.`)) {
    return;
  }

  try {
    const res = await fetchWithAuth(`/admin/plans/${code}`, {
      method: 'DELETE',
    });

    if (res && res.status === 'success') {
      showToast(res.msg || `Đã xóa gói "${code}" thành công!`, 'success');
      activePlanCode = 'starter';
      await loadAdminPlans();
    } else {
      showToast(res?.msg || 'Lỗi khi xóa gói', 'error');
    }
  } catch (err) {
    console.error('Lỗi xóa gói:', err);
    showToast('Lỗi kết nối máy chủ khi xóa gói', 'error');
  }
}

async function resetDefaultPlansConfirm() {
  if (!confirm('Khôi phục toàn bộ các gói dịch vụ API về mặc định ban đầu của hệ thống? Các chỉnh sửa giá của gói Starter, Pro, Enterprise sẽ được hoàn tác.')) {
    return;
  }

  try {
    const res = await fetchWithAuth('/admin/plans/reset-defaults', {
      method: 'POST',
    });

    if (res && res.status === 'success') {
      showToast(res.msg || 'Đã khôi phục các gói API về mặc định!', 'success');
      activePlanCode = 'starter';
      await loadAdminPlans();
    } else {
      showToast(res?.msg || 'Lỗi khôi phục mặc định', 'error');
    }
  } catch (err) {
    console.error('Lỗi khôi phục:', err);
    showToast('Lỗi máy chủ khi khôi phục gói mặc định', 'error');
  }
}

// ==========================================================================
// 6. TAB 6: CẤU HÌNH HỆ THỐNG (SETTINGS)
// ==========================================================================
async function loadAdminSettings() {
  try {
    const res = await fetchWithAuth('/admin/settings');
    if (res && res.status === 'success' && res.data) {
      const s = res.data;
      setVal('set-server-ip', s.server_ip || '');
      setVal('set-server-domain', s.domain || '');
      setVal('set-app-url', s.app_url || '');
      setVal('set-admin-email', s.admin_email || 'duongle26.1025@gmail.com');
      setVal('set-key-captcha', s.key_captcha || 'offline_ai_self_hosted');
      setVal('set-captcha-url', s.captcha_api_url || 'http://127.0.0.1:8088');
      setVal('set-captcha-price', s.captcha_price_per_request !== undefined ? s.captcha_price_per_request : 20);
      setVal('quick-captcha-price', s.captcha_price_per_request !== undefined ? s.captcha_price_per_request : 20);
      setVal('set-pusher-id', s.pusher_app_id || '');
      setVal('set-pusher-cluster', s.pusher_cluster || 'ap1');
      setVal('set-pusher-key', s.pusher_key || '');
      setVal('set-pusher-secret', s.pusher_secret || '');
      setVal('set-telegram-bot-token', s.telegram_bot_token || '');
      setVal('set-telegram-bot-username', s.telegram_bot_username || '');
      setVal('set-zalo-bot-token', s.zalo_bot_token || '');
      setVal('set-zalo-bot-name', s.zalo_bot_name || '');
      const defaultDeeplink = s.zalo_bot_deeplink || 'https://zalo.me/3100879446097204368';
      setVal('set-zalo-bot-deeplink', defaultDeeplink);
      const openDeeplinkBtn = document.getElementById('btn-open-zalo-deeplink');
      if (openDeeplinkBtn) openDeeplinkBtn.href = defaultDeeplink;
      setVal('set-system-notice', s.system_notice || '');
    }
  } catch (err) {
    console.error('Lỗi nạp cài đặt:', err);
  }
}

async function testTelegramBotToken() {
  const token = document.getElementById('set-telegram-bot-token')?.value.trim();
  const resSpan = document.getElementById('telegram-bot-test-result');
  const btn = document.getElementById('btn-test-telegram-bot');

  if (!token) {
    showToast('Vui lòng nhập Telegram Bot Token trước khi kiểm tra!', 'warning');
    document.getElementById('set-telegram-bot-token')?.focus();
    return;
  }

  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...';
  }
  if (resSpan) resSpan.innerHTML = '';

  try {
    const res = await fetchWithAuth('/admin/settings/test-telegram', {
      method: 'POST',
      body: JSON.stringify({ telegram_bot_token: token })
    });

    if (res && res.status === 'success' && res.bot) {
      showToast(res.msg, 'success');
      if (resSpan) {
        resSpan.innerHTML = `<span style="color: #34d399;"><i class="fa-solid fa-circle-check"></i> Đang online: <b>${res.bot.first_name}</b> (@${res.bot.username})</span>`;
      }
      const usernameInput = document.getElementById('set-telegram-bot-username');
      if (usernameInput && !usernameInput.value.trim() && res.bot.username) {
        usernameInput.value = res.bot.username;
      }
    } else {
      showToast(res?.msg || 'Kiểm tra bot thất bại', 'error');
      if (resSpan) {
        resSpan.innerHTML = `<span style="color: #f87171;"><i class="fa-solid fa-circle-xmark"></i> ${res?.msg || 'Token không hợp lệ'}</span>`;
      }
    }
  } catch (err) {
    showToast('Lỗi kết nối kiểm tra bot: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}
window.testTelegramBotToken = testTelegramBotToken;

async function testZaloBotToken() {
  const token = document.getElementById('set-zalo-bot-token')?.value.trim();
  const resSpan = document.getElementById('zalo-bot-test-result');
  const btn = document.getElementById('btn-test-zalo-bot');

  if (!token) {
    showToast('Vui lòng nhập Zalo Bot Token trước khi kiểm tra!', 'warning');
    document.getElementById('set-zalo-bot-token')?.focus();
    return;
  }

  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...';
  }
  if (resSpan) resSpan.innerHTML = '';

  try {
    const res = await fetchWithAuth('/admin/settings/test-zalo', {
      method: 'POST',
      body: JSON.stringify({ zalo_bot_token: token })
    });

    if (res && res.status === 'success' && res.bot) {
      showToast(res.msg, 'success');
      if (resSpan) {
        resSpan.innerHTML = `<span style="color: #34d399;"><i class="fa-solid fa-circle-check"></i> Đang online: <b>${res.bot.display_name || res.bot.account_name}</b> (ID: ${res.bot.id})</span>`;
      }
      const nameInput = document.getElementById('set-zalo-bot-name');
      if (nameInput && !nameInput.value.trim() && (res.bot.display_name || res.bot.account_name)) {
        nameInput.value = res.bot.display_name || res.bot.account_name;
      }
      const deeplinkInput = document.getElementById('set-zalo-bot-deeplink');
      if (deeplinkInput && !deeplinkInput.value.trim() && res.bot.id) {
        deeplinkInput.value = `https://zalo.me/${res.bot.id}`;
        const openBtn = document.getElementById('btn-open-zalo-deeplink');
        if (openBtn) openBtn.href = deeplinkInput.value;
      }
    } else {
      showToast(res?.msg || 'Kiểm tra bot thất bại', 'error');
      if (resSpan) {
        resSpan.innerHTML = `<span style="color: #f87171;"><i class="fa-solid fa-circle-xmark"></i> ${res?.msg || 'Token Zalo Bot không hợp lệ'}</span>`;
      }
    }
  } catch (err) {
    showToast('Lỗi kết nối kiểm tra bot Zalo: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}
window.testZaloBotToken = testZaloBotToken;

async function handleSaveAdminSettings(e) {
  e.preventDefault();

  const generalPayload = {
    server_ip: document.getElementById('set-server-ip')?.value.trim(),
    domain: document.getElementById('set-server-domain')?.value.trim(),
    app_url: document.getElementById('set-app-url')?.value.trim(),
    admin_email: document.getElementById('set-admin-email')?.value.trim(),
    key_captcha: document.getElementById('set-key-captcha')?.value.trim() || 'offline_ai_self_hosted',
    captcha_api_url: document.getElementById('set-captcha-url')?.value.trim() || 'http://127.0.0.1:8088',
    captcha_price_per_request: Number(document.getElementById('set-captcha-price')?.value) || 20,
    pusher_app_id: document.getElementById('set-pusher-id')?.value.trim(),
    pusher_cluster: document.getElementById('set-pusher-cluster')?.value.trim(),
    pusher_key: document.getElementById('set-pusher-key')?.value.trim(),
    pusher_secret: document.getElementById('set-pusher-secret')?.value.trim(),
    telegram_bot_token: document.getElementById('set-telegram-bot-token')?.value.trim(),
    telegram_bot_username: document.getElementById('set-telegram-bot-username')?.value.trim(),
    zalo_bot_token: document.getElementById('set-zalo-bot-token')?.value.trim(),
    zalo_bot_name: document.getElementById('set-zalo-bot-name')?.value.trim(),
    zalo_bot_deeplink: document.getElementById('set-zalo-bot-deeplink')?.value.trim(),
    system_notice: document.getElementById('set-system-notice')?.value.trim()
  };

  const memoPrefix = document.getElementById('set-deposit-memo-prefix')?.value.trim().toUpperCase() || 'NAPTIEN';
  const minAmount = parseInt(document.getElementById('set-deposit-min-amount')?.value) || 10000;

  try {
    const [res1, res2] = await Promise.all([
      fetchWithAuth('/admin/settings', {
        method: 'POST',
        body: JSON.stringify(generalPayload)
      }),
      fetchWithAuth('/admin/deposit-settings', {
        method: 'POST',
        body: JSON.stringify({ memo_prefix: memoPrefix, min_amount: minAmount })
      })
    ]);

    if (res1 && res1.status === 'success' && res2 && res2.status === 'success') {
      showToast('🎉 Đã lưu toàn bộ cấu hình hệ thống & thông số nạp tiền thành công!', 'success');
      setVal('dep-set-memo-prefix', memoPrefix);
      setVal('dep-set-min-amount', minAmount);
    } else {
      showToast(res1?.msg || res2?.msg || 'Lỗi lưu cấu hình', 'error');
    }
  } catch (_) {
    showToast('Lỗi máy chủ khi lưu cấu hình', 'error');
  }
}

async function handleTestCaptchaKey(btn) {
  const resultBox = document.getElementById('captcha-test-result');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang chạy AI OCR giải Captcha nội bộ...';

  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
    resultBox.style.border = '1px solid rgba(59, 130, 246, 0.3)';
    resultBox.style.color = '#60a5fa';
    resultBox.innerHTML = '<i class="fa-solid fa-microchip fa-spin"></i> Đang nạp mô hình ddddocr AI và nhận diện ký tự Captcha ngân hàng...';
  }

  try {
    const res = await fetchWithAuth('/admin/settings/test-captcha', {
      method: 'POST',
      body: JSON.stringify({})
    });

    btn.disabled = false;
    btn.innerHTML = originalHtml;

    if (res && (res.status === 'success' || res.status === true)) {
      showToast(res.msg, 'success');
      if (resultBox) {
        resultBox.style.background = 'rgba(16, 185, 129, 0.12)';
        resultBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
        resultBox.style.color = '#10b981';
        resultBox.innerHTML = `
          <div style="font-weight: 700; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <i class="fa-solid fa-circle-check"></i> ${res.msg}
          </div>
          <div style="font-size: 12px; color: #a7f3d0; margin-top: 6px;">
            • Mã Captcha nhận diện: <strong style="font-size: 14px; background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 4px; color: #34d399;">${res.data?.captcha}</strong>
            &nbsp;• Thời gian giải mã: <strong>${res.duration}s</strong>
            &nbsp;• Cơ chế: <span style="color: #6ee7b7; font-weight: 600;">100% Offline Deep Learning (ddddocr ONNX)</span>
          </div>
        `;
      }
    } else {
      showToast(res?.msg || 'Lỗi kiểm tra Captcha', 'error');
      if (resultBox) {
        resultBox.style.background = 'rgba(239, 68, 68, 0.12)';
        resultBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        resultBox.style.color = '#ef4444';
        resultBox.innerHTML = `
          <div style="font-weight: 700; display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <i class="fa-solid fa-circle-xmark"></i> ${res?.msg || 'Không thể giải mã Captcha'}
          </div>
          <div style="font-size: 12px; color: #fca5a5;">
            Vui lòng kiểm tra lại môi trường Python và gói thư viện ddddocr trên máy chủ VPS.
          </div>
        `;
      }
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    showToast('Lỗi máy chủ khi kiểm tra Captcha: ' + err.message, 'error');
  }
}

// Admin Logout
function handleAdminLogout() {
  if (!confirm('Bạn có chắc muốn đăng xuất khỏi trang Quản Trị Viên?')) return;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('7bank_token');
  localStorage.removeItem('7bank_user');
  window.location.href = '/login.html';
}

// Helpers
function formatMoney(num) {
  return new Intl.NumberFormat('vi-VN').format(num || 0) + ' đ';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.value = val;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('admin-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  t.style.borderColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#38bdf8';
  setTimeout(() => {
    t.style.display = 'none';
  }, 3200);
}

function copyToClipboard(text, msg = 'Đã sao chép vào bộ nhớ tạm!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(msg, 'success')).catch(() => showToast(msg, 'success'));
  } else {
    showToast(msg, 'success');
  }
}

// ==========================================================================
// 7. TAB CAPTCHA: QUẢN LÝ CHO THUÊ API CAPTCHA OCR
// ==========================================================================
async function loadAdminCaptchaLogs(forceToast = false) {
  const tbody = document.getElementById('admin-captcha-logs-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 24px; color: var(--admin-text-dim);">
          <i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu nhật ký Captcha...
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetchWithAuth('/admin/captcha-logs?limit=50');
    if (res && res.status === 'success') {
      const { data, stats } = res;

      // Update KPI metrics
      if (stats) {
        setValOrText('stat-captcha-total', (stats.total || 0).toLocaleString());
        setValOrText('stat-captcha-rate', stats.successRate || '100%');
        setValOrText('stat-captcha-success', (stats.success || 0).toLocaleString());
        setValOrText('stat-captcha-revenue', ((stats.totalRevenue || 0)).toLocaleString() + ' đ');
        setValOrText('stat-captcha-latency', stats.avgLatency || '~25ms');
      }

      if (!data || data.length === 0) {
        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="9" style="text-align: center; padding: 32px; color: var(--admin-text-muted);">
                <i class="fa-solid fa-receipt" style="font-size: 28px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                Chưa có yêu cầu giải Captcha nào được ghi nhận gần đây.
              </td>
            </tr>
          `;
        }
        if (forceToast) showToast('Đã làm mới dữ liệu (Chưa có nhật ký)', 'info');
        return;
      }

      if (tbody) {
        tbody.innerHTML = data.map(item => {
          const isSuccess = item.success !== false;
          const statusBadge = isSuccess
            ? '<span class="admin-badge badge-active"><i class="fa-solid fa-check"></i> Thành công</span>'
            : '<span class="admin-badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171;"><i class="fa-solid fa-xmark"></i> Thất bại</span>';
          
          const timeFormatted = item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '--';
          const tokenDisplay = item.token ? `<code style="font-family: monospace; color: #38bdf8;">${escapeHtml(item.token.substring(0, 14))}...</code>` : (item.userId ? `<span style="color: #94a3b8;">User #${String(item.userId).slice(-6)}</span>` : '<span style="color: #64748b;">Khách Sandbox</span>');
          const costFormatted = item.cost ? `<span style="color: #fbbf24; font-weight: 700;">-${item.cost.toLocaleString()} đ</span>` : '<span style="color: #94a3b8;">0 đ</span>';
          const balFormatted = item.balanceAfter !== undefined && item.balanceAfter !== null ? `${item.balanceAfter.toLocaleString()} đ` : '--';

          return `
            <tr>
              <td style="font-size: 12px; color: var(--admin-text-muted);">${timeFormatted}</td>
              <td>${tokenDisplay}</td>
              <td><span class="badge-pill badge-pill-info" style="font-weight: 700;">${escapeHtml((item.bank || 'ALL').toUpperCase())}</span></td>
              <td><strong style="color: #34d399; font-family: monospace; letter-spacing: 1px; font-size: 13.5px;">${escapeHtml(item.captcha || '--')}</strong></td>
              <td style="font-family: monospace; font-size: 12.5px; color: #a855f7;">${item.timeMs ? item.timeMs + 'ms' : '--'}</td>
              <td>${costFormatted}</td>
              <td style="font-size: 12.5px; color: #38bdf8;">${balFormatted}</td>
              <td style="font-family: monospace; font-size: 11.5px; color: var(--admin-text-dim);">${escapeHtml(item.ip || '127.0.0.1')}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }

      if (forceToast) showToast('Đã làm mới dữ liệu nhật ký Captcha!', 'success');
    } else {
      if (forceToast) showToast(res?.msg || 'Lỗi tải nhật ký Captcha', 'error');
    }
  } catch (err) {
    console.error('Lỗi loadAdminCaptchaLogs:', err);
    if (forceToast) showToast('Lỗi máy chủ khi tải nhật ký Captcha', 'error');
  }
}
window.loadAdminCaptchaLogs = loadAdminCaptchaLogs;

async function saveCaptchaPriceFromTab() {
  const priceVal = Number(document.getElementById('quick-captcha-price')?.value);
  if (isNaN(priceVal) || priceVal < 0) {
    showToast('Đơn giá không hợp lệ, vui lòng nhập số lớn hơn hoặc bằng 0', 'warning');
    return;
  }

  try {
    const res = await fetchWithAuth('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ captcha_price_per_request: priceVal })
    });

    if (res && res.status === 'success') {
      showToast(`🎉 Đã cập nhật đơn giá giải Captcha thành ${priceVal.toLocaleString()} VNĐ / lượt!`, 'success');
      setVal('set-captcha-price', priceVal);
    } else {
      showToast(res?.msg || 'Lỗi lưu đơn giá Captcha', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi cập nhật đơn giá: ' + err.message, 'error');
  }
}
window.saveCaptchaPriceFromTab = saveCaptchaPriceFromTab;

// ==========================================================================
// 8. TỰ ĐỘNG CẬP NHẬT PHIÊN BẢN (1-CLICK AUTO UPDATE ENGINE)
// ==========================================================================
let currentSystemVersion = '3.2.0';

async function loadSystemVersionInfo() {
  try {
    const res = await fetchWithAuth('/admin/update/status');
    if (res && res.status === 'success' && res.data) {
      const d = res.data;
      currentSystemVersion = d.currentVersion || '3.2.0';

      // Update Topbar badge
      const topBadge = document.getElementById('badge-topbar-version');
      if (topBadge) topBadge.textContent = `v${currentSystemVersion}`;

      // Update Settings badge
      const setBadge = document.getElementById('settings-current-version-badge');
      if (setBadge) setBadge.textContent = `Phiên bản hiện tại: v${currentSystemVersion} (${d.buildDate || ''})`;

      // Update Sidebar tag if exists
      const sideTag = document.getElementById('sidebar-version-tag');
      if (sideTag) sideTag.textContent = `v${currentSystemVersion}`;

      // Update Settings fields
      if (d.config) {
        setVal('set-update-repo', d.config.githubRepo || 'taquangminh/7bank');
        setVal('set-update-url', d.config.serverUrl || '');
        setVal('set-update-token', d.config.githubToken || '');
        setVal('set-update-channel', d.config.channel || 'stable');
      }
    }
  } catch (err) {
    console.warn('Lỗi tải thông tin phiên bản:', err);
  }
}
window.loadSystemVersionInfo = loadSystemVersionInfo;

// Bấm nút cập nhật phiên bản: Tự động kiểm tra và cập nhật bản mới nhất
async function handleAutoUpdateClick() {
  const icon = document.getElementById('topbar-update-icon');
  const btn = document.getElementById('btn-topbar-update');
  if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
  if (btn) btn.disabled = true;

  // Hiển thị SweetAlert2 đang kiểm tra
  Swal.fire({
    title: 'Đang Kiểm Tra Bản Cập Nhật...',
    html: `
      <div style="padding: 15px; font-size: 13.5px; color: var(--admin-text-muted);">
        <i class="fa-solid fa-cloud-arrow-down fa-bounce" style="font-size: 38px; color: #10b981; margin-bottom: 12px; display: block;"></i>
        Đang kết nối tới máy chủ phát hành để kiểm tra phiên bản mới nhất cho hệ thống...
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetchWithAuth('/admin/update/check');
    if (icon) icon.className = 'fa-solid fa-cloud-arrow-down';
    if (btn) btn.disabled = false;

    if (!res || res.status !== 'success' || !res.data) {
      Swal.fire({
        icon: 'error',
        title: 'Không Thể Kiểm Tra Cập Nhật',
        text: res?.msg || 'Máy chủ cập nhật không phản hồi hoặc gặp sự cố mạng.',
        confirmButtonColor: '#3085d6',
        confirmButtonText: 'Đóng',
      });
      return;
    }

    const data = res.data;

    // TRƯỜNG HỢP 1: ĐÃ CÓ PHIÊN BẢN MỚI HƠN
    if (data.hasUpdate) {
      const changelogHtml = Array.isArray(data.releaseNotes) && data.releaseNotes.length > 0
        ? data.releaseNotes.map(n => `<li style="margin-bottom: 6px;">${escapeHtml(n)}</li>`).join('')
        : '<li>Nâng cấp hệ thống, vá lỗi và tối ưu hóa hiệu năng các cổng ngân hàng.</li>';

      const confirmResult = await Swal.fire({
        title: `🚀 Đã Có Phiên Bản Mới: v${data.latestVersion}!`,
        html: `
          <div style="text-align: left; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 14px 18px; margin: 10px 0 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 13.5px;">
              <span>Phiên bản hiện tại: <b style="color: #94a3b8;">v${data.currentVersion}</b></span>
              <span style="color: #10b981; font-weight: 800; font-size: 14.5px;">➡️ v${data.latestVersion}</span>
            </div>
            <div style="font-size: 12px; color: #64748b;">
              Phát hành: ${data.publishedAt ? new Date(data.publishedAt).toLocaleDateString('vi-VN') : 'Mới nhất'}
            </div>
          </div>

          <div style="text-align: left; max-height: 190px; overflow-y: auto; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.06); font-size: 12.5px;">
            <b style="color: #38bdf8; display: block; margin-bottom: 6px;"><i class="fa-solid fa-list-check"></i> Các điểm mới trong bản này:</b>
            <ul style="padding-left: 20px; margin: 0; color: #e2e8f0; line-height: 1.5;">
              ${changelogHtml}
            </ul>
          </div>

          <div style="margin-top: 14px; font-size: 11.5px; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 8px 12px; border-radius: 6px; text-align: left;">
            <i class="fa-solid fa-shield-halved"></i> <b>Bảo vệ 100%:</b> Hệ thống sẽ tự động sao lưu cấu hình, giữ nguyên file .env, chứng chỉ keys/ và phiên ngân hàng.
          </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-cloud-arrow-down"></i> Tiến Hành Cập Nhật Ngay',
        cancelButtonText: 'Để sau',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
      });

      if (confirmResult.isConfirmed) {
        await executeSystemUpdate(data.downloadUrl);
      }
      return;
    }

    // TRƯỜNG HỢP 2: ĐANG Ở PHIÊN BẢN MỚI NHẤT
    const currentChangelogHtml = Array.isArray(data.currentChangelog) && data.currentChangelog.length > 0
      ? data.currentChangelog.map(n => `<li style="margin-bottom: 5px;">${escapeHtml(n)}</li>`).join('')
      : '<li>Hệ thống 7Bank Gateway hoạt động ổn định 24/7.</li>';

    Swal.fire({
      icon: 'success',
      title: '🎉 Hệ Thống Đang Ở Bản Mới Nhất!',
      html: `
        <div style="text-align: left; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; padding: 14px 18px; margin: 12px 0 16px;">
          <div style="font-size: 14.5px; font-weight: 800; color: #34d399; margin-bottom: 4px;">
            Phiên bản hiện tại: v${data.currentVersion}
          </div>
          <div style="font-size: 12px; color: var(--admin-text-dim);">
            ${data.currentTitle || '7Bank Master Engine'} • Kênh: <b>Stable</b> • Ngày build: <b>${data.buildDate || '26/10/2026'}</b>
          </div>
        </div>

        <div style="text-align: left; max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.06); font-size: 12.5px;">
          <b style="color: #38bdf8; display: block; margin-bottom: 6px;"><i class="fa-solid fa-circle-check"></i> Tính năng nổi bật của bản này:</b>
          <ul style="padding-left: 20px; margin: 0; color: #cbd5e1; line-height: 1.5;">
            ${currentChangelogHtml}
          </ul>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-check"></i> Đã Hiểu',
      cancelButtonText: '<i class="fa-solid fa-sliders"></i> Cài Đặt Nguồn Cập Nhật',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#3b82f6',
      reverseButtons: true,
    }).then((res) => {
      if (res.dismiss === Swal.DismissReason.cancel) {
        switchAdminNav('settings');
        const repoInput = document.getElementById('set-update-repo');
        if (repoInput) repoInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

  } catch (err) {
    if (icon) icon.className = 'fa-solid fa-cloud-arrow-down';
    if (btn) btn.disabled = false;
    Swal.fire({
      icon: 'error',
      title: 'Lỗi Kiểm Tra Phiên Bản',
      text: err.message || 'Không thể kết nối đến máy chủ kiểm tra phiên bản.',
    });
  }
}
window.handleAutoUpdateClick = handleAutoUpdateClick;

// Tiến hành tải và cập nhật phiên bản
async function executeSystemUpdate(downloadUrl) {
  Swal.fire({
    title: 'Đang Cập Nhật Hệ Thống...',
    html: `
      <div style="padding: 10px 14px; text-align: left; font-size: 13px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <i class="fa-solid fa-spinner fa-spin" style="font-size: 26px; color: #10b981;"></i>
          <span id="update-step-text" style="font-weight: 700; color: #34d399;">[1/4] Đang tạo điểm khôi phục an toàn (Auto-Backup)...</span>
        </div>
        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 11.5px; color: #94a3b8; max-height: 120px; overflow-y: auto;" id="update-live-log">
          [*] Bắt đầu tiến trình cập nhật...<br>
          [*] Khởi tạo môi trường sao lưu...
        </div>
      </div>
    `,
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => {
      setTimeout(() => {
        const step = document.getElementById('update-step-text');
        const log = document.getElementById('update-live-log');
        if (step) step.textContent = '[2/4] Đang tải gói cập nhật mới từ máy chủ...';
        if (log) log.innerHTML += '<br>[*] Đang tải mã nguồn từ máy chủ phát hành...';
      }, 2500);

      setTimeout(() => {
        const step = document.getElementById('update-step-text');
        const log = document.getElementById('update-live-log');
        if (step) step.textContent = '[3/4] Đang giải nén & ghi đè mã nguồn (Bảo vệ dữ liệu nhạy cảm)...';
        if (log) log.innerHTML += '<br>[*] Giải nén và đồng bộ tệp...<br>[*] Bảo vệ an toàn tệp .env, keys, data';
      }, 5000);
    }
  });

  try {
    const res = await fetchWithAuth('/admin/update/apply', {
      method: 'POST',
      body: JSON.stringify({ downloadUrl }),
    });

    if (res && res.status === 'success') {
      const step = document.getElementById('update-step-text');
      const log = document.getElementById('update-live-log');
      if (step) step.textContent = '[4/4] Cập nhật thành công! Đang khởi động lại máy chủ...';
      if (log) log.innerHTML += '<br>[✓] Áp dụng bản cập nhật thành công!<br>[*] Đang khởi động lại dịch vụ...';

      let seconds = 5;
      Swal.fire({
        icon: 'success',
        title: `🎉 Cập Nhật Thành Công Lên v${res.data.newVersion}!`,
        html: `
          <div style="font-size: 13.5px; color: var(--admin-text-dim); margin-bottom: 12px;">
            Mã nguồn đã được cập nhật hoàn tất. Bản sao lưu được lưu tại: <code>${escapeHtml(res.data.backupPath || 'backups/')}</code>
          </div>
          <div style="font-size: 14.5px; font-weight: 700; color: #34d399;">
            Trang web sẽ tự động làm mới sau <span id="reload-countdown" style="font-size: 18px; color: #38bdf8;">5</span> giây...
          </div>
        `,
        timer: 5000,
        timerProgressBar: true,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
          const cd = document.getElementById('reload-countdown');
          const interval = setInterval(() => {
            seconds--;
            if (cd) cd.textContent = seconds;
            if (seconds <= 0) clearInterval(interval);
          }, 1000);
        },
        willClose: () => {
          window.location.reload();
        }
      });

      // Kích hoạt restart server ngầm
      fetchWithAuth('/admin/update/restart', { method: 'POST' }).catch(() => {});
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Cập Nhật Thất Bại',
        text: res?.msg || 'Gặp lỗi trong quá trình giải nén hoặc ghi đè mã nguồn.',
      });
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Lỗi Kết Nối Cập Nhật',
      text: err.message || 'Mất kết nối với máy chủ trong quá trình cập nhật.',
    });
  }
}
window.executeSystemUpdate = executeSystemUpdate;

// Lưu cấu hình nguồn cập nhật trong Settings
async function saveUpdateSettingsOnly() {
  const repo = document.getElementById('set-update-repo')?.value.trim();
  const url = document.getElementById('set-update-url')?.value.trim();
  const token = document.getElementById('set-update-token')?.value.trim();
  const channel = document.getElementById('set-update-channel')?.value;

  try {
    const res = await fetchWithAuth('/admin/update/settings', {
      method: 'POST',
      body: JSON.stringify({
        githubRepo: repo,
        serverUrl: url,
        githubToken: token,
        channel: channel
      })
    });

    if (res && res.status === 'success') {
      showToast('🎉 Đã lưu cấu hình nguồn cập nhật thành công!', 'success');
    } else {
      showToast(res?.msg || 'Lỗi lưu cấu hình cập nhật', 'error');
    }
  } catch (err) {
    showToast('Lỗi máy chủ khi lưu cấu hình: ' + err.message, 'error');
  }
}
window.saveUpdateSettingsOnly = saveUpdateSettingsOnly;

// Kích hoạt chọn file ZIP thủ công
function triggerManualZipUpload() {
  const input = document.getElementById('input-update-zip');
  if (input) input.click();
}
window.triggerManualZipUpload = triggerManualZipUpload;

// Xử lý khi người dùng chọn file ZIP
async function handleZipFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.zip')) {
    showToast('Vui lòng chọn tệp tin định dạng .ZIP hợp lệ!', 'warning');
    return;
  }

  const confirmRes = await Swal.fire({
    title: 'Xác Nhận Cập Nhật Từ File .ZIP?',
    html: `
      <div style="font-size: 13.5px; text-align: left; padding: 10px;">
        Tập tin: <b>${escapeHtml(file.name)}</b> (${(file.size / 1024 / 1024).toFixed(2)} MB)<br>
        Hệ thống sẽ tự động sao lưu và cập nhật mã nguồn từ tập tin ZIP này.
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Tiến Hành Cập Nhật',
    cancelButtonText: 'Hủy',
    confirmButtonColor: '#10b981',
  });

  if (!confirmRes.isConfirmed) {
    event.target.value = '';
    return;
  }

  Swal.fire({
    title: 'Đang Tải Lên & Áp Dụng Cập Nhật...',
    html: 'Vui lòng không đóng trình duyệt trong quá trình ghi đè mã nguồn...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const zipBase64 = e.target.result;
      const res = await fetchWithAuth('/admin/update/upload', {
        method: 'POST',
        body: JSON.stringify({ zipBase64 })
      });

      if (res && res.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: '🎉 Cập Nhật File ZIP Thành Công!',
          text: `Phiên bản mới: v${res.data.newVersion}. Hệ thống sẽ tải lại sau 3 giây.`,
          timer: 3000,
          timerProgressBar: true,
          showConfirmButton: false,
          willClose: () => {
            window.location.reload();
          }
        });
      } else {
        Swal.fire('Lỗi', res?.msg || 'Không thể giải nén file ZIP cập nhật', 'error');
      }
    } catch (err) {
      Swal.fire('Lỗi', err.message || 'Lỗi xử lý file ZIP', 'error');
    }
  };
  reader.readAsDataURL(file);
}
window.handleZipFileSelected = handleZipFileSelected;


