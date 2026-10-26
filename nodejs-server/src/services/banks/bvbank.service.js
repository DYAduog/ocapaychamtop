const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cryptoService = require('../crypto.service');

class BVBankService {
  constructor() {
    this.baseUrl = 'https://digibank.bvbank.net.vn';
    this.base64Key = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDOMAicHDxAkPEBRp4RfMpDCbTQ16wZCFdS4Uw2E9S5NVIGIRdirdViOTsaNWmbk/pQQQeVIccsHHh9hvH6St6z0krxmIPeXs9NqYniVNcWOqxPDxcm4FuKc736RI6TVqXI4zA/yH/+2dA4uCF54ekOoPT3Akd1m13m0hNZHX/77wIDAQAB';
    this.publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${this.base64Key}\n-----END PUBLIC KEY-----`;
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    this.sessionFile = path.resolve(process.cwd(), 'data/bvbank_session.json');
    this.pendingSessions = new Map();

    // Đảm bảo thư mục data/bvbank tồn tại
    const dataDir = path.resolve(process.cwd(), 'data/bvbank');
    if (!fs.existsSync(dataDir)) {
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
    }
  }

  /**
   * Lấy hoặc tạo mới deviceId cho tài khoản.
   * Khi tài khoản mới hoặc đã bị xóa dữ liệu, deviceId sẽ được sinh ngẫu nhiên mới hoàn toàn
   * để máy chủ ngân hàng nhận diện đây là thiết bị mới và bắt buộc yêu cầu xác thực Smart OTP.
   */
  getDeviceId(accountIdentifier) {
    const clean = String(accountIdentifier || 'bvbank_device').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const deviceFile = path.resolve(process.cwd(), `data/bvbank/device_${clean}.json`);
    try {
      if (fs.existsSync(deviceFile)) {
        const data = JSON.parse(fs.readFileSync(deviceFile, 'utf8'));
        if (data.deviceId && typeof data.deviceId === 'string' && data.deviceId.length >= 16) {
          return data.deviceId;
        }
      }
    } catch (_) {}

    // Tạo deviceId ngẫu nhiên mới hoàn toàn (32 ký tự hex) cho thiết bị mới
    const newDeviceId = crypto.randomBytes(16).toString('hex');
    try {
      fs.writeFileSync(deviceFile, JSON.stringify({ deviceId: newDeviceId, createdAt: new Date() }, null, 2), 'utf8');
    } catch (err) {
      console.warn('[BVBank Node.js] Không thể lưu deviceId mới:', err.message);
    }
    return newDeviceId;
  }

  /**
   * Mã hóa RSA PKCS#1 v1.5 với Public Key của BVBank
   */
  encryptWithPublicKey(plaintext) {
    try {
      const buffer = Buffer.from(String(plaintext || ''), 'utf8');
      const encrypted = crypto.publicEncrypt(
        {
          key: this.publicKeyPem,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        buffer
      );
      return encrypted.toString('base64');
    } catch (err) {
      console.error('[BVBank Node.js] RSA Encryption error:', err.message);
      return '';
    }
  }

  /**
   * Hợp nhất cookie mới vào chuỗi cookie hiện có, bảo toàn session hợp lệ
   */
  mergeCookies(existingCookieStr = '', setCookieHeaders = []) {
    const cookieMap = new Map();
    if (existingCookieStr) {
      existingCookieStr.split(';').forEach((c) => {
        const [k, ...v] = c.trim().split('=');
        if (k && v.length > 0) cookieMap.set(k.trim(), v.join('='));
      });
    }

    const headersList = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const sc of headersList) {
      if (!sc || typeof sc !== 'string') continue;
      const part = sc.split(';')[0];
      const [k, ...v] = part.trim().split('=');
      const val = v.join('=').trim();
      const key = k ? k.trim() : '';
      if (!key) continue;

      // Không ghi đè session hợp lệ bằng giá trị rỗng hoặc deleted
      if ((val === '' || val === 'deleted') && cookieMap.has(key)) {
        continue;
      }
      cookieMap.set(key, val);
    }

    const merged = [];
    cookieMap.forEach((v, k) => merged.push(`${k}=${v}`));
    return merged.join('; ');
  }

  /**
   * Trích xuất CSRF Token từ HTML trang login
   */
  extractCsrf(html) {
    if (!html) return '';
    const m =
      html.match(/name="_csrf"\s+value="([^"]+)"/i) ||
      html.match(/value="([^"]+)"\s+name="_csrf"/i) ||
      html.match(/_csrf.*?value=["'](.*?)["']/i);
    return m ? m[1] : '';
  }

  /**
   * Trích xuất thông báo lỗi từ trang login
   */
  extractErrorMessage(html) {
    if (!html) return '';
    const m = html.match(/login\.on_load\("(?:lock|error|pilot)",\s*"(.*?)"/);
    if (m && m[1]) {
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch (_) {
        return m[1];
      }
    }
    const alertMatch = html.match(/class=["'][^"']*alert[^"']*["'][^>]*>(.*?)<\/div>/i);
    if (alertMatch && alertMatch[1]) {
      return alertMatch[1].replace(/<[^>]*>/g, '').trim();
    }
    return '';
  }

  /**
   * Trích xuất danh sách tài khoản và số dư từ HTML trang chủ /home
   */
  extractAccounts(html) {
    if (!html) return [];
    const accounts = [];

    // Cách 1: Quét khối CASA item-li
    const itemRegex = /<div[^>]*class=["'][^"']*item-li[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[1];
      const accMatch = block.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      const balMatch = block.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
      if (accMatch) {
        const accNum = accMatch[1].replace(/<[^>]*>/g, '').trim();
        const balStr = balMatch ? balMatch[1].replace(/<[^>]*>/g, '').trim() : '0';
        const cleanBal = parseFloat(balStr.replace(/[^0-9]/g, '')) || 0;
        if (accNum) {
          accounts.push({ accountNumber: accNum, balance: cleanBal, rawBalance: balStr });
        }
      }
    }

    // Cách 2: Nếu chưa tìm thấy, quét theo span.me-2 & span.text-blue
    if (accounts.length === 0) {
      const accMatch = html.match(/<span[^>]*class=["'][^"']*me-2[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const balMatch = html.match(/<span[^>]*class=["'][^"']*text-blue[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      if (accMatch) {
        const accNum = accMatch[1].replace(/<[^>]*>/g, '').trim();
        const balStr = balMatch ? balMatch[1].replace(/<[^>]*>/g, '').trim() : '0';
        const cleanBal = parseFloat(balStr.replace(/[^0-9]/g, '')) || 0;
        if (accNum && accNum.length >= 6) {
          accounts.push({ accountNumber: accNum, balance: cleanBal, rawBalance: balStr });
        }
      }
    }

    return accounts;
  }

  /**
   * Trích xuất tên chủ tài khoản từ trang /home hoặc /account/getOtp
   */
  extractAccountName(html) {
    if (!html) return '';
    // Ưu tiên 1: Thẻ <b><a href="/account/info-person">TÊN CHỦ TÀI KHOẢN</a></b> trên header
    const bMatch = html.match(/<b>\s*<a[^>]+href=["'][^"']*info-person[^"']*["'][^>]*>([\s\S]*?)<\/a>\s*<\/b>/i);
    if (bMatch && bMatch[1]) {
      const name = bMatch[1].replace(/<[^>]*>/g, '').trim();
      if (name && !name.toLowerCase().includes('thông tin') && !name.toLowerCase().includes('thoát')) {
        return name;
      }
    }

    // Ưu tiên 2: Khối Kính chào Quý khách: <label>Kính chào Quý khách</label>\s*<label>\s*([A-ZÀ-Ỹ\s]{3,40})\s*</label>
    const welcomeMatch = html.match(/<label[^>]*>\s*Kính chào Quý khách\s*<\/label>\s*<label[^>]*>([\s\S]*?)<\/label>/i);
    if (welcomeMatch && welcomeMatch[1]) {
      const name = welcomeMatch[1].replace(/<[^>]*>/g, '').trim();
      if (name && !name.toLowerCase().includes('thông tin') && !name.toLowerCase().includes('quý khách')) {
        return name;
      }
    }

    // Ưu tiên 3: Xin chào ...
    const helloMatch = html.match(/Xin chào[,\s]*([A-ZÀ-Ỹ\s]{3,40})/i);
    if (helloMatch && helloMatch[1]) {
      const name = helloMatch[1].trim();
      if (name && !name.toLowerCase().includes('quý khách')) return name;
    }

    // Ưu tiên 4: <span class="user-name">...</span>
    const userMatch = html.match(/<span[^>]*class=["'][^"']*user-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    if (userMatch && userMatch[1]) {
      const name = userMatch[1].replace(/<[^>]*>/g, '').trim();
      if (name && !name.toLowerCase().includes('thông tin')) return name;
    }

    return '';
  }

  /**
   * Lưu phiên vào file JSON
   */
  saveSession(accountNumber, sessionData) {
    try {
      const cleanAcc = String(accountNumber || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.resolve(process.cwd(), `data/bvbank/${cleanAcc}.json`);
      fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf8');

      let allSessions = {};
      if (fs.existsSync(this.sessionFile)) {
        try { allSessions = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')); } catch (_) {}
      }
      allSessions[cleanAcc] = sessionData;
      fs.writeFileSync(this.sessionFile, JSON.stringify(allSessions, null, 2), 'utf8');
    } catch (err) {
      console.warn('[BVBank Node.js] Save session error:', err.message);
    }
  }

  /**
   * Tải phiên từ file JSON
   */
  loadSession(accountNumber) {
    try {
      const cleanAcc = String(accountNumber || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.resolve(process.cwd(), `data/bvbank/${cleanAcc}.json`);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
      if (fs.existsSync(this.sessionFile)) {
        const allSessions = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
        if (allSessions[cleanAcc]) return allSessions[cleanAcc];
      }
    } catch (_) {}
    return {};
  }

  /**
   * Lưu phiên chờ xác thực OTP
   */
  savePendingSession(accountNumber, pendingData) {
    try {
      const cleanAcc = String(accountNumber || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.resolve(process.cwd(), `data/bvbank/pending_${cleanAcc}.json`);
      fs.writeFileSync(filePath, JSON.stringify(pendingData, null, 2), 'utf8');
    } catch (_) {}
  }

  /**
   * Tải phiên chờ xác thực OTP
   */
  loadPendingSession(accountNumber) {
    try {
      const cleanAcc = String(accountNumber || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.resolve(process.cwd(), `data/bvbank/pending_${cleanAcc}.json`);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (_) {}
    return null;
  }

  /**
   * Xóa phiên chờ OTP sau khi hoàn tất
   */
  clearPendingSession(accountNumber) {
    try {
      const cleanAcc = String(accountNumber || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
      this.pendingSessions.delete(cleanAcc);
      const filePath = path.resolve(process.cwd(), `data/bvbank/pending_${cleanAcc}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
  }

  /**
   * Xóa sạch toàn bộ dữ liệu, file phiên, cache và mã định danh thiết bị của tài khoản.
   * Sau khi xóa, lần thêm lại tiếp theo sẽ được xử lý như một tài khoản/thiết bị hoàn toàn mới từ đầu.
   */
  clearAccountData(accountNumber, username) {
    const targets = new Set();
    if (accountNumber) targets.add(String(accountNumber).trim());
    if (username) targets.add(String(username).trim());

    const dataDir = path.resolve(process.cwd(), 'data/bvbank');

    for (const raw of targets) {
      this.closeBrowserSession(raw);
      const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
      this.closeBrowserSession(clean);
      this.pendingSessions.delete(clean);
      this.pendingSessions.delete(raw);

      // Quét và xóa toàn bộ file trong thư mục data/bvbank có chứa số TK hoặc username
      if (fs.existsSync(dataDir)) {
        try {
          const files = fs.readdirSync(dataDir);
          for (const file of files) {
            if (file.includes(clean) || (raw && file.includes(raw))) {
              try {
                fs.unlinkSync(path.join(dataDir, file));
                console.log(`[BVBank Node.js] 🗑️ Đã xóa file rác: ${file}`);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // Xóa trong file tổng hợp bvbank_session.json
      if (fs.existsSync(this.sessionFile)) {
        try {
          const allSessions = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
          delete allSessions[clean];
          delete allSessions[raw];
          fs.writeFileSync(this.sessionFile, JSON.stringify(allSessions, null, 2), 'utf8');
        } catch (_) {}
      }
    }

    console.log(`[BVBank Node.js] 🧹 Đã xóa sạch dữ liệu phiên và thông tin thiết bị cho: ${Array.from(targets).join(', ')}`);
  }

  /**
   * Khởi tạo phiên, tải trang /login và lấy CSRF token cùng cookies
   */
  async initSession(deviceId) {
    const url = `${this.baseUrl}/login`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      redirect: 'manual',
    });

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    let cookies = this.mergeCookies('', setCookies);
    if (deviceId) {
      cookies = `deviceId=${deviceId}; ` + cookies;
    }
    const html = await res.text();
    const csrf = this.extractCsrf(html);

    return { cookies, csrf };
  }


  /**
   * Đăng nhập BVBank DigiBank bằng HTTP API thuần (Node.js fetch, RSA PKCS#1 v1.5)
   * Không sử dụng trình duyệt ẩn (Headless Chrome / Puppeteer)
   */
  async login(username, password, accountNumber) {
    const user = String(username || accountNumber || '').trim();
    const pwd = String(password || '').trim();
    const accNum = String(accountNumber || user).trim();

    if (!user || !pwd) {
      return { success: false, message: 'Thiếu tên đăng nhập hoặc mật khẩu BVBank.' };
    }

    console.log(`[BVBank API] 🚀 Bắt đầu đăng nhập bằng HTTP API thuần cho tài khoản: ${user}...`);

    try {
      const cleanAcc = accNum.replace(/[^a-zA-Z0-9_-]/g, '_');
      const deviceId = this.getDeviceId(cleanAcc);

      // 1. Tải trang login để lấy cookies và _csrf (nếu có)
      const init = await this.initSession(deviceId);
      if (!init || !init.cookies) {
        return { success: false, message: 'Không thể kết nối máy chủ BVBank DigiBank. Vui lòng kiểm tra lại đường truyền.' };
      }

      // 2. Mã hóa RSA Public Key cho username và password
      const encUser = this.encryptWithPublicKey(user);
      const encPass = this.encryptWithPublicKey(pwd);

      const cusInfo = {
        ip: '',
        userAgent: this.userAgent,
        deviceName: 'Chrome 131.0.0.0',
        location: '',
      };

      const payload = new URLSearchParams({
        '_csrf': init.csrf || '',
        'infoForm': JSON.stringify(cusInfo),
        'username': encUser,
        'password': encPass,
      });

      // 3. Gửi POST /login
      const loginRes = await fetch(`${this.baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/login`,
          'User-Agent': this.userAgent,
          'Cookie': init.cookies,
        },
        body: payload.toString(),
        redirect: 'manual',
      });

      const sc1 = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
      let cookies = this.mergeCookies(init.cookies, sc1);

      const loc = loginRes.headers.get('location') || '';
      console.log(`[BVBank API] Kết quả POST /login: HTTP ${loginRes.status}, Location: ${loc}`);

      // Nếu BVBank yêu cầu OTP ngay tại /login
      if (loc.includes('/account/getOtp')) {
        console.log(`🔔 [BVBank API] Cần xác thực Smart OTP! Đang tải context trang /account/getOtp...`);
        try {
          const otpPageRes = await fetch(`${this.baseUrl}/account/getOtp`, {
            headers: {
              'User-Agent': this.userAgent,
              'Referer': `${this.baseUrl}/login`,
              'Cookie': cookies,
            },
            redirect: 'manual',
          });
          const scOtp = otpPageRes.headers.getSetCookie ? otpPageRes.headers.getSetCookie() : [otpPageRes.headers.get('set-cookie')];
          cookies = this.mergeCookies(cookies, scOtp);
        } catch (_) {}

        this.savePendingSession(cleanAcc, {
          username: user,
          accountNumber: accNum,
          passwordEncrypted: pwd,
          cookies,
          csrf: init.csrf,
          timestamp: Date.now(),
        });

        return {
          success: false,
          requiresOtp: true,
          status: 'requires_otp',
          bank: 'bvbank',
          accountNumber: accNum,
          username: user,
          accountName: 'LE MANH DUONG',
          expiresIn: 120,
          message: 'BVBank yêu cầu nhập mã Smart OTP từ ứng dụng Digimi trên điện thoại để xác thực thiết bị.',
        };
      }

      // 4. Nếu chuyển hướng 302 đến /home -> tiếp tục lấy dữ liệu trang /home
      const homeRes = await fetch(`${this.baseUrl}/home`, {
        headers: {
          'User-Agent': this.userAgent,
          'Referer': `${this.baseUrl}/login`,
          'Cookie': cookies,
        },
        redirect: 'manual',
      });

      const sc2 = homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : [homeRes.headers.get('set-cookie')];
      cookies = this.mergeCookies(cookies, sc2);

      const homeLoc = homeRes.headers.get('location') || '';
      console.log(`[BVBank API] Kết quả GET /home: HTTP ${homeRes.status}, Location: ${homeLoc}`);

      // Nếu trang /home chuyển hướng đến /account/getOtp
      if (homeLoc.includes('/account/getOtp')) {
        console.log(`🔔 [BVBank API] Cần xác thực Smart OTP tại /account/getOtp! Đang tải context trang getOtp...`);
        try {
          const otpPageRes = await fetch(`${this.baseUrl}/account/getOtp`, {
            headers: {
              'User-Agent': this.userAgent,
              'Referer': `${this.baseUrl}/home`,
              'Cookie': cookies,
            },
            redirect: 'manual',
          });
          const scOtp = otpPageRes.headers.getSetCookie ? otpPageRes.headers.getSetCookie() : [otpPageRes.headers.get('set-cookie')];
          cookies = this.mergeCookies(cookies, scOtp);
        } catch (_) {}

        this.savePendingSession(cleanAcc, {
          username: user,
          accountNumber: accNum,
          passwordEncrypted: pwd,
          cookies,
          csrf: init.csrf,
          timestamp: Date.now(),
        });

        return {
          success: false,
          requiresOtp: true,
          status: 'requires_otp',
          bank: 'bvbank',
          accountNumber: accNum,
          username: user,
          accountName: 'LE MANH DUONG',
          expiresIn: 120,
          message: 'BVBank yêu cầu nhập mã Smart OTP từ ứng dụng Digimi trên điện thoại để xác thực thiết bị mới.',
        };
      }

      // Nếu không chuyển hướng thành công và không phải 200
      if (homeRes.status !== 200 && loginRes.status !== 302) {
        const errHtml = await loginRes.text();
        const errMsg = this.extractErrorMessage(errHtml);
        return { success: false, message: errMsg || 'Đăng nhập BVBank DigiBank thất bại.' };
      }

      // 5. Đăng nhập thành công trực tiếp không cần OTP!
      const html = await homeRes.text();
      const accounts = this.extractAccounts(html);
      let accountName = this.extractAccountName(html) || 'LE MANH DUONG';
      const menuMatch = html.match(/href="(\/account\/[a-zA-Z0-9%_\-]+%3D%3D)"/i);
      const accountPageUrl = menuMatch ? menuMatch[1] : '/account/gyEDRfc6wxWU4Eg8DnTXcg%3D%3D';

      let balance = 0;
      let matchedAcc = accNum;
      if (accounts.length > 0) {
        const found = accounts.find((a) => a.accountNumber === accNum) || accounts[0];
        balance = found.balance;
        matchedAcc = found.accountNumber;
      }

      // Kích hoạt phân hệ CASA qua HTTP
      console.log(`[BVBank API] 🔄 Kích hoạt phân hệ tài khoản CASA qua HTTP: ${accountPageUrl}...`);
      const actRes = await this.activateCasaSession(cookies, accountPageUrl, matchedAcc);
      if (actRes.cookies) cookies = actRes.cookies;

      const sessionData = {
        cookies,
        accountName,
        accountNumber: matchedAcc,
        balance,
        accountPageUrl,
        lastLoginAt: new Date().toISOString(),
      };

      this.saveSession(matchedAcc, sessionData);

      // Cập nhật MongoDB
      try {
        const BankAccount = require('../../models/BankAccount');
        await BankAccount.findOneAndUpdate(
          {
            bankCode: { $in: ['bvbank', 'bvb', 'banviet'] },
            $or: [{ accountNumber: accNum }, { accountNumber: matchedAcc }, { username: user }],
          },
          {
            accountName,
            balance,
            sessionData,
            sessionStatus: 'active',
            sessionError: '',
            status: 1,
            lastLoginAt: new Date(),
          }
        );
      } catch (_) {}

      console.log(`✅ [BVBank API] Đăng nhập thuần API thành công cho ${matchedAcc} (${accountName}). Số dư: ${balance} VND`);

      return {
        success: true,
        status: 'success',
        bank: 'bvbank',
        accountNumber: matchedAcc,
        accountName,
        balance,
        sessionData,
        message: 'Đăng nhập BVBank DigiBank thành công! Tài khoản đã sẵn sàng đồng bộ giao dịch.',
      };
    } catch (err) {
      console.error(`[BVBank API] Lỗi trong quá trình đăng nhập API:`, err.message);
      return { success: false, message: `Lỗi kết nối đăng nhập BVBank: ${err.message}` };
    }
  }

  /**
   * Xác thực mã Smart OTP qua HTTP API thuần
   * Gọi trực tiếp endpoint: /scan-login/verify-otp-login?otp=...
   * Không sử dụng trình duyệt ẩn
   */
  async submitOtp(accountNumber, otp) {
    const cleanAcc = String(accountNumber || '').trim();
    const cleanOtp = String(otp || '').trim();

    if (!cleanOtp) {
      return { success: false, message: 'Vui lòng cung cấp mã Smart OTP.' };
    }

    const cleanAccKey = cleanAcc.replace(/[^a-zA-Z0-9_-]/g, '_');
    const pendingSession = this.loadPendingSession(cleanAccKey) || this.loadPendingSession(cleanAcc);

    if (!pendingSession || !pendingSession.cookies) {
      return {
        success: false,
        expired: true,
        message: 'Phiên chờ xác thực Smart OTP không tồn tại hoặc đã hết hạn (120s). Vui lòng bấm [Đăng nhập lại] để lấy mã mới.',
      };
    }

    console.log(`[BVBank API] 🔑 Đang gửi mã OTP "${cleanOtp}" tới BVBank qua HTTP API...`);

    try {
      let cookies = pendingSession.cookies;

      // Đảm bảo phiên luôn được đồng bộ context đầy đủ từ /account/getOtp
      try {
        const otpPageRes = await fetch(`${this.baseUrl}/account/getOtp`, {
          headers: {
            'User-Agent': this.userAgent,
            'Referer': `${this.baseUrl}/home`,
            'Cookie': cookies,
          },
          redirect: 'manual',
        });
        const scOtp = otpPageRes.headers.getSetCookie ? otpPageRes.headers.getSetCookie() : [otpPageRes.headers.get('set-cookie')];
        cookies = this.mergeCookies(cookies, scOtp);
      } catch (_) {}

      const verifyUrl = `${this.baseUrl}/scan-login/verify-otp-login?otp=${encodeURIComponent(cleanOtp)}`;
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': '*/*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${this.baseUrl}/account/getOtp`,
          'Cookie': cookies,
        },
      });

      const resText = (await verifyRes.text()).trim();
      console.log(`[BVBank API] Kết quả xác thực OTP từ server: HTTP ${verifyRes.status}, body: "${resText}"`);

      const sc = verifyRes.headers.getSetCookie ? verifyRes.headers.getSetCookie() : [verifyRes.headers.get('set-cookie')];
      cookies = this.mergeCookies(cookies, sc);

      if (resText === 'OK' || (verifyRes.status === 200 && resText.toUpperCase() === 'OK')) {
        console.log(`🎉 [BVBank API] Xác thực Smart OTP thành công qua HTTP API! Đang lấy số dư và lưu phiên...`);

        // Lấy thông tin tài khoản từ trang /home
        const homeRes = await fetch(`${this.baseUrl}/home`, {
          headers: {
            'User-Agent': this.userAgent,
            'Referer': `${this.baseUrl}/account/getOtp`,
            'Cookie': cookies,
          },
          redirect: 'manual',
        });

        const scHome = homeRes.headers.getSetCookie ? homeRes.headers.getSetCookie() : [homeRes.headers.get('set-cookie')];
        cookies = this.mergeCookies(cookies, scHome);

        const homeHtml = await homeRes.text();
        const accounts = this.extractAccounts(homeHtml);
        const accountName = this.extractAccountName(homeHtml) || pendingSession.username || 'LE MANH DUONG';
        const menuMatch = homeHtml.match(/href="(\/account\/[a-zA-Z0-9%_\-]+%3D%3D)"/i);
        const accountPageUrl = menuMatch ? menuMatch[1] : '/account/gyEDRfc6wxWU4Eg8DnTXcg%3D%3D';

        let balance = 0;
        let matchedAcc = cleanAcc;
        if (accounts.length > 0) {
          const found = accounts.find((a) => a.accountNumber === cleanAcc) || accounts[0];
          balance = found.balance;
          matchedAcc = found.accountNumber;
        }

        // Kích hoạt phân hệ CASA
        const actRes = await this.activateCasaSession(cookies, accountPageUrl, matchedAcc);
        if (actRes.cookies) cookies = actRes.cookies;

        const sessionData = {
          cookies,
          accountName,
          accountNumber: matchedAcc,
          balance,
          accountPageUrl,
          lastLoginAt: new Date().toISOString(),
        };

        this.saveSession(matchedAcc, sessionData);
        this.clearPendingSession(cleanAccKey);
        this.clearPendingSession(cleanAcc);

        // Cập nhật MongoDB
        try {
          const BankAccount = require('../../models/BankAccount');
          await BankAccount.findOneAndUpdate(
            {
              bankCode: { $in: ['bvbank', 'bvb', 'banviet'] },
              $or: [{ accountNumber: cleanAcc }, { accountNumber: matchedAcc }, { username: pendingSession.username }],
            },
            {
              accountName,
              balance,
              sessionData,
              sessionStatus: 'active',
              sessionError: '',
              status: 1,
              lastLoginAt: new Date(),
            }
          );
        } catch (_) {}

        return {
          success: true,
          status: 'success',
          bank: 'bvbank',
          accountNumber: matchedAcc,
          accountName,
          balance,
          sessionData,
          message: 'Đăng nhập BVBank DigiBank thành công! Tài khoản đã sẵn sàng đồng bộ giao dịch.',
        };
      }

      // Xử lý các trường hợp lỗi từ BVBank
      if (resText === 'UNAUTHORIZED' || verifyRes.status === 401) {
        this.clearPendingSession(cleanAccKey);
        this.clearPendingSession(cleanAcc);
        return {
          success: false,
          expired: true,
          message: 'Phiên xác thực Smart OTP trên BVBank đã hết hạn hoặc bị đăng xuất. Vui lòng bấm [Đăng nhập lại].',
        };
      }

      return {
        success: false,
        expired: false,
        message: `${resText || 'Mã Smart OTP không chính xác.'} (Lưu ý: Nếu smart otp đang còn thời gian nhập mà báo sai thì Mở APP Digimi (BVBank) => Truy cập vào Menu => Smart OTP => nhấn cấp lại mã pin rồi lấy lại otp).`,
      };
    } catch (err) {
      console.error(`[BVBank API] Lỗi khi xác thực OTP:`, err.message);
      return { success: false, message: `Lỗi kết nối xác thực OTP: ${err.message}` };
    }
  }

  /**
   * Xác thực tài khoản ngân hàng khi liên kết hoặc bấm Đăng nhập lại trên trang quản trị
   */
  async verifyLogin(params = {}) {
    const { username, password, accountNumber, sessionData } = params;
    const user = String(username || accountNumber || '').trim();
    const pwd = String(password || '').trim();
    const accNum = String(accountNumber || user).trim();

    console.log(`====================================================`);
    console.log(`🚀 [BVBank Node.js] XÁC THỰC PHIÊN ĐĂNG NHẬP: ${user}`);
    console.log(`====================================================`);

    // 1. Kiểm tra phiên hiện có nếu đã lưu cookie (chỉ kiểm tra khi KHÔNG có cờ force)
    if (!params.force) {
      let cookies = sessionData?.cookies || '';
      if (!cookies) {
        const saved = this.loadSession(accNum);
        if (saved.cookies) cookies = saved.cookies;
      }

      if (cookies) {
        console.log(`[BVBank Node.js] Đang kiểm tra tính hợp lệ của phiên cookie có sẵn...`);
        const balRes = await this.getBalance(cookies, accNum);
        if (balRes.success) {
          console.log(`🎉 [BVBank Node.js] Phiên cookie còn hiệu lực! Số dư: ${balRes.balance} VND`);
          return {
            success: true,
            status: 'success',
            bank: 'bvbank',
            accountNumber: balRes.accountNumber || accNum,
            accountName: balRes.accountName || user,
            balance: balRes.balance,
            sessionData: {
              cookies,
              accountNumber: balRes.accountNumber || accNum,
              accountName: balRes.accountName || user,
              balance: balRes.balance,
              lastLoginAt: new Date().toISOString(),
            },
            message: 'Phiên đăng nhập BVBank DigiBank hợp lệ',
          };
        }
      }
    }

    // 2. Nếu phiên không hợp lệ hoặc chưa có hoặc yêu cầu force -> Đăng nhập mới
    if (!pwd) {
      return {
        success: false,
        status: 'error',
        bank: 'bvbank',
        message: 'Phiên BVBank đã hết hạn. Vui lòng nhập mật khẩu để đăng nhập lại.',
      };
    }

    const loginRes = await this.login(user, pwd, accNum);
    if (loginRes.success) {
      return {
        success: true,
        status: 'success',
        bank: 'bvbank',
        accountNumber: loginRes.accountNumber || accNum,
        accountName: loginRes.accountName,
        balance: loginRes.balance,
        sessionData: loginRes.sessionData,
        message: loginRes.message,
      };
    }

    if (loginRes.requiresOtp) {
      return {
        success: false,
        requiresOtp: true,
        status: 'requires_otp',
        bank: 'bvbank',
        accountNumber: accNum,
        username: user,
        accountName: loginRes.accountName,
        expiresIn: loginRes.expiresIn || 120,
        message: loginRes.message,
      };
    }

    return {
      success: false,
      status: 'error',
      bank: 'bvbank',
      message: loginRes.message || 'Đăng nhập BVBank DigiBank thất bại',
    };
  }

  /**
   * Lấy số dư tài khoản từ trang /home
   */
  async getBalance(cookies, accountNumber) {
    if (!cookies) return { success: false, message: 'Thiếu cookies phiên BVBank' };

    try {
      const res = await fetch(`${this.baseUrl}/home`, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': `${this.baseUrl}/login`,
          'Cookie': cookies,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 302 || res.status === 401 || (res.redirected && res.url.includes('/login'))) {
        return { success: false, code: 401, message: 'Phiên đăng nhập đã hết hạn' };
      }

      const html = await res.text();
      if (html.includes('id="loginForm"') || html.includes('login.on_load') || html.includes('Đăng nhập thiết bị mới') || html.includes('/login')) {
        return { success: false, code: 401, message: 'Phiên đăng nhập đã hết hạn' };
      }

      const accounts = this.extractAccounts(html);
      const accountName = this.extractAccountName(html);

      if (accounts.length > 0) {
        const acc = accounts.find((a) => a.accountNumber === accountNumber) || accounts[0];
        return {
          success: true,
          accountNumber: acc.accountNumber,
          accountName: accountName || 'LE MANH DUONG',
          balance: acc.balance,
          accounts,
        };
      }

      return {
        success: false,
        code: 401,
        message: 'Không tìm thấy thông tin tài khoản hợp lệ, phiên đã hết hạn',
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Hợp nhất cookie string hiện tại với các header Set-Cookie trả về từ máy chủ
   */
  mergeCookies(currentCookieStr = '', setCookieHeaders = []) {
    const cookieMap = new Map();
    if (currentCookieStr) {
      currentCookieStr.split(';').forEach((part) => {
        const [k, ...v] = part.trim().split('=');
        if (k && v.length > 0) cookieMap.set(k.trim(), v.join('='));
      });
    }
    const headersList = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const sc of headersList) {
      if (!sc || typeof sc !== 'string') continue;
      const part = sc.split(';')[0];
      const [k, ...v] = part.trim().split('=');
      const val = v.join('=').trim();
      const key = k ? k.trim() : '';
      if (!key) continue;
      if ((val === '' || val === 'deleted') && cookieMap.has(key)) continue;
      cookieMap.set(key, val);
    }
    const merged = [];
    cookieMap.forEach((v, k) => merged.push(`${k}=${v}`));
    return merged.join('; ');
  }

  /**
   * Kích hoạt lại context phân hệ tài khoản CASA qua HTTP
   */
  async activateCasaSession(cookies, accountPageUrl, accountNumber) {
    let currentCookies = cookies;
    try {
      const pageRes = await fetch(`${this.baseUrl}${accountPageUrl}`, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': `${this.baseUrl}/home`,
          'Cookie': currentCookies,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      const sc1 = pageRes.headers.getSetCookie ? pageRes.headers.getSetCookie() : [pageRes.headers.get('set-cookie')];
      currentCookies = this.mergeCookies(currentCookies, sc1);

      const accNoRes = await fetch(`${this.baseUrl}/account/accNo/CASA/${accountNumber}`, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${this.baseUrl}${accountPageUrl}`,
          'Cookie': currentCookies,
        },
        signal: AbortSignal.timeout(10000),
      });

      const sc2 = accNoRes.headers.getSetCookie ? accNoRes.headers.getSetCookie() : [accNoRes.headers.get('set-cookie')];
      currentCookies = this.mergeCookies(currentCookies, sc2);

      return { success: true, cookies: currentCookies };
    } catch (err) {
      return { success: false, cookies: currentCookies, error: err.message };
    }
  }

  /**
   * Chuyển đổi dữ liệu JSON trả về từ BVBank sang định dạng giao dịch chuẩn của 7Bank
   */
  parseTransactionList(rawData, cleanAcc, balance = 0) {
    if (!rawData) return [];
    const rawList = Array.isArray(rawData)
      ? rawData
      : Array.isArray(rawData.response)
      ? rawData.response
      : Array.isArray(rawData.data)
      ? rawData.data
      : [];

    const transactions = [];
    const latestBalance = balance || 0;

    for (const item of rawList) {
      const txId = String(item.transRef || item.transaction_id || item.transactionId || item.id || item.ref_no || '');
      const rawAmount = parseFloat(item.amt ?? item.amount ?? item.transactionAmount ?? 0);
      const absAmount = Math.abs(rawAmount);
      const isCredit = String(item.doC || item.dorc || '').toUpperCase() === 'C' || rawAmount > 0;

      let dateStr = '';
      if (item.strTransDate) {
        dateStr = item.strTransDate;
      } else if (item.transDate) {
        dateStr = item.transDate;
      } else if (item.time && item.date) {
        dateStr = `${item.time} ${item.date}`;
      } else if (item.date) {
        dateStr = item.date;
      } else if (item.transactionDate) {
        dateStr = item.transactionDate;
      } else {
        dateStr = new Date().toLocaleString('vi-VN');
      }

      const desc = String(item.narrative || item.description || item.remark || '').trim();

      transactions.push({
        transaction_id: txId || `BVB_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        transaction_number: txId,
        ref_no: txId,
        amount: absAmount,
        type: isCredit ? 'IN' : 'OUT',
        description: desc,
        content: desc,
        date: dateStr,
        transaction_date: dateStr,
        balance: latestBalance,
        account_number: cleanAcc,
        bank: 'bvbank',
      });
    }

    return transactions;
  }

  /**
   * Lấy lịch sử biến động số dư BVBank DigiBank
   */
  async getTransactionHistory(bankAccount, options = {}) {
    const { accountNumber, username, sessionData, passwordEncrypted } = bankAccount;
    const cleanAcc = String(accountNumber || '').trim();

    let cookies = sessionData?.cookies || '';
    if (!cookies) {
      const saved = this.loadSession(cleanAcc);
      if (saved.cookies) cookies = saved.cookies;
    }

    let password = '';
    if (passwordEncrypted) {
      try {
        password = cryptoService.decryptBankPassword(passwordEncrypted);
      } catch (_) {}
    }

    if (!cookies && password) {
      console.log(`[BVBank Node.js] Phiên chưa có cookies, thử khôi phục đăng nhập cho: ${cleanAcc}...`);
      const reloginRes = await this.login(username || cleanAcc, password, cleanAcc);
      if (reloginRes.success) {
        cookies = reloginRes.sessionData?.cookies;
        bankAccount.sessionData = reloginRes.sessionData;
        bankAccount.balance = reloginRes.balance;
        if (reloginRes.accountName) bankAccount.accountName = reloginRes.accountName;
        bankAccount.sessionStatus = 'active';
        await bankAccount.save().catch(() => {});
      } else if (reloginRes.requiresOtp) {
        bankAccount.sessionStatus = 'expired';
        bankAccount.sessionError = 'BVBank yêu cầu xác thực Smart OTP trên điện thoại';
        await bankAccount.save().catch(() => {});
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'bvbank',
          message: 'Phiên BVBank cần xác thực lại Smart OTP trên điện thoại. Vui lòng bấm [Đăng nhập lại] trên trang quản trị.',
          transactions: [],
        };
      }
    }

    if (!cookies) {
      return {
        success: false,
        status: 'error',
        code: '99',
        bank: 'bvbank',
        message: 'Chưa có phiên đăng nhập BVBank DigiBank. Vui lòng bấm [Đăng nhập lại] trên trang quản trị.',
        transactions: [],
      };
    }

    let accountPageUrl = sessionData?.accountPageUrl || '/account/gyEDRfc6wxWU4Eg8DnTXcg%3D%3D';

    const days = parseInt(options.days || 30);
    const isLatest = options.latest === true || days <= 1;

    const fmtDate = (d) => {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const now = new Date();
    const fromDateObj = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const fromDate = fmtDate(fromDateObj);
    const toDate = fmtDate(now);

    // Sử dụng endpoint chuẩn của BVBank DigiBank (quick-search gdgn luôn trả về biến động số dư mới nhất)
    const quickSearchUrl = `${this.baseUrl}/account/quick-search/CASA/${cleanAcc}/gdgn`;
    const historyUrl = `${this.baseUrl}/account/getHistory/CASA/${cleanAcc}`;
    const dateSearchUrl = `${this.baseUrl}/account/search-by-date/CASA/${cleanAcc}/${fromDate}/${toDate}`;

    const queryUrl = (options.fromDate && options.toDate) ? dateSearchUrl : quickSearchUrl;

    const makeQueryHeaders = (ck, accUrl) => ({
      'User-Agent': this.userAgent,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${this.baseUrl}${accUrl || accountPageUrl}`,
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Cookie': ck,
    });

    try {
      let res = await fetch(queryUrl, {
        method: 'GET',
        headers: makeQueryHeaders(cookies, accountPageUrl),
        signal: AbortSignal.timeout(12000),
      });

      // Cập nhật cookies nếu server trả về Set-Cookie
      const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
      if (sc && sc.length > 0 && sc[0]) {
        cookies = this.mergeCookies(cookies, sc);
        if (bankAccount.sessionData) bankAccount.sessionData.cookies = cookies;
      }

      // Nếu tra cứu theo ngày hoặc getHistory không phản hồi tốt, thử chuyển sang quick-search
      if ((res.status === 404 || res.status === 403 || res.status === 500) && queryUrl !== quickSearchUrl) {
        console.log(`[BVBank Node.js] Thử lại bằng endpoint quick-search gdgn...`);
        res = await fetch(quickSearchUrl, {
          method: 'GET',
          headers: makeQueryHeaders(cookies, accountPageUrl),
          signal: AbortSignal.timeout(12000),
        });
      }

      // Nếu gặp 401 hoặc 403, thử kích hoạt lại context CASA qua HTTP trước
      if (res.status === 401 || res.status === 403) {
        console.log(`[BVBank Node.js] HTTP ${res.status} khi truy vấn, thử kích hoạt context CASA qua HTTP...`);
        const actRes = await this.activateCasaSession(cookies, accountPageUrl, cleanAcc);
        if (actRes.success && actRes.cookies) {
          cookies = actRes.cookies;
          if (bankAccount.sessionData) bankAccount.sessionData.cookies = cookies;
          res = await fetch(quickSearchUrl, {
            method: 'GET',
            headers: makeQueryHeaders(cookies, accountPageUrl),
            signal: AbortSignal.timeout(12000),
          });
          console.log(`[BVBank Node.js] Kết quả sau khi kích hoạt context CASA: HTTP ${res.status}`);
        }
      }

      // Nếu vẫn gặp 401/403 hoặc chuyển hướng về login, thử tự động đăng nhập lại bằng mật khẩu lưu trong DB (HTTP API)
      if (res.status === 401 || res.status === 403 || (res.redirected && res.url.includes('/login'))) {
        if (password) {
          console.log(`[BVBank Node.js] Phiên hết hạn (${res.status}), đang tự động đăng nhập lại bằng HTTP API cho ${cleanAcc}...`);
          const reloginRes = await this.login(username || cleanAcc, password, cleanAcc);
          if (reloginRes.success) {
            cookies = reloginRes.sessionData?.cookies || cookies;
            if (reloginRes.sessionData?.accountPageUrl) {
              accountPageUrl = reloginRes.sessionData.accountPageUrl;
            }
            bankAccount.sessionData = reloginRes.sessionData;
            bankAccount.balance = reloginRes.balance;
            if (reloginRes.accountName) bankAccount.accountName = reloginRes.accountName;
            bankAccount.sessionStatus = 'active';
            await bankAccount.save().catch(() => {});

            // Nếu trong quá trình đăng nhập trình duyệt đã trích xuất được giao dịch -> trả về ngay
            if (reloginRes.transactions && reloginRes.transactions.length > 0) {
              console.log(`🎉 [BVBank Node.js] Đồng bộ thành công ${reloginRes.transactions.length} giao dịch trích xuất trực tiếp từ phiên trình duyệt!`);
              return {
                success: true,
                status: 'success',
                code: '00',
                bank: 'bvbank',
                accountNumber: cleanAcc,
                accountName: reloginRes.accountName,
                balance: reloginRes.balance,
                count: reloginRes.transactions.length,
                transactions: reloginRes.transactions,
              };
            }

            // Thử lại truy vấn bằng phiên mới đã kích hoạt CASA
            res = await fetch(quickSearchUrl, {
              method: 'GET',
              headers: makeQueryHeaders(cookies, accountPageUrl),
              signal: AbortSignal.timeout(12000),
            });
            console.log(`[BVBank Node.js] Kết quả truy vấn lại: HTTP ${res.status}, redirected: ${res.redirected}, url: ${res.url}`);
          }
        }
      }

      if (res.status === 401 || res.status === 403 || (res.redirected && res.url.includes('/login'))) {
        bankAccount.sessionStatus = 'expired';
        bankAccount.sessionError = 'Phiên đăng nhập BVBank đã hết hạn. Vui lòng bấm [Đăng nhập lại].';
        await bankAccount.save().catch(() => {});
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'bvbank',
          message: 'Phiên BVBank đã hết hạn. Vui lòng bấm [Đăng nhập lại] để cập nhật phiên mới.',
          transactions: [],
        };
      }

      const resText = await res.text();
      let rawData = null;
      try {
        rawData = JSON.parse(resText);
      } catch (_) {
        rawData = null;
      }

      // Kiểm tra xem phản hồi có phải trang đăng nhập do phiên hết hạn không
      if (!rawData && (resText.includes('id="loginForm"') || resText.includes('login.on_load') || resText.includes('Đăng nhập thiết bị mới') || resText.includes('/login'))) {
        bankAccount.sessionStatus = 'expired';
        bankAccount.sessionError = 'Phiên đăng nhập BVBank đã hết hạn';
        await bankAccount.save().catch(() => {});
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'bvbank',
          message: 'Phiên BVBank đã hết hạn. Vui lòng bấm [Đăng nhập lại] để cập nhật phiên mới.',
          transactions: [],
        };
      }

      // Nếu trả về HTML chứa item-account-statement
      if (!rawData && resText.includes('item-account-statement')) {
        const htmlTxs = this.extractTransactionHistoryFromHtml(resText);
        const validAccName = (bankAccount.accountName && !bankAccount.accountName.toLowerCase().includes('thông tin'))
          ? bankAccount.accountName
          : 'LE MANH DUONG';

        bankAccount.sessionStatus = 'active';
        bankAccount.sessionError = '';
        bankAccount.lastSyncAt = new Date();
        await bankAccount.save().catch(() => {});

        return {
          success: true,
          status: 'success',
          code: '00',
          bank: 'bvbank',
          accountNumber: cleanAcc,
          accountName: validAccName,
          balance: bankAccount.balance || 0,
          count: htmlTxs.length,
          transactions: htmlTxs,
        };
      }

      if (!rawData) {
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'bvbank',
          message: 'Không nhận được dữ liệu phản hồi hợp lệ từ BVBank DigiBank.',
          transactions: [],
        };
      }

      const rawList = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData.response)
        ? rawData.response
        : Array.isArray(rawData.data)
        ? rawData.data
        : [];

      const transactions = [];
      let latestBalance = bankAccount.balance || 0;

      for (const item of rawList) {
        const txId = String(item.transRef || item.transaction_id || item.transactionId || item.id || item.ref_no || '');
        const rawAmount = parseFloat(item.amt ?? item.amount ?? item.transactionAmount ?? 0);
        const absAmount = Math.abs(rawAmount);
        const isCredit = String(item.doC || item.dorc || '').toUpperCase() === 'C' || rawAmount > 0;

        let dateStr = '';
        if (item.strTransDate) {
          dateStr = item.strTransDate;
        } else if (item.transDate) {
          dateStr = item.transDate;
        } else if (item.time && item.date) {
          dateStr = `${item.time} ${item.date}`;
        } else if (item.date) {
          dateStr = item.date;
        } else if (item.transactionDate) {
          dateStr = item.transactionDate;
        } else {
          dateStr = new Date().toLocaleString('vi-VN');
        }

        const desc = String(item.narrative || item.description || item.remark || '').trim();

        let bal = 0;
        if (item.balance !== undefined && item.balance !== null) {
          bal = parseFloat(String(item.balance).replace(/[^0-9.]/g, '')) || 0;
          if (bal > 0 && latestBalance === 0) latestBalance = bal;
        }

        transactions.push({
          transactionID: txId,
          amount: absAmount,
          type: isCredit ? 'IN' : 'OUT',
          description: desc,
          transactionDate: dateStr,
          balance: bal || latestBalance,
        });
      }

        const validAccName = (bankAccount.accountName && !bankAccount.accountName.toLowerCase().includes('thông tin'))
          ? bankAccount.accountName
          : 'LE MANH DUONG';

        // Cập nhật số dư, tên và thời gian đồng bộ vào MongoDB
        try {
          if (latestBalance > 0 && latestBalance !== bankAccount.balance) {
            bankAccount.balance = latestBalance;
          }
          bankAccount.accountName = validAccName;
          bankAccount.sessionStatus = 'active';
          bankAccount.sessionError = '';
          bankAccount.lastSyncAt = new Date();
          await bankAccount.save().catch(() => {});
        } catch (_) {}

        return {
          success: true,
          status: 'success',
          code: '00',
          bank: 'bvbank',
          accountNumber: cleanAcc,
          accountName: validAccName,
          balance: latestBalance,
          count: transactions.length,
          transactions,
        };
      } catch (err) {
        return {
          success: false,
          status: 'error',
          code: '99',
          bank: 'bvbank',
          message: `Lỗi kết nối BVBank DigiBank: ${err.message}`,
          transactions: [],
        };
      }
  }

  /**
   * Trích xuất lịch sử giao dịch từ HTML (phòng khi BVBank trả về giao diện HTML item-account-statement)
   */
  extractTransactionHistoryFromHtml(html) {
    if (!html) return [];
    const transactions = [];
    const itemRegex = /<div[^>]*class=["'][^"']*item-account-statement[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[1];
      const dateMatch = block.match(/<p[^>]*class=["'][^"']*fs-small[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      const descMatch = block.match(/<p[^>]*class=["'][^"']*text-break[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      const codeMatch = block.match(/<span[^>]*class=["'][^"']*fw-bold[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const amtMatch = block.match(/<p[^>]*class=["'][^"']*(text-danger|text-green)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);

      const dateStr = dateMatch ? dateMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const code = codeMatch ? codeMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const amtStr = amtMatch ? amtMatch[2].replace(/<[^>]*>/g, '').trim() : '0';
      const isCredit = amtMatch && amtMatch[1].includes('text-green');
      const cleanAmt = parseFloat(amtStr.replace(/[^0-9.]/g, '')) || 0;

      if (code || dateStr || cleanAmt > 0) {
        transactions.push({
          transactionID: code || String(Date.now()),
          amount: cleanAmt,
          type: isCredit ? 'IN' : 'OUT',
          description: desc,
          transactionDate: dateStr || new Date().toLocaleString('vi-VN'),
          balance: 0,
        });
      }
    }
    return transactions;
  }
}

module.exports = new BVBankService();
