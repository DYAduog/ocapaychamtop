const { Zalo, LoginQRCallbackEventType } = require('zca-js');
const toughCookie = require('tough-cookie');

/**
 * Service quản lý luồng quét mã QR đăng nhập Zalo để tự động trích xuất Cookie phiên làm việc
 * Hỗ trợ:
 *   - Khởi tạo mã QR Zalo Live (Web)
 *   - Lắng nghe trạng thái quét và bấm xác nhận trên điện thoại
 *   - Trích xuất Cookie định dạng chuẩn cho ZaloPay API Engine
 */
class ZaloQrLoginService {
  constructor() {
    this.sessions = new Map();
    // Tự động dọn dẹp phiên cũ sau mỗi 5 phút
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  cleanup() {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (now - s.createdAt > 10 * 60 * 1000) {
        if (s.actions && s.actions.abort) {
          try { s.actions.abort(); } catch (_) {}
        }
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Khởi tạo phiên quét mã QR mới
   */
  async startQrSession(phone) {
    const sessionId = `zqr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sessionState = {
      id: sessionId,
      phone: String(phone || '').trim(),
      status: 'generating', // generating | waiting_scan | scanned | confirmed | expired | declined | error
      statusText: 'Đang tạo mã QR Zalo...',
      qrImage: '',
      code: '',
      displayName: '',
      avatar: '',
      cookies: [],
      cookieString: '',
      userInfo: null,
      error: null,
      createdAt: Date.now(),
      actions: null,
    };

    this.sessions.set(sessionId, sessionState);

    // Khởi tạo tiến trình ngầm qua zca-js
    this._runZaloLogin(sessionId).catch((err) => {
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'error';
        s.statusText = err.message || 'Lỗi tạo mã QR Zalo';
        s.error = err.message;
      }
    });

    // Chờ tối đa 8 giây để mã QR được sinh ra
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const current = this.sessions.get(sessionId);
      if (current && current.qrImage) {
        return {
          status: 'success',
          sessionId,
          qrImage: current.qrImage,
          statusText: current.statusText,
        };
      }
      if (current && current.status === 'error') {
        throw new Error(current.error || 'Không thể tạo mã QR Zalo');
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    const curr = this.sessions.get(sessionId);
    if (curr && curr.qrImage) {
      return {
        status: 'success',
        sessionId,
        qrImage: curr.qrImage,
        statusText: curr.statusText,
      };
    }

    throw new Error('Thời gian tạo mã QR quá lâu, vui lòng thử lại');
  }

  async _runZaloLogin(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return;

    const zalo = new Zalo({ logging: false });

    return new Promise((resolve, reject) => {
      zalo.loginQR(
        {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        (event) => {
          const sess = this.sessions.get(sessionId);
          if (!sess) {
            try { event.actions.abort(); } catch (_) {}
            return;
          }

          sess.actions = event.actions;

          if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
            sess.status = 'waiting_scan';
            sess.statusText = 'Vui lòng quét mã QR bằng App Zalo';
            sess.code = event.data.code;
            // Chuẩn hóa base64 data URL
            let img = event.data.image;
            if (!img.startsWith('data:image')) {
              img = `data:image/png;base64,${img}`;
            }
            sess.qrImage = img;
            console.log(`[ZaloQR:${sessionId}] ✅ Mã QR đã sẵn sàng (Code: ${event.data.code})`);
          } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
            sess.status = 'scanned';
            sess.statusText = 'Đã quét mã! Vui lòng bấm [Xác Nhận Đăng Nhập] trên điện thoại...';
            sess.displayName = event.data.display_name || '';
            sess.avatar = event.data.avatar || '';
            console.log(`[ZaloQR:${sessionId}] 📲 Người dùng đã quét mã: ${sess.displayName}`);
          } else if (event.type === LoginQRCallbackEventType.GotLoginInfo || event.type === 4) {
            console.log(`[ZaloQR:${sessionId}] 🔑 Nhận được GotLoginInfo từ Zalo App!`);
            sess.rawGotLoginInfo = event.data;
            if (event.data && event.data.cookie) {
              sess.cookies = event.data.cookie;
            }
          } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
            sess.status = 'expired';
            sess.statusText = 'Mã QR đã hết hạn. Vui lòng bấm làm mới mã.';
            console.log(`[ZaloQR:${sessionId}] ⏳ Mã QR hết hạn.`);
          } else if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
            sess.status = 'declined';
            sess.statusText = 'Bạn đã từ chối xác nhận đăng nhập trên điện thoại.';
            console.log(`[ZaloQR:${sessionId}] ❌ Bị từ chối trên thiết bị.`);
          }
        }
      )
        .then(async (loginResult) => {
          const sess = this.sessions.get(sessionId);
          if (!sess) return resolve(loginResult);

          // 1. Trích xuất cookie từ nhiều nguồn khác nhau của zca-js
          let rawCookies = [];
          if (sess.cookies && sess.cookies.length) {
            rawCookies = sess.cookies;
          } else if (sess.rawGotLoginInfo?.cookie) {
            rawCookies = sess.rawGotLoginInfo.cookie;
          } else if (loginResult && loginResult.ctx && loginResult.ctx.cookie) {
            try {
              rawCookies = loginResult.ctx.cookie.toJSON().cookies;
            } catch (_) {}
          } else if (loginResult && (loginResult.cookie || loginResult.cookies)) {
            rawCookies = loginResult.cookie || loginResult.cookies;
          }
          sess.cookies = rawCookies;

          // 2. Chuyển đổi mảng cookie sang chuỗi chuẩn: name=value; name2=value2
          let baseCookieString = '';
          if (Array.isArray(rawCookies)) {
            baseCookieString = rawCookies
              .map((c) => `${c.key || c.name}=${c.value}`)
              .join('; ');
          } else if (typeof rawCookies === 'string') {
            baseCookieString = rawCookies;
          }
          sess.cookieString = baseCookieString;

          // 3. Tự động thử trao đổi SSO Token sang ZaloPay Web (social.zalopay.vn)
          try {
            console.log(`[ZaloQR:${sessionId}] 🔄 Đang tự động trao đổi SSO Token sang ZaloPay Web...`);
            const zalopayCookies = await this._exchangeZaloToZaloPay(baseCookieString);
            if (zalopayCookies) {
              sess.cookieString = zalopayCookies;
              sess.hasZaloPayCookie = true;
              console.log(`[ZaloQR:${sessionId}] 🎯 Trao đổi thành công ZaloPay Cookie (zlp_token)!`);
            } else {
              console.log(`[ZaloQR:${sessionId}] ℹ️ Giữ Zalo cookie (${baseCookieString.length} ký tự).`);
            }
          } catch (exErr) {
            console.warn(`[ZaloQR:${sessionId}] Cảnh báo auto SSO:`, exErr.message);
          }

          sess.userInfo = loginResult.userInfo || null;
          sess.status = 'confirmed';
          sess.statusText = 'Đăng nhập Zalo thành công! Đang lưu thông tin ví...';
          console.log(`[ZaloQR:${sessionId}] 🎉 Đăng nhập thành công! Cookies len: ${sess.cookieString.length}`);
          resolve(loginResult);
        })
        .catch((err) => {
          const sess = this.sessions.get(sessionId);
          if (sess) {
            sess.status = 'error';
            sess.statusText = err.message || 'Lỗi trong quá trình xác thực';
            sess.error = err.message;
          }
          console.error(`[ZaloQR:${sessionId}] Lỗi đăng nhập:`, err.message);
          reject(err);
        });
    });
  }

  /**
   * Tự động trao đổi Cookie phiên Zalo Chat sang Cookie ZaloPay Web thông qua OAuth SSO bridge
   */
  async _exchangeZaloToZaloPay(zaloCookieString) {
    if (!zaloCookieString) return null;
    const axios = require('axios');
    const userAgent =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ZaloPayClient/8.29.2 OS/16.0.2 Platform/ios Secured/true ZaloPayWebClient/8.29.2';

    try {
      // Bước 1: Gọi check trên social.zalopay.vn để lấy link OAuth permission
      const r1 = await axios.get('https://social.zalopay.vn/login-gateway/check?f=1&callback=https%3A%2F%2Fsocial.zalopay.vn%2Fspa%2Fv2', {
        maxRedirects: 0,
        validateStatus: () => true,
        headers: { 'User-Agent': userAgent },
        timeout: 10000,
      });

      const oauthUrl = r1.headers?.location;
      if (!oauthUrl) return null;

      // Bước 2: Gọi link OAuth permission kèm Cookie phiên Zalo
      const r2 = await axios.get(oauthUrl, {
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'User-Agent': userAgent,
          'Cookie': zaloCookieString,
          'Referer': 'https://social.zalopay.vn/',
        },
        timeout: 10000,
      });

      const callbackUrl = r2.headers?.location;
      if (!callbackUrl || !callbackUrl.includes('login-gateway/callback')) {
        return null;
      }

      // Bước 3: Gọi callback URL trên social.zalopay.vn để trích xuất zlp_token và cookie ZaloPay
      const r3 = await axios.get(callbackUrl, {
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'User-Agent': userAgent,
          'Referer': 'https://oauth.zaloapp.com/',
        },
        timeout: 10000,
      });

      const setCookies = r3.headers?.['set-cookie'] || [];
      const zalopayCookies = {};
      setCookies.forEach((c) => {
        const part = c.split(';')[0];
        const [k, ...v] = part.split('=');
        if (k && v.length) {
          zalopayCookies[k.trim()] = v.join('=');
        }
      });

      if (zalopayCookies['zlp_token']) {
        let cookieParts = ['has_device_id=0'];
        if (zalopayCookies['zalo_id']) cookieParts.push(`zalo_id=${zalopayCookies['zalo_id']}`);
        if (zalopayCookies['zalopay_id']) cookieParts.push(`zalopay_id=${zalopayCookies['zalopay_id']}`);
        if (zalopayCookies['zalo_oauth']) cookieParts.push(`zalo_oauth=${zalopayCookies['zalo_oauth']}`);
        cookieParts.push(`zlp_token=${zalopayCookies['zlp_token']}`);
        return cookieParts.join('; ');
      }
    } catch (e) {
      console.warn('[ZaloQrLoginService] _exchangeZaloToZaloPay:', e.message);
    }
    return null;
  }

  /**
   * Lấy thông tin trạng thái phiên hiện tại
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
}

module.exports = new ZaloQrLoginService();
