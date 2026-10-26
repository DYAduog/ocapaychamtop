const axios = require('axios');

class ACBService {
  constructor() {
    this.clientId = 'iuSuHYVufIUuNIREV0FB9EoLn9kHsDbm';
    this.baseUrl = 'https://apiapp.acb.com.vn';
  }

  /**
   * Login ACB to retrieve access token
   */
  async login(username, password) {
    const url = `${this.baseUrl}/mb/v2/auth/tokens`;
    const payload = {
      clientId: this.clientId,
      username,
      password,
    };
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': 'apiapp.acb.com.vn',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13',
    };

    const response = await axios.post(url, payload, { headers, timeout: 15000 });
    return response.data;
  }

  /**
   * Get Account Balance
   */
  async getBalance(accessToken) {
    const url = `${this.baseUrl}/mb/legacy/ss/cs/bankservice/transfers/list/account-payment`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': 'apiapp.acb.com.vn',
      'Authorization': `bearer ${accessToken}`,
    };
    const response = await axios.get(url, { headers, timeout: 15000 });
    return response.data;
  }

  /**
   * Get Transaction History
   */
  async getTransactionHistory({ accountNumber, rows = 20, accessToken }) {
    const url = `${this.baseUrl}/mb/legacy/ss/cs/bankservice/saving/tx-history?maxRows=${rows}&account=${accountNumber}`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Host': 'apiapp.acb.com.vn',
      'Authorization': `bearer ${accessToken}`,
    };
    const response = await axios.get(url, { headers, timeout: 15000 });
    return response.data;
  }

  /**
   * Verify login credentials with ACB API
   */
  async verifyLogin({ username, password }) {
    try {
      const res = await this.login(username, password);
      if (res && res.accessToken) {
        return {
          success: true,
          accountName: res.identity?.displayName || 'Chủ tài khoản ACB',
          sessionData: {
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            identity: res.identity,
          },
          raw: res,
        };
      }
      return {
        success: false,
        message: res?.errorMessage || res?.message || 'ACB: Thông tin đăng nhập không chính xác',
        raw: res,
      };
    } catch (err) {
      const errData = err.response?.data;
      let msg = 'Thông tin đăng nhập ACB không chính xác hoặc tài khoản bị khóa';
      if (errData?.error && errData.error.includes('UsernameOrPasswordIncorrectException')) {
        msg = 'Tên đăng nhập hoặc mật khẩu ACB không chính xác';
      } else if (errData?.error) {
        msg = `ACB phản hồi lỗi: ${errData.error}`;
      }
      return { success: false, message: msg, detail: errData };
    }
  }
}

module.exports = new ACBService();
