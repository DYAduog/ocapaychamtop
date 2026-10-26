const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * MSB DigiBank Pure Node.js Engine (100% JavaScript, No Python)
 * - Tra cứu số dư & sao kê siêu tốc qua HTTP API RESTful trực tiếp (~120ms)
 * - Tự động làm mới Access Token qua Keycloak OIDC (Refresh Token Grant) 24/7
 * - Tự động hóa đăng nhập & xác thực Smart OTP bằng Chrome Native CDP khi cần cấp lại phiên
 */
class MsbService {
  constructor() {
    this.port = 9226;
    this.isStartingChrome = false;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    this.appVersion = '2024.09.3-LTS';
    this.tokenUrl = 'https://digibank-identity-retail.msb.com.vn/auth/realms/customer/protocol/openid-connect/token';
    this.arrangementsUrl = 'https://digibank.msb.com.vn/api/arrangement-manager-extension/client-api/v1/arrangements/search';
    this.transactionsUrl = 'https://digibank.msb.com.vn/api/transaction-manager-extension/client-api/v1/transactions';

    this.defaultSessionPaths = [
      path.resolve(__dirname, '../../../../msb_session.json'),
      path.resolve(__dirname, '../../../msb_session.json'),
      path.resolve(process.cwd(), 'msb_session.json'),
      path.resolve(process.cwd(), '../msb_session.json'),
      path.resolve(__dirname, '../../../../core/MBS-API-BANKING-main/MBS-API-BANKING-main/msb_session.json'),
      'D:/7bank/msb_session.json',
    ];
  }

  /**
   * Đọc thông tin phiên lưu trữ từ file
   */
  loadSavedSession(accountNumber = '') {
    for (const p of this.defaultSessionPaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (raw && (raw.access_token || raw.refresh_token)) {
            const ctxId = raw.contextId 
              || raw.session_storage?.contextId 
              || raw.headers?.['x-user-context'] 
              || '8a5890d9a0f8477301a139c5fee83639';
            return {
              accessToken: raw.access_token || raw.session_storage?.access_token || '',
              refreshToken: raw.refresh_token || raw.session_storage?.refresh_token || '',
              arrangementId: raw.arrangement_id || 'b4c83d40-0a82-4646-bdac-13d48034d054',
              contextId: ctxId,
              cookie: raw.cookie_string || '',
              filePath: p,
            };
          }
        } catch (_) {}
      }
    }
    return {
      accessToken: '',
      refreshToken: '',
      arrangementId: 'b4c83d40-0a82-4646-bdac-13d48034d054',
      contextId: '8a5890d9a0f8477301a139c5fee83639',
      cookie: '',
      filePath: this.defaultSessionPaths[0],
    };
  }

  /**
   * Đồng bộ lưu phiên mới vào các file msb_session.json
   */
  saveSessionFiles(sessionData = {}) {
    const { accessToken, refreshToken, arrangementId, cookie, contextId } = sessionData;
    for (const p of this.defaultSessionPaths) {
      try {
        let existing = {};
        if (fs.existsSync(p)) {
          try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
        }
        existing.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
        if (accessToken) {
          existing.access_token = accessToken;
          existing.authorization = `Bearer ${accessToken}`;
          existing.session_storage = existing.session_storage || {};
          existing.session_storage.access_token = accessToken;
        }
        if (refreshToken) {
          existing.refresh_token = refreshToken;
          existing.session_storage = existing.session_storage || {};
          existing.session_storage.refresh_token = refreshToken;
        }
        if (arrangementId) existing.arrangement_id = arrangementId;
        if (cookie) existing.cookie_string = cookie;
        if (contextId) {
          existing.contextId = contextId;
          existing.session_storage = existing.session_storage || {};
          existing.session_storage.contextId = contextId;
          existing.headers = existing.headers || {};
          existing.headers['x-user-context'] = contextId;
        }

        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(existing, null, 2), 'utf8');
      } catch (_) {}
    }
  }

  /**
   * Xóa sạch file phiên và dữ liệu của MSB khi người dùng xóa tài khoản
   */
  clearAccountData(accountNumber, username) {
    try {
      for (const p of this.defaultSessionPaths) {
        if (fs.existsSync(p)) {
          try {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data) {
              data.access_token = '';
              data.authorization = '';
              data.refresh_token = '';
              data.cookie_string = '';
              fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
            }
          } catch (_) {}
        }
      }
      console.log(`[MSB Node.js] 🧹 Đã xóa phiên MSB cho tài khoản: ${accountNumber || username}`);
    } catch (err) {
      console.warn(`[MSB Node.js] Lỗi khi dọn dẹp phiên:`, err.message);
    }
  }

  /**
   * Giải mã tên chủ tài khoản từ JWT payload của Keycloak
   */
  getJwtName(token) {
    if (!token || typeof token !== 'string') return '';
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        let padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (padded.length % 4 !== 0) padded += '=';
        const json = Buffer.from(padded, 'base64').toString('utf8');
        const payload = JSON.parse(json);
        return payload.name || payload.given_name || payload.preferred_username || '';
      }
    } catch (_) {}
    return '';
  }

  /**
   * Giải mã Context ID / leid từ JWT payload của Keycloak
   */
  getContextIdFromJwt(token) {
    if (!token || typeof token !== 'string') return '';
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        let padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (padded.length % 4 !== 0) padded += '=';
        const json = Buffer.from(padded, 'base64').toString('utf8');
        const payload = JSON.parse(json);
        return payload.leid || payload.contextId || payload.context_id || '';
      }
    } catch (_) {}
    return '';
  }

  /**
   * Làm mới Access Token qua Keycloak OIDC (100% Pure HTTP, Không cần mở trình duyệt)
   */
  async refreshAccessToken(refreshToken) {
    if (!refreshToken) return { success: false, error: 'Thiếu Refresh Token' };

    try {
      const bodyParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'bb-web-client',
        refresh_token: refreshToken,
      });

      const res = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
          'Origin': 'https://digibank.msb.com.vn',
          'Referer': 'https://digibank.msb.com.vn/',
        },
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(9000),
      });

      const data = await res.json();
      if (res.ok && data.access_token) {
        const newAccess = data.access_token;
        const newRefresh = data.refresh_token || refreshToken;

        this.saveSessionFiles({
          accessToken: newAccess,
          refreshToken: newRefresh,
        });

        return {
          success: true,
          accessToken: newAccess,
          refreshToken: newRefresh,
          expiresIn: data.expires_in,
        };
      }

      return {
        success: false,
        error: data.error_description || data.error || `HTTP ${res.status}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Lấy số dư và arrangementId của tài khoản MSB
   */
  async getBalance(accessToken, cookie = '', contextId = '') {
    if (!accessToken) return { success: false, error: 'Thiếu Access Token' };

    try {
      const saved = this.loadSavedSession();
      const ctx = contextId || saved.contextId || '8a5890d9a0f8477301a139c5fee83639';
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': this.userAgent,
        'X-App-Version': this.appVersion,
        'Origin': 'https://digibank.msb.com.vn',
        'Referer': 'https://digibank.msb.com.vn/',
        'x-user-context': ctx,
      };
      if (cookie) headers['Cookie'] = cookie;

      const res = await fetch(this.arrangementsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 401) {
        return { success: false, code: 401, error: 'Token hết hạn' };
      }

      const body = await res.json();
      const list = body.data || (Array.isArray(body) ? body : []);
      if (list.length > 0) {
        const acct = list[0];
        const arrId = acct.id || '';
        const accNum = acct.externalArrangementId || '';
        const accName = acct.accountHolderNames || acct.name || this.getJwtName(accessToken) || 'LE MANH DUONG';
        const balance = parseFloat(acct.availableBalance ?? acct.bookedBalance ?? 0);

        return {
          success: true,
          accountNumber: accNum,
          accountName: String(accName).trim(),
          balance,
          arrangementId: arrId,
          currency: acct.currency || 'VND',
        };
      }

      // Dự phòng arrangement_id từ file lưu trữ
      const fallbackArrId = saved.arrangementId || 'b4c83d40-0a82-4646-bdac-13d48034d054';

      return {
        success: true,
        accountNumber: '',
        accountName: this.getJwtName(accessToken) || 'LE MANH DUONG',
        balance: 0,
        arrangementId: fallbackArrId,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Lấy lịch sử giao dịch MSB DigiBank (100% Pure Node.js HTTP REST)
   */
  async getTransactionHistory(bankAccount, options = {}) {
    const days = parseInt(options.days || 30);
    const limit = parseInt(options.limit || 30);

    let session = bankAccount.sessionData || {};
    let accessToken = session.accessToken || session.access_token;
    let refreshToken = session.refreshToken || session.refresh_token;
    let arrangementId = session.arrangementId || session.arrangement_id;
    let contextId = session.contextId || session.context_id;
    let cookie = session.cookie || session.cookie_string || '';

    // Nếu trong DB chưa có sessionData hoặc thiếu contextId/arrangementId, nạp từ file msb_session.json
    const saved = this.loadSavedSession(bankAccount.accountNumber);
    if (!accessToken && saved.accessToken) accessToken = saved.accessToken;
    if (!refreshToken && saved.refreshToken) refreshToken = saved.refreshToken;
    if (!arrangementId && saved.arrangementId) arrangementId = saved.arrangementId;
    if (!contextId && saved.contextId) contextId = saved.contextId;
    if (!cookie && saved.cookie) cookie = saved.cookie;

    if (!contextId) {
      contextId = '8a5890d9a0f8477301a139c5fee83639';
    }
    if (!arrangementId) {
      arrangementId = 'b4c83d40-0a82-4646-bdac-13d48034d054';
    }

    if (!accessToken && !refreshToken) {
      return {
        success: false,
        status: 'error',
        code: '99',
        bank: 'msb',
        message: 'Chưa có phiên đăng nhập MSB DigiBank. Vui lòng bấm [Cập nhật phiên] trên trang quản trị.',
        transactions: [],
      };
    }

    // Tính khoảng thời gian tra cứu: từ (today - days) đến (today + 1 day)
    const now = new Date();
    const toDateObj = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const fromDateObj = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const fmtDate = (d) => d.toISOString().split('T')[0];
    const fromDate = fmtDate(fromDateObj);
    const toDate = fmtDate(toDateObj);

    // Vòng lặp tra cứu tự động refresh nếu gặp 401
    for (let attempt = 0; attempt < 2; attempt++) {
      // Đảm bảo có arrangementId
      if (!arrangementId) {
        const balRes = await this.getBalance(accessToken, cookie, contextId);
        if (balRes.success && balRes.arrangementId) {
          arrangementId = balRes.arrangementId;
          session.arrangementId = arrangementId;
        } else if (balRes.code === 401 && attempt === 0 && refreshToken) {
          const rf = await this.refreshAccessToken(refreshToken);
          if (rf.success) {
            accessToken = rf.accessToken;
            refreshToken = rf.refreshToken;
            session.accessToken = accessToken;
            session.refreshToken = refreshToken;
            continue;
          }
        }
      }

      if (!arrangementId) {
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'msb',
          message: 'Không tìm thấy mã tài khoản arrangementId của MSB. Vui lòng bấm [Cập nhật phiên].',
          transactions: [],
        };
      }

      const txUrl = `${this.transactionsUrl}?bookingDateGreaterThan=${fromDate}&bookingDateLessThan=${toDate}&arrangementId=${arrangementId}&from=0&size=${limit}&orderBy=creationTime&direction=DESC`;

      try {
        const ctx = contextId || session.contextId || saved.contextId || '8a5890d9a0f8477301a139c5fee83639';
        const headers = {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': this.userAgent,
          'X-App-Version': this.appVersion,
          'Origin': 'https://digibank.msb.com.vn',
          'Referer': 'https://digibank.msb.com.vn/',
          'x-user-context': ctx,
        };
        if (cookie) headers['Cookie'] = cookie;

        const res = await fetch(txUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(12000),
        });

        if (res.status === 401 && attempt === 0) {
          // Token hết hạn -> Tự động nạp lại refresh token nếu thiếu và gia hạn qua Keycloak endpoint tức thì
          if (!refreshToken) {
            if (saved.refreshToken) refreshToken = saved.refreshToken;
          }

          if (refreshToken) {
            const rf = await this.refreshAccessToken(refreshToken);
            if (rf.success) {
              accessToken = rf.accessToken;
              refreshToken = rf.refreshToken;
              session.accessToken = accessToken;
              session.refreshToken = refreshToken;

              try {
                if (bankAccount) {
                  bankAccount.sessionData = bankAccount.sessionData || {};
                  bankAccount.sessionData.accessToken = accessToken;
                  bankAccount.sessionData.refreshToken = refreshToken;
                  bankAccount.sessionData.contextId = contextId;
                  bankAccount.sessionData.arrangementId = arrangementId;
                  if (typeof bankAccount.save === 'function') {
                    bankAccount.save().catch(() => {});
                  }
                }
                const mongoose = require('mongoose');
                if (mongoose.connection && mongoose.connection.readyState === 1) {
                  mongoose.connection.db.collection('bankaccounts').updateOne(
                    { accountNumber: bankAccount.accountNumber },
                    { $set: { 'sessionData.accessToken': accessToken, 'sessionData.refreshToken': refreshToken, 'sessionData.contextId': contextId, 'sessionData.arrangementId': arrangementId, updatedAt: new Date() } }
                  ).catch(() => {});
                }
              } catch (_) {}

              continue;
            }
          }
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return {
            success: false,
            status: 'error',
            code: '99',
            bank: 'msb',
            message: `MSB API lỗi (HTTP ${res.status}): ${errText.substring(0, 150)}`,
            transactions: [],
          };
        }

        const rawData = await res.json();
        const rawList = Array.isArray(rawData) ? rawData : (rawData.data || []);

        const transactions = [];
        let latestBalance = bankAccount.balance || 0;

        for (const tx of rawList) {
          const txId = String(tx.reference || tx.id || '');
          let dateStr = tx.bookingDate || '';
          if (tx.creationTime) {
            try {
              const d = new Date(tx.creationTime);
              if (!isNaN(d.getTime())) {
                dateStr = new Intl.DateTimeFormat('vi-VN', {
                  timeZone: 'Asia/Ho_Chi_Minh',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                }).format(d).replace(/,/g, '');
              }
            } catch (_) {}
          }

          const indicator = String(tx.creditDebitIndicator || '').toUpperCase();
          const isCredit = indicator === 'CRDT' || indicator === 'CREDIT';

          const amtObj = tx.transactionAmountCurrency || tx.transactionAmount || {};
          const amount = Math.abs(parseFloat(amtObj.amount || 0));
          const bal = parseFloat(tx.runningBalance || 0);
          if (bal > 0 && latestBalance === 0) latestBalance = bal;

          transactions.push({
            transactionID: txId,
            amount,
            type: isCredit ? 'IN' : 'OUT',
            description: String(tx.description || '').trim(),
            transactionDate: dateStr,
            balance: bal,
          });
        }

        // Lấy số dư mới nhất nếu có
        const balRes = await this.getBalance(accessToken, cookie).catch(() => null);
        if (balRes && balRes.success) {
          latestBalance = balRes.balance;
        }

        const resolvedAccountName = balRes?.accountName || this.getJwtName(accessToken) || bankAccount.accountName || 'LE MANH DUONG';

        // Cập nhật lại sessionData và balance vào MongoDB
        try {
          bankAccount.sessionData = {
            accessToken,
            refreshToken,
            arrangementId,
            cookie,
            latestTransactions: transactions,
            updatedAt: new Date().toISOString(),
          };
          if (latestBalance !== undefined && latestBalance !== null) {
            bankAccount.balance = latestBalance;
          }
          if (resolvedAccountName && resolvedAccountName !== 'Tài khoản MSB') {
            bankAccount.accountName = resolvedAccountName;
          }
          bankAccount.lastSyncAt = new Date();
          bankAccount.markModified('sessionData');
          await bankAccount.save();
        } catch (_) {}

        return {
          success: true,
          status: 'success',
          code: '00',
          bank: 'msb',
          accountNumber: bankAccount.accountNumber,
          accountName: resolvedAccountName,
          balance: latestBalance,
          count: transactions.length,
          transactions,
        };
      } catch (err) {
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'msb',
          message: `Lỗi kết nối MSB: ${err.message}`,
          transactions: [],
        };
      }
    }

    return {
      success: false,
      status: 'error',
      code: '99',
      bank: 'msb',
      message: 'Phiên MSB DigiBank đã hết hạn. Vui lòng bấm [Cập nhật phiên] trên trang quản trị.',
      transactions: [],
    };
  }

  /**
   * Khởi động Chrome Daemon riêng cho MSB trên cổng 9226
   */
  async ensureChromeRunning(user = '0869482825') {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch (_) {}

    // Chống xung đột khi gọi song song
    if (this.isStartingChrome) {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
          const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(400) });
          if (res.ok) return true;
        } catch (_) {}
      }
    }
    this.isStartingChrome = true;

    try {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(800) });
        if (res.ok) return true;
      } catch (_) {}

      const chromePaths = [
        process.env.CHROME_PATH,
        process.env.CHROME_BIN,
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      ].filter(Boolean);
      const chromeExe = chromePaths.find(p => fs.existsSync(p));
      if (!chromeExe) {
        throw new Error('Không tìm thấy trình duyệt Google Chrome hoặc Chromium trên máy chủ VPS. Vui lòng cài đặt google-chrome hoặc chromium-browser.');
      }

      const cleanUser = String(user).replace(/[^a-zA-Z0-9_-]/g, '_');
      const legacyProfile = path.resolve(__dirname, '../../../../core/MBS-API-BANKING-main/MBS-API-BANKING-main/chrome_profile');
      const profileDir = fs.existsSync(legacyProfile) ? legacyProfile : path.resolve(process.cwd(), `data/msb/profiles/${cleanUser}`);
      fs.mkdirSync(profileDir, { recursive: true });

      console.log(`[MSB Node.js] Khởi động Chrome ẩn ngầm tự động hóa đăng nhập trên cổng ${this.port}...`);
      const args = [
        '--headless=new',
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-sync',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-blink-features=AutomationControlled',
        `--user-agent=${this.userAgent}`,
        '--window-size=1366,768',
        'https://digibank.msb.com.vn/',
      ];

      const proc = spawn(chromeExe, args, {
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();

      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${this.port}/json/version`, { signal: AbortSignal.timeout(300) });
          if (res.ok) return true;
        } catch (_) {}
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`Không thể khởi động Chrome trên cổng ${this.port}`);
    } finally {
      this.isStartingChrome = false;
    }
  }

  /**
   * Đóng hoàn toàn tiến trình Chrome MSB để giải phóng bộ nhớ
   */
  async stopChrome() {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const tabs = await res.json();
        for (const tab of tabs) {
          if (tab.webSocketDebuggerUrl) {
            try {
              const ws = new WebSocket(tab.webSocketDebuggerUrl);
              await new Promise((resolve) => {
                ws.onopen = () => {
                  ws.send(JSON.stringify({ id: 999, method: 'Browser.close' }));
                  setTimeout(() => {
                    try { ws.close(); } catch (_) {}
                    resolve();
                  }, 500);
                };
                ws.onerror = () => resolve();
                setTimeout(resolve, 1000);
              });
              break;
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    console.log(`[MSB Node.js] Đã đóng trình duyệt Chrome cổng ${this.port} để giải phóng tài nguyên.`);
  }

  /**
   * Lấy WebSocket Debugger URL của tab MSB
   */
  async getDebuggerUrl(user) {
    await this.ensureChromeRunning(user);
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const tabs = await res.json();
      let msbTab = tabs.find(t => t.type === 'page' && t.url && (t.url.includes('msb.com.vn') || t.url.includes('select-context') || t.url.includes('auth/realms')));
      if (!msbTab) msbTab = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
      if (!msbTab && tabs.length > 0) msbTab = tabs[0];
      return msbTab ? msbTab.webSocketDebuggerUrl : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Thực thi JavaScript qua WebSocket CDP (an toàn khi trang chuyển hướng)
   */
  async executeEvaluate(expression, user, timeoutMs = 12000) {
    const wsUrl = await this.getDebuggerUrl(user);
    if (!wsUrl) throw new Error(`Không thể kết nối Chrome Debugger MSB cổng ${this.port}`);

    return new Promise((resolve, reject) => {
      let isDone = false;
      const timer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          try { ws.close(); } catch (_) {}
          reject(new Error('Hết thời gian chờ phản hồi từ Chrome CDP (Timeout)'));
        }
      }, timeoutMs);

      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 101,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }));
      };

      ws.onmessage = (event) => {
        if (isDone) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.id === 101) {
            isDone = true;
            clearTimeout(timer);
            try { ws.close(); } catch (_) {}
            if (msg.error) {
              const errMsg = msg.error.message || '';
              reject(new Error(errMsg || 'Lỗi CDP Evaluate'));
            } else {
              resolve(msg.result?.result?.value);
            }
          }
        } catch (err) {
          isDone = true;
          clearTimeout(timer);
          try { ws.close(); } catch (_) {}
          reject(err);
        }
      };

      ws.onerror = (err) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          try { ws.close(); } catch (_) {}
          reject(new Error('WebSocket connection error'));
        }
      };
    });
  }

  /**
   * Điều hướng trình duyệt tới URL
   */
  async navigateUrl(targetUrl, user, waitMs = 2500) {
    const wsUrl = await this.getDebuggerUrl(user);
    if (!wsUrl) return;

    await new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 51,
          method: 'Page.navigate',
          params: { url: targetUrl },
        }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.id === 51) {
            ws.close();
            resolve();
          }
        } catch (_) {
          ws.close();
          resolve();
        }
      };
      ws.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });

    if (waitMs > 0) {
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  /**
   * ĐĂNG NHẬP THUẦN NODE.JS (verifyLogin):
   * 1. Trước hết kiểm tra xem có Refresh Token hợp lệ không, nếu có -> tự động làm mới tức thì không cần mở trình duyệt.
   * 2. Nếu không có token hợp lệ -> tự động mở Chrome CDP, điền form đăng nhập, chờ phê duyệt Smart OTP trên app MSB mBank.
   * 3. Trích xuất tokens & arrangementId và lưu vĩnh viễn.
   */
  async verifyLogin(params = {}) {
    const { username, password, accountNumber, sessionData } = params;
    const user = String(username || accountNumber || '').trim();
    const pwd = String(password || '').trim();

    console.log(`====================================================`);
    console.log(`🚀 [MSB Node.js] KIỂM TRA & XÁC THỰC PHIÊN: ${user}`);
    console.log(`====================================================`);

    // 1. Thử xác thực trực tiếp qua HTTP trước nếu đã có refreshToken
    let rfToken = sessionData?.refreshToken || sessionData?.refresh_token;
    if (!rfToken) {
      const saved = this.loadSavedSession(accountNumber);
      if (saved.refreshToken) rfToken = saved.refreshToken;
    }

    if (rfToken) {
      console.log(`[MSB Node.js] Đang kiểm tra làm mới phiên qua Refresh Token...`);
      const rf = await this.refreshAccessToken(rfToken);
      if (rf.success) {
        const bal = await this.getBalance(rf.accessToken);
        if (bal.success) {
          console.log(`🎉 [MSB Node.js] Phiên hợp lệ không cần mở trình duyệt! Chủ TK: ${bal.accountName}, Số dư: ${bal.balance}`);
          return {
            success: true,
            status: 'success',
            bank: 'msb',
            accountNumber: bal.accountNumber || accountNumber || user,
            accountName: bal.accountName,
            balance: bal.balance,
            sessionData: {
              accessToken: rf.accessToken,
              refreshToken: rf.refreshToken,
              arrangementId: bal.arrangementId,
            },
            message: 'Phiên MSB DigiBank được kích hoạt thành công qua Refresh Token',
          };
        }
      }
    }

    // 2. Nếu không có session hợp lệ -> tự động hóa qua Chrome CDP
    if (!user || !pwd) {
      return {
        success: false,
        status: 'error',
        bank: 'msb',
        message: 'Phiên MSB đã hết hạn. Vui lòng cung cấp mật khẩu để tự động xác thực qua Chrome.',
      };
    }

    console.log(`[1/3] Khởi động Chrome ngầm và mở trang đăng nhập MSB DigiBank...`);
    await this.ensureChromeRunning(user);

    // Luôn điều hướng về trang chủ để bắt đầu phiên đăng nhập sạch và gửi thông báo mới
    const curUrl = await this.executeEvaluate(`window.location.href`, user, 1500).catch(() => '');
    if (!curUrl || curUrl.includes('login-actions/authenticate') || !curUrl.includes('msb.com.vn')) {
      await this.navigateUrl('https://digibank.msb.com.vn/', user, 800);
    }

    console.log(`[2/3] Chờ trang đăng nhập MSB sẵn sàng và tự động điền form...`);
    const startWaitForm = Date.now();
    let formSubmitted = false;
    let isAlreadyLoggedIn = false;
    let loginErrorMessage = '';

    while (Date.now() - startWaitForm < 35000) {
      try {
        const res = await this.executeEvaluate(`
          (() => {
            const u = window.location.href;
            const title = document.title || '';

            // 0. CHỈ coi là đã đăng nhập khi đã có access_token VÀ refresh_token trong storage
            const accToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
            const refToken = sessionStorage.getItem('refresh_token') || localStorage.getItem('refresh_token');
            if (accToken && refToken && (u.includes('dashboard') || u.includes('select-context'))) {
              return { status: 'already_logged_in', url: u };
            }

            // Kiểm tra thông báo lỗi trên trang đăng nhập
            const errEl = document.querySelector('.alert, .error, #input-error, .kc-feedback-text, .msb-error-text');
            if (errEl && errEl.innerText && errEl.innerText.trim().length > 3) {
              return { status: 'error', message: errEl.innerText.trim(), url: u };
            }

            // Nếu đã vào màn hình OTP (Check your Device / login-actions/authenticate)
            const isOtp = u.includes('login-actions/authenticate') 
              || title.includes('Check your Device') 
              || (document.body && document.body.innerText.includes('xác thực đăng nhập'));

            if (isOtp) return { status: 'otp_screen', url: u };

            // Tìm ô input đăng nhập
            const uInp = document.querySelector('#identity-web-auth-login-username-input') 
              || document.querySelector('input[name="username"]')
              || Array.from(document.querySelectorAll('input')).find(i => (i.placeholder || '').toLowerCase().includes('tên') || (i.placeholder || '').toLowerCase().includes('đăng nhập'));
            const pInp = document.querySelector('#identity-web-auth-login-password-input') 
              || document.querySelector('input[name="password"]')
              || document.querySelector('input[type="password"]');
            const submitBtn = document.querySelector('#bb_button_0_load-button')
              || document.querySelector('#kc-login')
              || document.querySelector('input[name="login"]')
              || document.querySelector('input[type="submit"]')
              || document.querySelector('button[type="submit"]')
              || Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('đăng nhập'));

            if (uInp && pInp) {
              const valSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              
              // Điền username
              uInp.focus();
              if (valSetter) valSetter.call(uInp, ${JSON.stringify(user)}); else uInp.value = ${JSON.stringify(user)};
              uInp.dispatchEvent(new Event('input', { bubbles: true }));
              uInp.dispatchEvent(new Event('change', { bubbles: true }));
              uInp.dispatchEvent(new Event('blur', { bubbles: true }));

              // Điền password
              pInp.focus();
              if (valSetter) valSetter.call(pInp, ${JSON.stringify(pwd)}); else pInp.value = ${JSON.stringify(pwd)};
              pInp.dispatchEvent(new Event('input', { bubbles: true }));
              pInp.dispatchEvent(new Event('change', { bubbles: true }));
              pInp.dispatchEvent(new Event('blur', { bubbles: true }));

              // Bấm nút đăng nhập
              if (submitBtn && !submitBtn.disabled) {
                submitBtn.click();
                return { status: 'submitted', url: u };
              } else if (submitBtn) {
                // Thử click ngay cả khi có class
                submitBtn.click();
                return { status: 'submitted', url: u };
              } else if (uInp.form || uInp.closest('form')) {
                const f = uInp.form || uInp.closest('form');
                if (typeof f.requestSubmit === 'function') f.requestSubmit();
                else f.submit();
                return { status: 'submitted', url: u };
              }
            }

            return { status: 'waiting', url: u, title: title };
          })()
        `, user, 3000);

        if (res?.status === 'already_logged_in') {
          formSubmitted = true;
          isAlreadyLoggedIn = true;
          console.log(`[MSB Node.js] Phiên đã sẵn sàng hoặc tự động đồng bộ qua SSO! Đang trích xuất token...`);
          break;
        }

        if (res?.status === 'error') {
          loginErrorMessage = res.message;
          console.warn(`[MSB Node.js] ⚠️ Lỗi từ trang đăng nhập MSB: ${loginErrorMessage}`);
          break;
        }

        if (res?.status === 'otp_screen' || res?.status === 'submitted') {
          formSubmitted = true;
          console.log(`[MSB Node.js] Đã điền và gửi form đăng nhập thành công! Đang chờ MSB chuyển sang màn hình OTP...`);
          break;
        }
      } catch (err) {
        // Trang đang chuyển hướng, tiếp tục chờ
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (loginErrorMessage) {
      await this.stopChrome();
      return {
        success: false,
        status: 'error',
        bank: 'msb',
        message: `MSB thông báo: ${loginErrorMessage}`,
      };
    }

    if (!formSubmitted) {
      await this.stopChrome();
      return {
        success: false,
        status: 'error',
        bank: 'msb',
        message: 'Hết thời gian chờ trang đăng nhập MSB sẵn sàng (Timeout 35s)',
      };
    }

    // Đợi trang chuyển hoàn tất sang màn hình OTP (Check your Device)
    if (!isAlreadyLoggedIn) {
      const startWaitOtp = Date.now();
      let reachedOtpScreen = false;
      while (Date.now() - startWaitOtp < 12000) {
        try {
          const otpCheck = await this.executeEvaluate(`
            (() => {
              const u = window.location.href;
              const title = document.title || '';
              const body = document.body ? document.body.innerText : '';
              return u.includes('login-actions/authenticate') 
                || title.includes('Check your Device') 
                || body.includes('yêu cầu xác thực đăng nhập')
                || body.includes('xác thực');
            })()
          `, user, 2000);
          if (otpCheck) {
            reachedOtpScreen = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 500));
      }
      if (reachedOtpScreen) {
        console.log(`[MSB Node.js] 📲 ĐÃ KÍCH HOẠT MÀN HÌNH XÁC THỰC! MSB đã gửi thông báo phê duyệt tới điện thoại của bạn.`);
      }
    }

    console.log(`[3/3] Chờ bạn bấm [Phê duyệt] trên App MSB mBank trên điện thoại...`);
    const timeoutSeconds = 140;
    const startWait = Date.now();
    let loggedIn = false;

    while (Date.now() - startWait < timeoutSeconds * 1000) {
      await new Promise(r => setTimeout(r, 800));

      const poll = await this.executeEvaluate(`
        (() => {
          const u = window.location.href;
          const isHome = u.includes('digibank.msb.com.vn') && !u.includes('auth/realms') && !u.includes('select-context');
          const isSelectContext = u.includes('select-context');

          // 1. Tự động click nút Smart OTP / Gửi thông báo nếu Keycloak hiển thị lựa chọn
          const otpBtns = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], a.btn'));
          const promptBtn = otpBtns.find(b => {
            const t = (b.innerText || b.value || '').toLowerCase();
            return t.includes('smart otp') || t.includes('gửi thông báo') || t.includes('xác thực') || t.includes('tiếp tục') || t.includes('xác nhận');
          });
          if (promptBtn && !promptBtn.disabled) {
            promptBtn.click();
          }

          // 2. Tự động vượt qua màn hình chọn bối cảnh cá nhân
          if (isSelectContext) {
            const btns = Array.from(document.querySelectorAll('button, [role="button"], .bb-card'));
            const cBtn = btns.find(b => (b.innerText || '').toLowerCase().includes('cá nhân') || (b.innerText || '').toLowerCase().includes('tiếp tục'));
            if (cBtn) cBtn.click();
          }

          // 3. Đọc tokens từ sessionStorage & localStorage
          let accToken = null;
          let refToken = null;
          let ctxId = null;

          try {
            accToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
            refToken = sessionStorage.getItem('refresh_token') || localStorage.getItem('refresh_token');
            ctxId = sessionStorage.getItem('contextId') || localStorage.getItem('contextId');
          } catch (_) {}

          // Quét toàn bộ storage tìm refresh_token
          const storages = [sessionStorage, localStorage];
          for (const st of storages) {
            try {
              for (let i = 0; i < st.length; i++) {
                const k = st.key(i);
                const v = st.getItem(k);
                if (!v) continue;

                if ((k === 'refresh_token' || k.toLowerCase().includes('refresh')) && !refToken && v.length > 20) {
                  refToken = v;
                }
                if ((k === 'access_token' || k.toLowerCase().includes('access_token')) && !accToken && v.length > 20) {
                  accToken = v;
                }
                if ((k === 'contextId' || k.toLowerCase().includes('contextid')) && !ctxId && v.length > 10) {
                  ctxId = v;
                }

                try {
                  const p = JSON.parse(v);
                  if (p && typeof p === 'object') {
                    if (!accToken && p.access_token) accToken = p.access_token;
                    if (!refToken && p.refresh_token) refToken = p.refresh_token;
                    if (!ctxId && (p.contextId || p.context_id)) ctxId = p.contextId || p.context_id;
                  }
                } catch (_) {}
              }
            } catch (_) {}
          }

          return {
            isHome,
            isSelectContext,
            accToken,
            refToken,
            contextId: ctxId,
            url: u,
            cookie: document.cookie,
          };
        })()
      `, user).catch(() => ({ isHome: false, isSelectContext: false, accToken: null, refToken: null, contextId: null, url: '', cookie: '' }));

      if ((poll.isHome || poll.isSelectContext || (poll.url && poll.url.includes('digibank.msb.com.vn') && !poll.url.includes('auth/realms'))) && (poll.accToken || poll.refToken)) {
        console.log(`🎉 [MSB Node.js] Xác thực thành công! URL: ${poll.url}`);
        loggedIn = true;

        const newAccessToken = poll.accToken;
        const newRefreshToken = poll.refToken;
        const contextId = poll.contextId || '';
        const cookie = poll.cookie || '';

        // Tải số dư và arrangementId
        await new Promise(r => setTimeout(r, 1000));
        const bal = await this.getBalance(newAccessToken, cookie, contextId);
        const resolvedAccountName = bal?.accountName || this.getJwtName(newAccessToken) || 'LE MANH DUONG';
        const balance = bal?.balance || 0;
        const arrangementId = bal?.arrangementId || 'b4c83d40-0a82-4646-bdac-13d48034d054';

        this.saveSessionFiles({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          arrangementId,
          cookie,
          contextId,
        });

        // Cập nhật trực tiếp vào MongoDB
        try {
          const mongoose = require('mongoose');
          const BankAccount = mongoose.models?.BankAccount;
          if (BankAccount) {
            await BankAccount.updateOne(
              { bankCode: 'msb', accountNumber: bal?.accountNumber || accountNumber || user },
              {
                $set: {
                  sessionData: {
                    accessToken: newAccessToken,
                    refreshToken: newRefreshToken,
                    arrangementId,
                    contextId,
                    cookie,
                  },
                  accountName: resolvedAccountName,
                  balance,
                  lastLoginAt: new Date(),
                  lastSyncAt: new Date(),
                  status: 'active',
                }
              }
            );
            console.log(`[MSB Node.js] Đã cập nhật sessionData & tokens vào MongoDB thành công.`);
          }
        } catch (dbErr) {
          console.warn('[MSB Node.js] Lỗi ghi DB trực tiếp (không ảnh hưởng):', dbErr.message);
        }

        // Đóng Chrome ẩn ngay lập tức để giải phóng tài nguyên
        await this.stopChrome();
        console.log(`[MSB Node.js] Đã tự động đóng Chrome ẩn. Mọi truy vấn sau này đều dùng 100% Request URL.`);

        return {
          success: true,
          status: 'success',
          bank: 'msb',
          accountNumber: bal?.accountNumber || accountNumber || user,
          accountName: resolvedAccountName,
          balance,
          sessionData: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            arrangementId,
            contextId,
            cookie,
          },
          message: `Đăng nhập MSB DigiBank thành công! Chủ tài khoản: ${resolvedAccountName}`,
        };
      }
    }

    await this.stopChrome();
    return {
      success: false,
      status: 'error',
      bank: 'msb',
      message: 'Hết thời gian chờ phê duyệt Smart OTP trên ứng dụng điện thoại MSB (Timeout)',
    };
  }
}

module.exports = new MsbService();

