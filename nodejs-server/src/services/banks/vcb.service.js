const axios = require('axios');

class VCBService {
  constructor() {
    this.baseUrl = 'https://digiapp.vietcombank.com.vn';
  }

  /**
   * Verify login credentials with Vietcombank Digibank API
   */
  async verifyLogin({ username, password, accountNumber }) {
    try {
      const url = `${this.baseUrl}/authen-service/v1/login`;
      const payload = {
        user: username || accountNumber,
        password: password,
        DT: 'Windows',
        OV: '10',
        PM: 'Chrome 104.0.0.0',
        mid: 6,
        browserId: require('crypto').createHash('md5').update(String(username)).digest('hex'),
        lang: 'vi',
      };

      const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'Referer': 'https://vcbdigibank.vietcombank.com.vn/',
        'Origin': 'https://vcbdigibank.vietcombank.com.vn',
        'X-Channel': 'Web',
        'X-Request-ID': `${Date.now()}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      const response = await axios.post(url, payload, { headers, timeout: 15000 });
      const data = response.data;

      if (data && data.code === '00') {
        return {
          success: true,
          accountName: data.userInfo?.cusName || 'Chủ tài khoản Vietcombank',
          sessionData: {
            sessionId: data.sessionId,
            accessKey: data.accessKey,
            cif: data.userInfo?.cif,
            clientId: data.userInfo?.clientId,
            mobileId: data.userInfo?.mobileId,
          },
          raw: data,
        };
      }

      // VCB returns specific error codes: 105 (bad password), 9999 (data error/captcha required)
      let errMsg = data?.des || data?.message || 'Thông tin tài khoản hoặc mật khẩu Vietcombank không chính xác';
      if (data?.code === '105') {
        errMsg = 'Tên đăng nhập hoặc mật khẩu Vietcombank không chính xác (Mã 105)';
      } else if (data?.code === '9999') {
        errMsg = 'Vietcombank yêu cầu xác thực bảo mật hoặc thông tin đăng nhập không hợp lệ';
      }

      return {
        success: false,
        message: errMsg,
        raw: data,
      };
    } catch (err) {
      const errRes = err.response?.data;
      return {
        success: false,
        message: errRes?.des || 'Không thể kết nối đến máy chủ Vietcombank: ' + err.message,
        detail: errRes,
      };
    }
  }

  /**
   * Get Transaction History for VCB
   */
  async getTransactionHistory({ accountNumber, username, sessionData, days = 6 }) {
    try {
      const url = `${this.baseUrl}/bank-service/v1/transaction-history`;
      const payload = {
        accountNo: accountNumber,
        accountType: 'D',
        currPage: '1',
        maxCounter: '50',
        sessionId: sessionData?.sessionId,
        cif: sessionData?.cif,
        mid: 14,
      };

      const headers = {
        'Content-Type': 'application/json;charset=utf-8',
        'Authorization': `Bearer ${sessionData?.sessionId || 'null'}`,
        'X-Channel': 'Web',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      const response = await axios.post(url, payload, { headers, timeout: 15000 });
      return {
        status: 'success',
        bank: 'vcb',
        raw: response.data,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi truy vấn sao kê VCB: ' + (err.response?.data?.des || err.message),
      };
    }
  }
}

module.exports = new VCBService();
