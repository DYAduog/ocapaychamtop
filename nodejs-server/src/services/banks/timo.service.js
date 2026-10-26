const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CREDS_FILE = path.resolve(__dirname, '../../../../core/timo-bank-master/timo_credentials.json');
const APP_VERSION = '332';
const API_HOSTNAME = 'app2.timo.vn';

class TimoService {
  constructor() {
    this.hostname = API_HOSTNAME;
    this.appVersion = APP_VERSION;
    this.browserSignature = `:WEB:WEB:${APP_VERSION}:WEB:desktop:chrome`;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
  }

  sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  sha512(input) {
    return crypto.createHash('sha512').update(input).digest('hex');
  }

  generateDeviceId() {
    return crypto.randomBytes(16).toString('hex');
  }

  buildDeviceReg(deviceId, signature = this.browserSignature) {
    return `${deviceId}${signature}`;
  }

  buildContextId(deviceId) {
    const inputString = `WEB.${deviceId}.${this.appVersion}`;
    const hashPart = this.sha256(inputString);
    const uuid = crypto.randomUUID();
    return `${hashPart}.${uuid}`;
  }

  buildDeviceKey(timoDeviceId, signature = this.browserSignature) {
    return `${timoDeviceId}${signature}`;
  }

  getSavedCredentials(user) {
    try {
      if (fs.existsSync(CREDS_FILE)) {
        const raw = fs.readFileSync(CREDS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (!user || data.username === user || data.username === String(user).trim()) {
          return data;
        }
      }
    } catch (_) {}
    return null;
  }

  saveCredentials(data) {
    try {
      const dir = path.dirname(CREDS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (_) {}
  }

  request(method, reqPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : '';
      const reqHeaders = {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json; charset=UTF-8',
        'origin': 'https://my.timo.vn',
        'referer': 'https://my.timo.vn/',
        'user-agent': this.userAgent,
        ...headers,
      };

      if (body) {
        reqHeaders['content-length'] = Buffer.byteLength(postData).toString();
      }

      const options = {
        hostname: this.hostname,
        port: 443,
        path: reqPath,
        method: method,
        headers: reqHeaders,
        timeout: 25000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              json: JSON.parse(data),
              raw: data,
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              raw: data,
            });
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timo request timed out'));
      });

      if (body) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Xác thực đăng nhập tài khoản Timo Digital Bank
   */
  async verifyLogin({ username, accountNumber, password, sessionData = {} }) {
    const user = String(username || accountNumber || '').trim();
    console.log(`[TimoService] Verifying login for user: ${user}...`);

    // 1. Kiểm tra thiết bị đã xác thực (Trusted Device)
    const savedCreds = this.getSavedCredentials(user) || {};
    const deviceId = sessionData?.deviceId || savedCreds.deviceId || this.generateDeviceId();
    const timoDeviceId = sessionData?.timoDeviceId || savedCreds.timoDeviceId || 'DfEXfvmZ';
    const signature = this.browserSignature;
    const contextId = this.buildContextId(deviceId);
    const deviceReg = this.buildDeviceReg(deviceId, signature);

    // 2. Hash mật khẩu nếu chưa hash
    let hashedPassword = '';
    if (password) {
      hashedPassword = (password.length === 128 && /^[0-9a-fA-F]+$/.test(password))
        ? password
        : this.sha512(password);
    } else if (savedCreds.password) {
      hashedPassword = savedCreds.password;
    } else if (sessionData?.hashedPassword) {
      hashedPassword = sessionData.hashedPassword;
    }

    if (!hashedPassword) {
      return {
        success: false,
        message: 'Thiếu mật khẩu tài khoản Timo để xác thực',
      };
    }

    try {
      console.log(`[TimoService] Đang gửi yêu cầu đăng nhập tới https://${this.hostname}/login...`);
      const loginRes = await this.request(
        'POST',
        '/login',
        {
          'x-timo-devicereg': deviceReg,
          'x-gofs-context-id': contextId,
        },
        {
          username: user,
          password: hashedPassword,
          lang: 'vn',
        }
      );

      const respJson = loginRes.json || {};

      // THÀNH CÔNG: Thiết bị đã được tin cậy hoặc token hợp lệ
      if (respJson.success && respJson.code === 200 && respJson.data) {
        const data = respJson.data;
        const sessionToken = data.token;
        const assignedTimoDeviceId = data.timoDeviceId || timoDeviceId;

        const sessionHeaders = {
          token: sessionToken,
          'x-gofs-context-id': contextId,
          'x-timo-devicekey': this.buildDeviceKey(assignedTimoDeviceId, signature),
        };

        // Lấy thông tin khách hàng (Profile)
        let customerName = 'Chủ tài khoản Timo';
        try {
          const profileRes = await this.request('GET', '/user/getProfile', sessionHeaders);
          if (profileRes.json && profileRes.json.data) {
            customerName = profileRes.json.data.fullName || customerName;
          }
        } catch (_) {}

        // Lấy danh sách số tài khoản & số dư
        let spendAccountNo = accountNumber || '';
        let balance = 0;
        try {
          const accRes = await this.request('GET', '/user/accountPreview', sessionHeaders);
          if (accRes.json && accRes.json.data && accRes.json.data.accounts) {
            const accounts = accRes.json.data.accounts;
            const spendAcc = accounts.find((a) => a.accountType === '1025' || a.name === 'Spend Account') || accounts[0];
            if (spendAcc) {
              spendAccountNo = spendAcc.no || spendAccountNo;
              balance = parseFloat(spendAcc.availableAmount ?? spendAcc.balance ?? 0);
            }
          }
        } catch (_) {}

        // Lưu thông tin credentials để tự động duy trì phiên
        const updatedCreds = {
          username: user,
          password: hashedPassword,
          deviceId,
          timoDeviceId: assignedTimoDeviceId,
          browserSignature: signature,
          createdAt: new Date().toISOString(),
        };
        this.saveCredentials(updatedCreds);

        return {
          success: true,
          accountName: customerName,
          accountNumber: spendAccountNo || user,
          balance,
          sessionData: {
            username: user,
            hashedPassword,
            deviceId,
            timoDeviceId: assignedTimoDeviceId,
            browserSignature: signature,
            token: sessionToken,
            contextId,
            spendAccountNo,
            verifiedAt: new Date().toISOString(),
          },
          message: 'Đăng nhập Timo thành công (Bypass OTP thiết bị tin cậy)',
        };
      }

      // NẾU TIMO YÊU CẦU OTP CHO THIẾT BỊ MỚI
      if (respJson.code === 6001 || respJson.code === 6006) {
        const otpData = respJson.data || {};
        return {
          success: false,
          requiresOtp: true,
          refNo: otpData.refNo,
          message: `Timo đã gửi mã OTP xác thực tới số điện thoại ${otpData.phoneNumber || user}. Vui lòng xác thực trên ứng dụng Timo hoặc nhập mã OTP.`,
        };
      }

      // Lỗi mật khẩu hoặc bị khóa
      const msg = respJson.error?.message || respJson.message || `Đăng nhập Timo thất bại (Mã lỗi: ${respJson.code || loginRes.statusCode})`;
      return {
        success: false,
        message: msg,
        raw: respJson,
      };
    } catch (err) {
      console.error('[TimoService] Exception during login:', err.message);
      return {
        success: false,
        message: `Lỗi kết nối tới máy chủ Timo: ${err.message}`,
      };
    }
  }

  /**
   * Truy vấn lịch sử giao dịch Timo (Tự động đăng nhập lại nếu token hết hạn)
   */
  async getTransactionHistory(bankAccount, options = {}) {
    const { accountNumber, username, sessionData = {}, passwordEncrypted } = bankAccount;
    const user = username || sessionData.username || accountNumber;
    const days = options.days || 30;

    let token = sessionData.token;
    let deviceId = sessionData.deviceId;
    let timoDeviceId = sessionData.timoDeviceId;
    let contextId = sessionData.contextId || this.buildContextId(deviceId || this.generateDeviceId());
    let spendAccountNo = sessionData.spendAccountNo || accountNumber;

    // 1. Kiểm tra hoặc tự động làm mới phiên làm việc
    if (!token || !timoDeviceId) {
      console.log(`[TimoService] Session missing for Timo (${user}), auto-logging in...`);
      const relogin = await this.verifyLogin({
        username: user,
        accountNumber,
        password: bankAccount.password || '',
        sessionData,
      });

      if (!relogin.success) {
        return {
          status: 'error',
          bank: 'timo',
          message: relogin.message || 'Không thể đăng nhập tự động vào Timo',
          transactions: [],
        };
      }

      token = relogin.sessionData.token;
      deviceId = relogin.sessionData.deviceId;
      timoDeviceId = relogin.sessionData.timoDeviceId;
      contextId = relogin.sessionData.contextId;
      spendAccountNo = relogin.sessionData.spendAccountNo || spendAccountNo;
      Object.assign(sessionData, relogin.sessionData);
    }

    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - days);

    const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const executeFetch = async (authToken, authContextId) => {
      const sessionHeaders = {
        token: authToken,
        'x-gofs-context-id': authContextId,
        'x-timo-devicekey': this.buildDeviceKey(timoDeviceId, this.browserSignature),
      };

      const payload = {
        format: 'group',
        index: 0,
        offset: -1,
        accountNo: spendAccountNo,
        accountType: '1025',
        fromDate: fmt(fromDate),
        toDate: fmt(today),
      };

      return await this.request('POST', '/user/account/transaction/list', sessionHeaders, payload);
    };

    try {
      console.log(`[TimoService] Đang lấy lịch sử giao dịch Timo (STK: ${spendAccountNo})...`);
      let txRes = await executeFetch(token, contextId);

      // Nếu token hết hạn (HTTP 401 hoặc code !== 200), tự động relogin và thử lại
      if (!txRes.json || !txRes.json.success || txRes.statusCode === 401) {
        console.log('[TimoService] Token expired, executing auto-relogin...');
        const relogin = await this.verifyLogin({
          username: user,
          accountNumber,
          sessionData,
        });

        if (relogin.success) {
          token = relogin.sessionData.token;
          contextId = relogin.sessionData.contextId;
          Object.assign(sessionData, relogin.sessionData);
          txRes = await executeFetch(token, contextId);
        }
      }

      const items = [];
      if (txRes.json && txRes.json.data) {
        const data = txRes.json.data;
        for (const grp of data.items ?? []) {
          for (const item of grp.item ?? grp.itemDetailList ?? []) {
            items.push(item);
          }
        }
      }

      // Chuẩn hóa danh sách giao dịch theo quy chuẩn 7Bank (song song V1 & V2)
      const normalized = items.map((it) => {
        const isCr = it.txnType === 'CR';
        const amt = Math.abs(Number(it.txnAmount || 0));
        const ref = String(it.refNo || it.transactionId || it.id || `TIMO_${Date.now()}`);
        const date = it.txnTime || it.transactionTime || new Date().toISOString();
        const desc = it.txnDesc || '';
        return {
          transactionID: ref,
          amount: amt,
          description: desc,
          transactionDate: date,
          type: isCr ? 'IN' : 'OUT',
        };
      });

      return {
        status: 'success',
        bank: 'timo',
        count: normalized.length,
        transactions: normalized,
        sessionData,
      };
    } catch (err) {
      console.error('[TimoService] getTransactionHistory error:', err.message);
      return {
        status: 'error',
        bank: 'timo',
        message: `Lỗi truy vấn lịch sử Timo: ${err.message}`,
        transactions: [],
      };
    }
  }
}

module.exports = new TimoService();
