const axios = require('axios');

class MBBankService {
  constructor() {
    this.baseUrl = 'https://online.mbbank.com.vn';
  }

  generateImei() {
    // Generate device id similar to PHP implementation
    const time = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const rand = Math.random().toString(36).substring(2, 10);
    return `${rand}-mbib-0000-0000-${time}`;
  }

  formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Get transaction history for an MBBank account
   */
  async getTransactionHistory({ phone, accountNumber, sessionId, deviceId, days = 6 }) {
    try {
      const toDate = this.formatDate(new Date());
      const fromDate = this.formatDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
      const refNo = `${phone}-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;

      const url = `${this.baseUrl}/api/retail-transactionms/transactionms/get-account-transaction-history`;
      const payload = {
        toDate,
        accountNo: accountNumber,
        sessionId,
        fromDate,
        refNo,
        deviceIdCommon: deviceId,
      };

      const headers = {
        'Deviceid': deviceId,
        'Authorization': 'Basic RU1CUkVUQUlMV0VCOlNEMjM0ZGZnMzQlI0BGR0AzNHNmc2RmNDU4NDNm',
        'Content-Type': 'application/json; charset=UTF-8',
        'RefNo': refNo,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://online.mbbank.com.vn/information-account/source-account',
        'X-Request-Id': refNo,
      };

      const response = await axios.post(url, payload, { headers, timeout: 15000 });
      return response.data;
    } catch (error) {
      if (error.response) {
        return error.response.data;
      }
      throw error;
    }
  }

  /**
   * Get Captcha Image from MBBank
   */
  async getCaptchaImage(deviceId) {
    const refNo = String(Date.now());
    const url = `${this.baseUrl}/retail-web-internetbankingms/getCaptchaImage`;
    const payload = {
      refNo,
      deviceIdCommon: deviceId,
      sessionId: '',
    };
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    const response = await axios.post(url, payload, { headers, timeout: 10000 });
    return response.data;
  }

  /**
   * Bypass Captcha tự động 100% Offline qua Engine OCR nội bộ
   */
  async bypassCaptcha(captchaServiceUrl, apiKey, base64Image) {
    if (!base64Image) {
      return null;
    }
    // 1. Ưu tiên giải tự động qua Engine OCR nội bộ (ddddocr)
    try {
      const captchaRentalService = require('../captchaRental.service');
      const res = await captchaRentalService.solveBase64(base64Image, 'mbbank');
      if (res && res.success && res.captcha) {
        return res.captcha;
      }
    } catch (_) {}

    // 2. Fallback nếu có cấu hình dịch vụ ngoài
    if (captchaServiceUrl && apiKey) {
      try {
        const response = await axios.post(
          captchaServiceUrl,
          {
            access_token: apiKey,
            type: 'mbbank',
            img_base64: base64Image,
          },
          { timeout: 10000 }
        );
        return response.data?.data?.captcha || response.data?.captcha;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Verify login credentials with MBBank
   */
  async verifyLogin({ phone, accountNumber, password }) {
    try {
      const deviceId = this.generateImei();
      const refNo = `${phone || accountNumber}-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`;

      const url = `${this.baseUrl}/api/retail_web/internetbanking/v2.0/doLogin`;
      const payload = {
        userId: phone || accountNumber,
        password: require('crypto').createHash('md5').update(String(password)).digest('hex'),
        sessionId: null,
        refNo: refNo,
        deviceIdCommon: deviceId,
      };

      const headers = {
        'Content-Type': 'application/json; charset=UTF-8',
        'Authorization': 'Basic RU1CUkVUQUlMV0VCOlNEMjM0ZGZnMzQlI0BGR0AzNHNmc2RmNDU4NDNm',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://online.mbbank.com.vn/pl/login',
        'Refno': refNo,
        'X-Request-Id': refNo,
      };

      const response = await axios.post(url, payload, { headers, timeout: 15000 });
      const data = response.data;

      if (data && data.sessionId) {
        return {
          success: true,
          accountName: data.cust?.nm || 'Chủ tài khoản MBBank',
          sessionData: {
            sessionId: data.sessionId,
            deviceId: deviceId,
            cust: data.cust,
          },
          raw: data,
        };
      }

      const msg = data?.result?.message || data?.message || 'Thông tin đăng nhập MBBank không chính xác hoặc cần mã hóa WASM/Captcha';
      return {
        success: false,
        message: msg,
        raw: data,
      };
    } catch (err) {
      const errRes = err.response?.data;
      return {
        success: false,
        message: errRes?.result?.message || 'Lỗi kết nối máy chủ MBBank: ' + err.message,
        detail: errRes,
      };
    }
  }
}

module.exports = new MBBankService();
