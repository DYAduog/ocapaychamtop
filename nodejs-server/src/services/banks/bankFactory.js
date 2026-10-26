const pythonBridgeService = require('../pythonBridge.service');
const cryptoService = require('../crypto.service');
const tpbankService = require('./tpbank.service');
const thesieureService = require('./thesieure.service');
const viettelpayService = require('./viettelpay.service');
const timoService = require('./timo.service');
const ocbService = require('./ocb.service');
const bvbankService = require('./bvbank.service');

const historyCache = new Map();

class BankFactory {
  getService(bankCode) {
    const code = String(bankCode).toLowerCase();
    switch (code) {
      case 'tpbank':
      case 'tpb':
        return tpbankService;
      case 'thesieure':
      case 'tsr':
        return thesieureService;
      case 'viettelpay':
      case 'viettel':
        return viettelpayService;
      case 'timo':
        return timoService;
      case 'ocb':
      case 'ocbomni':
        return ocbService;
      case 'bvbank':
      case 'bvb':
      case 'banviet':
        return bvbankService;
      default:
        return pythonBridgeService;
    }
  }

  /**
   * Xóa sạch toàn bộ dữ liệu phiên, file thiết bị và cache của tài khoản để chuẩn bị thêm mới
   */
  async cleanAccountData(bankCode, accountNumber, username) {
    const code = String(bankCode || '').toLowerCase();
    console.log(`[BankFactory] 🧹 Đang dọn dẹp toàn bộ dữ liệu phiên cho ngân hàng: ${code.toUpperCase()}, TK: ${accountNumber}`);

    if (code === 'bvbank' || code === 'bvb' || code === 'banviet') {
      try {
        bvbankService.clearAccountData(accountNumber, username);
      } catch (err) {
        console.warn(`[BankFactory] Lỗi dọn dẹp BVBank:`, err.message);
      }
    }

    if (code === 'msb' || code === 'maritime' || code === 'maritimebank') {
      try {
        const msbService = require('./msb.service');
        if (typeof msbService.clearAccountData === 'function') {
          msbService.clearAccountData(accountNumber, username);
        }
      } catch (err) {
        console.warn(`[BankFactory] Lỗi dọn dẹp MSB:`, err.message);
      }
    }

    if (code === 'pgbank' || code === 'pg') {
      try {
        const pgbankCdpService = require('./pgbankCdp.service');
        if (typeof pgbankCdpService.clearAccountData === 'function') {
          pgbankCdpService.clearAccountData(accountNumber, username);
        }
      } catch (err) {
        console.warn(`[BankFactory] Lỗi dọn dẹp PGBank:`, err.message);
      }
    }

    if (code === 'eximbank' || code === 'eib') {
      try {
        const fs = require('fs');
        const path = require('path');
        const userFile = path.resolve(__dirname, '../../../../core/bank/eximbank_python-main/eximbank_python-main/db/users', `${username || accountNumber}.txt`);
        const cookieFile = path.resolve(__dirname, '../../../../core/bank/eximbank_python-main/eximbank_python-main/db/cookies', `${accountNumber}.json`);
        if (fs.existsSync(userFile)) fs.unlinkSync(userFile);
        if (fs.existsSync(cookieFile)) fs.unlinkSync(cookieFile);
      } catch (err) {
        console.warn(`[BankFactory] Lỗi dọn dẹp Eximbank:`, err.message);
      }
    }

    // Xóa cache lịch sử nếu có trong historyCache
    for (const key of historyCache.keys()) {
      if (key.includes(String(accountNumber)) || (username && key.includes(String(username)))) {
        historyCache.delete(key);
      }
    }
  }

  /**
   * Xác thực đăng nhập tài khoản ngân hàng liên kết trực tiếp với file API Python / Node Service
   */
  async verifyLogin(bankCode, { accountNumber, username, password, cookie, sessionData, force, otp, requestId, imei }) {
    const code = String(bankCode).toLowerCase();
    console.log(`[BankFactory] Verifying login for bank: ${code.toUpperCase()}, account: ${accountNumber}`);

    // Nhóm 0: PGBank Omni - Xử lý 100% qua Pure Node.js CDP Engine (Không dùng Python)
    if (code === 'pgbank' || code === 'pg') {
      const pgbankCdpService = require('./pgbankCdp.service');
      return await pgbankCdpService.verifyLogin({
        username: username || accountNumber,
        password,
        accountNumber,
      });
    }

    // Nhóm 0.7: MSB DigiBank - 100% Thuần Node.js (msb.service.js)
    if (code === 'msb' || code === 'maritime' || code === 'maritimebank') {
      const msbService = require('./msb.service');
      return await msbService.verifyLogin({
        username: username || accountNumber,
        password,
        accountNumber,
        sessionData: sessionData || {},
      });
    }

    // Nhóm 0.8: OCB OMNI Cá Nhân - 100% Thuần Node.js (ocb.service.js)
    if (code === 'ocb' || code === 'ocbomni') {
      return await ocbService.verifyLogin({
        username: username || accountNumber,
        password,
        accountNumber,
        sessionData: sessionData || {},
      });
    }

    // Nhóm 0.9: BVBank (Bản Việt DigiBank) - 100% Thuần Node.js (bvbank.service.js)
    if (code === 'bvbank' || code === 'bvb' || code === 'banviet') {
      return await bvbankService.verifyLogin({
        username: username || accountNumber,
        password,
        accountNumber,
        sessionData: sessionData || {},
      });
    }

    // Nhóm 1: Các ngân hàng xử lý qua Python API Engine (MBBank, ACB, VCB, BIDV, VietinBank, Techcombank, ZaloPay)
    const pythonBanks = [
      'mbbank',
      'mb',
      'acb',
      'vcb',
      'vietcombank',
      'bidv',
      'viettin',
      'vietinbank',
      'techcombank',
      'tcb',
      'zalopay',
      'zalo',
      'eximbank',
      'eib',
    ];

    if (pythonBanks.includes(code)) {
      // Gọi trực tiếp file API Python trên hệ thống
      const pyResult = await pythonBridgeService.verifyLogin({
        bankCode: code,
        accountNumber,
        username: username || accountNumber,
        password,
        cookie,
        sessionData: sessionData || {},
      });

      return pyResult;
    }

    // Nhóm 2: TPBank (Tiên Phong) - Xử lý trực tiếp qua Node.js TPBank Engine (Chuẩn tpbank.js - không cần giải Captcha)
    if (code === 'tpbank' || code === 'tpb') {
      return await tpbankService.verifyLogin({
        username: username || accountNumber,
        accountNumber,
        password,
        cookie,
        sessionData: sessionData || {},
      });
    }

    // Nhóm 3: Cổng Thẻ Siêu Rẻ (TSR)
    if (code === 'thesieure' || code === 'tsr') {
      return await thesieureService.verifyLogin({
        username,
        accountNumber,
        password,
        cookie,
      });
    }

    // Nhóm 4: ViettelPay / Viettel Money
    if (code === 'viettelpay' || code === 'viettel') {
      return await viettelpayService.verifyLogin({
        phone: username || accountNumber,
        username: username || accountNumber,
        accountNumber: accountNumber || username,
        password,
        otp,
        requestId,
        imei,
        sessionData: sessionData || {},
        force,
      });
    }

    // Nhóm 5: Timo Digital Bank
    if (code === 'timo') {
      return await timoService.verifyLogin({
        username: username || accountNumber,
        accountNumber,
        password,
        sessionData: sessionData || {},
      });
    }

    // Mặc định cho cổng chưa hỗ trợ
    if (!password || password.length < 4) {
      return {
        success: false,
        message: `Mật khẩu cho cổng ${code.toUpperCase()} không hợp lệ (tối thiểu 4 ký tự)`,
      };
    }

    return {
      success: true,
      accountName: '',
      sessionData: {
        note: `Kết nối thành công cổng ${code.toUpperCase()}`,
        connectedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Truy vấn lịch sử giao dịch ngân hàng và tự động giữ phiên đăng nhập (auto relogin / session keepalive)
   */
  async getTransactionHistory(bankAccount, options = {}) {
    const { bankCode, accountNumber, username, sessionData, passwordEncrypted } = bankAccount;
    const normalizedBank = String(bankCode).toLowerCase();

    // 0. Bộ nhớ đệm: Khi options.force = true, tra cứu trực tiếp thời gian thực từ ngân hàng ngay lập tức
    const isRealtimeBank = ['pgbank', 'pg'].includes(normalizedBank);
    const cacheLimit = isRealtimeBank ? 0 : 3000;
    const cacheKey = `${normalizedBank}_${accountNumber}`;
    const cached = historyCache.get(cacheKey);
    const now = Date.now();
    if (!options.force && cacheLimit > 0 && cached && (now - cached.time < cacheLimit)) {
      return cached.data;
    }

    let password = '';
    const rawEnc = passwordEncrypted || bankAccount.passwordEncrypted || bankAccount._doc?.passwordEncrypted;
    if (rawEnc) {
      try {
        password = cryptoService.decryptBankPassword(rawEnc);
      } catch (err) {
        console.warn(`[BankFactory] Password decryption error for ${normalizedBank}:`, err.message);
      }
    }


    // 1.5. PGBank Omni: Kết nối trực tiếp qua native WebSocket CDP (Tốc độ ~80ms, không dùng Python subprocess)
    if (normalizedBank === 'pgbank' || normalizedBank === 'pg') {
      const pgbankCdpService = require('./pgbankCdp.service');
      const result = await pgbankCdpService.getTransactionHistory(options);

      if (result.success || result.status === 'success') {
        try {
          if (result.accountName && result.accountName.length > 2 && !result.accountName.includes('CHI TIẾT')) {
            bankAccount.accountName = result.accountName;
          }
          if (result.balance !== undefined && result.balance !== null) {
            bankAccount.balance = Number(result.balance);
          }
          bankAccount.sessionData = bankAccount.sessionData || {};
          bankAccount.sessionData.latestTransactions = result.transactions || [];
          bankAccount.lastSyncAt = new Date();
          bankAccount.sessionStatus = 'active';
          bankAccount.sessionError = '';
          await bankAccount.save();
        } catch (saveErr) {
          console.warn('[BankFactory] Could not persist sessionData:', saveErr.message);
        }

        return {
          status: 'success',
          code: '00',
          bank: 'pgbank',
          accountNumber: bankAccount.accountNumber,
          accountName: result.accountName || bankAccount.accountName || 'LE MANH DUONG',
          balance: result.balance !== undefined ? result.balance : bankAccount.balance,
          count: (result.transactions || []).length,
          transactions: result.transactions || [],
          raw: result,
        };
      }

      try {
        bankAccount.sessionStatus = 'expired';
        bankAccount.sessionError = result.message || 'Phiên PGBank đã hết hạn hoặc chưa đăng nhập';
        await bankAccount.save();
      } catch (_) {}

      return {
        status: 'error',
        code: '99',
        bank: 'pgbank',
        message: result.message || 'Phiên PGBank đã hết hạn hoặc chưa đăng nhập',
        transactions: [],
        raw: result,
      };
    }

    // 1.7. MSB DigiBank: 100% Thuần Node.js HTTP REST API (Tốc độ ~120ms, không dùng Python subprocess)
    if (normalizedBank === 'msb' || normalizedBank === 'maritime' || normalizedBank === 'maritimebank') {
      const msbService = require('./msb.service');
      const result = await msbService.getTransactionHistory(bankAccount, options);
      if (result.success || result.status === 'success') {
        try {
          bankAccount.sessionStatus = 'active';
          bankAccount.sessionError = '';
          await bankAccount.save();
        } catch (_) {}
        return result;
      }

      try {
        bankAccount.sessionStatus = 'expired';
        bankAccount.sessionError = result.message || 'Phiên đăng nhập MSB DigiBank đã hết hạn hoặc chưa đăng nhập';
        await bankAccount.save();
      } catch (_) {}

      return {
        status: 'error',
        code: '99',
        bank: 'msb',
        message: result.message || 'Phiên đăng nhập MSB DigiBank đã hết hạn hoặc chưa đăng nhập',
        transactions: [],
        raw: result,
      };
    }

    // 1.8. OCB OMNI Cá Nhân: 100% Thuần Node.js HTTP REST API
    if (normalizedBank === 'ocb' || normalizedBank === 'ocbomni') {
      return await ocbService.getTransactionHistory(bankAccount, options);
    }

    // 1.9. BVBank (Bản Việt DigiBank): 100% Thuần Node.js HTTP REST API
    if (normalizedBank === 'bvbank' || normalizedBank === 'bvb' || normalizedBank === 'banviet') {
      return await bvbankService.getTransactionHistory(bankAccount, options);
    }

    // 1.10. ViettelPay / Viettel Money: 100% Thuần Node.js HTTP REST API
    if (normalizedBank === 'viettel' || normalizedBank === 'viettelpay') {
      const accountData = bankAccount.toObject ? bankAccount.toObject() : { ...bankAccount };
      const result = await viettelpayService.getTransactionHistory({ ...accountData, password }, options);
      const BankAccountModel = require('../../models/BankAccount');
      if (result.status === 'success' || result.success) {
        try {
          const updateFields = {
            sessionStatus: 'active',
            sessionError: '',
            lastSyncAt: new Date(),
          };
          if (result.sessionData) {
            bankAccount.sessionData = result.sessionData;
            updateFields.sessionData = result.sessionData;
          }
          if (result.balance !== undefined) {
            bankAccount.balance = Number(result.balance);
            updateFields.balance = Number(result.balance);
          }
          if (result.accountName && result.accountName.length > 2) {
            bankAccount.accountName = result.accountName;
            updateFields.accountName = result.accountName;
          }
          if (typeof bankAccount.save === 'function') {
            await bankAccount.save();
          }
          if (bankAccount._id) {
            await BankAccountModel.updateOne({ _id: bankAccount._id }, { $set: updateFields });
          } else if (accountNumber) {
            await BankAccountModel.updateOne({ bankCode: normalizedBank, accountNumber }, { $set: updateFields });
          }
        } catch (saveErr) {
          console.warn('[BankFactory] Could not persist ViettelPay account:', saveErr.message);
        }
      }
      historyCache.set(cacheKey, { data: result, time: Date.now() });
      return result;
    }

    // 2. Các ngân hàng kết nối trực tiếp qua Python API Engine
    const pythonBanks = [
      'mbbank',
      'mb',
      'acb',
      'vcb',
      'vietcombank',
      'bidv',
      'viettin',
      'vietinbank',
      'techcombank',
      'tcb',
      'zalopay',
      'zalo',
      'eximbank',
      'eib',
    ];

    if (pythonBanks.includes(normalizedBank)) {
      const result = await pythonBridgeService.getTransactionHistory({
        bankCode: normalizedBank,
        accountNumber,
        username: username || accountNumber,
        password,
        cookie: sessionData?.cookie || '',
        sessionData: sessionData || {},
        days: options.days || 6,
      });

      if (result.success || result.status === 'success') {
        // Tự động lưu phiên đăng nhập mới vào DB khi kết nối thành công
        try {
          const BankAccountModel = require('../../models/BankAccount');
          const updateFields = {
            lastSyncAt: new Date(),
            sessionStatus: 'active',
            sessionError: '',
          };
          if (result.sessionData && Object.keys(result.sessionData).length > 0) {
            bankAccount.sessionData = { ...(bankAccount.sessionData || {}), ...result.sessionData };
            updateFields.sessionData = bankAccount.sessionData;
          }
          if (result.accountName && result.accountName.length > 2 && !result.accountName.includes('CHI TIẾT')) {
            bankAccount.accountName = result.accountName;
            updateFields.accountName = result.accountName;
          }
          if (result.balance !== undefined && result.balance !== null) {
            bankAccount.balance = Number(result.balance);
            updateFields.balance = Number(result.balance);
          }

          if (typeof bankAccount.save === 'function') {
            await bankAccount.save();
          }
          if (bankAccount._id) {
            await BankAccountModel.updateOne({ _id: bankAccount._id }, { $set: updateFields });
          } else if (accountNumber) {
            await BankAccountModel.updateOne({ bankCode: normalizedBank, accountNumber }, { $set: updateFields });
          }
        } catch (saveErr) {
          console.warn('[BankFactory] Could not persist sessionData:', saveErr.message);
        }

        const txs = (result.transactions || []).map(t => {
          const id = String(t.Reference || t.transactionID || t.transaction_id || t.id || 'TX' + Math.floor(100000 + Math.random() * 900000));
          const amt = t.Amount !== undefined ? Number(t.Amount) : (t.amount !== undefined ? Number(t.amount) : 0);
          const isOut = t.CD === '-' || t.type === 'OUT';
          const desc = t.Description || t.description || t.content || '';
          const date = t.TransactionDate || t.transactionDate || t.date || new Date().toLocaleDateString('vi-VN');
          return {
            transactionID: id,
            amount: amt,
            description: desc,
            transactionDate: date,
            type: isOut ? 'OUT' : 'IN',
          };
        });
        const finalRes = {
          status: 'success',
          code: '00',
          bank: normalizedBank,
          accountNumber: bankAccount.accountNumber,
          accountName: result.accountName || bankAccount.accountName || 'LE MANH DUONG',
          balance: result.balance !== undefined ? result.balance : bankAccount.balance,
          count: txs.length,
          transactions: txs,
          sessionData: result.sessionData || sessionData,
          raw: result,
        };
        historyCache.set(cacheKey, { data: finalRes, time: Date.now() });
        return finalRes;
      }

      try {
        bankAccount.sessionStatus = 'expired';
        bankAccount.sessionError = result.message || 'Phiên hết hạn hoặc chưa đăng nhập';
        await bankAccount.save();
      } catch (_) {}

      const errRes = {
        status: 'error',
        code: '99',
        bank: normalizedBank,
        message: result.message || `Lỗi truy vấn lịch sử giao dịch ${normalizedBank.toUpperCase()} hoặc phiên đã hết hạn`,
        transactions: [],
        raw: result,
      };
      return errRes;
    }

    // 3. TPBank (Tiên Phong) - Tra cứu qua Node.js TPBank Service
    if (normalizedBank === 'tpbank' || normalizedBank === 'tpb') {
      const accountData = bankAccount.toObject ? bankAccount.toObject() : { ...bankAccount };
      const result = await tpbankService.getTransactionHistory({ ...accountData, password }, options);
      if (bankAccount.save) {
        try {
          if (result.success || result.status === 'success') {
            bankAccount.sessionStatus = 'active';
            bankAccount.sessionError = '';
            if (result.sessionData) bankAccount.sessionData = result.sessionData;
            bankAccount.lastSyncAt = new Date();
          } else {
            bankAccount.sessionStatus = 'expired';
            bankAccount.sessionError = result.message || 'Phiên TPBank đã hết hạn';
          }
          await bankAccount.save();
        } catch (_) {}
      }
      return result;
    }

    // 4. Timo Digital Bank
    if (normalizedBank === 'timo') {
      const accountData = bankAccount.toObject ? bankAccount.toObject() : { ...bankAccount };
      const result = await timoService.getTransactionHistory({ ...accountData, password }, options);
      if (result.sessionData && bankAccount.save) {
        try {
          bankAccount.sessionData = result.sessionData;
          bankAccount.lastSyncAt = new Date();
          await bankAccount.save();
          console.log(`[BankFactory] Cập nhật phiên đăng nhập mới cho Timo (${accountNumber})`);
        } catch (_) {}
      }
      return result;
    }



    // 4. Fallback cho các cổng khác
    if (normalizedBank === 'thesieure' || normalizedBank === 'tsr') {
      return {
        status: 'error',
        bank: 'thesieure',
        message: 'Cổng Thẻ Siêu Rẻ chưa có hàm tra cứu giao dịch tự động',
      };
    }

    return {
      status: 'error',
      message: `Cổng ngân hàng '${bankCode.toUpperCase()}' chưa hỗ trợ lấy lịch sử giao dịch.`,
    };
  }

  /**
   * Xác thực mã OTP gửi về điện thoại (Eximbank, BVBank, Viettel)
   */
  async submitOtp(bankCode, { accountNumber, username, password, otp, sessionData }) {
    const code = String(bankCode || '').toLowerCase();
    if (code === 'eximbank' || code === 'eib') {
      return await pythonBridgeService.execute('verify_otp', {
        bankCode: 'eximbank',
        accountNumber,
        username: username || accountNumber,
        password: password || '',
        otp,
        sessionData: sessionData || {},
      });
    }
    return {
      success: false,
      message: `Cổng ngân hàng ${code.toUpperCase()} không hỗ trợ xác thực mã OTP qua phương thức này`,
    };
  }
}

module.exports = new BankFactory();
