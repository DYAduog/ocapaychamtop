const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getPythonExecutable, getPythonProjectRoot } = require('../utils/python');

/**
 * Service kết nối và điều khiển các module Banking Python trong d:\7bank
 * (MBBank, ACB, VCB, BIDV, VietinBank, Techcombank, ZaloPay, TPBank).
 */
class PythonBridgeService {
  constructor() {
    const rootDir = getPythonProjectRoot();
    const candidates = [
      process.env.PYTHON_BRIDGE_PATH,
      path.resolve(rootDir, 'python_bridge.py'),
      path.resolve(__dirname, '../../../python_bridge.py'),
      path.resolve(__dirname, '../../python_bridge.py'),
      path.resolve(process.cwd(), '../python_bridge.py'),
      path.resolve(process.cwd(), 'python_bridge.py'),
      path.resolve(__dirname, '../python_bridge.py'),
      'D:/7bank/python_bridge.py',
    ].filter(Boolean);
    this.scriptPath = candidates.find(fs.existsSync) || path.resolve(rootDir, 'python_bridge.py');
    this.pythonExecutable = getPythonExecutable();
    this.defaultTimeoutMs = 85000; // 85s cho các bước xác thực Out-Of-Band / OTP (Techcombank, TPBank)
  }

  /**
   * Gọi python_bridge.py với payload và action tương ứng
   */
  async execute(action, payload = {}) {
    let keyCaptcha = payload.keyCaptcha || payload.key_captcha || process.env.KEY_CAPTCHA || process.env.CAPTCHA_API_KEY || 'local_offline_ai';
    let captchaApiUrl = payload.captchaApiUrl || payload.captcha_api_url || process.env.CAPTCHA_LOCAL_ENGINE_URL || process.env.CAPTCHA_API_URL || 'http://127.0.0.1:8088';
    try {
      const Setting = require('../models/Setting');
      const s = await Setting.findOne({ name: 'key_captcha' });
      if (s && s.value) keyCaptcha = s.value;
      const u = await Setting.findOne({ name: 'captcha_api_url' });
      if (u && u.value) captchaApiUrl = u.value;
    } catch (_) {}

    return new Promise((resolve) => {
      const inputData = {
        action,
        ...payload,
        keyCaptcha: payload.keyCaptcha || payload.key_captcha || keyCaptcha,
        key_captcha: payload.keyCaptcha || payload.key_captcha || keyCaptcha,
        captchaApiUrl: payload.captchaApiUrl || payload.captcha_api_url || captchaApiUrl,
        captcha_api_url: payload.captchaApiUrl || payload.captcha_api_url || captchaApiUrl,
      };

      const child = spawn(this.pythonExecutable, [this.scriptPath], {
        cwd: path.dirname(this.scriptPath),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          KEY_CAPTCHA: keyCaptcha,
          CAPTCHA_API_KEY: keyCaptcha,
          CAPTCHA_API_URL: captchaApiUrl,
        },
        windowsHide: true,
      });

      let stdoutData = '';
      let stderrData = '';
      let isTimedOut = false;

      let timeoutMs = this.defaultTimeoutMs;
      const bankNormalized = String(payload.bankCode || '').toLowerCase();
      if ((bankNormalized === 'msb' || bankNormalized === 'pgbank' || bankNormalized === 'pg' || bankNormalized === 'techcombank' || bankNormalized === 'tcb') && action === 'verify_login') {
        timeoutMs = 140000; // 140s cho MSB, PGBank và Techcombank phê duyệt Out-Of-Band trên điện thoại
      }

      const timer = setTimeout(() => {
        isTimedOut = true;
        console.warn(`[PythonBridge TIMEOUT ${timeoutMs / 1000}s] Bank: ${payload.bankCode || 'UNKNOWN'}. Tail output:\n${stdoutData.slice(-500)}`);
        child.kill();
        let timeoutMsg = `Kết nối tới cổng ngân hàng ${payload.bankCode?.toUpperCase() || ''} bị quá thời gian (Timeout ${timeoutMs / 1000}s). Vui lòng kiểm tra ứng dụng ngân hàng và thử lại.`;
        if (bankNormalized === 'msb') {
          timeoutMsg = 'Hết thời gian chờ xác thực MSB (140s). Bạn chưa kịp bấm [Phê duyệt] trên App MSB hoặc kết nối bị gián đoạn. Vui lòng thử lại!';
        } else if (bankNormalized === 'pgbank' || bankNormalized === 'pg') {
          timeoutMsg = 'Hết thời gian chờ xác thực PGBank (140s). Bạn chưa kịp chọn số xác thực Smart OTP trên App PGBank hoặc kết nối bị gián đoạn. Vui lòng thử lại!';
        } else if (bankNormalized === 'techcombank' || bankNormalized === 'tcb') {
          timeoutMsg = 'Hết thời gian chờ xác nhận Techcombank (140s). Bạn chưa kịp mở App Techcombank và bấm [Xác nhận]. Vui lòng thử lại!';
        }
        resolve({
          success: false,
          status: 'error',
          message: timeoutMsg,
        });
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stdoutData += text;
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('}') || trimmed.includes('7BANK_JSON')) continue;
          const lower = trimmed.toLowerCase();
          const isError = lower.includes('error') || lower.includes('failed') || lower.includes('lỗi') ||
                          lower.includes('thất bại') || lower.includes('[-] ') || lower.includes('❌') ||
                          lower.includes('hết hạn') || lower.includes('exception');
          if (isError) {
            console.error(`[PythonBridge:${payload.bankCode || 'PY'}:ERR]`, trimmed);
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderrData += text;
        console.error(`[PythonBridge:ERR]`, text.trim());
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        if (isTimedOut) return;
        console.error('[PythonBridge Error]:', err);
        resolve({
          success: false,
          status: 'error',
          message: `Không thể khởi chạy môi trường Python: ${err.message}`,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        const cleanOutput = stdoutData.trim();
        if (!cleanOutput) {
          resolve({
            success: false,
            status: 'error',
            message: stderrData.trim() || `Python process exited with code ${code} without output`,
          });
          return;
        }

        try {
          // 1. Kiểm tra marker phân cách chuẩn
          if (cleanOutput.includes('---7BANK_JSON_START---') && cleanOutput.includes('---7BANK_JSON_END---')) {
            const start = cleanOutput.indexOf('---7BANK_JSON_START---') + '---7BANK_JSON_START---'.length;
            const end = cleanOutput.indexOf('---7BANK_JSON_END---');
            const jsonText = cleanOutput.substring(start, end).trim();
            const parsed = JSON.parse(jsonText);
            resolve(parsed);
            return;
          }

          // 2. Thử parse từ các dòng cuối cùng ngược lên (dòng JSON kết quả)
          const lines = cleanOutput.split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
              try {
                const parsed = JSON.parse(line);
                resolve(parsed);
                return;
              } catch (_) {}
            }
          }

          // 3. Fallback lấy block JSON cuối cùng
          const lastBrace = cleanOutput.lastIndexOf('}');
          if (lastBrace !== -1) {
            const startBrace = cleanOutput.lastIndexOf('\n{', lastBrace);
            const idx = startBrace !== -1 ? startBrace + 1 : cleanOutput.indexOf('{');
            if (idx !== -1 && lastBrace > idx) {
              const parsed = JSON.parse(cleanOutput.substring(idx, lastBrace + 1));
              resolve(parsed);
              return;
            }
          }

          const parsed = JSON.parse(cleanOutput);
          resolve(parsed);
        } catch (parseErr) {
          console.error('[PythonBridge Parse Error]:', cleanOutput, parseErr);
          resolve({
            success: false,
            status: 'error',
            message: `Lỗi xử lý phản hồi từ hệ thống ngân hàng: ${cleanOutput.slice(0, 200)}`,
          });
        }
      });

      try {
        child.stdin.write(JSON.stringify(inputData));
        child.stdin.end();
      } catch (writeErr) {
        clearTimeout(timer);
        resolve({
          success: false,
          status: 'error',
          message: `Lỗi truyền tham số xác thực: ${writeErr.message}`,
        });
      }
    });
  }

  /**
   * Xác thực đăng nhập qua file API Python
   */
  async verifyLogin(params) {
    return await this.execute('verify_login', params);
  }

  /**
   * Lấy lịch sử giao dịch qua file API Python (tự động relogin nếu session hết hạn)
   */
  async getTransactionHistory(params) {
    return await this.execute('get_history', params);
  }

  /**
   * Giữ đăng nhập và làm mới session
   */
  async keepAlive(params) {
    return await this.execute('keepalive', params);
  }
}

module.exports = new PythonBridgeService();
