const axios = require('axios');

/**
 * TPBank (Tien Phong Commercial Joint Stock Bank) Service
 * Tích hợp chuẩn API eBank v4 tương thích 100% với tpbank.js cho 7Bank Gateway
 *
 * Hỗ trợ:
 * - Đăng nhập không cần giải Captcha (sử dụng chuẩn Header HYDRO eBank Web v4)
 * - Tự động kích hoạt Push Notification xác thực 2FA về App TPBank trên điện thoại
 * - Tự động thăm dò (polling) trạng thái phê duyệt 2FA và hoàn tất Bước 2
 * - Hỗ trợ đăng nhập trực tiếp bằng Access Token (bỏ qua mật khẩu và 2FA)
 * - Tra cứu thông tin chủ tài khoản, danh sách tài khoản & số dư
 * - Quét lịch sử biến động số dư qua smart-search v2
 */
class TPBankService {
  constructor() {
    this.baseUrl = 'https://ebank.tpb.vn/gateway/api';
    this.defaultDeviceId = process.env.TPB_DEVICE_ID || 'KpWCqmyUvmiul5EQ26Xm4JW6dNSVNQ0Y1z0dhTKLQw3Pa';
    this.appVersion = '2026.05.22';
    this.userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
  }

  /**
   * Bộ Headers chuẩn của TPBank eBank Web v4 (HYDRO)
   */
  getHeaders(token = null, customHeaders = {}) {
    return {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
      'app_version': this.appVersion,
      'Authorization': token ? `Bearer ${token}` : 'Bearer',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'device_id': this.defaultDeviceId,
      'device_name': 'Chrome',
      'platform_name': 'WEB',
      'platform_version': '146',
      'Pragma': 'no-cache',
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'Origin': 'https://ebank.tpb.vn',
      'Referer': 'https://ebank.tpb.vn/',
      'source_app': 'HYDRO',
      'user_name': 'HYD',
      'User-Agent': this.userAgent,
      ...customHeaders,
    };
  }

  /**
   * Helper parse thông báo lỗi từ TPBank
   */
  parseError(status, errorData) {
    if (typeof errorData === 'string') {
      try {
        errorData = JSON.parse(errorData);
      } catch (_) {}
    }
    const errObj = errorData?.error || errorData || {};
    const code = String(errObj.error_code || errObj.code || status || '');
    const msg =
      errObj.message_vi ||
      errObj.error_message ||
      errObj.message ||
      errObj.error_description ||
      `Lỗi máy chủ TPBank (Mã ${code || status})`;

    if (code === '50525' || errObj.error_message === 'INVALID_CREDENTIAL_WRONG_AND_HAVE_TRY_NUMBER_REMAINS') {
      const remains = errObj.remain_try_number ? ` (Còn lại ${errObj.remain_try_number} lần thử)` : '';
      return `Sai tên đăng nhập hoặc mật khẩu Internet Banking TPBank${remains}`;
    }
    if (code === '50526') {
      return 'Tài khoản TPBank bị tạm khóa do nhập sai mật khẩu nhiều lần (Mã 50526)';
    }
    if (code === '50054' || errObj.error_message === 'WRONG_CAPTCHA') {
      return 'Mã xác thực Captcha TPBank không chính xác, vui lòng thử lại';
    }
    if (code === '50055' || errObj.error_message === 'CAPTCHA_IS_REQUIRED') {
      return 'Tài khoản TPBank tạm thời yêu cầu xác thực bảo mật do sai mật khẩu trước đó. Vui lòng thử lại hoặc đăng nhập qua App TPBank!';
    }
    if (code === '70115') {
      return 'Phiên bản ứng dụng TPBank cần cập nhật (Mã 70115)';
    }
    return msg;
  }

  /**
   * Tạo Captcha mới từ máy chủ TPBank
   */
  async generateCaptcha(deviceId = null) {
    try {
      const devId = deviceId || this.defaultDeviceId;
      const url = `${this.baseUrl}/common-v2-service/v1/captcha/generate`;
      const res = await axios.post(
        url,
        {
          captcha: {
            clientId: devId,
            clientIP: '',
          },
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
          validateStatus: () => true,
        }
      );
      if (res.status === 200 && res.data?.captcha?.id) {
        return res.data.captcha;
      }
    } catch (err) {
      console.warn('[TPBankService] Lỗi tạo captcha TPBank:', err.message);
    }
    return null;
  }

  /**
   * Giải mã Captcha TPBank tự động qua AI OCR (ddddocr)
   */
  async solveCaptcha(base64Image) {
    if (!base64Image) return null;
    return new Promise((resolve) => {
      try {
        const { exec } = require('child_process');
        const cleanB64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s+/g, '');
        const pyCmd = `python -c "import ddddocr, base64, sys; ocr = ddddocr.DdddOcr(show_ad=False); ocr.set_ranges('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'); print(ocr.classification(base64.b64decode(sys.argv[1])))" "${cleanB64}"`;
        exec(pyCmd, { timeout: 8000 }, (error, stdout) => {
          if (!error && stdout) {
            resolve(stdout.trim());
          } else {
            resolve(null);
          }
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  /**
   * Xác thực thông tin đăng nhập với TPBank eBank API theo chuẩn tpbank.js
   */
  async verifyLogin({ username, accountNumber, password, token, sessionData }) {
    const user = String(username || accountNumber || '').trim();
    if (!user) {
      return {
        success: false,
        message: 'Vui lòng cung cấp số điện thoại hoặc tên đăng nhập TPBank',
      };
    }

    const effectiveToken =
      token ||
      (password && (password.startsWith('ey') || password.length > 50) ? password : null) ||
      sessionData?.accessToken ||
      null;

    // 1. Nếu đã có Access Token (hoặc người dùng nhập Token vào ô Mật Khẩu)
    if (effectiveToken) {
      try {
        console.log(`[TPBankService] Xác thực bằng Access Token TPBank (User: ${user})...`);
        const customer = await this.getCustomers(effectiveToken);
        const accounts = await this.getAccounts(effectiveToken);
        const stk = Array.isArray(accounts) && accounts[0] ? (accounts[0].BBAN || accounts[0].accountNo) : accountNumber;
        const balance = Array.isArray(accounts) && accounts[0] ? Number(accounts[0].availableBalance || 0) : 0;

        return {
          success: true,
          accountName: customer?.fullName || customer?.customerName || 'Chủ tài khoản TPBank',
          accountNumber: stk || user,
          balance,
          sessionData: {
            username: user,
            accessToken: effectiveToken,
            deviceId: this.defaultDeviceId,
            cif: customer?.cifNumber,
            verifiedAt: new Date().toISOString(),
          },
          message: 'Đăng nhập TPBank bằng Access Token thành công!',
        };
      } catch (err) {
        console.warn('[TPBankService] Access Token không hợp lệ hoặc đã hết hạn:', err.message);
        if (!password || password === effectiveToken) {
          return {
            success: false,
            message: 'Access Token TPBank đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại bằng mật khẩu!',
          };
        }
      }
    }

    if (!password) {
      return {
        success: false,
        message: 'Vui lòng nhập mật khẩu TPBank eBank',
      };
    }

    try {
      // 2. BƯỚC 1: Gửi yêu cầu đăng nhập (chuẩn tpbank.js - không trigger Captcha)
      console.log(`[TPBankService] Gửi yêu cầu Đăng nhập Bước 1 tới TPBank (User: ${user})...`);
      const url = `${this.baseUrl}/auth/login/v4/non-trust`;
      let payload = {
        username: user,
        password: password,
        deviceId: this.defaultDeviceId,
        transactionId: '',
      };

      let res = await axios.post(url, payload, {
        headers: this.getHeaders(),
        timeout: 15000,
        validateStatus: () => true,
      });

      let data = res.data;

      // Xử lý tự động giải Captcha nếu TPBank yêu cầu (do tài khoản bị thử sai hoặc hệ thống kích hoạt bảo mật)
      if (
        data?.error?.error_code === '50055' ||
        data?.error?.require_captcha === true ||
        data?.error?.error_message === 'CAPTCHA_IS_REQUIRED'
      ) {
        console.log(`[TPBankService] 🛡️ TPBank kích hoạt Captcha xác thực! Đang tự động giải mã bằng AI OCR...`);
        let captchaSuccess = false;
        const maxCaptchaAttempts = 4;

        for (let cTry = 1; cTry <= maxCaptchaAttempts; cTry++) {
          const capObj = await this.generateCaptcha(this.defaultDeviceId);
          if (!capObj?.captchaImage || !capObj?.id) {
            console.warn('[TPBankService] Không thể tạo mã Captcha mới từ TPBank.');
            break;
          }

          const solvedText = await this.solveCaptcha(capObj.captchaImage);
          console.log(`[TPBankService] 🤖 AI OCR giải mã Captcha (Lần ${cTry}): '${solvedText}'`);

          if (!solvedText) continue;

          payload.captcha = {
            id: capObj.id,
            clientId: this.defaultDeviceId,
            clientIP: '',
            captcha: solvedText,
          };

          const capRes = await axios.post(url, payload, {
            headers: this.getHeaders(),
            timeout: 15000,
            validateStatus: () => true,
          });

          res = capRes;
          data = capRes.data;

          if (res.status === 200 || data?.access_token || data?.error?.error_code === '70101' || (data?.error?.transaction_id && data?.error?.rsa_token)) {
            captchaSuccess = true;
            break;
          }

          if (data?.error?.error_code === '50054' || data?.error?.error_message === 'WRONG_CAPTCHA') {
            console.warn(`[TPBankService] Captcha chưa chính xác (${solvedText}), tự động thử lại mã mới...`);
            continue;
          }

          // Lỗi khác (sai mật khẩu 50525, khóa tài khoản, v.v.)
          break;
        }
      }

      // TH1: Đăng nhập thành công trực tiếp (có access_token)
      if (res.status === 200 && data?.access_token) {
        const accessToken = data.access_token;
        let customerName = data.fullName || 'Chủ tài khoản TPBank';
        let balance = 0;
        let finalStk = accountNumber || user;

        try {
          const cust = await this.getCustomers(accessToken);
          if (cust?.fullName) customerName = cust.fullName;
          const accs = await this.getAccounts(accessToken);
          if (Array.isArray(accs) && accs[0]) {
            finalStk = accs[0].BBAN || accs[0].accountNo || finalStk;
            balance = Number(accs[0].availableBalance || 0);
          }
        } catch (_) {}

        return {
          success: true,
          accountName: customerName,
          accountNumber: finalStk,
          balance,
          sessionData: {
            username: user,
            accessToken,
            deviceId: this.defaultDeviceId,
            verifiedAt: new Date().toISOString(),
          },
          message: 'Đăng nhập TPBank thành công!',
        };
      }

      // TH2: TPBank yêu cầu xác thực 2FA (Mã 70101: eToken, Smart OTP hoặc FacePay)
      if (data?.error?.error_code === '70101' || (data?.error?.transaction_id && data?.error?.rsa_token)) {
        const errObj = data.error;
        const transactionId = errObj.transaction_id;
        const rsaToken = errObj.rsa_token;
        const authMethod = errObj.high_risk_auth_method || 'etoken';

        console.log(`[TPBankService] 🔔 [Yêu Cầu 2FA] Thông tin chính xác! Mã GD: ${transactionId}, Phương thức: ${authMethod}`);

        // Tự động kích hoạt Push Notification tới ứng dụng TPBank trên điện thoại
        try {
          await this.resendNotification(user, rsaToken);
          console.log(`[TPBankService] 📲 Đã kích hoạt thông báo xác nhận tới App TPBank trên điện thoại!`);
        } catch (pushErr) {
          console.warn('[TPBankService] Lỗi gửi thông báo push:', pushErr.message);
        }

        // Tự động thăm dò (polling) xác nhận trên App TPBank trong tối đa 70 giây
        console.log(`[TPBankService] ⏳ Đang chờ người dùng bấm [Xác Nhận] trên App TPBank (tối đa 70s)...`);
        let authenticated = false;
        const maxAttempts = 35; // 35 lần * 2s = 70s

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const check = await this.checkTransaction(transactionId, rsaToken);
            const currentStatus = String(check?.status || check?.data?.status || '').toUpperCase();
            if (currentStatus === 'CONFIRM' || currentStatus === 'SUCCESS') {
              console.log(`[TPBankService] 🎉 ĐÃ XÁC THỰC THÀNH CÔNG TRÊN APP TPBANK! [Lần ${attempt}]`);
              authenticated = true;
              break;
            }
          } catch (chkErr) {
            // bỏ qua lỗi tạm thời trong khi poll
          }
        }

        if (!authenticated) {
          return {
            success: false,
            message: 'Hết thời gian chờ xác nhận 2FA trên ứng dụng TPBank. Vui lòng mở App TPBank trên điện thoại bấm [Xác Nhận] và thử lại!',
            requiresApproval: true,
            transaction_id: transactionId,
          };
        }

        // BƯỚC 2: Hoàn tất đăng nhập sau khi đã xác thực trên điện thoại
        console.log('[TPBankService] 🚀 Đang gửi lệnh hoàn tất đăng nhập Bước 2...');
        const step2Res = await axios.post(
          url,
          {
            username: user,
            password: password,
            deviceId: this.defaultDeviceId,
            transactionId: transactionId,
          },
          {
            headers: this.getHeaders(),
            timeout: 15000,
            validateStatus: () => true,
          }
        );

        if (step2Res.status === 200 && step2Res.data?.access_token) {
          const accessToken = step2Res.data.access_token;
          let customerName = step2Res.data.fullName || 'Chủ tài khoản TPBank';
          let balance = 0;
          let finalStk = accountNumber || user;

          try {
            const cust = await this.getCustomers(accessToken);
            if (cust?.fullName) customerName = cust.fullName;
            const accs = await this.getAccounts(accessToken);
            if (Array.isArray(accs) && accs[0]) {
              finalStk = accs[0].BBAN || accs[0].accountNo || finalStk;
              balance = Number(accs[0].availableBalance || 0);
            }
          } catch (_) {}

          return {
            success: true,
            accountName: customerName,
            accountNumber: finalStk,
            balance,
            sessionData: {
              username: user,
              accessToken,
              deviceId: this.defaultDeviceId,
              verifiedAt: new Date().toISOString(),
            },
            message: 'Đăng nhập và xác thực TPBank 2FA thành công!',
          };
        }

        return {
          success: false,
          message: this.parseError(step2Res.status, step2Res.data) || 'Không thể hoàn tất đăng nhập Bước 2 sau khi xác nhận 2FA.',
        };
      }

      // TH3: Báo lỗi thông thường
      return {
        success: false,
        message: this.parseError(res.status, data),
        raw: data,
      };
    } catch (err) {
      return {
        success: false,
        message: 'Lỗi kết nối tới máy chủ TPBank: ' + err.message,
      };
    }
  }

  /**
   * Kích hoạt thông báo xác nhận về ứng dụng TPBank trên điện thoại
   */
  async resendNotification(username, rsaToken) {
    const url = `${this.baseUrl}/facepay-pandp-service/v1/smart-face/resend-noti-login`;
    const payload = {
      rsaToken,
      cif: username,
      deviceId: this.defaultDeviceId,
    };
    const res = await axios.post(url, payload, {
      headers: this.getHeaders(),
      timeout: 10000,
      validateStatus: () => true,
    });
    return res.data;
  }

  /**
   * Kiểm tra trạng thái xác nhận giao dịch từ máy chủ TPBank
   */
  async checkTransaction(transactionId, rsaToken) {
    const url = `${this.baseUrl}/auth/transaction/check`;
    const payload = { rsaToken, transactionId };
    const res = await axios.post(url, payload, {
      headers: this.getHeaders(),
      timeout: 10000,
      validateStatus: () => true,
    });
    return res.data;
  }

  /**
   * Lấy thông tin khách hàng từ Access Token (chuẩn tpbank.js)
   */
  async getCustomers(token) {
    const url = `${this.baseUrl}/customers-presentation-service/v1/customers`;
    const res = await axios.get(url, {
      headers: this.getHeaders(token),
      timeout: 15000,
    });
    return res.data;
  }

  /**
   * Lấy danh sách tài khoản & số dư từ Access Token (chuẩn tpbank.js)
   */
  async getAccounts(token) {
    const url = `${this.baseUrl}/common-presentation-service/v1/bank-accounts?function=inquiry`;
    const res = await axios.get(url, {
      headers: this.getHeaders(token),
      timeout: 15000,
    });
    return res.data;
  }

  /**
   * Quét lịch sử biến động số dư theo số tài khoản (chuẩn tpbank.js smart-search v2)
   */
  async getTransactionHistory(bankAccount, options = {}) {
    const { accountNumber, username, sessionData, password } = bankAccount;
    let token = sessionData?.accessToken || process.env.TPB_TOKEN;

    // Tự động re-login nếu chưa có token hoặc token đã hết hạn
    if (!token && password) {
      console.log(`[TPBankService] Chưa có token, đang tự động đăng nhập lại cho TK ${accountNumber}...`);
      const loginRes = await this.verifyLogin({
        username: username || accountNumber,
        accountNumber,
        password,
      });
      if (loginRes.success && loginRes.sessionData?.accessToken) {
        token = loginRes.sessionData.accessToken;
        if (bankAccount.save) {
          try {
            bankAccount.sessionData = loginRes.sessionData;
            bankAccount.lastSyncAt = new Date();
            await bankAccount.save();
          } catch (_) {}
        }
      }
    }

    if (!token) {
      return {
        status: 'error',
        message: 'Tài khoản TPBank chưa có Access Token hoặc phiên đăng nhập đã hết hạn. Vui lòng xác thực lại.',
        transactions: [],
      };
    }

    try {
      const now = new Date();
      const formatYYYYMMDD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}`;
      };

      const finalToDate = formatYYYYMMDD(now);
      const days = options.days || 30;
      const pastDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const finalFromDate = formatYYYYMMDD(pastDate);

      const url = `${this.baseUrl}/smart-search-presentation-service-v2/v2/account-transactions/find`;
      const body = {
        pageNumber: 1,
        pageSize: options.rows || 100,
        accountNo: accountNumber,
        currency: 'VND',
        maxAcentrysrno: '',
        fromDate: finalFromDate,
        toDate: finalToDate,
        keyword: options.keyword || '',
      };

      const res = await axios.post(url, body, {
        headers: this.getHeaders(token),
        timeout: 15000,
        validateStatus: () => true,
      });

      if (res.status === 200 && res.data) {
        const rawTxs = res.data.transactionInfos || res.data.data?.transactionInfos || [];
        const txList = rawTxs.map((tx) => {
          const cd = String(tx.creditDebitIndicator || tx.cdIndicator || '').toUpperCase();
          const isCredit = cd === 'CRDT' || cd === 'CR' || cd === 'C' || cd === '+';
          const id = String(tx.id || tx.reference || tx.txId || 'TPB' + Math.floor(100000 + Math.random() * 900000));
          const amt = Number(tx.amount || 0);
          const desc = tx.description || tx.remark || '';
          const date = tx.bookingDate || tx.valueDate || new Date().toISOString();
          return {
            transactionID: id,
            amount: amt,
            description: desc,
            transactionDate: date,
            type: isCredit ? 'IN' : 'OUT',
          };
        });

        return {
          status: 'success',
          code: '00',
          bank: 'tpbank',
          count: txList.length,
          transactions: txList,
          sessionData: { ...(sessionData || {}), accessToken: token },
          raw: res.data,
        };
      }

      // Nếu token hết hạn (401), thử re-login nếu có mật khẩu
      if (res.status === 401 && password) {
        console.log(`[TPBankService] Token hết hạn, đang tự động đăng nhập lại cho TK ${accountNumber}...`);
        const loginRes = await this.verifyLogin({
          username: username || accountNumber,
          accountNumber,
          password,
        });
        if (loginRes.success && loginRes.sessionData?.accessToken) {
          const newToken = loginRes.sessionData.accessToken;
          if (bankAccount.save) {
            try {
              bankAccount.sessionData = loginRes.sessionData;
              bankAccount.lastSyncAt = new Date();
              await bankAccount.save();
            } catch (_) {}
          }
          // Retry với token mới
          const retryRes = await axios.post(url, body, {
            headers: this.getHeaders(newToken),
            timeout: 15000,
            validateStatus: () => true,
          });
          if (retryRes.status === 200 && retryRes.data) {
            const rawTxs = retryRes.data.transactionInfos || retryRes.data.data?.transactionInfos || [];
            const txList = rawTxs.map((tx) => {
              const cd = String(tx.creditDebitIndicator || tx.cdIndicator || '').toUpperCase();
              const isCredit = cd === 'CRDT' || cd === 'CR' || cd === 'C' || cd === '+';
              const id = String(tx.id || tx.reference || tx.txId || 'TPB' + Math.floor(100000 + Math.random() * 900000));
              const amt = Number(tx.amount || 0);
              const desc = tx.description || tx.remark || '';
              const date = tx.bookingDate || tx.valueDate || new Date().toISOString();
              return {
                transactionID: id,
                amount: amt,
                description: desc,
                transactionDate: date,
                type: isCredit ? 'IN' : 'OUT',
              };
            });
            return {
              status: 'success',
              code: '00',
              bank: 'tpbank',
              count: txList.length,
              transactions: txList,
              sessionData: loginRes.sessionData,
            };
          }
        }
      }

      return {
        status: 'error',
        message: this.parseError(res.status, res.data),
        transactions: [],
        raw: res.data,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi truy vấn lịch sử giao dịch TPBank: ' + err.message,
        transactions: [],
      };
    }
  }
}

module.exports = new TPBankService();
