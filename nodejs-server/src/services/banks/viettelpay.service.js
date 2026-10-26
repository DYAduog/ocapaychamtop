const axios = require('axios');
const crypto = require('crypto');

/**
 * ViettelPay / Viettel Money API Service (Chuyển đổi từ d:\7bank\core\bank\viettel.php)
 * Hỗ trợ:
 * - Gửi mã OTP xác thực thiết bị mới (sendOTP)
 * - Xác thực OTP + PIN đăng nhập (loginUser)
 * - Đăng nhập lại với phiên đã lưu (loginRefresh / SESSION)
 * - Làm mới Access Token (refresh)
 * - Truy vấn số dư tổng tài sản (getBalance)
 * - Lấy lịch sử giao dịch thông báo (getHistory)
 */
class ViettelPayService {
  constructor() {
    this.baseUrl = 'https://api8.viettelpay.vn';
    this.appVersion = '5.1.8';
    this.appName = 'VIETTELPAY';
    this.typeOs = 'ios';
  }

  /**
   * Tạo mã IMEI ngẫu nhiên chuẩn ViettelPay (8-4-4-4-12)
   */
  generateImei() {
    const gen = (len) => {
      const chars = '0123456789QWERTYUIOPASDFGHJKLMNBVCXZ';
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };
    return `${gen(8)}-${gen(4)}-${gen(4)}-${gen(4)}-${gen(12)}`;
  }

  /**
   * Headers tiêu chuẩn gửi tới máy chủ ViettelPay
   */
  getHeaders(accessToken = '') {
    const headers = {
      'Host': 'api8.viettelpay.vn',
      'Product': this.appName,
      'Authority-Party': 'APP',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'ViettelPay/5.1.8 (iPhone; iOS 16.0; Scale/3.00)',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken.trim()}`;
    }
    return headers;
  }

  /**
   * Gửi HTTP POST request với cấu hình timeout và bắt lỗi an toàn
   */
  async post(url, data, accessToken = '', timeoutMs = 15000) {
    try {
      const response = await axios.post(url, data, {
        headers: this.getHeaders(accessToken),
        timeout: timeoutMs,
      });
      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      if (error.response) {
        return {
          success: false,
          status: error.response.status,
          data: error.response.data,
          message: error.response.data?.message || error.response.data?.status?.message || `HTTP ${error.response.status}`,
        };
      }
      return {
        success: false,
        status: 0,
        message: error.message || 'Lỗi kết nối máy chủ ViettelPay',
      };
    }
  }

  /**
   * Bước 1: Gửi yêu cầu cấp OTP đăng nhập về số điện thoại
   */
  async sendOTP({ phone, imei }) {
    const deviceImei = imei || this.generateImei();
    const payload = {
      msisdn: phone,
      typeOs: 'iOS',
      imei: deviceImei,
      username: phone,
      userType: 'msisdn',
      loginType: 'BASIC',
    };

    const res = await this.post(`${this.baseUrl}/auth/v1/authn/login`, payload);
    return {
      ...res,
      imei: deviceImei,
      requestId: res.data?.data?.requestId || res.data?.requestId || '',
    };
  }

  /**
   * Bước 2: Xác thực OTP và PIN để nhận Access Token
   */
  async loginUser({ phone, password, otp, requestId, imei }) {
    const deviceImei = imei || this.generateImei();
    const payload = {
      msisdn: phone,
      typeOs: 'iOS',
      otp: String(otp || '').trim(),
      pin: String(password || '').trim(),
      imei: deviceImei,
      username: phone,
      userType: 'msisdn',
      loginType: 'BASIC',
      requestId: requestId || '',
    };

    const res = await this.post(`${this.baseUrl}/auth/v1/authn/login`, payload);
    return {
      ...res,
      imei: deviceImei,
    };
  }

  /**
   * Đăng nhập nhanh bằng SESSION (cho thiết bị đã xác thực OTP trước đó)
   */
  async loginRefresh({ phone, password, imei }) {
    const payload = {
      msisdn: phone,
      typeOs: 'iOS',
      pin: String(password || '').trim(),
      imei: imei || this.generateImei(),
      username: phone,
      userType: 'msisdn',
      loginType: 'SESSION',
    };

    return await this.post(`${this.baseUrl}/auth/v1/authn/login`, payload);
  }

  /**
   * Làm mới Access Token bằng Refresh Token
   */
  async refresh({ accessToken, refreshToken }) {
    const payload = {
      refreshToken: refreshToken,
    };

    return await this.post(`${this.baseUrl}/auth/v1/authn/refresh`, payload, accessToken);
  }

  /**
   * Kiểm tra xem Access Token có sắp hết hạn không (ngưỡng bufferSeconds giây)
   */
  isTokenExpiring(jwtToken, bufferSeconds = 90) {
    if (!jwtToken) return true;
    try {
      const parts = jwtToken.split('.');
      if (parts.length < 2) return true;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (!payload.exp) return false;
      const now = Math.floor(Date.now() / 1000);
      return (payload.exp - now) < bufferSeconds;
    } catch (_) {
      return true;
    }
  }

  /**
   * Truy vấn số dư tổng tài sản
   */
  async getBalance({ accessToken, phone, imei }) {
    const payload = {
      app_version: this.appVersion,
      app_name: this.appName,
      type_os: this.typeOs,
      body: {
        accountNo: phone,
      },
      imei: imei || this.generateImei(),
    };

    const res = await this.post(`${this.baseUrl}/whm/whm-core-service/public/v1/total-assets/find-total-assets`, payload, accessToken);
    if (res.success) {
      const totalAssets = res.data?.body?.totalAssets || res.data?.data?.totalAssets || [];
      let totalBalance = 0;
      let vttBalance = 0;
      let mmBalance = 0;

      for (const item of totalAssets) {
        const amt = Number(item.amount) || 0;
        totalBalance += amt;
        if (item.assetType === 'VTT') vttBalance = amt;
        if (item.assetType === 'MM') mmBalance = amt;
      }

      res.parsedBalance = {
        totalBalance,
        vttBalance,
        mmBalance,
        totalAssets,
      };
    }
    return res;
  }

  /**
   * Lấy lịch sử biến động số dư qua thông báo (Notifications)
   * Có cơ chế Auto Retry thông minh để xử lý việc đồng bộ giữa các node server ViettelPay
   */
  async getHistory({ accessToken, imei, page = 1, size = 20, status = [0, 1, 2, 3, 4, 5, -1], autoRetry = true }) {
    const payload = {
      status: Array.isArray(status) && status.length > 0 ? status : [0, 1, 2, 3, 4, 5, -1],
      app_version: this.appVersion,
      app_name: this.appName,
      size: Number(size) || 20,
      type_os: this.typeOs,
      page: Number(page) || 1,
      imei: imei || this.generateImei(),
    };

    let res = await this.post(`${this.baseUrl}/gnotification-service/public/api/v1/notify/search`, payload, accessToken);

    // Nếu lần đầu trả về mảng rỗng (do load balancer Viettel chưa đồng bộ), tự động thử lại sau 1.5s
    if (autoRetry && res.success && (!res.data?.data?.content || res.data.data.content.length === 0)) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        await new Promise(r => setTimeout(r, 1500));
        res = await this.post(`${this.baseUrl}/gnotification-service/public/api/v1/notify/search`, payload, accessToken);
        if (res.data?.data?.content && res.data.data.content.length > 0) {
          break;
        }
      }
    }

    return res;
  }

  /**
   * Chuẩn hóa lịch sử biến động từ ViettelPay notifications
   */
  normalizeTransactions(notifyList = []) {
    const transactions = [];

    for (const item of notifyList) {
      // 1. Số tiền
      let amount = 0;
      if (item.amount !== undefined && item.amount !== null && item.amount !== '') {
        amount = Math.abs(Number(item.amount)) || 0;
      }

      // 2. Loại giao dịch (IN / OUT)
      let type = 'IN';
      if (item.paymentType === 'DEBIT') {
        type = 'OUT';
      } else if (item.paymentType === 'CREDIT') {
        type = 'IN';
      } else {
        const checkStr = `${item.msgContent || ''} ${item.content || ''}`.toLowerCase();
        if (checkStr.includes('thanh toan') || checkStr.includes('tru') || checkStr.includes('chuyen di')) {
          type = 'OUT';
        }
      }

      // 3. Nội dung giao dịch
      const description = (item.msgContent || item.description || item.content || item.notifyContent || item.title || '').trim();

      // 4. Mã giao dịch
      const transactionID = String(item.bankTransId || item.orderId || item.clientId || item.notifyId || item.id || 'VT' + Date.now());

      // 5. Ngày giao dịch
      const transactionDate = item.transDate || item.createdDate || item.sendDate || item.time || new Date().toISOString();

      transactions.push({
        transactionID,
        amount,
        description,
        transactionDate,
        type,
        balance: item.balance ? Number(item.balance) : undefined,
        raw: item,
      });
    }

    return transactions;
  }

  // =========================================================================
  // GIAO THỨC TÍCH HỢP CHUẨN 7BANK GATEWAY
  // =========================================================================

  /**
   * Xác thực đăng nhập qua BankFactory của 7Bank
   */
  async verifyLogin({ username, accountNumber, password, otp, requestId, imei, sessionData = {}, force = false }) {
    const phone = username || accountNumber;
    if (!phone || !phone.match(/^(0|84)[3|5|7|8|9][0-9]{8}$/)) {
      return {
        success: false,
        message: 'Số điện thoại Viettel Money không hợp lệ (cần 10 số đầu 03, 05, 07, 08, 09)',
      };
    }

    if (!password || password.length < 6) {
      return {
        success: false,
        message: 'Mật khẩu / mã PIN Viettel Money tối thiểu 6 ký tự',
      };
    }

    const deviceImei = imei || sessionData.imei || this.generateImei();

    // 1. Nếu có OTP được truyền lên: thực hiện loginUser
    if (otp) {
      const effectiveRequestId = requestId || sessionData.requestId;
      const loginRes = await this.loginUser({
        phone,
        password,
        otp,
        requestId: effectiveRequestId,
        imei: deviceImei,
      });

      if (!loginRes.success) {
        return {
          success: false,
          message: loginRes.message || 'Mã OTP hoặc mật khẩu Viettel Money không chính xác',
          raw: loginRes.data,
        };
      }

      const tokenData = loginRes.data?.data || loginRes.data || {};
      const accessToken = tokenData.accessToken || tokenData.token || '';
      const refreshToken = tokenData.refreshToken || '';

      let balance = 0;
      let accountName = `Viettel Money (${phone})`;
      try {
        const balRes = await this.getBalance({ accessToken, phone, imei: deviceImei });
        if (balRes.success) {
          balance = Number(balRes.parsedBalance?.totalBalance ?? balRes.data?.data?.totalBalance ?? balRes.data?.totalBalance ?? 0);
        }
      } catch (_) {}

      return {
        success: true,
        accountName,
        balance,
        accountNumber: phone,
        sessionData: {
          phone,
          imei: deviceImei,
          accessToken,
          refreshToken,
          connectedAt: new Date().toISOString(),
        },
        message: 'Đăng nhập Viettel Money thành công',
      };
    }

    // 2. Thử đăng nhập nhanh bằng SESSION nếu đã có IMEI và không yêu cầu force OTP
    if (!force && sessionData.imei) {
      const refreshRes = await this.loginRefresh({
        phone,
        password,
        imei: sessionData.imei,
      });

      if (refreshRes.success && (refreshRes.data?.data?.accessToken || refreshRes.data?.accessToken)) {
        const tokenData = refreshRes.data?.data || refreshRes.data;
        return {
          success: true,
          accountName: `Viettel Money (${phone})`,
          balance: 0,
          accountNumber: phone,
          sessionData: {
            ...sessionData,
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken || sessionData.refreshToken,
            lastLoginAt: new Date().toISOString(),
          },
          message: 'Đăng nhập lại Viettel Money thành công',
        };
      }
    }

    // 3. Nếu chưa có OTP hoặc session hết hạn: Gửi mã OTP xác thực
    const otpRes = await this.sendOTP({ phone, imei: deviceImei });
    if (!otpRes.success) {
      return {
        success: false,
        message: otpRes.message || 'Không thể gửi mã OTP Viettel Money. Vui lòng kiểm tra lại số điện thoại!',
        raw: otpRes.data,
      };
    }

    return {
      success: false,
      requiresOtp: true,
      accountNumber: phone,
      accountName: `Viettel Money (${phone})`,
      expiresIn: 120,
      sessionData: {
        phone,
        imei: deviceImei,
        requestId: otpRes.requestId,
      },
      message: 'Viettel Money đã gửi mã OTP xác nhận về số điện thoại. Vui lòng nhập OTP để tiếp tục.',
    };
  }

  /**
   * Truy vấn lịch sử giao dịch chuẩn 7Bank Gateway
   */
  async getTransactionHistory(bankAccount, options = {}) {
    const { accountNumber, username, sessionData = {}, password } = bankAccount;
    const phone = username || accountNumber;
    let accessToken = sessionData.accessToken;
    let refreshToken = sessionData.refreshToken;
    const imei = sessionData.imei || this.generateImei();

    // 1. Nếu chưa có token nhưng có password: Đăng nhập nhanh bằng SESSION
    if (!accessToken && password) {
      const logRes = await this.loginRefresh({ phone, password, imei });
      if (logRes.success && (logRes.data?.data?.accessToken || logRes.data?.accessToken)) {
        const newData = logRes.data?.data || logRes.data;
        accessToken = newData.accessToken;
        refreshToken = newData.refreshToken || refreshToken;
        sessionData.accessToken = accessToken;
        sessionData.refreshToken = refreshToken;
        sessionData.imei = imei;
      }
    }

    if (!accessToken && !refreshToken) {
      return {
        status: 'error',
        code: '99',
        bank: 'viettel',
        message: 'Chưa có phiên đăng nhập Viettel Money. Vui lòng đăng nhập tài khoản!',
        transactions: [],
      };
    }

    // 2. Kiểm tra xem token có sắp hết hạn không (dưới 90 giây), nếu có tự động làm mới
    if (this.isTokenExpiring(accessToken, 90) && refreshToken) {
      const refRes = await this.refresh({ accessToken, refreshToken });
      if (refRes.success && (refRes.data?.data?.accessToken || refRes.data?.accessToken)) {
        const newData = refRes.data?.data || refRes.data;
        accessToken = newData.accessToken;
        sessionData.accessToken = accessToken;
        if (newData.refreshToken) sessionData.refreshToken = newData.refreshToken;
      }
    }

    // 3. Thử truy vấn lịch sử với accessToken
    let histRes = await this.getHistory({
      accessToken,
      imei,
      page: 1,
      size: options.size || 20,
      status: [0, 1, 2, 3, 4, 5, -1],
      autoRetry: true,
    });

    const hasContent = histRes.success && Array.isArray(histRes.data?.data?.content) && histRes.data.data.content.length > 0;

    // 4. Nếu không thành công, token hết hạn (403), hoặc danh sách rỗng (load balancer ViettelPay cần kích hoạt lại quyền phiên):
    if (!histRes.success || histRes.status === 403 || (!hasContent && password)) {
      console.log(`[ViettelPay] getHistory lần 1 (${histRes.success ? 'Rỗng 0 giao dịch' : 'HTTP ' + histRes.status}). Đang làm mới phiên bằng SESSION...`);
      let reloginSuccess = false;

      // Ưu tiên đăng nhập lại bằng SESSION nếu có mật khẩu PIN để lấy Token gắn đúng quyền hộp thư thông báo
      if (password) {
        console.log(`[ViettelPay] Đang tự động đăng nhập lại bằng SESSION với SĐT: ${phone}, IMEI: ${imei}...`);
        const logRes = await this.loginRefresh({ phone, password, imei });
        if (logRes.success && (logRes.data?.data?.accessToken || logRes.data?.accessToken)) {
          const newData = logRes.data?.data || logRes.data;
          accessToken = newData.accessToken;
          refreshToken = newData.refreshToken || refreshToken;
          sessionData.accessToken = accessToken;
          sessionData.refreshToken = refreshToken;
          sessionData.imei = imei;
          reloginSuccess = true;
          console.log('[ViettelPay] Tự động đăng nhập lại bằng SESSION thành công!');
        } else {
          console.log(`[ViettelPay] loginRefresh thất bại: ${logRes.message || logRes.data?.status?.message}`);
        }
      }

      // Nếu không có password nhưng có refreshToken: thử refresh
      if (!reloginSuccess && refreshToken) {
        const refRes = await this.refresh({ accessToken, refreshToken });
        if (refRes.success && (refRes.data?.data?.accessToken || refRes.data?.accessToken)) {
          const newData = refRes.data?.data || refRes.data;
          accessToken = newData.accessToken;
          refreshToken = newData.refreshToken || refreshToken;
          sessionData.accessToken = accessToken;
          sessionData.refreshToken = refreshToken;
          reloginSuccess = true;
          console.log('[ViettelPay] Đã làm mới token bằng refreshToken thành công!');
        } else {
          console.log('[ViettelPay] RefreshToken không hợp lệ hoặc đã hết hạn.');
        }
      }

      if (reloginSuccess) {
        histRes = await this.getHistory({
          accessToken,
          imei,
          page: 1,
          size: options.size || 20,
          status: [0, 1, 2, 3, 4, 5, -1],
          autoRetry: true,
        });
        console.log(`[ViettelPay] getHistory sau relogin: Success: ${histRes.success}, Elements: ${histRes.data?.data?.pageMetadata?.totalElements}`);
      }
    }

    if (!histRes.success) {
      return {
        status: 'error',
        code: '99',
        bank: 'viettel',
        message: histRes.message || 'Không thể lấy lịch sử giao dịch Viettel Money',
        transactions: [],
      };
    }

    const rawList = histRes.data?.data?.content || histRes.data?.data?.list || histRes.data?.list || histRes.data?.data || [];
    const normalizedTxs = this.normalizeTransactions(Array.isArray(rawList) ? rawList : []);

    // Lấy số dư mới nhất
    let balance = bankAccount.balance || 0;
    try {
      const balRes = await this.getBalance({ accessToken, phone, imei });
      if (balRes.success && balRes.parsedBalance) {
        balance = balRes.parsedBalance.totalBalance;
      } else if (balRes.success) {
        balance = Number(balRes.data?.data?.totalBalance || balRes.data?.totalBalance || balance);
      }
    } catch (_) {}

    return {
      status: 'success',
      code: '00',
      bank: 'viettel',
      accountNumber: phone,
      accountName: bankAccount.accountName || `Viettel Money (${phone})`,
      balance,
      transactions: normalizedTxs,
      sessionData,
    };
  }
}

module.exports = new ViettelPayService();
