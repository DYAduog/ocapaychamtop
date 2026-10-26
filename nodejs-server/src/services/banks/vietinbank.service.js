const { execFile } = require('child_process');
const path = require('path');

class VietinBankService {
  constructor() {
    this.baseUrl = 'https://api-ipay.vietinbank.vn/ipay/wa';
  }

  /**
   * Verify login credentials with VietinBank iPay API using viettin.py
   */
  async verifyLogin({ username, accountNumber, password }) {
    const user = username || accountNumber;
    if (!user || !password) {
      return {
        success: false,
        message: 'Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu VietinBank',
      };
    }

    if (password.length < 6) {
      return {
        success: false,
        message: 'Mật khẩu VietinBank iPay tối thiểu phải có 6 ký tự',
      };
    }

    return new Promise((resolve) => {
      const pythonScript = path.resolve(__dirname, '../../../viettin.py');
      const pyExe = process.platform === 'win32' ? 'python' : 'python3';
      const args = [pythonScript, user, password, accountNumber || user];

      execFile(pyExe, args, { timeout: 25000 }, (error, stdout, stderr) => {
        const fullOutput = (stdout || '') + (stderr || '');

        // Extract JSON if present in output
        let parsed = null;
        try {
          const jsonMatch = fullOutput.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        } catch (_) {}

        if (parsed) {
          if (parsed.error === false || parsed.sessionId) {
            return resolve({
              success: true,
              accountName: `VietinBank iPay - ${user}`,
              sessionData: {
                username: user,
                accountNumber: accountNumber || user,
                sessionId: parsed.sessionId,
                tokenId: parsed.tokenId,
                ipayId: parsed.ipayId,
                addField3: parsed.addField3,
                verifiedAt: new Date().toISOString(),
              },
              raw: parsed,
            });
          } else {
            return resolve({
              success: false,
              message:
                parsed.errorMessage ||
                parsed.errorCode ||
                'Đăng nhập VietinBank không thành công',
              raw: parsed,
            });
          }
        }

        if (error) {
          return resolve({
            success: false,
            message:
              fullOutput.trim().slice(0, 300) ||
              'Lỗi khi thực thi tiến trình xác thực VietinBank',
          });
        }

        return resolve({
          success: false,
          message:
            fullOutput.trim().slice(0, 300) || 'Đăng nhập VietinBank thất bại',
        });
      });
    });
  }
}

module.exports = new VietinBankService();
