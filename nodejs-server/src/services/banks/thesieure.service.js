const axios = require('axios');

class TheSieuReService {
  constructor() {
    this.baseUrl = 'https://thesieure.com';
  }

  /**
   * Verify session with TheSieuRe.com
   */
  async verifyLogin({ username, accountNumber, password, cookie }) {
    try {
      const targetUser = username || accountNumber;
      if (cookie) {
        const response = await axios.get(`${this.baseUrl}/account/profile`, {
          headers: {
            'Host': 'thesieure.com',
            'Referer': 'https://thesieure.com/',
            'Cookie': cookie,
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 10; SM-J600G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36',
          },
          timeout: 15000,
        });

        const html = response.data;
        if (typeof html === 'string') {
          // Check if profile page rendered with user details
          if (html.includes('account/logout') || html.includes('col-7 text-right') || html.includes('Thông tin cá nhân')) {
            // Extract username or balance
            const matchName = html.match(/<b>(.*?)<\/b>/i);
            const verifiedName = matchName ? matchName[1].trim() : targetUser;
            return {
              success: true,
              accountName: verifiedName,
              sessionData: {
                cookie,
                verifiedAt: new Date().toISOString(),
              },
            };
          }
        }

        return {
          success: false,
          message: 'Cookie Thẻ Siêu Rẻ không hợp lệ hoặc đã hết phiên đăng nhập',
        };
      }

      if (!targetUser || !password) {
        return {
          success: false,
          message: 'Vui lòng cung cấp tài khoản và mật khẩu Thẻ Siêu Rẻ',
        };
      }

      return {
        success: true,
        accountName: targetUser,
        sessionData: {
          note: 'Tài khoản Thẻ Siêu Rẻ đã lưu',
        },
      };
    } catch (err) {
      return {
        success: false,
        message: 'Lỗi kết nối Thẻ Siêu Rẻ: ' + (err.response?.data?.message || err.message),
      };
    }
  }
}

module.exports = new TheSieuReService();
