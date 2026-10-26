const axios = require('axios');
const crypto = require('crypto');
const cryptoService = require('../crypto.service');

function base64Url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function parseJwt(token) {
  try {
    const base64Payload = token.split('.')[1];
    const payload = Buffer.from(base64Payload, 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

class OCBService {
  constructor() {
    this.keycloakBase = 'https://identity-omni.ocb.com.vn/auth/realms/backbase';
    this.omniBase = 'https://ocbomni.ocb.com.vn';
    this.clientId = 'bb-web-client';
    this.redirectUri = 'https://ocbomni.ocb.com.vn/select-context';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }

  mergeCookies(existingCookieStr = '', setCookieHeaders = []) {
    const cookieMap = new Map();
    if (existingCookieStr) {
      existingCookieStr.split(';').forEach(c => {
        const [k, ...v] = c.trim().split('=');
        if (k) cookieMap.set(k.trim(), v.join('='));
      });
    }

    if (Array.isArray(setCookieHeaders)) {
      setCookieHeaders.forEach(sc => {
        const part = sc.split(';')[0];
        const [k, ...v] = part.trim().split('=');
        if (k) cookieMap.set(k.trim(), v.join('='));
      });
    } else if (typeof setCookieHeaders === 'string') {
      const part = setCookieHeaders.split(';')[0];
      const [k, ...v] = part.trim().split('=');
      if (k) cookieMap.set(k.trim(), v.join('='));
    }

    const merged = [];
    cookieMap.forEach((v, k) => merged.push(`${k}=${v}`));
    return merged.join('; ');
  }

  /**
   * Đăng nhập OCB OMNI Cá Nhân qua Keycloak PKCE + Xác thực ứng dụng (PUSH_DEVICE)
   */
  async login(username, password, options = {}) {
    try {
      const cleanUser = String(username).trim();
      const cleanPass = String(password).trim();
      const timeoutSec = options.timeoutSec || 90;

      const codeVerifier = base64Url(crypto.randomBytes(32));
      const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
      const state = base64Url(crypto.randomBytes(16));
      const nonce = base64Url(crypto.randomBytes(16));

      // Step 1: Khởi tạo phiên OAuth2 PKCE
      const authParams = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        scope: 'openid',
        state: state,
        nonce: nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      const initUrl = `${this.keycloakBase}/protocol/openid-connect/auth?${authParams.toString()}`;
      console.log(`[OCBService] Bước 1: Khởi tạo luồng PKCE cho user: ${cleanUser}...`);

      const res1 = await axios.get(initUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 10,
        validateStatus: () => true
      });

      let cookies = this.mergeCookies('', res1.headers['set-cookie']);
      const html1 = String(res1.data);
      const actionMatch = html1.match(/<form[^>]+action=["']([^"']+)["']/i);
      if (!actionMatch) {
        return {
          success: false,
          message: 'Không tìm thấy form đăng nhập OCB OMNI từ máy chủ Keycloak.',
        };
      }

      let postActionUrl = actionMatch[1].replace(/&amp;/g, '&');

      // Step 2: Gửi thông tin đăng nhập
      console.log(`[OCBService] Bước 2: Gửi thông tin tài khoản và mật khẩu...`);
      const postData = new URLSearchParams({
        username: cleanUser,
        password: cleanPass,
        locale: 'vi',
        rememberMe: 'on',
        login: 'Đăng nhập',
      });

      const res2 = await axios.post(postActionUrl, postData.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://identity-omni.ocb.com.vn',
          'Referer': initUrl,
          'Cookie': cookies,
        },
        maxRedirects: 0,
        validateStatus: () => true
      });

      cookies = this.mergeCookies(cookies, res2.headers['set-cookie']);
      const html2 = String(res2.data);

      // Kiểm tra lỗi mật khẩu hoặc tài khoản sai
      if (html2.includes('Tên đăng nhập hoặc mật khẩu không chính xác') ||
          html2.includes('Invalid username or password') ||
          html2.includes('kc-feedback-text')) {
        const errTextMatch = html2.match(/class=["'][^"']*kc-feedback-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        const errDesc = errTextMatch ? errTextMatch[1].trim() : 'Tên đăng nhập hoặc mật khẩu OCB không chính xác.';
        return {
          success: false,
          message: errDesc,
        };
      }

      // Step 3: Lựa chọn hình thức xác thực 2FA (mặc định chọn PUSH_DEVICE gửi về App OCB OMNI)
      const form2 = [...html2.matchAll(/<form[\s\S]*?<\/form>/gi)];
      if (!form2.length) {
        return {
          success: false,
          message: 'Không nhận được yêu cầu xác thực 2FA từ OCB OMNI.',
        };
      }

      const action3 = form2[0][0].match(/action=["']([^"']+)["']/i)[1].replace(/&amp;/g, '&');
      console.log(`[OCBService] Bước 3: Kích hoạt xác thực qua ứng dụng OCB OMNI (PUSH_DEVICE)...`);

      const postData3 = new URLSearchParams({ otpChoice: 'PUSH_DEVICE' });
      const res3 = await axios.post(action3, postData3.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://identity-omni.ocb.com.vn',
          'Referer': action3,
          'Cookie': cookies,
        },
        maxRedirects: 0,
        validateStatus: () => true
      });

      cookies = this.mergeCookies(cookies, res3.headers['set-cookie']);
      const html3 = String(res3.data);

      const pollActionMatch = html3.match(/<form[^>]+id=["']bb-check-device-continue-form["'][^>]+action=["']([^"']+)["']/i) ||
                              html3.match(/<form[^>]+action=["']([^"']+)["']/i);
      const pollUrl = pollActionMatch ? pollActionMatch[1].replace(/&amp;/g, '&') : action3;

      console.log(`[OCBService] 🔔 ĐÃ GỬI THÔNG BÁO TỚI ĐIỆN THOẠI! Đang chờ bạn bấm [XÁC NHẬN] trên App OCB OMNI (tối đa ${timeoutSec}s)...`);

      // Polling vòng lặp kiểm tra trạng thái phê duyệt từ điện thoại
      let currentActionUrl = pollUrl;
      let isApproved = false;
      const maxLoops = Math.ceil(timeoutSec / 3);

      for (let i = 1; i <= maxLoops; i++) {
        await new Promise(r => setTimeout(r, 3000));

        const pollData = new URLSearchParams({
          'oob-authn-action': 'confirmation-poll'
        });

        const pollRes = await axios.post(currentActionUrl, pollData.toString(), {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Convert-Redirects': 'true',
            'Origin': 'https://identity-omni.ocb.com.vn',
            'Referer': currentActionUrl,
            'Cookie': cookies,
          },
          maxRedirects: 0,
          validateStatus: () => true
        });

        cookies = this.mergeCookies(cookies, pollRes.headers['set-cookie']);

        let result = pollRes.data;
        if (typeof result === 'string') {
          try { result = JSON.parse(result); } catch (e) {}
        }

        if (result && result.actionUrl) {
          currentActionUrl = result.actionUrl;
        }

        const status = result?.status || 'UNKNOWN';

        if (status === 'USER DECLINED') {
          return {
            success: false,
            message: 'Bạn đã từ chối yêu cầu đăng nhập trên ứng dụng OCB OMNI.',
          };
        }

        if (status === 'EXPIRED') {
          return {
            success: false,
            message: 'Yêu cầu xác thực trên ứng dụng OCB OMNI đã hết hạn. Vui lòng thử lại.',
          };
        }

        if (status !== 'PENDING' && status !== 'UNKNOWN') {
          console.log(`[OCBService] 🎉 Đã nhận được phê duyệt từ điện thoại! Trạng thái: ${status}`);
          isApproved = true;
          break;
        }
      }

      if (!isApproved) {
        return {
          success: false,
          message: 'Hết thời gian chờ xác nhận trên App OCB OMNI (90 giây). Vui lòng thử lại và mở App bấm Xác nhận kịp thời.',
        };
      }

      // Step 4: Gửi confirmation-continue để lấy redirect_uri chứa OAuth code
      console.log(`[OCBService] Bước 4: Hoàn tất xác nhận và nhận OAuth code...`);
      const continueData = new URLSearchParams({
        'oob-authn-action': 'confirmation-continue'
      });

      const res4 = await axios.post(currentActionUrl, continueData.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://identity-omni.ocb.com.vn',
          'Referer': currentActionUrl,
          'Cookie': cookies,
        },
        maxRedirects: 0,
        validateStatus: () => true
      });

      cookies = this.mergeCookies(cookies, res4.headers['set-cookie']);
      const location = res4.headers['location'];
      if (!location) {
        return {
          success: false,
          message: 'Không nhận được đường dẫn điều hướng sau khi xác nhận.',
        };
      }

      const redirectUrl = new URL(location);
      const authCode = redirectUrl.searchParams.get('code');
      if (!authCode) {
        return {
          success: false,
          message: 'Không tìm thấy mã OAuth code trong phản hồi OCB.',
        };
      }

      // Step 5: Đổi Code lấy Access Token & Refresh Token
      console.log(`[OCBService] Bước 5: Đổi Code lấy Token OpenID Connect...`);
      const tokenEndpoint = `${this.keycloakBase}/protocol/openid-connect/token`;
      const tokenData = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code: authCode,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      });

      const tokenRes = await axios.post(tokenEndpoint, tokenData.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Origin': this.omniBase,
          'Referer': `${this.omniBase}/`
        },
        validateStatus: () => true
      });

      if (tokenRes.status !== 200 || !tokenRes.data?.access_token) {
        return {
          success: false,
          message: 'Lỗi đổi mã xác thực lấy Access Token từ OCB OMNI: ' + (tokenRes.data?.error_description || tokenRes.statusText),
        };
      }

      const tokenDataObj = tokenRes.data;
      const accessToken = tokenDataObj.access_token;
      const refreshToken = tokenDataObj.refresh_token;
      const expiresIn = tokenDataObj.expires_in || 300;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Giải mã JWT để lấy thông tin khách hàng
      const idPayload = parseJwt(tokenDataObj.id_token) || parseJwt(accessToken) || {};
      const customerName = idPayload.name || idPayload.preferred_username || cleanUser;

      console.log(`[OCBService] ✅ Đăng nhập OCB OMNI thành công! Khách hàng: ${customerName}`);

      // Step 6: Khởi tạo User Context và lấy danh sách tài khoản & số dư
      console.log(`[OCBService] Bước 6: Khởi tạo User Context & lấy thông tin tài khoản...`);
      const contextInfo = await this.initUserContext(accessToken);

      return {
        success: true,
        accessToken,
        refreshToken,
        expiresAt,
        cookies,
        customerName: contextInfo.accountHolderName || customerName,
        userContextCookie: contextInfo.userContextCookie,
        xUserContext: contextInfo.xUserContext,
        arrangementId: contextInfo.arrangementId,
        accounts: contextInfo.accounts || [],
        primaryAccount: contextInfo.primaryAccount || null,
        balance: contextInfo.balance || 0,
      };
    } catch (err) {
      console.error('[OCBService] Login Exception:', err);
      return {
        success: false,
        message: 'Lỗi trong quá trình đăng nhập OCB OMNI: ' + (err.response?.data?.message || err.message),
      };
    }
  }

  /**
   * Khởi tạo User Context bắt buộc của Backbase và lấy danh sách tài khoản
   */
  async initUserContext(accessToken) {
    try {
      // 1. Lấy service agreements
      const saUrl = `${this.omniBase}/api/access-control/client-api/v3/accessgroups/user-context/service-agreements`;
      const saRes = await axios.get(saUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': this.userAgent,
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 10000,
        validateStatus: () => true
      });

      let saId = null;
      if (Array.isArray(saRes.data) && saRes.data.length > 0) {
        saId = saRes.data[0].id;
      }

      if (!saId) {
        return { success: false, accounts: [], balance: 0 };
      }

      // 2. Gửi Post User Context
      const ucUrl = `${this.omniBase}/api/access-control/client-api/v3/accessgroups/user-context`;
      const ucRes = await axios.post(ucUrl, { serviceAgreementId: saId }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 10000,
        validateStatus: () => true
      });

      const setCookies = ucRes.headers['set-cookie'] || [];
      const userContextCookie = setCookies.map(c => c.split(';')[0]).join('; ');

      // 3. Lấy thông tin tài khoản tiền gửi thanh toán VND
      const accUrl = `${this.omniBase}/api/arrangement-manager/client-api/v2/arrangement-views/account-overview/groups/current-account-vnd`;
      const accRes = await axios.get(accUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Cookie': userContextCookie,
          'X-User-Context': saId,
          'User-Agent': this.userAgent,
          'Accept': 'application/json, text/plain, */*',
        },
        timeout: 10000,
        validateStatus: () => true
      });

      const elements = accRes.data?.elements || [];
      const accounts = elements.map(el => {
        const attr = el.attributes || {};
        return {
          accountId: el.id,
          accountNo: attr.bban?.value || '',
          accountName: attr.accountHolderName?.value || attr.displayName?.value || '',
          currentBalance: Number(attr.availableBalance?.value || attr.bookedBalance?.value || attr.usableBalance?.value || 0),
          currency: attr.currency?.value || 'VND',
          raw: el
        };
      });

      const primary = accounts[0] || null;

      return {
        success: true,
        userContextCookie,
        xUserContext: saId,
        arrangementId: primary?.accountId || null,
        accounts,
        primaryAccount: primary,
        accountHolderName: primary?.accountName || '',
        balance: primary?.currentBalance || 0,
      };
    } catch (err) {
      console.error('[OCBService] initUserContext error:', err.message);
      return { success: false, accounts: [], balance: 0 };
    }
  }

  /**
   * Tự động làm mới Access Token khi hết hạn qua Refresh Token
   */
  async refreshAccessToken(refreshToken) {
    try {
      if (!refreshToken) return null;

      const tokenEndpoint = `${this.keycloakBase}/protocol/openid-connect/token`;
      const tokenData = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        refresh_token: refreshToken,
      });

      const res = await axios.post(tokenEndpoint, tokenData.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Origin': this.omniBase,
          'Referer': `${this.omniBase}/`
        },
        validateStatus: () => true
      });

      if (res.status === 200 && res.data?.access_token) {
        const expiresIn = res.data.expires_in || 300;
        const newAccessToken = res.data.access_token;

        // Khởi tạo lại User Context cho Access Token mới
        const contextInfo = await this.initUserContext(newAccessToken);

        return {
          accessToken: newAccessToken,
          refreshToken: res.data.refresh_token || refreshToken,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          userContextCookie: contextInfo.userContextCookie,
          xUserContext: contextInfo.xUserContext,
          arrangementId: contextInfo.arrangementId,
        };
      }
      return null;
    } catch (err) {
      console.error('[OCBService] Refresh Token Failed:', err.message);
      return null;
    }
  }

  /**
   * Xác thực tài khoản khi thêm trên giao diện 7Bank Portal
   */
  async verifyLogin({ username, accountNumber, password }) {
    try {
      const user = username || accountNumber;
      if (!user || !password) {
        return {
          success: false,
          message: 'Vui lòng cung cấp đầy đủ tên đăng nhập và mật khẩu OCB OMNI.',
        };
      }

      console.log(`[OCBService] Bắt đầu xác thực cho tài khoản: ${user}...`);
      const loginRes = await this.login(user, password, { timeoutSec: 90 });

      if (loginRes.success) {
        let matched = null;
        if (Array.isArray(loginRes.accounts) && loginRes.accounts.length > 0) {
          matched = loginRes.accounts.find(a => String(a.accountNo).trim() === String(accountNumber).trim()) || loginRes.accounts[0];
        }

        const resolvedAccountNo = matched?.accountNo || accountNumber || user;
        const resolvedAccountName = matched?.accountName || loginRes.customerName || `Chủ tài khoản OCB - ${resolvedAccountNo}`;
        const balance = matched ? Number(matched.currentBalance || 0) : (loginRes.balance || 0);
        const arrangementId = matched?.accountId || loginRes.arrangementId || null;

        return {
          success: true,
          accountNumber: resolvedAccountNo,
          accountName: resolvedAccountName,
          balance,
          sessionData: {
            accessToken: loginRes.accessToken,
            refreshToken: loginRes.refreshToken,
            expiresAt: loginRes.expiresAt,
            cookies: loginRes.cookies,
            userContextCookie: loginRes.userContextCookie,
            xUserContext: loginRes.xUserContext,
            arrangementId: arrangementId,
            accountId: arrangementId,
            username: user,
            accountNumber: resolvedAccountNo,
            accountName: resolvedAccountName,
            currentBalance: balance,
            lastLoginAt: new Date().toISOString(),
          },
        };
      }

      return {
        success: false,
        message: loginRes.message || 'Xác thực tài khoản OCB OMNI không thành công.',
      };
    } catch (err) {
      return {
        success: false,
        message: 'Lỗi xác thực OCB OMNI: ' + err.message,
      };
    }
  }

  /**
   * Lấy lịch sử giao dịch tự động
   */
  async getTransactionHistory(bankAccount, options = {}) {
    try {
      const { accountNumber, sessionData } = bankAccount;
      let accessToken = sessionData?.accessToken;
      let refreshToken = sessionData?.refreshToken;
      let arrangementId = sessionData?.arrangementId || sessionData?.accountId;
      let userContextCookie = sessionData?.userContextCookie;
      let xUserContext = sessionData?.xUserContext;
      let currentBalance = sessionData?.currentBalance || bankAccount.balance || 0;

      // 1. Kiểm tra hạn token và tự động làm mới nếu cần
      if (refreshToken) {
        const expiresAt = sessionData?.expiresAt ? new Date(sessionData.expiresAt).getTime() : 0;
        const isExpiringSoon = Date.now() >= (expiresAt - 60000); // hết hạn trong vòng 1 phút

        if (isExpiringSoon || !accessToken) {
          console.log(`[OCBService] Token OCB (${accountNumber}) sắp hết hạn, đang tự động làm mới...`);
          const refreshed = await this.refreshAccessToken(refreshToken);
          if (refreshed) {
            accessToken = refreshed.accessToken;
            refreshToken = refreshed.refreshToken;
            userContextCookie = refreshed.userContextCookie || userContextCookie;
            xUserContext = refreshed.xUserContext || xUserContext;
            arrangementId = refreshed.arrangementId || arrangementId;
            try {
              bankAccount.sessionData = {
                ...(bankAccount.sessionData || {}),
                accessToken,
                refreshToken,
                expiresAt: refreshed.expiresAt,
                userContextCookie,
                xUserContext,
                arrangementId,
              };
              await bankAccount.save();
            } catch (_) {}
          }
        }
      }

      // 2. Nếu thiếu userContextCookie, tự khởi tạo lại
      if (accessToken && (!userContextCookie || !xUserContext)) {
        console.log(`[OCBService] Khởi tạo User Context cho OCB (${accountNumber})...`);
        const ctx = await this.initUserContext(accessToken);
        if (ctx.success) {
          userContextCookie = ctx.userContextCookie;
          xUserContext = ctx.xUserContext;
          arrangementId = ctx.arrangementId || arrangementId;
          try {
            bankAccount.sessionData = {
              ...(bankAccount.sessionData || {}),
              userContextCookie,
              xUserContext,
              arrangementId,
            };
            await bankAccount.save();
          } catch (_) {}
        }
      }

      if (!accessToken) {
        return {
          status: 'error',
          code: '99',
          bank: 'ocb',
          message: 'Phiên đăng nhập OCB OMNI đã hết hạn. Vui lòng đăng nhập lại.',
          transactions: [],
        };
      }

      // 3. Gọi API lấy giao dịch từ Backbase Transaction Manager
      const transUrl = `${this.omniBase}/api/transaction-manager/client-api/v2/transactions`;
      const params = {
        size: options.limit || 50,
        from: 0,
      };
      if (arrangementId) {
        params.arrangementId = arrangementId;
      }

      const reqHeaders = {
        'User-Agent': this.userAgent,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json, text/plain, */*',
      };
      if (userContextCookie) {
        reqHeaders['Cookie'] = userContextCookie;
      }
      if (xUserContext) {
        reqHeaders['X-User-Context'] = xUserContext;
      }

      const res = await axios.get(transUrl, {
        params,
        headers: reqHeaders,
        timeout: 15000,
        validateStatus: () => true
      });

      if (res.status === 200 && Array.isArray(res.data)) {
        const normalized = this.normalizeTransactions(res.data, accountNumber);
        
        // Cập nhật số dư mới nhất từ giao dịch đầu tiên nếu có
        if (normalized.length > 0 && normalized[0].balance) {
          currentBalance = normalized[0].balance;
          try {
            bankAccount.balance = currentBalance;
            bankAccount.lastSyncAt = new Date();
            await bankAccount.save();
          } catch (_) {}
        }

        return {
          status: 'success',
          code: '00',
          bank: 'ocb',
          accountNumber,
          accountName: bankAccount.accountName || 'Chủ tài khoản OCB',
          balance: currentBalance,
          count: normalized.length,
          transactions: normalized,
        };
      }

      return {
        status: 'error',
        code: '99',
        bank: 'ocb',
        message: 'Không thể tải lịch sử giao dịch từ OCB OMNI (HTTP ' + res.status + ')',
        transactions: [],
        raw: res.data,
      };
    } catch (err) {
      return {
        status: 'error',
        code: '99',
        bank: 'ocb',
        message: 'Lỗi tải lịch sử giao dịch OCB OMNI: ' + err.message,
        transactions: [],
      };
    }
  }

  normalizeTransactions(transactions, accountNumber) {
    if (!Array.isArray(transactions)) return [];

    return transactions.map((tx) => {
      const amount = Math.abs(Number(tx.transactionAmountCurrency?.amount || tx.transactionAmount?.amount || tx.amount || 0));
      const creditDebit = tx.creditDebitIndicator || (Number(tx.transactionAmountCurrency?.amount || tx.amount || 0) > 0 ? 'CRDT' : 'DBIT');
      const isCredit = creditDebit === 'CRDT' || creditDebit === 'CR';
      const transId = tx.reference || tx.id || tx.referenceNumber || `TX_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      return {
        transactionID: String(transId),
        accountNumber: String(accountNumber),
        amount: amount,
        type: isCredit ? 'IN' : 'OUT',
        description: tx.description || tx.reference || '',
        transactionDate: tx.bookingDate || tx.valueDate || tx.creationTime || new Date().toISOString(),
        balance: Number(tx.runningBalance || 0),
        raw: tx,
      };
    });
  }
}

module.exports = new OCBService();
