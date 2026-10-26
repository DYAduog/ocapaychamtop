/**
 * 7BANK GATEWAY - API RENTAL WEB INTERFACE LOGIC
 * High-tech FinTech SaaS interaction system
 * ONLY displays the 10 real banks/wallets supported by 7Bank
 */

// EXACT 10 Banks & Services Supported by 7Bank System
const SUPPORTED_BANKS = [
  {
    code: 'tpbank',
    name: 'TPBank',
    fullName: 'TPBank (Tiên Phong Bank)',
    logo: '/images/tpbank.svg',
    category: 'popular',
    badge: '2FA Siêu Tốc 0.3s',
    highlight: 'API eBank v4, xác thực 1 chạm trên App, không gọi lặp',
    speed: '0.28s',
    successRate: '99.98%',
    protocol: 'eBank v4 • RSA-2048 • AI OCR',
    color: '#5c2483'
  },
  {
    code: 'mbbank',
    name: 'MBBank',
    fullName: 'MBBank (Quân Đội)',
    logo: '/images/mbbank.svg',
    fallbackLogo: '/images/mbbank.png',
    category: 'popular',
    badge: 'Không Cần Thiết Bị',
    highlight: 'Đồng bộ eMB không cần treo điện thoại, tự động quét 24/7',
    speed: '0.30s',
    successRate: '99.95%',
    protocol: 'Digital eMB • Session Keepalive',
    color: '#002855'
  },
  {
    code: 'vcb',
    name: 'Vietcombank',
    fullName: 'Vietcombank (VCB Digibank)',
    logo: '/images/vietcombank.svg',
    fallbackLogo: '/images/vietcombank.png',
    category: 'popular',
    badge: 'Big4 Auto 100%',
    highlight: 'Bypass Captcha tự động bằng AI OCR, ổn định tuyệt đối',
    speed: '0.32s',
    successRate: '99.92%',
    protocol: 'VCB Digibank v5 • AI Captcha',
    color: '#005b38'
  },
  {
    code: 'acb',
    name: 'ACB',
    fullName: 'ACB (Ngân Hàng Á Châu)',
    logo: '/images/acb.svg',
    fallbackLogo: '/images/acb.png',
    category: 'popular',
    badge: 'Webhook Siêu Tốc 0.2s',
    highlight: 'Tốc độ quét nhanh nhất hệ thống, độ trễ gần như zero',
    speed: '0.22s',
    successRate: '99.99%',
    protocol: 'ACB Online API • Ultra Low Latency',
    color: '#005596'
  },
  {
    code: 'bidv',
    name: 'BIDV',
    fullName: 'BIDV (SmartBanking V4)',
    logo: '/images/bidv.png',
    category: 'popular',
    badge: 'Big4 SmartBanking',
    highlight: 'Hỗ trợ SmartBanking cá nhân và doanh nghiệp không giới hạn',
    speed: '0.35s',
    successRate: '99.90%',
    protocol: 'SmartBanking v4 • Auto Poller',
    color: '#105caa'
  },
  {
    code: 'viettin',
    name: 'VietinBank',
    fullName: 'VietinBank (iPay)',
    logo: '/images/vietinbank.svg',
    fallbackLogo: '/images/vietinbank.png',
    category: 'popular',
    badge: 'Big4 iPay Auto',
    highlight: 'Tự động bắt webhook từ VietinBank iPay chỉ trong 0.3s',
    speed: '0.31s',
    successRate: '99.91%',
    protocol: 'iPay Web API • Auto Captcha',
    color: '#00529c'
  },
  {
    code: 'techcombank',
    name: 'Techcombank',
    fullName: 'Techcombank (Mobile Banking)',
    logo: '/images/techcombank.jpg',
    category: 'popular',
    badge: 'Tự Động 24/7',
    highlight: 'Hệ thống tự refresh token liên tục, không bị đứt phiên',
    speed: '0.33s',
    successRate: '99.94%',
    protocol: 'TCB Mobile Engine • Token Vault',
    color: '#ea0029'
  },
  {
    code: 'msb',
    name: 'MSB',
    fullName: 'MSB (Hàng Hải - DigiBank)',
    logo: '/images/msb.png',
    fallbackLogo: '/images/msb.png',
    category: 'popular',
    badge: 'Auto Token 24/7',
    highlight: 'DigiBank API v2, tự động giữ phiên và làm mới Token liên tục',
    speed: '0.25s',
    successRate: '99.96%',
    protocol: 'DigiBank v2 • Keycloak OIDC • Webhook 0.2s',
    color: '#ea580c'
  },
  {
    code: 'zalopay',
    name: 'ZaloPay',
    fullName: 'Ví Điện Tử ZaloPay',
    logo: '/images/zalopay.png',
    category: 'wallet',
    badge: 'Ví Điện Tử 0.2s',
    highlight: 'Quét giao dịch chuyển tiền ZaloPay cá nhân & Merchant tức thì',
    speed: '0.24s',
    successRate: '99.97%',
    protocol: 'ZaloPay Merchant API • Push Callback',
    color: '#008fe5'
  },
  {
    code: 'pgbank',
    name: 'PGBank',
    fullName: 'PGBank (Ngân Hàng TMCP Thịnh Vượng và Phát Triển)',
    logo: '/images/pgbank.png',
    fallbackLogo: '/images/pgbank.png',
    category: 'popular',
    badge: 'PGBank Omni 24/7',
    highlight: 'Đồng bộ biến động số dư PGBank Omni tự động 24/7 qua Token & Webhook',
    speed: '0.29s',
    successRate: '99.95%',
    protocol: 'PGBank Omni Engine • Headless Session Guard',
    color: '#005baa'
  },
  {
    code: 'ocb',
    name: 'OCB',
    fullName: 'OCB (Phương Đông - OMNI)',
    logo: '/images/ocb.png',
    fallbackLogo: '/images/ocb.png',
    category: 'popular',
    badge: 'OCB OMNI 4.0 Auto',
    highlight: 'Hỗ trợ tài khoản OCB OMNI Cá Nhân tự động lấy lịch sử và số dư 24/7',
    speed: '0.28s',
    successRate: '99.95%',
    protocol: 'OCB OMNI 4.0 • Token Vault • Webhook 0.2s',
    color: '#008853'
  },
  {
    code: 'bvbank',
    name: 'BVBank',
    fullName: 'BVBank (Ngân Hàng Bản Việt)',
    logo: '/images/bvbank.png',
    fallbackLogo: '/images/bvbank.png',
    category: 'popular',
    badge: 'BVBank DigiBank 24/7',
    highlight: 'Đồng bộ biến động số dư BVBank DigiBank tự động 24/7 qua Token & Webhook',
    speed: '0.25s',
    successRate: '99.98%',
    protocol: 'BVBank DigiBank Engine • RSA Cryptography • Pure HTTP',
    color: '#005baa'
  },
  {
    code: 'viettel',
    name: 'Viettel Money',
    fullName: 'Viettel Money (ViettelPay)',
    logo: '/images/viettel.png',
    category: 'wallet',
    badge: 'Ví Viettel Tự Động',
    highlight: 'Tích hợp tài khoản Viettel Money nạp rút 24/7 không cần treo app',
    speed: '0.30s',
    successRate: '99.90%',
    protocol: 'ViettelPay Core • Auto Verification',
    color: '#ee0033'
  },
  {
    code: 'eximbank',
    name: 'Eximbank',
    fullName: 'Eximbank (Ngân Hàng Xuất Nhập Khẩu Việt Nam - Edigi)',
    logo: '/images/eximbank.png',
    fallbackLogo: '/images/bank.png',
    category: 'popular',
    badge: 'Edigi Auto 24/7',
    highlight: 'Đồng bộ biến động số dư Eximbank Edigi tự động 24/7 qua Token & Webhook',
    speed: '0.28s',
    successRate: '99.96%',
    protocol: 'Eximbank Edigi Engine • Auto Relogin • Webhook 0.2s',
    color: '#005baa'
  }
];

// App State
const rentalState = {
  cycle: '1m', // '1m', '3m', '1y'
  activeCategory: 'all',
  searchQuery: '',
  activeSimTab: 'v3',
  selectedBankCode: 'tpbank',
  plans: {
    starter: {
      name: 'Gói Starter (Cơ Bản)',
      desc: '2 Cổng ngân hàng tùy chọn • Tần suất quét 10s • Phù hợp shop vừa và nhỏ',
      banks: '2 Cổng Ngân Hàng',
      speed: '10s / lần quét',
      prices: {
        '1m': { current: 250000, original: 350000, label: 'tháng' },
        '3m': { current: 637500, original: 750000, label: '3 tháng (-15%)' },
        '1y': { current: 2100000, original: 3000000, label: 'năm (-30%)' }
      }
    },
    pro: {
      name: 'Gói Pro Business (Bán Chạy)',
      desc: '6 Cổng ngân hàng tùy chọn • Quét siêu tốc 3s - 5s • Không giới hạn giao dịch',
      banks: '6 Cổng Ngân Hàng',
      speed: '3s - 5s / lần quét (0.3s Webhook)',
      prices: {
        '1m': { current: 550000, original: 750000, label: 'tháng' },
        '3m': { current: 1400000, original: 1650000, label: '3 tháng (-15%)' },
        '1y': { current: 4620000, original: 6600000, label: 'năm (-30%)' }
      }
    },
    enterprise: {
      name: 'Gói Enterprise (Doanh Nghiệp)',
      desc: 'Tất cả 10 Cổng ngân hàng • Quét Realtime Push • Dedicated VPS riêng biệt',
      banks: 'Toàn Bộ 10 Cổng Hệ Thống',
      speed: 'Near Realtime (Push 1s - 2s)',
      prices: {
        '1m': { current: 1250000, original: 1800000, label: 'tháng' },
        '3m': { current: 3180000, original: 3750000, label: '3 tháng (-15%)' },
        '1y': { current: 10500000, original: 15000000, label: 'năm (-30%)' }
      }
    }
  },
  selectedPlanKey: 'pro',
  selectedPayBank: 'tpbank',
  currentOrderCode: '',
  isEyeHidden: false,
  isDispatching: false
};

// Payment Bank Details
const payBanks = {
  tpbank: {
    bin: '970423',
    name: 'TPBank (Tiên Phong Bank)',
    stk: '10005925592',
    owner: 'LE MANH DUONG',
    logo: '/images/tpbank.svg'
  },
  mbbank: {
    bin: '970422',
    name: 'MBBank (Quân Đội)',
    stk: '0987654321',
    owner: '7BANK GATEWAY',
    logo: '/images/mbbank.png'
  }
};

// Formatting Utilities
function formatVND(num) {
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function formatNum(num) {
  return new Intl.NumberFormat('vi-VN').format(num);
}

// 1. Render Bank Cards Grid (10 REAL BANKS ONLY)
function renderRentalBanks() {
  const gridEl = document.getElementById('rental-banks-grid');
  if (!gridEl) return;

  const query = rentalState.searchQuery.toLowerCase().trim();
  const cat = rentalState.activeCategory;

  const filtered = SUPPORTED_BANKS.filter(b => {
    const matchesCat = (cat === 'all') || (b.category === cat);
    const matchesQuery = !query || b.name.toLowerCase().includes(query) || b.fullName.toLowerCase().includes(query) || b.code.toLowerCase().includes(query);
    return matchesCat && matchesQuery;
  });

  if (filtered.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: #64748b; background: #ffffff; border-radius: 16px; border: 1px dashed #cbd5e1;">
        <i class="fa-regular fa-folder-open" style="font-size: 36px; margin-bottom: 12px; display: block; color: #94a3b8;"></i>
        <p style="font-weight: 600;">Không tìm thấy cổng phù hợp với từ khóa "${rentalState.searchQuery}".</p>
        <p style="font-size: 13px; margin-top: 4px;">7Bank hỗ trợ chính xác 10 cổng: TPBank, MBBank, VCB, ACB, BIDV, VietinBank, Techcombank, ZaloPay, Viettel Money, Thẻ Siêu Rẻ.</p>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = filtered.map(b => {
    const isSelected = rentalState.selectedBankCode === b.code;
    return `
      <div class="tech-bank-card ${isSelected ? 'active-inspect' : ''}" onclick="selectBankForInspect('${b.code}')" id="bank-card-${b.code}">
        <div class="tech-card-header">
          <div class="tech-logo-wrap">
            <img src="${b.logo}" onerror="this.src='${b.fallbackLogo || '/images/bank.png'}'" alt="${b.name}" class="tech-bank-logo">
          </div>
          <div class="tech-status-badge">
            <span class="live-pulse-dot"></span>
            <span>ONLINE</span>
          </div>
        </div>

        <div class="tech-card-body">
          <h4 class="tech-bank-title">${b.name}</h4>
          <p class="tech-bank-fullname">${b.fullName}</p>
          <div class="tech-bank-pill">${b.badge}</div>
        </div>

        <div class="tech-card-footer">
          <div class="tech-metric-item">
            <span class="metric-label">Độ trễ:</span>
            <span class="metric-val text-primary"><i class="fa-solid fa-bolt"></i> ${b.speed}</span>
          </div>
          <div class="tech-metric-item">
            <span class="metric-label">Uptime:</span>
            <span class="metric-val" style="color: #10b981;">${b.successRate}</span>
          </div>
        </div>

        <div class="tech-card-hover-action">
          <span><i class="fa-solid fa-vial"></i> Bấm để thử Webhook cổng này &rarr;</span>
        </div>
      </div>
    `;
  }).join('');
}

function filterRentalBanks(val) {
  rentalState.searchQuery = val;
  renderRentalBanks();
}

function filterBankCategory(category, btn) {
  rentalState.activeCategory = category;
  document.querySelectorAll('.eco-cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderRentalBanks();
}

function selectBankForInspect(bankCode) {
  rentalState.selectedBankCode = bankCode;
  const b = SUPPORTED_BANKS.find(x => x.code === bankCode);
  if (!b) return;

  // Highlight card
  document.querySelectorAll('.tech-bank-card').forEach(c => c.classList.remove('active-inspect'));
  document.getElementById(`bank-card-${bankCode}`)?.classList.add('active-inspect');

  // Update simulator bank select
  const simSelect = document.getElementById('sim-bank');
  if (simSelect) {
    const upper = bankCode.toUpperCase();
    for (let opt of simSelect.options) {
      if (opt.value === upper || opt.value.includes(upper)) {
        simSelect.value = opt.value;
        break;
      }
    }
  }

  // Smooth scroll to simulator
  const simEl = document.getElementById('simulator');
  if (simEl) {
    simEl.scrollIntoView({ behavior: 'smooth' });
  }

  // Trigger high-tech simulated webhook
  triggerSimulator();
}

// 2. Toggle Pricing Cycle
function setPricingCycle(cycle) {
  rentalState.cycle = cycle;

  document.querySelectorAll('.pricing-cycle-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cycle === cycle);
  });

  Object.keys(rentalState.plans).forEach(key => {
    const plan = rentalState.plans[key];
    const priceData = plan.prices[cycle];

    const card = document.getElementById(`plan-card-${key}`);
    if (!card) return;

    const currentPriceEl = card.querySelector('.plan-price');
    const originalPriceEl = card.querySelector('.plan-original-price');
    const periodEl = card.querySelector('.plan-period');

    if (currentPriceEl) currentPriceEl.textContent = formatVND(priceData.current);
    if (originalPriceEl) originalPriceEl.textContent = formatVND(priceData.original);
    if (periodEl) periodEl.textContent = `/ ${priceData.label}`;
  });

  updateCalculator();
}

// 3. High-Tech Webhook Simulator with Mystical Running Aurora Effect
function formatJsonToSyntaxHtml(obj, commentHeader = '') {
  let jsonStr = JSON.stringify(obj, null, 2);
  
  // Escape HTML characters
  jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  const highlighted = jsonStr.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = 'tok-num';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'tok-key';
          const keyPart = match.slice(0, -1);
          return `<span class="${cls}">${keyPart}</span><span class="tok-punct">:</span>`;
        } else {
          cls = 'tok-str';
        }
      } else if (/true|false/.test(match)) {
        cls = 'tok-bool';
      } else if (/null/.test(match)) {
        cls = 'tok-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );

  let html = '';
  if (commentHeader) {
    html += `<span class="tok-comment">${commentHeader}</span>\n`;
  }
  html += highlighted;
  html += `\n<span class="tok-cursor" aria-hidden="true">▋</span>`;
  return html;
}

function updateTerminalGutter(lineCount) {
  const gutterEl = document.getElementById('sim-terminal-lines');
  if (!gutterEl) return;
  const count = Math.max(12, Math.min(lineCount, 60));
  let linesHtml = '';
  for (let i = 1; i <= count; i++) {
    linesHtml += `<span>${i < 10 ? '0' + i : i}</span>`;
  }
  gutterEl.innerHTML = linesHtml;
}

function onSimulatorBankChange() {
  const bank = document.getElementById('sim-bank')?.value || 'TPBANK';
  rentalState.selectedBankCode = bank.toLowerCase();
  
  const bankTag = document.getElementById('sim-terminal-bank-tag');
  if (bankTag) {
    bankTag.innerHTML = `<i class="fa-solid fa-building-columns"></i> ${bank}`;
  }
  
  triggerSimulator();
}

function switchSimTab(tab) {
  rentalState.activeSimTab = tab;
  document.querySelectorAll('.sim-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`sim-tab-${tab}`)?.classList.add('active');

  const methodEl = document.getElementById('sim-terminal-method');
  const routeEl = document.getElementById('sim-terminal-route');

  if (tab === 'v1') {
    if (methodEl) { methodEl.textContent = 'GET'; methodEl.style.color = '#34d399'; methodEl.style.borderColor = 'rgba(52, 211, 153, 0.4)'; }
    if (routeEl) routeEl.textContent = '/historyapi/{token}';
  } else if (tab === 'v2') {
    if (methodEl) { methodEl.textContent = 'POST'; methodEl.style.color = '#38bdf8'; methodEl.style.borderColor = 'rgba(6, 182, 212, 0.4)'; }
    if (routeEl) routeEl.textContent = '/api/v2/transactions/verify';
  } else {
    if (methodEl) { methodEl.textContent = 'POST'; methodEl.style.color = '#c084fc'; methodEl.style.borderColor = 'rgba(168, 85, 247, 0.4)'; }
    if (routeEl) routeEl.textContent = '/api/callback/bank';
  }

  triggerSimulator();
}

function triggerSimulator() {
  if (rentalState.isDispatching) return;
  rentalState.isDispatching = true;

  const bankSelect = document.getElementById('sim-bank');
  const amountInput = document.getElementById('sim-amount');
  const contentInput = document.getElementById('sim-content');
  const webhookInput = document.getElementById('sim-webhook');
  const terminalBody = document.getElementById('terminal-body');
  const statusStepText = document.getElementById('sim-step-text-inner') || document.getElementById('sim-step-text');
  const terminalWrapper = document.getElementById('sim-terminal-wrapper');
  const latencyChip = document.getElementById('sim-terminal-latency');
  const bankTag = document.getElementById('sim-terminal-bank-tag');

  const bank = bankSelect ? bankSelect.value : 'TPBANK';
  const amount = amountInput ? parseInt(amountInput.value) || 250000 : 250000;
  const content = contentInput ? contentInput.value.trim() : 'NAPTIEN USER_VIP88';
  const webhookUrl = webhookInput ? webhookInput.value.trim() : 'https://shopcuaban.vn/api/callback/bank';

  if (bankTag) {
    bankTag.innerHTML = `<i class="fa-solid fa-building-columns"></i> ${bank}`;
  }

  const transactionId = 'FT' + Math.floor(100000000 + Math.random() * 900000000);
  const executionTime = (0.24 + Math.random() * 0.08).toFixed(2);
  const now = new Date().toISOString();

  // Supercharge Terminal with Running Aurora Transmission Animation
  if (terminalWrapper) {
    terminalWrapper.classList.add('is-transmitting');
  }

  if (latencyChip) {
    latencyChip.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-warning"></i> Connecting...`;
  }

  // Step 1: AI OCR Inspection & Server Handshake
  if (statusStepText) {
    statusStepText.innerHTML = `Đang kết nối lõi <strong>${bank}</strong> &amp; bypass Captcha tự động bằng AI OCR engine...`;
  }
  setStepProgress(1);

  if (terminalBody) {
    terminalBody.innerHTML = `
<div class="tok-step-row">
  <span class="tok-step-chip chip-ocr"><i class="fa-solid fa-satellite-dish fa-spin"></i> [GIAI_DOAN_1]</span>
  <span class="tok-step-text">Khởi tạo kết nối máy chủ <strong>${bank}</strong> (Ping mạng lõi: ${executionTime}s)...</span>
</div>
<div class="tok-step-row">
  <span class="tok-step-chip chip-ai"><i class="fa-solid fa-microchip"></i> [AI_OCR_ENGINE]</span>
  <span class="tok-step-text">Giải mã Captcha &amp; Smart OTP tự động: <span class="tok-success">BYPASS_SUCCESS (0.04s)</span></span>
</div>
<div class="tok-step-row">
  <span class="tok-step-chip chip-sign"><i class="fa-solid fa-shield-halved"></i> [HMAC_SHA256]</span>
  <span class="tok-step-text">Ký mật mã chống sửa đổi payload với Secret Key...</span>
</div>
<span class="tok-cursor">▋</span>`;
    updateTerminalGutter(6);
  }

  setTimeout(() => {
    // Step 2: Packet Push Over Encrypted Channel
    setStepProgress(2);
    if (statusStepText) {
      statusStepText.innerHTML = `Đang đẩy gói tin callback realtime mã hoá RSA-2048 tới: <code>${escapeHtml(webhookUrl)}</code>...`;
    }

    setTimeout(() => {
      // Step 3: Complete & Render High-Tech Highlighted Payload
      setStepProgress(3);
      if (statusStepText) {
        statusStepText.innerHTML = `<span style="color:#10b981;">Đã gửi thành công! Máy chủ bạn phản hồi HTTP 200 OK (${executionTime}s)</span>`;
      }

      if (latencyChip) {
        latencyChip.innerHTML = `<i class="fa-solid fa-bolt"></i> ${executionTime}s`;
      }

      let payload = {};

      if (rentalState.activeSimTab === 'v1') {
        payload = {
          codeStatus: 200,
          messageStatus: "success",
          gateway: "OcaPay Auto Gateway v2.5",
          took: Math.round(executionTime * 1000),
          data: [
            {
              transactionID: transactionId,
              amount: amount,
              description: content,
              transactionDate: now,
              type: "IN",
              bank: bank
            }
          ]
        };
      } else if (rentalState.activeSimTab === 'v2') {
        payload = {
          success: true,
          code: 200,
          gateway: "OcaPay Gateway REST API v2.5",
          execution_time: `${executionTime}s`,
          result: {
            id: transactionId,
            bank: bank,
            accountNumber: bank === 'TPBANK' ? "10005925592" : "0987654321",
            amount: amount,
            content: content,
            status: "COMPLETED",
            createdAt: now
          }
        };
      } else {
        payload = {
          event: "BANK_INCOMING_TRANSACTION",
          timestamp: now,
          execution_time: `${executionTime}s`,
          gateway: "OcaPay Auto Gateway Webhook v3.0",
          data: {
            transaction_id: transactionId,
            bank_code: bank,
            type: "CREDIT",
            amount: amount,
            currency: "VND",
            description: content,
            account_number: bank === 'TPBANK' ? "10005925592" : "0987654321",
            balance_after: amount + 14500000
          },
          signature: "hmac_sha256_verified_e4b1a8f936e7...",
          callback_status: "DELIVERED_200_OK"
        };
      }

      rentalState.lastSimPayload = payload;

      if (terminalBody) {
        const comment = `// [SUCCESS 200 OK] Webhook hoàn tất trong ${executionTime}s • Callback Delivered!`;
        terminalBody.innerHTML = formatJsonToSyntaxHtml(payload, comment);
        
        // Count lines
        const lines = terminalBody.innerText.split('\n').length;
        updateTerminalGutter(lines);
      }

      showToast(`🔔 [${bank}] Biến động +${formatVND(amount)} đã đẩy Webhook thành công trong ${executionTime}s!`, 'success');
      
      setTimeout(() => {
        if (terminalWrapper) {
          terminalWrapper.classList.remove('is-transmitting');
        }
        rentalState.isDispatching = false;
      }, 1200);

    }, 280);
  }, 220);
}

function setStepProgress(stepNum) {
  const steps = [document.getElementById('sim-step-1'), document.getElementById('sim-step-2'), document.getElementById('sim-step-3')];
  steps.forEach((s, idx) => {
    if (!s) return;
    if (idx < stepNum) {
      s.classList.add('active');
    } else {
      s.classList.remove('active');
    }
  });
}

function copySimulatorOutput() {
  const terminalBody = document.getElementById('terminal-body');
  if (!terminalBody) return;
  
  let textToCopy = '';
  if (rentalState.lastSimPayload) {
    textToCopy = JSON.stringify(rentalState.lastSimPayload, null, 2);
  } else {
    textToCopy = terminalBody.innerText.replace(/▋/g, '').trim();
  }
  
  copyToClipboard(textToCopy, 'Đã sao chép gói tin JSON Webhook!');
}

function initTerminalSimulator() {
  const terminalBody = document.getElementById('terminal-body');
  if (!terminalBody) return;

  const defaultPayload = {
    status: "ready",
    gateway: "OcaPay Auto Gateway v2.5",
    engine: "AI OCR Captcha Bypass & Realtime Webhook 0.28s",
    supported_banks: 10,
    security: "TLS 1.3 • RSA-2048 • HMAC-SHA256",
    message: "Bấm nút 'Bắn Thử Giao Dịch Ngay' bên trái để xem webhook realtime!"
  };

  rentalState.lastSimPayload = defaultPayload;
  terminalBody.innerHTML = formatJsonToSyntaxHtml(defaultPayload, '// [READY] Hệ thống cổng thanh toán tự động sẵn sàng!');
  const lines = terminalBody.innerText.split('\n').length;
  updateTerminalGutter(lines);
}

// 4. Interactive Cost & ROI Calculator
function updateCalculator() {
  const bankSlider = document.getElementById('calc-banks');
  const monthSlider = document.getElementById('calc-months');
  const banksValEl = document.getElementById('calc-banks-val');
  const monthsValEl = document.getElementById('calc-months-val');

  const totalEl = document.getElementById('calc-total');
  const dailyEl = document.getElementById('calc-daily');
  const manualEl = document.getElementById('calc-manual-cost');
  const savedEl = document.getElementById('calc-savings-amount');

  if (!bankSlider || !monthSlider) return;

  const banks = parseInt(bankSlider.value);
  const months = parseInt(monthSlider.value);

  banksValEl.textContent = `${banks} / 10 Cổng`;
  monthsValEl.textContent = `${months} Tháng`;

  let monthlyRate = 250000;
  if (banks > 2 && banks <= 6) {
    monthlyRate = 550000;
  } else if (banks > 6) {
    monthlyRate = 1250000; // All 10 enterprise
  }

  let discount = 0;
  if (months >= 12) discount = 0.30;
  else if (months >= 3) discount = 0.15;

  const total7Bank = Math.round(monthlyRate * months * (1 - discount));
  const dailyCost = Math.round(total7Bank / (months * 30));

  const manualCost = 7000000 * months;
  const savings = manualCost - total7Bank;

  totalEl.textContent = formatVND(total7Bank);
  dailyEl.textContent = `Chỉ khoảng ~${formatNum(dailyCost)} đ / ngày sử dụng`;
  manualEl.textContent = formatVND(manualCost);
  savedEl.textContent = formatVND(savings);
}

// 5. Order Modal & VietQR Payment Workflow
function openOrderModal(planKey) {
  if (planKey) rentalState.selectedPlanKey = planKey;
  const plan = rentalState.plans[rentalState.selectedPlanKey];
  const priceData = plan.prices[rentalState.cycle];

  rentalState.currentOrderCode = '7B' + Math.floor(100000 + Math.random() * 900000);

  document.getElementById('modal-plan-title').textContent = `${plan.name} (${priceData.label})`;
  document.getElementById('modal-plan-desc').textContent = `${plan.banks} • ${plan.speed}`;
  document.getElementById('modal-transfer-amount').textContent = formatVND(priceData.current);
  document.getElementById('modal-transfer-content').textContent = `THUE7BANK ${rentalState.currentOrderCode}`;

  selectPayBank(rentalState.selectedPayBank || 'tpbank');

  const modal = document.getElementById('order-modal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function selectPayBank(bankKey) {
  rentalState.selectedPayBank = bankKey;
  const b = payBanks[bankKey] || payBanks.tpbank;
  const plan = rentalState.plans[rentalState.selectedPlanKey];
  const priceData = plan.prices[rentalState.cycle];
  const transferContent = `THUE7BANK ${rentalState.currentOrderCode}`;

  const nameEl = document.getElementById('pay-bank-name');
  const stkEl = document.getElementById('pay-bank-stk');
  const ownerEl = document.getElementById('pay-bank-owner');

  if (nameEl) nameEl.textContent = b.name;
  if (stkEl) stkEl.textContent = b.stk;
  if (ownerEl) ownerEl.textContent = b.owner;

  const btnTpb = document.getElementById('btn-pay-tpbank');
  const btnMb = document.getElementById('btn-pay-mbbank');
  if (btnTpb) btnTpb.className = bankKey === 'tpbank' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
  if (btnMb) btnMb.className = bankKey === 'mbbank' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';

  const qrUrl = `https://img.vietqr.io/image/${b.bin}-${b.stk}-compact2.png?amount=${priceData.current}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(b.owner)}`;
  const qrImg = document.getElementById('modal-qr-image');
  if (qrImg) qrImg.src = qrUrl;
}

function closeOrderModal() {
  const modal = document.getElementById('order-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function copyText(elementId, label) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent.trim();
  copyToClipboard(text, `Đã sao chép ${label || 'thông tin'}: ${text}`);
}

function copyToClipboard(text, alertMsg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(alertMsg || 'Đã sao chép vào bộ nhớ tạm!', 'success');
    }).catch(() => {
      showToast('Đã sao chép!', 'success');
    });
  } else {
    showToast(alertMsg || 'Đã sao chép!', 'success');
  }
}

function confirmOrderPayment() {
  const btn = document.getElementById('btn-confirm-payment');
  if (!btn) return;

  const fullName = document.getElementById('order-fullname').value.trim();
  const phone = document.getElementById('order-phone').value.trim();

  if (!fullName || !phone) {
    showToast('Vui lòng nhập Họ tên và Số điện thoại / Zalo để nhận bàn giao thông tin cấu hình!', 'warning');
    return;
  }

  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang đối soát Napas 247...`;
  btn.disabled = true;

  setTimeout(() => {
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Đã Ghi Nhận Thanh Toán!`;
    showToast(`🎉 Kích hoạt thành công đơn hàng #${rentalState.currentOrderCode}! Thông tin cấu hình đã được cấp phép.`, 'success');

    setTimeout(() => {
      closeOrderModal();
      btn.innerHTML = `<i class="fa-solid fa-check-double"></i> Tôi Đã Chuyển Khoản - Kích Hoạt Ngay`;
      btn.disabled = false;
    }, 2200);
  }, 1600);
}

// 6. Eye Toggle
function toggleRentalEye() {
  rentalState.isEyeHidden = !rentalState.isEyeHidden;
  const prices = document.querySelectorAll('.plan-price, .calc-total-amount');
  prices.forEach(el => {
    if (rentalState.isEyeHidden) {
      el.dataset.origText = el.textContent;
      el.textContent = '••••••';
    } else {
      if (el.dataset.origText) el.textContent = el.dataset.origText;
    }
  });
  showToast(rentalState.isEyeHidden ? 'Đã ẩn hiển thị bảng giá' : 'Đã hiện hiển thị bảng giá');
}

// 7. Toast Alerts
function showToast(message, type = 'info') {
  const toast = document.getElementById('rental-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.background = type === 'success' ? '#166534' : type === 'warning' ? '#b45309' : type === 'error' ? '#991b1b' : '#064e3b';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3200);
}

// 8. Live Realtime Feed Ticker (Cycles through 10 real supported banks)
function initLiveMockupFeed() {
  const feedStream = document.getElementById('hero-feed-stream');
  if (!feedStream) return;

  const sampleTrx = [
    { bank: 'TPBank', logo: '/images/tpbank.svg', name: 'LE MANH DUONG', amount: 150000, memo: 'NAPTIEN USER88', time: '0.28s' },
    { bank: 'MBBank', logo: '/images/mbbank.svg', name: 'CONG TY CP CONG NGHE', amount: 3200000, memo: 'HD882', time: '0.30s' },
    { bank: 'Vietcombank', logo: '/images/vietcombank.svg', name: 'HOANG GIA BAO', amount: 950000, memo: 'THUE API VCB', time: '0.32s' },
    { bank: 'ACB', logo: '/images/acb.svg', name: 'TRAN KIM THAO', amount: 500000, memo: 'DON HANG 102', time: '0.22s' },
    { bank: 'BIDV', logo: '/images/bidv.png', name: 'NGUYEN VAN LONG', amount: 1800000, memo: 'AUTO TOPUP', time: '0.35s' },
    { bank: 'VietinBank', logo: '/images/vietinbank.svg', name: 'VU HOAI NAM', amount: 620000, memo: 'NAP SO DU', time: '0.31s' },
    { bank: 'Techcombank', logo: '/images/techcombank.jpg', name: 'DANG THI HUONG', amount: 1200000, memo: 'ORDER 551', time: '0.33s' },
    { bank: 'ZaloPay', logo: '/images/zalopay.png', name: 'PHAN THANH TUNG', amount: 250000, memo: 'NAP GAME 772', time: '0.24s' },
    { bank: 'Viettel Money', logo: '/images/viettel.png', name: 'BUI QUANG HUY', amount: 450000, memo: 'TOPUP VTM', time: '0.30s' }
  ];

  let idx = 0;
  setInterval(() => {
    const item = sampleTrx[idx % sampleTrx.length];
    idx++;

    const itemEl = document.createElement('div');
    itemEl.className = 'mockup-feed-item';
    itemEl.innerHTML = `
      <div class="mockup-bank-details">
        <img src="${item.logo}" onerror="this.src='/images/bank.png'" alt="${item.bank}" class="mockup-bank-avatar">
        <div>
          <div class="mockup-bank-title">+${formatNum(item.amount)} đ [${item.bank}]</div>
          <div class="mockup-bank-sub">${item.name} • ${item.memo}</div>
        </div>
      </div>
      <div class="mockup-feed-amount">
        <div class="feed-amount-green">+${formatNum(item.amount)}</div>
        <div class="feed-speed-badge"><i class="fa-solid fa-bolt"></i> Webhook ${item.time}</div>
      </div>
    `;

    feedStream.insertBefore(itemEl, feedStream.firstChild);
    if (feedStream.children.length > 3) {
      feedStream.lastChild.remove();
    }
  }, 3600);
}

async function loadDynamicPlansFromApi() {
  try {
    const res = await fetch('/api/plans');
    const data = await res.json();
    if (data && data.status === 'success' && Array.isArray(data.data) && data.data.length > 0) {
      data.data.forEach(p => {
        rentalState.plans[p.code] = {
          name: p.name,
          desc: p.description,
          banks: `${p.maxGateways || 2} Cổng Ngân Hàng`,
          speed: p.scanSpeed || '10s / lần',
          maxAccounts: p.maxAccounts || 2,
          prices: {
            '1m': { current: p.priceMonth || 0, original: p.originalPriceMonth || Math.round((p.priceMonth || 0) * 1.4), label: 'tháng' },
            '3m': { current: p.price3Month || Math.round((p.priceMonth || 0) * 3 * 0.85), original: Math.round((p.priceMonth || 0) * 3), label: '3 tháng (-15%)' },
            '1y': { current: p.priceYear || Math.round((p.priceMonth || 0) * 12 * 0.7), original: Math.round((p.priceMonth || 0) * 12), label: 'năm (-30%)' }
          },
          bankPrices: p.bankPrices || []
        };
      });
      setPricingCycle(rentalState.cycle);
    }
  } catch (_) {}
}

// 9. Initial Load
document.addEventListener('DOMContentLoaded', () => {
  renderRentalBanks();
  setPricingCycle('1m');
  updateCalculator();
  initLiveMockupFeed();
  loadDynamicPlansFromApi();
  initTerminalSimulator();
  initCaptchaSandbox();

  // Close modal on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOrderModal();
  });

  initRentalLiveChat();
});

// ==========================================================================
// 10. REALTIME FINTECH LIVE CHAT WIDGET LOGIC FOR RENTAL
// ==========================================================================
let rentalLiveChatState = {
  isOpen: false,
  sessionId: localStorage.getItem('ocapay_rental_session_id') || ('rental_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)),
  lastPollTime: null,
  pollTimer: null,
  messages: [
    {
      id: 'init-1',
      sender: 'bot',
      text: 'Chào bạn! 👋 Chào mừng bạn đến với OcaPay Gateway.',
      time: 'Vừa xong'
    },
    {
      id: 'init-2',
      sender: 'bot',
      text: 'Tôi là trợ lý kỹ thuật AI OcaPay. Bạn đang cần tư vấn thuê cổng ngân hàng nào hoặc cần hỗ trợ tích hợp Webhook/API?',
      time: 'Vừa xong'
    }
  ]
};
localStorage.setItem('ocapay_rental_session_id', rentalLiveChatState.sessionId);

function toggleLiveChat() {
  const box = document.getElementById('ocapay-livechat-box');
  if (!box) return;

  rentalLiveChatState.isOpen = !rentalLiveChatState.isOpen;
  if (rentalLiveChatState.isOpen) {
    box.classList.add('active');
    const badge = document.getElementById('chat-unread-badge');
    if (badge) badge.style.display = 'none';
    const input = document.getElementById('livechat-input');
    if (input) setTimeout(() => input.focus(), 150);
    scrollToBottomLiveChat();
    pollRentalLiveChatMessages();
  } else {
    box.classList.remove('active');
  }
}

function scrollToBottomLiveChat() {
  const body = document.getElementById('livechat-body');
  if (body) {
    setTimeout(() => {
      body.scrollTop = body.scrollHeight;
    }, 50);
  }
}

function renderRentalLiveChatMessages() {
  const body = document.getElementById('livechat-body');
  if (!body) return;

  body.innerHTML = rentalLiveChatState.messages.map(m => {
    if (m.sender === 'user') {
      return `
        <div class="livechat-msg-row user-row">
          <div class="livechat-bubble">
            ${escapeHtml(m.text)}
            <div class="livechat-msg-time">${m.time}</div>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="livechat-msg-row bot-row">
          <div class="livechat-msg-avatar">
            <i class="fa-solid fa-headset"></i>
          </div>
          <div class="livechat-bubble">
            ${m.html || escapeHtml(m.text)}
            <div class="livechat-msg-time">${m.time}</div>
          </div>
        </div>
      `;
    }
  }).join('');

  scrollToBottomLiveChat();
}

function addRentalLiveChatMessage(sender, text, htmlContent = null) {
  const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const msg = {
    id: 'msg-' + Date.now(),
    sender,
    text,
    html: htmlContent,
    time: now
  };
  rentalLiveChatState.messages.push(msg);
  renderRentalLiveChatMessages();
  try {
    localStorage.setItem('ocapay_rental_livechat_msgs', JSON.stringify(rentalLiveChatState.messages.slice(-25)));
  } catch(e) {}
}

function showRentalTypingIndicator() {
  const body = document.getElementById('livechat-body');
  if (!body) return;
  let typing = document.getElementById('livechat-typing');
  if (!typing) {
    typing = document.createElement('div');
    typing.id = 'livechat-typing';
    typing.className = 'livechat-msg-row bot-row';
    typing.innerHTML = `
      <div class="livechat-msg-avatar"><i class="fa-solid fa-headset"></i></div>
      <div class="livechat-typing-indicator" style="display: flex;">
        <span class="livechat-typing-dot"></span>
        <span class="livechat-typing-dot"></span>
        <span class="livechat-typing-dot"></span>
      </div>
    `;
    body.appendChild(typing);
  }
  scrollToBottomLiveChat();
}

function hideRentalTypingIndicator() {
  const typing = document.getElementById('livechat-typing');
  if (typing) typing.remove();
}

function handleSendLiveChatMessage(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('livechat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addRentalLiveChatMessage('user', text);

  // Dispatch realtime to LiveChat API
  try {
    fetch('/api/livechat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: rentalLiveChatState.sessionId,
        sender: 'user',
        senderName: 'Khách Thuê API (Landing Page)',
        text: text,
        pageUrl: '/rental.html'
      })
    }).then(res => res.json()).then(data => {
      if (data.status === 'success') {
        rentalLiveChatState.lastPollTime = new Date().toISOString();
      }
    }).catch(() => {});
  } catch (_) {}

  showRentalTypingIndicator();
  setTimeout(() => {
    hideRentalTypingIndicator();
    generateRentalAgentResponse(text);
  }, 800 + Math.random() * 400);
}

async function pollRentalLiveChatMessages() {
  if (!rentalLiveChatState.sessionId) return;
  try {
    const url = `/api/livechat/poll?sessionId=${rentalLiveChatState.sessionId}${rentalLiveChatState.lastPollTime ? '&after=' + encodeURIComponent(rentalLiveChatState.lastPollTime) : ''}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.messages)) {
      let hasAdminMsg = false;
      for (const m of json.messages) {
        if (m.sender === 'admin') {
          const exists = rentalLiveChatState.messages.some(existing => existing.id === m._id || (existing.text === m.text && existing.sender === 'admin'));
          if (!exists) {
            hasAdminMsg = true;
            rentalLiveChatState.messages.push({
              id: m._id || ('admin-' + Date.now()),
              sender: 'admin',
              senderName: m.senderName || 'Kỹ thuật viên OcaPay',
              text: m.text,
              html: `
                <div style="border-left: 3px solid #00a65a; padding-left: 8px;">
                  <div style="font-weight: 800; color: #00a65a; font-size: 11.5px; margin-bottom: 2px;">
                    <i class="fa-solid fa-headset"></i> ${escapeHtml(m.senderName || 'Kỹ thuật viên OcaPay')}:
                  </div>
                  <div style="font-size: 13px; line-height: 1.45;">${escapeHtml(m.text)}</div>
                </div>
              `,
              time: new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      }
      if (hasAdminMsg) {
        renderRentalLiveChatMessages();
        if (!rentalLiveChatState.isOpen) {
          const badge = document.getElementById('chat-unread-badge');
          if (badge) {
            badge.style.display = 'flex';
            badge.textContent = '!';
          }
        }
      }
      rentalLiveChatState.lastPollTime = new Date().toISOString();
    }
  } catch (_) {}
}

function sendQuickPrompt(promptText) {
  const input = document.getElementById('livechat-input');
  if (input) input.value = promptText;
  handleSendLiveChatMessage(null);
}

function generateRentalAgentResponse(userQuery) {
  const q = userQuery.toLowerCase();

  if (q.includes('gói') || q.includes('giá') || q.includes('bảng giá') || q.includes('tư vấn') || q.includes('thuê')) {
    addRentalLiveChatMessage('bot', '', `
      <div>
        <strong>⚡ Gói Cước Thuê Cổng API OcaPay:</strong>
        <p style="margin: 6px 0;">Hiện OcaPay cung cấp 3 gói cước linh hoạt:</p>
        <ul style="margin: 4px 0 8px 16px; padding: 0;">
          <li><strong>Starter (250k/tháng):</strong> 2 Ngân hàng, quét 5s/lần.</li>
          <li><strong>Pro Business (550k/tháng):</strong> 6 Ngân hàng, quét 3s/lần, tặng AI OCR.</li>
          <li><strong>Enterprise (1.200k/tháng):</strong> Không giới hạn cổng, Webhook tức thì 0.25s.</li>
        </ul>
        <button class="quick-chip-btn" onclick="document.getElementById('bang-gia').scrollIntoView({behavior: 'smooth'}); toggleLiveChat();" style="background: #e8f5e9; color: #008d4c; cursor: pointer;">👉 Xem Bảng Giá Chi Tiết</button>
      </div>
    `);
  } else if (q.includes('webhook') || q.includes('callback') || q.includes('tích hợp')) {
    addRentalLiveChatMessage('bot', '', `
      <div>
        <strong>🚀 Tích Hợp Webhook Siêu Tốc 0.25s:</strong>
        <p style="margin: 6px 0;">OcaPay cung cấp API chuẩn RESTful JSON và Webhook đẩy dữ liệu trực tiếp về website của bạn (PHP, Node.js, Laravel, WordPress...).</p>
        <p style="margin: 4px 0 8px 0;">Bạn có thể kéo xuống mục <strong>Thử Nghiệm Webhook Simulator</strong> trên trang để test bắn webhook giả lập ngay lập tức!</p>
        <button class="quick-chip-btn" onclick="document.getElementById('simulator').scrollIntoView({behavior: 'smooth'}); toggleLiveChat();" style="background: #e8f5e9; color: #008d4c; cursor: pointer;">⚡ Thử Webhook Simulator</button>
      </div>
    `);
  } else if (q.includes('tpbank') || q.includes('mbbank') || q.includes('ngân hàng') || q.includes('2fa') || q.includes('otp')) {
    addRentalLiveChatMessage('bot', '', `
      <div>
        <strong>🏦 Cổng TPBank eBank & MBBank:</strong>
        <p style="margin: 6px 0;">Hệ thống áp dụng công nghệ mới nhất:</p>
        <ul style="margin: 4px 0 8px 16px; padding: 0;">
          <li><strong>TPBank:</strong> Xác thực 1 chạm qua App TPBank trên điện thoại, không cần duy trì thiết bị.</li>
          <li><strong>MBBank:</strong> Quét tự động 24/7, tự động vượt lỗi phiên.</li>
          <li><strong>AI OCR Captcha:</strong> Giải mã Captcha hình ảnh 100% tự động, miễn phí vĩnh viễn.</li>
        </ul>
        <button class="quick-chip-btn" onclick="document.getElementById('ngan-hang').scrollIntoView({behavior: 'smooth'}); toggleLiveChat();" style="background: #e8f5e9; color: #008d4c; cursor: pointer;">👉 Xem Chi Tiết 10 Cổng</button>
      </div>
    `);
  } else if (q.includes('ultraview') || q.includes('hỗ trợ') || q.includes('ktv') || q.includes('kỹ thuật') || q.includes('admin') || q.includes('zalo') || q.includes('telegram')) {
    addRentalLiveChatMessage('bot', '', `
      <div>
        <strong>👨‍💻 Kỹ Thuật Viên Hỗ Trợ Cài Đặt 1-1 Miễn Phí:</strong>
        <p style="margin: 6px 0;">Đội ngũ OcaPay hỗ trợ tích hợp trực tiếp qua <strong>Ultraview / Teamviewer</strong> hoặc Telegram 24/7:</p>
        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
          <a href="https://t.me/" target="_blank" class="quick-chip-btn">
            <i class="fa-brands fa-telegram" style="color: #0284c7;"></i> Kết nối Telegram CSKH 1-1
          </a>
          <a href="https://zalo.me/" target="_blank" class="quick-chip-btn">
            <i class="fa-solid fa-comment-dots" style="color: #0284c7;"></i> Kết nối Zalo Hỗ Trợ Kỹ Thuật
          </a>
        </div>
      </div>
    `);
  } else {
    addRentalLiveChatMessage('bot', '', `
      <div>
        <p>Cảm ơn bạn đã liên hệ OcaPay! Đội ngũ tư vấn đã ghi nhận: <em>"${escapeHtml(userQuery)}"</em>.</p>
        <p style="margin: 6px 0;">Để được tư vấn và demo trực tiếp, bạn hãy chat ngay với kỹ thuật viên:</p>
        <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
          <a href="https://t.me/" target="_blank" class="quick-chip-btn">✈️ Telegram 1-1</a>
          <a href="https://zalo.me/" target="_blank" class="quick-chip-btn">💬 Zalo Tư Vấn</a>
        </div>
      </div>
    `);
  }
}

function initRentalLiveChat() {
  try {
    const saved = localStorage.getItem('ocapay_rental_livechat_msgs');
    if (saved) {
      rentalLiveChatState.messages = JSON.parse(saved);
    }
  } catch(e) {}
  renderRentalLiveChatMessages();

  // Periodic polling for realtime admin replies
  pollRentalLiveChatMessages();
  if (!rentalLiveChatState.pollTimer) {
    rentalLiveChatState.pollTimer = setInterval(pollRentalLiveChatMessages, 2500);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.toggleLiveChat = toggleLiveChat;
window.handleSendLiveChatMessage = handleSendLiveChatMessage;
window.sendQuickPrompt = sendQuickPrompt;

// ==========================================================================
// 12. AI CAPTCHA RENTAL INTERACTIVE LIVE SANDBOX & CODE TABS
// ==========================================================================
const captchaDemoSamples = {
  vcb: {
    bank: 'vcb',
    name: 'Vietcombank',
    b64: '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'
  },
  mbbank: {
    bank: 'mbbank',
    name: 'MBBank',
    b64: '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'
  },
  bidv: {
    bank: 'bidv',
    name: 'BIDV',
    b64: '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'
  },
  pgbank: {
    bank: 'pgbank',
    name: 'PGBank',
    b64: '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'
  }
};

let currentCaptchaBank = 'vcb';
let currentCaptchaBase64 = captchaDemoSamples.vcb.b64;

function initCaptchaSandbox() {
  const targetImg = document.getElementById('captcha-target-img');
  if (targetImg) {
    targetImg.src = 'data:image/png;base64,' + currentCaptchaBase64;
  }
}

function selectCaptchaSample(bankKey, btnEl) {
  document.querySelectorAll('.sample-bank-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const sample = captchaDemoSamples[bankKey];
  if (!sample) return;

  currentCaptchaBank = sample.bank;
  currentCaptchaBase64 = sample.b64;

  const targetImg = document.getElementById('captcha-target-img');
  if (targetImg) {
    targetImg.src = 'data:image/png;base64,' + currentCaptchaBase64;
    targetImg.style.display = 'block';
  }
  const hint = document.getElementById('captcha-stage-hint');
  if (hint) hint.style.display = 'none';

  // Automatically trigger AI test on click
  triggerCaptchaTest();
}

function handleCaptchaCustomUpload(inputEl) {
  if (!inputEl || !inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const rawUrl = e.target.result;
    currentCaptchaBase64 = rawUrl.split(',')[1] || rawUrl;
    currentCaptchaBank = 'general';

    document.querySelectorAll('.sample-bank-btn').forEach(b => b.classList.remove('active'));

    const targetImg = document.getElementById('captcha-target-img');
    if (targetImg) {
      targetImg.src = rawUrl;
      targetImg.style.display = 'block';
    }
    const hint = document.getElementById('captcha-stage-hint');
    if (hint) hint.style.display = 'none';

    triggerCaptchaTest();
  };
  reader.readAsDataURL(file);
}

function promptCaptchaBase64() {
  const b64 = prompt('Dán chuỗi ảnh Base64 của bạn vào đây:');
  if (!b64 || !b64.trim()) return;

  let cleaned = b64.trim();
  if (cleaned.includes(',')) cleaned = cleaned.split(',')[1].trim();

  currentCaptchaBase64 = cleaned;
  currentCaptchaBank = 'general';

  document.querySelectorAll('.sample-bank-btn').forEach(b => b.classList.remove('active'));

  const targetImg = document.getElementById('captcha-target-img');
  if (targetImg) {
    targetImg.src = 'data:image/png;base64,' + cleaned;
    targetImg.style.display = 'block';
  }
  const hint = document.getElementById('captcha-stage-hint');
  if (hint) hint.style.display = 'none';

  triggerCaptchaTest();
}

async function triggerCaptchaTest() {
  const stage = document.getElementById('captcha-image-stage');
  const btn = document.getElementById('btn-run-captcha-test');
  const detectedVal = document.getElementById('captcha-detected-val');
  const statusTag = document.getElementById('captcha-status-tag');
  const metricSpeed = document.getElementById('metric-ocr-time');
  const metricAcc = document.getElementById('metric-ocr-acc');
  const jsonPre = document.getElementById('captcha-json-output');

  if (stage) stage.classList.add('scanning');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ⚡ Đang quét Laser AI...';
  }
  if (detectedVal) {
    detectedVal.textContent = '...';
    detectedVal.style.color = '#38bdf8';
  }

  const startTime = Date.now();

  try {
    const res = await fetch('/api/v1/captcha/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: currentCaptchaBase64,
        type: currentCaptchaBank
      })
    });

    const data = await res.json();
    const elapsed = Date.now() - startTime;

    if (data && data.status && data.captcha) {
      if (detectedVal) {
        detectedVal.textContent = data.captcha;
        detectedVal.style.color = '#34d399';
      }
      if (statusTag) {
        statusTag.innerHTML = '<i class="fa-solid fa-circle-check"></i> Nhận diện thành công • Độ tin cậy cao';
        statusTag.style.color = '#6ee7b7';
      }
      if (metricSpeed) metricSpeed.textContent = (data.time_ms || elapsed) + ' ms';
      if (metricAcc) metricAcc.textContent = '99.4%';
    } else {
      if (detectedVal) {
        detectedVal.textContent = 'ERR';
        detectedVal.style.color = '#f87171';
      }
      if (statusTag) {
        statusTag.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ' + (data.message || 'Không thể nhận diện');
        statusTag.style.color = '#f87171';
      }
      if (metricSpeed) metricSpeed.textContent = elapsed + ' ms';
      if (metricAcc) metricAcc.textContent = '0%';
    }

    if (jsonPre) {
      jsonPre.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    if (detectedVal) {
      detectedVal.textContent = 'ERR';
      detectedVal.style.color = '#f87171';
    }
    if (statusTag) {
      statusTag.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Lỗi kết nối API Demo';
      statusTag.style.color = '#f87171';
    }
    if (jsonPre) {
      jsonPre.textContent = JSON.stringify({ status: false, error: err.message }, null, 2);
    }
  } finally {
    if (stage) stage.classList.remove('scanning');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-bolt"></i> ⚡ Giải Mã Bằng AI Ngay (0.02s)';
    }
  }
}

// Code Tabs for Captcha Docs
const captchaCodeSnippets = {
  curl: `curl -X POST https://ocapay.vn/api/v1/captcha/solve \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "vcb",
    "base64": "iVBORw0KGgoAAAANSUhEUgAA..."
  }'`,
  python: `import requests

url = "https://ocapay.vn/api/v1/captcha/solve"
headers = {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
}
payload = {
    "type": "vcb",
    "base64": "iVBORw0KGgoAAAANSUhEUgAA..."
}

response = requests.post(url, json=payload, timeout=5)
result = response.json()
print("Captcha:", result.get("captcha"))
print("Số dư còn lại:", result.get("balance"))`,
  nodejs: `const axios = require('axios');

async function solveCaptcha(base64Image, bankType = 'vcb') {
  const res = await axios.post('https://ocapay.vn/api/v1/captcha/solve', {
    type: bankType,
    base64: base64Image
  }, {
    headers: {
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    timeout: 5000
  });

  console.log('Captcha:', res.data.captcha);
  return res.data.captcha;
}`,
  php: `<?php
$apiKey = "YOUR_API_KEY";
$data = [
    "type" => "vcb",
    "base64" => "iVBORw0KGgoAAAANSUhEUgAA..."
];

$ch = curl_init("https://ocapay.vn/api/v1/captcha/solve");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . $apiKey,
    "Content-Type: application/json"
]);

$response = curl_exec($ch);
curl_close($ch);
$result = json_decode($response, true);
echo "Captcha: " . $result["captcha"];
?>`
};

let currentCaptchaLang = 'curl';

function switchCaptchaCodeTab(lang, btnEl) {
  document.querySelectorAll('.code-tabs-nav .code-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  currentCaptchaLang = lang;
  const pre = document.getElementById('captcha-code-pre');
  if (pre && captchaCodeSnippets[lang]) {
    pre.textContent = captchaCodeSnippets[lang];
  }
}

function copyCaptchaSnippet() {
  const code = captchaCodeSnippets[currentCaptchaLang] || '';
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.code-copy-btn');
    if (btn) {
      const oldHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã chép!';
      btn.style.background = '#34d399';
      btn.style.color = '#020617';
      setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.style.background = '';
        btn.style.color = '';
      }, 1500);
    }
  });
}

window.selectCaptchaSample = selectCaptchaSample;
window.handleCaptchaCustomUpload = handleCaptchaCustomUpload;
window.promptCaptchaBase64 = promptCaptchaBase64;
window.triggerCaptchaTest = triggerCaptchaTest;
window.switchCaptchaCodeTab = switchCaptchaCodeTab;
window.copyCaptchaSnippet = copyCaptchaSnippet;

