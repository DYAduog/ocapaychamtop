const BankAccount = require('../models/BankAccount');
const DepositAccount = require('../models/DepositAccount');
const ProcessedTransaction = require('../models/ProcessedTransaction');
const User = require('../models/User');
const cryptoService = require('../services/crypto.service');
const bankFactory = require('../services/banks/bankFactory');

class BankController {
  /**
   * List all bank accounts of a user
   */
  async listAccounts(req, res) {
    try {
      const { bankCode } = req.query;
      const userToken = req.headers['authorization']?.replace('Bearer ', '') || req.query.userToken;

      const filter = {};
      if (userToken) {
        const user = await User.findOne({ token: userToken });
        if (user) {
          const userConditions = [{ userId: user._id }];
          if (user.legacyId) userConditions.push({ legacyUserId: user.legacyId });
          const totalUsers = await User.countDocuments();
          if (totalUsers <= 1 || user.level === 'admin' || user.email === (process.env.ADMIN_EMAIL || 'duongle26.1025@gmail.com')) {
            userConditions.push({ userId: null }, { userId: { $exists: false } });
          }
          filter.$or = userConditions;
        }
      }
      if (bankCode) {
        const b = bankCode.toLowerCase();
        if (b === 'vcb' || b === 'vietcombank') {
          filter.bankCode = { $in: ['vcb', 'vietcombank'] };
        } else if (b === 'tpb' || b === 'tpbank') {
          filter.bankCode = { $in: ['tpb', 'tpbank'] };
        } else if (b === 'mb' || b === 'mbbank') {
          filter.bankCode = { $in: ['mb', 'mbbank'] };
        } else {
          filter.bankCode = b;
        }
      }

      const accounts = await BankAccount.find(filter);
      const mappedAccounts = accounts.map(acc => {
        const obj = acc.toObject();
        let plainPassword = '';
        if (obj.passwordEncrypted) {
          try {
            plainPassword = cryptoService.decryptBankPassword(obj.passwordEncrypted);
          } catch (e) {
            console.warn(`[listAccounts] Không thể giải mã mật khẩu tài khoản ${obj.accountNumber}:`, e.message);
          }
        }
        obj.password = plainPassword;

        // Đánh giá và chuẩn hóa trạng thái phiên (sessionStatus: 'active' | 'expired') cho tất cả các cổng
        let isExpired = obj.sessionStatus === 'expired';
        const bCode = (obj.bankCode || '').toLowerCase();

        // Kiểm tra đặc thù từng cổng nếu chưa được gắn cờ rõ ràng
        if (!isExpired) {
          if (bCode === 'msb') {
            const hasMsbToken = Boolean(obj.sessionData?.refreshToken || obj.sessionData?.accessToken);
            if (!hasMsbToken) isExpired = true;
          } else if (bCode === 'zalopay') {
            const hasZaloToken = Boolean(obj.sessionData?.cookie || obj.sessionData?.accessToken || obj.sessionData?.zaloToken);
            if (!hasZaloToken) isExpired = true;
          } else if (bCode === 'vcb' || bCode === 'vietcombank') {
            const hasVcbSession = Boolean(obj.sessionData?.sessionId || plainPassword);
            if (!hasVcbSession) isExpired = true;
          } else if (bCode === 'pgbank' || bCode === 'pg') {
            if (!plainPassword && !obj.sessionData?.lastSyncAt) isExpired = true;
          } else if (bCode === 'bvbank' || bCode === 'bvb' || bCode === 'banviet') {
            if (!obj.accountName || obj.accountName.toLowerCase().includes('thông tin')) {
              obj.accountName = 'LE MANH DUONG';
            }
          }
        }

        obj.sessionStatus = isExpired ? 'expired' : 'active';
        delete obj.passwordEncrypted;
        return obj;
      });

      return res.json({ status: 'success', data: mappedAccounts });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Add a bank account (e.g. MBBank, ACB, VCB...)
   */
  async addAccount(req, res) {
    try {
      let { bankCode, accountNumber, username, password, accountName, userToken, skipVerification, cookie } = req.body;
      const bCodeLower = String(bankCode || '').toLowerCase();
      if (bCodeLower === 'viettel' || bCodeLower === 'viettelpay') {
        if (!accountNumber && username) accountNumber = username;
        if (!username && accountNumber) username = accountNumber;
      }

      const effectivePassword = password || cookie || '000000';
      if (!bankCode || (!accountNumber && !username) || (!password && !cookie && bCodeLower !== 'zalopay')) {
        return res.status(400).json({ status: 'error', msg: 'Vui lòng điền đủ thông tin tài khoản' });
      }

      const effectiveToken = req.headers['authorization']?.replace('Bearer ', '') || userToken;
      let userId = null;
      let user = null;
      if (effectiveToken) {
        user = await User.findOne({ token: effectiveToken });
        if (user) userId = user._id;
      }
      if (!userId) {
        const defaultUser = await User.findOne().sort({ createdAt: 1 });
        if (defaultUser) {
          userId = defaultUser._id;
          user = defaultUser;
        }
      }

      // Check if user API subscription is expired
      if (user && user.timeMomo && user.timeMomo < Math.floor(Date.now() / 1000)) {
        return res.status(403).json({
          status: 'error',
          msg: 'Gói dịch vụ API của bạn đã hết hạn, vui lòng nâng cấp để tiếp tục sử dụng',
        });
      }

      // Check user plan bank availability & max accounts limit
      if (user && user.level !== 'admin' && user.level !== '1') {
        try {
          const Plan = require('../models/Plan');
          const userPlanCode = user.plan || 'starter';
          const plan = (await Plan.findOne({ code: userPlanCode })) || (await Plan.findOne({ code: 'starter' }));
          if (plan) {
            // 1. Check if this bank is enabled in the user's plan
            const bConfig = plan.bankPrices?.find(b => b.bankCode === bCodeLower);
            if (bConfig && bConfig.enabled === false) {
              return res.status(403).json({
                status: 'error',
                msg: `Cổng ${bankCode.toUpperCase()} không khả dụng trong gói "${plan.name}". Vui lòng nâng cấp gói API để sử dụng!`,
              });
            }

            // If adding a new account (not updating existing one), check limits
            const existingAcc = await BankAccount.findOne({ bankCode: bCodeLower, accountNumber });
            if (!existingAcc) {
              // 2. Check max distinct bank gateways allowed for this plan
              if (plan.maxGateways) {
                const userDistinctBanks = await BankAccount.distinct('bankCode', { userId: user._id });
                const isNewBank = !userDistinctBanks.some(b => {
                  const bl = (b || '').toLowerCase();
                  return bl === bCodeLower || 
                    (bl === 'vietcombank' && bCodeLower === 'vcb') || 
                    (bl === 'vcb' && bCodeLower === 'vietcombank') ||
                    (bl === 'tpbank' && bCodeLower === 'tpb') ||
                    (bl === 'tpb' && bCodeLower === 'tpbank') ||
                    (bl === 'mbbank' && bCodeLower === 'mb') ||
                    (bl === 'mb' && bCodeLower === 'mbbank');
                });

                if (isNewBank && userDistinctBanks.length >= plan.maxGateways) {
                  return res.status(403).json({
                    status: 'error',
                    msg: `Gói "${plan.name}" chỉ cho phép sử dụng tối đa ${plan.maxGateways} cổng ngân hàng (bạn đã dùng ${userDistinctBanks.length} cổng). Vui lòng nâng cấp gói để mở thêm cổng khác!`,
                  });
                }
              }

              // 3. Check account limit per bank: "ví dụ gói để 1 tài khoản thì tất cả các cổng trong gói đó chỉ thêm 1 tài khoản mỗi cổng"
              const accountsLimitPerBank = Number(plan.accountsPerBank) || Number(bConfig?.maxAccountsPerBank) || 1;
              const bankCodesMatch = [bCodeLower];
              if (bCodeLower === 'vcb') bankCodesMatch.push('vietcombank');
              if (bCodeLower === 'tpb') bankCodesMatch.push('tpbank');
              if (bCodeLower === 'mb') bankCodesMatch.push('mbbank');

              const totalForThisBank = await BankAccount.countDocuments({
                userId: user._id,
                bankCode: { $in: bankCodesMatch },
              });

              if (totalForThisBank >= accountsLimitPerBank) {
                return res.status(403).json({
                  status: 'error',
                  msg: `Gói "${plan.name}" quy định mỗi cổng chỉ được thêm tối đa ${accountsLimitPerBank} tài khoản. Cổng ${bankCode.toUpperCase()} của bạn đã đạt ${totalForThisBank}/${accountsLimitPerBank} tài khoản!`,
                });
              }

              // 4. Check total user accounts
              if (plan.maxAccounts) {
                const totalUserAccounts = await BankAccount.countDocuments({ userId: user._id });
                if (totalUserAccounts >= plan.maxAccounts) {
                  return res.status(403).json({
                    status: 'error',
                    msg: `Bạn đã đạt giới hạn tối đa ${plan.maxAccounts} tài khoản của gói "${plan.name}". Vui lòng liên hệ Admin hoặc nâng cấp gói để thêm tài khoản!`,
                  });
                }
              }
            }
          }
        } catch (planErr) {
          console.warn('[AddBank] Plan limit check error (non-fatal):', planErr.message);
        }
      }

      // Check if gateway is in maintenance or coming soon or disabled
      const gatewayService = require('../services/gateway.service');
      const gateway = await gatewayService.getGateway(bankCode);
      if (gateway) {
        if (gateway.status === 'disabled') {
          return res.status(400).json({
            status: 'error',
            msg: `Cổng ${gateway.name} hiện đang bị tắt${gateway.notice ? ' (' + gateway.notice + ')' : ''}, không hỗ trợ liên kết!`,
          });
        }
        if (gateway.status === 'maintenance') {
          return res.status(400).json({
            status: 'error',
            msg: `Cổng ${gateway.name} hiện đang bảo trì${gateway.notice ? ' (' + gateway.notice + ')' : ''}. Vui lòng quay lại sau!`,
          });
        }
        if (gateway.status === 'coming_soon') {
          return res.status(400).json({
            status: 'error',
            msg: `Cổng ${gateway.name} sắp ra mắt${gateway.notice ? ' (' + gateway.notice + ')' : ''}. Hiện chưa thể thêm tài khoản!`,
          });
        }
      }

      const bankFactory = require('../services/banks/bankFactory');
      let verifiedAccountName = accountName || '';
      let sessionData = {};

      // 1. Run live bank API verification unless explicitly skipped
      if (!skipVerification) {
        console.log(`[AddAccount] Verifying login with ${bankCode.toUpperCase()} for account ${accountNumber}...`);
        const verifyResult = await bankFactory.verifyLogin(bankCode, {
          accountNumber,
          username: username || accountNumber,
          password: effectivePassword,
          cookie,
          force: true, // Khi người dùng bấm thêm hoặc đăng nhập lại qua form, luôn thực hiện đăng nhập mới với mật khẩu
        });

        if (!verifyResult.success) {
          if (verifyResult.requiresOtp) {
            console.log(`[AddAccount] Bank ${bankCode.toUpperCase()} requires OTP verification:`, verifyResult.message);
            // Lưu sẵn tài khoản vào DB ở trạng thái chờ OTP nếu chưa có
            const passwordEncrypted = cryptoService.encryptBankPassword(effectivePassword);
            const token = cryptoService.generateToken(32);
            await BankAccount.findOneAndUpdate(
              { bankCode: bankCode.toLowerCase(), accountNumber: verifyResult.accountNumber || accountNumber },
              {
                userId,
                bankCode: bankCode.toLowerCase(),
                accountNumber: verifyResult.accountNumber || accountNumber,
                accountName: verifyResult.accountName || accountName || 'Chờ xác thực OTP',
                username: username || accountNumber,
                passwordEncrypted,
                token,
                sessionData: verifyResult.sessionData || {},
                status: 0,
                sessionStatus: 'expired',
                sessionError: 'Cần xác thực mã OTP',
                lastLoginAt: new Date(),
              },
              { upsert: true, new: true }
            );

            return res.json({
              status: 'requires_otp',
              requiresOtp: true,
              bankCode,
              accountNumber: verifyResult.accountNumber || accountNumber,
              username: username || accountNumber,
              accountName: verifyResult.accountName || accountName,
              qrData: verifyResult.qrData || null,
              qrUrl: verifyResult.qrUrl || null,
              token: verifyResult.token || null,
              expiresIn: verifyResult.expiresIn || 120,
              msg: verifyResult.message || 'Quý khách vui lòng xác thực SmartOTP để thực hiện đăng nhập vào Eximbank EDigi',
            });
          }

          console.warn(`[AddAccount] Verification failed:`, verifyResult.message);
          return res.status(400).json({
            status: 'error',
            msg: `Đăng nhập ${bankCode.toUpperCase()} thất bại: ${verifyResult.message}`,
            detail: verifyResult.detail || null,
          });
        }

        console.log(`[AddAccount] Verification success for ${accountNumber}! Customer: ${verifyResult.accountName}`);
        if (verifyResult.accountName) {
          verifiedAccountName = verifyResult.accountName;
        }
        if (verifyResult.accountNumber && (!accountNumber || accountNumber === username)) {
          accountNumber = verifyResult.accountNumber;
        }
        if (verifyResult.sessionData) {
          sessionData = verifyResult.sessionData;
        }
      }

      // 2. Encrypt bank password with RSA and maintain or create token
      const existingAccount = await BankAccount.findOne({ bankCode: bankCode.toLowerCase(), accountNumber });
      const passwordEncrypted = cryptoService.encryptBankPassword(effectivePassword);
      const token = existingAccount?.token || cryptoService.generateToken(32);

      const cleanAccName = (verifiedAccountName && !verifiedAccountName.toLowerCase().includes('thông tin'))
        ? verifiedAccountName
        : (bankCode.toLowerCase() === 'bvbank' ? 'LE MANH DUONG' : verifiedAccountName);

      // 3. Save or update bank account in MongoDB
      const newAccount = await BankAccount.findOneAndUpdate(
        { bankCode: bankCode.toLowerCase(), accountNumber },
        {
          userId,
          bankCode: bankCode.toLowerCase(),
          accountNumber,
          accountName: cleanAccName,
          username: username || accountNumber,
          passwordEncrypted,
          token,
          sessionData,
          sessionStatus: 'active',
          sessionError: '',
          status: 1,
          lastLoginAt: new Date(),
        },
        { upsert: true, new: true }
      );

      return res.json({
        status: 'success',
        msg: `Xác thực và kết nối thành công! ${verifiedAccountName ? 'Chủ TK: ' + verifiedAccountName : ''}`,
        data: {
          id: newAccount._id,
          bankCode: newAccount.bankCode,
          accountNumber: newAccount.accountNumber,
          accountName: newAccount.accountName,
          token: newAccount.token,
        },
      });
    } catch (error) {
      console.error('[AddAccount Error]:', error);
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Delete or remove a bank account (xóa sạch toàn bộ dữ liệu để khi thêm lại như mới từ đầu)
   */
  async removeAccount(req, res) {
    try {
      const { id } = req.params;
      
      // Tìm tài khoản theo MongoDB ID hoặc số tài khoản
      let account = null;
      if (id && String(id).match(/^[0-9a-fA-F]{24}$/)) {
        account = await BankAccount.findById(id);
      }
      if (!account && id) {
        account = await BankAccount.findOne({
          $or: [{ accountNumber: String(id).trim() }, { _id: id }],
        });
      }

      if (!account) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản ngân hàng để xóa' });
      }

      const { bankCode, accountNumber, username } = account;
      const cleanAcc = String(accountNumber).trim();
      const cleanBank = String(bankCode).toLowerCase().trim();

      console.log(`[RemoveAccount] 🗑️ Tiến hành xóa sạch toàn bộ dữ liệu tài khoản ${cleanAcc} (${cleanBank.toUpperCase()})...`);

      // 1. Xóa trong BankAccount (bao gồm mọi bản ghi trùng số tài khoản nếu có)
      await BankAccount.deleteMany({
        $or: [
          { _id: account._id },
          { accountNumber: cleanAcc },
          { bankCode: cleanBank, accountNumber: cleanAcc },
        ],
      });

      // 2. Xóa các tài khoản nạp tiền liên quan trong DepositAccount
      await DepositAccount.deleteMany({
        $or: [
          { accountNumber: cleanAcc },
          { bankCode: cleanBank, accountNumber: cleanAcc },
        ],
      });

      // 3. Xóa các giao dịch đã xử lý liên quan đến số tài khoản này
      await ProcessedTransaction.deleteMany({
        $or: [
          { accountNumber: cleanAcc },
          { bankCode: cleanBank, accountNumber: cleanAcc },
        ],
      });

      // 4. Xóa sạch file phiên, file thiết bị (deviceId), OTP chờ và cache của ngân hàng
      await bankFactory.cleanAccountData(cleanBank, cleanAcc, username);

      return res.json({
        status: 'success',
        msg: `Đã xóa sạch toàn bộ dữ liệu tài khoản ${cleanAcc} (${cleanBank.toUpperCase()}). Khi thêm lại sẽ bắt đầu lại từ đầu như tài khoản mới!`,
      });
    } catch (error) {
      console.error('[RemoveAccount Error]:', error);
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Refresh API token for a bank account
   */
  async refreshToken(req, res) {
    try {
      const { id } = req.params;
      const newToken = cryptoService.generateToken(32);
      const updated = await BankAccount.findByIdAndUpdate(id, { token: newToken }, { new: true });
      return res.json({ status: 'success', msg: 'Làm mới token thành công', token: updated.token });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }
  /**
   * Toggle account status (active 1 / inactive 0)
   */
  async toggleStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updated = await BankAccount.findByIdAndUpdate(
        id,
        { status: status !== undefined ? Number(status) : 1 },
        { new: true }
      );
      return res.json({ status: 'success', msg: 'Cập nhật trạng thái thành công', data: updated });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Bật / Tắt thông báo Tele hoặc Zalo hoặc Cả hai cho từng tài khoản ngân hàng cụ thể
   */
  async toggleNotify(req, res) {
    try {
      const { id } = req.params;
      const { channel, state } = req.body; // channel: 'telegram' | 'zalo' | 'both'
      const account = await BankAccount.findById(id);
      if (!account) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản ngân hàng' });
      }

      let msg = '';
      const bankTitle = `${(account.bankCode || '').toUpperCase()} (${account.accountNumber})`;

      if (channel === 'telegram') {
        account.telegramNotifyEnabled = state !== undefined ? Boolean(state) : !account.telegramNotifyEnabled;
        msg = `Đã ${account.telegramNotifyEnabled ? 'BẬT' : 'TẮT'} thông báo Telegram cho ${bankTitle}`;
      } else if (channel === 'zalo') {
        account.zaloNotifyEnabled = state !== undefined ? Boolean(state) : !account.zaloNotifyEnabled;
        msg = `Đã ${account.zaloNotifyEnabled ? 'BẬT' : 'TẮT'} thông báo Zalo cho ${bankTitle}`;
      } else if (channel === 'both') {
        const nextState = state !== undefined ? Boolean(state) : (!account.telegramNotifyEnabled || !account.zaloNotifyEnabled);
        account.telegramNotifyEnabled = nextState;
        account.zaloNotifyEnabled = nextState;
        msg = `Đã ${nextState ? 'BẬT CẢ HAI' : 'TẮT CẢ HAI'} thông báo (Tele & Zalo) cho ${bankTitle}`;
      } else {
        return res.status(400).json({ status: 'error', msg: 'Kênh thông báo không hợp lệ (telegram, zalo, both)' });
      }

      await account.save();
      return res.json({
        status: 'success',
        msg,
        data: {
          _id: account._id,
          telegramNotifyEnabled: account.telegramNotifyEnabled,
          zaloNotifyEnabled: account.zaloNotifyEnabled,
          webhookUrl: account.webhookUrl,
          webhookEnabled: account.webhookEnabled,
        }
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Cập nhật URL Webhook và trạng thái kích hoạt Webhook cho từng tài khoản ngân hàng
   */
  async updateWebhook(req, res) {
    try {
      const { id } = req.params;
      const { webhookUrl, webhookEnabled } = req.body;
      const account = await BankAccount.findById(id);
      if (!account) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản ngân hàng' });
      }

      if (webhookUrl !== undefined) account.webhookUrl = String(webhookUrl).trim();
      if (webhookEnabled !== undefined) account.webhookEnabled = Boolean(webhookEnabled);

      await account.save();
      return res.json({
        status: 'success',
        msg: `Đã lưu cấu hình Webhook cho tài khoản ${account.accountNumber}`,
        data: {
          _id: account._id,
          webhookUrl: account.webhookUrl,
          webhookEnabled: account.webhookEnabled,
        }
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Bắn thử nghiệm Webhook test tới URL Callback (Web Hub Callback Tester)
   */
  async testWebhook(req, res) {
    try {
      const { id } = req.params;
      const { webhookUrl, amount, type, content, date, bankCode, accountNumber, bankId } = req.body;
      
      let account = null;
      const targetId = id || bankId;
      if (targetId && targetId !== 'general' && targetId !== 'test') {
        account = await BankAccount.findById(targetId).catch(() => null);
      }

      const targetUrl = String(webhookUrl || (account ? account.webhookUrl : '')).trim();
      if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        return res.status(400).json({ status: 'error', msg: 'Vui lòng nhập URL Webhook hợp lệ (bắt đầu bằng http:// hoặc https://)' });
      }

      // Lấy signature từ user token
      const userToken = req.headers['authorization']?.replace('Bearer ', '') || req.query.userToken || req.body.signature || '';
      let signature = userToken;
      if (userToken) {
        const user = await User.findOne({ token: userToken });
        if (user) signature = user.token;
      }
      if (!signature) {
        signature = 'd978a2a5b9566e49bf672fb876d5568c';
      }

      const cleanBank = (bankCode || (account ? account.bankCode : 'MBBANK') || 'MBBANK').toUpperCase();
      const cleanAcc = accountNumber || (account ? account.accountNumber : '0987654321');
      const testAmount = String(amount || 100000);
      const testType = (type || 'IN').toUpperCase();
      const testContent = content || 'KIEM THU WEBHOOK';
      const testDate = date || new Date().toISOString();
      const testTid = '24' + Math.floor(100 + Math.random() * 900);

      // Định dạng gói tin JSON chuẩn Web Hub (tương thích mẫu ảnh và code PHP mẫu)
      const testPayload = {
        status: 'success',
        message: 'Thành công',
        transactions: [
          {
            type: testType,
            transactionID: testTid,
            amount: testAmount,
            description: testContent,
            date: testDate,
            bank: cleanBank,
            accountNumber: cleanAcc,
          }
        ]
      };

      const axios = require('axios');
      const start = Date.now();
      let response;
      let duration = 0;
      try {
        response = await axios.post(targetUrl, testPayload, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': '7Bank-WebHub-Engine/1.0',
            'signature': signature,
            'Signature': signature,
          }
        });
        duration = Date.now() - start;

        if (account) {
          account.lastCallbackAt = new Date();
          account.lastCallbackResponse = `HTTP ${response.status} OK`;
          account.lastCallbackStatus = response.status;
          await account.save();
        }

        return res.json({
          status: 'success',
          msg: `Kiểm thử Webhook thành công! Phản hồi HTTP ${response.status} (${duration}ms)`,
          sentBody: testPayload,
          response: {
            status: response.status,
            statusText: response.statusText,
            data: response.data,
            durationMs: duration,
          }
        });
      } catch (httpErr) {
        duration = Date.now() - start;
        const errStatus = httpErr.response ? httpErr.response.status : 500;
        const errData = httpErr.response ? httpErr.response.data : httpErr.message;

        if (account) {
          account.lastCallbackAt = new Date();
          account.lastCallbackResponse = `HTTP ${errStatus} ${httpErr.response?.statusText || 'Error'}`;
          account.lastCallbackStatus = errStatus;
          await account.save();
        }

        return res.json({
          status: 'error',
          msg: `Gửi thử Webhook thất bại: ${httpErr.message}`,
          sentBody: testPayload,
          response: {
            status: errStatus,
            statusText: httpErr.response?.statusText || 'Error',
            data: errData,
            durationMs: duration,
          }
        });
      }
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Get single account details
   */
  async getAccountById(req, res) {
    try {
      const { id } = req.params;
      const account = await BankAccount.findById(id);
      if (!account) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản ngân hàng' });
      }
      const obj = account.toObject();
      let plainPassword = '';
      if (obj.passwordEncrypted) {
        try {
          plainPassword = cryptoService.decryptBankPassword(obj.passwordEncrypted);
        } catch (_) {}
      }
      obj.password = plainPassword;
      delete obj.passwordEncrypted;
      return res.json({ status: 'success', data: obj });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Fetch transaction history for a specific bank account directly
   */
  async getAccountHistory(req, res) {
    try {
      const { id } = req.params;
      const bankFactory = require('../services/banks/bankFactory');
      const account = await BankAccount.findById(id);
      if (!account) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản ngân hàng' });
      }

      const historyResult = await bankFactory.getTransactionHistory(account, {
        days: req.query.days ? parseInt(req.query.days) : 6,
        force: req.query.force === 'true' || req.query.refresh === '1',
      });

      return res.json(historyResult);
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Verify Smart OTP for banks requiring 2FA (BVBank, etc.)
   */
  async verifyOtp(req, res) {
    try {
      const { bankCode, accountNumber, username, otp } = req.body;
      if (!otp) {
        return res.status(400).json({ status: 'error', msg: 'Vui lòng nhập mã Smart OTP' });
      }
      const bCode = (bankCode || '').toLowerCase();
      if (bCode === 'bvbank' || bCode === 'bvb' || bCode === 'banviet') {
        const bvbankService = require('../services/banks/bvbank.service');
        const result = await bvbankService.submitOtp(accountNumber || username, otp);
        if (result.success) {
          const accNum = result.accountNumber || accountNumber;
          const validName = (result.accountName && !result.accountName.toLowerCase().includes('thông tin'))
            ? result.accountName
            : 'LE MANH DUONG';

          await BankAccount.findOneAndUpdate(
            { bankCode: { $in: ['bvbank', 'bvb', 'banviet'] }, $or: [{ accountNumber: accNum }, { username: accountNumber || username }] },
            {
              accountName: validName,
              balance: result.balance !== undefined ? result.balance : 0,
              sessionData: result.sessionData,
              sessionStatus: 'active',
              sessionError: '',
              status: 1,
              lastLoginAt: new Date(),
            }
          ).catch(() => {});

          return res.json({
            status: 'success',
            msg: result.message,
            data: { ...result, accountName: validName },
          });
        }
        return res.status(400).json({ status: 'error', expired: result.expired || false, msg: result.message });
      }

      // Viettel Money / ViettelPay
      if (bCode === 'viettel' || bCode === 'viettelpay') {
        const viettelpayService = require('../services/banks/viettelpay.service');
        const account = await BankAccount.findOne({
          bankCode: { $in: ['viettel', 'viettelpay'] },
          $or: [{ accountNumber: accountNumber || username }, { username: accountNumber || username }]
        });
        if (!account) {
          return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản Viettel Money cần xác thực' });
        }
        let password = '';
        if (account.passwordEncrypted) {
          try {
            password = cryptoService.decryptBankPassword(account.passwordEncrypted);
          } catch (_) {}
        }
        const effectiveImei = account.sessionData?.imei;
        const effectiveRequestId = account.sessionData?.requestId;

        const result = await viettelpayService.verifyLogin({
          phone: account.accountNumber || accountNumber || username,
          username: account.username || username,
          accountNumber: account.accountNumber || accountNumber,
          password,
          otp,
          requestId: effectiveRequestId,
          imei: effectiveImei,
          sessionData: account.sessionData || {},
        });

        if (result.success) {
          const validName = (result.accountName && !result.accountName.toLowerCase().includes('thông tin'))
            ? result.accountName
            : `Viettel Money (${account.accountNumber})`;

          account.accountName = validName;
          if (result.balance !== undefined) account.balance = Number(result.balance);
          account.sessionData = result.sessionData;
          account.sessionStatus = 'active';
          account.sessionError = '';
          account.status = 1;
          account.lastLoginAt = new Date();
          await account.save();

          return res.json({
            status: 'success',
            msg: result.message || 'Xác thực OTP Viettel Money thành công! Cổng đã sẵn sàng hoạt động.',
            data: {
              bankCode: 'viettel',
              accountNumber: account.accountNumber,
              accountName: validName,
              balance: account.balance,
              token: account.token,
            },
          });
        }
        return res.status(400).json({ status: 'error', msg: result.message || 'Mã OTP không chính xác hoặc đã hết hạn' });
      }

      // Eximbank Edigi
      if (bCode === 'eximbank' || bCode === 'eib') {
        const bankFactory = require('../services/banks/bankFactory');
        const account = await BankAccount.findOne({
          bankCode: { $in: ['eximbank', 'eib'] },
          $or: [{ accountNumber: accountNumber || username }, { username: accountNumber || username }]
        });
        const currentSession = account?.sessionData || {};

        let password = '';
        if (account?.passwordEncrypted) {
          try {
            password = cryptoService.decryptBankPassword(account.passwordEncrypted);
          } catch (_) {}
        }

        const result = await bankFactory.submitOtp('eximbank', {
          accountNumber: account?.accountNumber || accountNumber,
          username: account?.username || username || accountNumber,
          password,
          otp,
          sessionData: currentSession,
        });

        if (result.success) {
          const accNum = result.accountNumber || account?.accountNumber || accountNumber;
          const validName = (result.accountName && !result.accountName.toLowerCase().includes('thông tin'))
            ? result.accountName
            : 'Chủ tài khoản Eximbank';

          const updateData = {
            accountNumber: accNum,
            accountName: validName,
            balance: result.balance !== undefined ? result.balance : (account?.balance || 0),
            sessionData: result.sessionData || currentSession,
            sessionStatus: 'active',
            sessionError: '',
            status: 1,
            lastLoginAt: new Date(),
          };

          if (account) {
            Object.assign(account, updateData);
            await account.save();
          } else {
            await BankAccount.findOneAndUpdate(
              { bankCode: 'eximbank', accountNumber: accNum },
              updateData,
              { upsert: true }
            );
          }

          return res.json({
            status: 'success',
            msg: result.message || 'Xác thực OTP Eximbank thành công! Cổng đã sẵn sàng hoạt động.',
            data: {
              bankCode: 'eximbank',
              accountNumber: accNum,
              accountName: validName,
              balance: updateData.balance,
              token: account?.token,
            },
          });
        }
        return res.status(400).json({ status: 'error', msg: result.message || 'Mã OTP không chính xác hoặc đã hết hạn' });
      }

      return res.status(400).json({ status: 'error', msg: `Cổng ${bankCode} không hỗ trợ xác thực mã OTP qua form này.` });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  /**
   * Kiểm tra xác nhận đăng nhập qua quét QR Smart OTP (Eximbank, ...)
   */
  async checkConfirm(req, res) {
    try {
      const { bankCode, accountNumber, username, token, otpToken, qrData } = req.body;
      const bCode = String(bankCode || '').toLowerCase();
      if (bCode === 'eximbank' || bCode === 'eib') {
        console.log(`[CheckConfirm] Checking QR confirm status for Eximbank account: ${accountNumber || username}`);
        const account = await BankAccount.findOne({
          bankCode: { $in: ['eximbank', 'eib'] },
          $or: [{ accountNumber: accountNumber || username }, { username: accountNumber || username }]
        });
        const currentSession = account?.sessionData || {};
        const pythonBridgeService = require('../services/pythonBridge.service');
        const result = await pythonBridgeService.execute('check_confirm', {
          bankCode: 'eximbank',
          accountNumber: account?.accountNumber || accountNumber,
          username: account?.username || username || accountNumber,
          token: token || account?.sessionData?.token || '',
          otpToken: otpToken || qrData || account?.sessionData?.otp_token || account?.sessionData?.otpToken || '',
          sessionData: currentSession,
        });

        if (result && result.success) {
          const accNum = result.accountNumber || account?.accountNumber || accountNumber;
          const validName = (result.accountName && !result.accountName.toLowerCase().includes('thông tin'))
            ? result.accountName
            : 'Chủ tài khoản Eximbank';

          const updateData = {
            accountNumber: accNum,
            accountName: validName,
            balance: result.balance !== undefined ? result.balance : (account?.balance || 0),
            sessionData: result.sessionData || currentSession,
            sessionStatus: 'active',
            sessionError: '',
            status: 1,
            lastLoginAt: new Date(),
          };

          if (account) {
            Object.assign(account, updateData);
            await account.save();
          } else {
            await BankAccount.findOneAndUpdate(
              { bankCode: 'eximbank', accountNumber: accNum },
              updateData,
              { upsert: true }
            );
          }

          return res.json({
            status: 'success',
            msg: result.message || 'Xác thực Smart OTP Eximbank thành công! Cổng đã sẵn sàng hoạt động.',
            data: {
              bankCode: 'eximbank',
              accountNumber: accNum,
              accountName: validName,
              balance: updateData.balance,
              token: account?.token,
            },
          });
        }

        if (result && result.status === 'expired') {
          return res.json({
            status: 'expired',
            msg: result.message || 'Mã QR đã hết hạn. Vui lòng bấm Đăng nhập lại để tạo mã mới.',
          });
        }

        return res.json({
          status: 'pending',
          msg: result?.message || 'Chờ quét mã xác thực trên điện thoại...',
        });
      }

      return res.status(400).json({ status: 'error', msg: 'Không hỗ trợ kiểm tra xác thực cho ngân hàng này' });
    } catch (e) {
      return res.status(500).json({ status: 'error', msg: e.message });
    }
  }
}

module.exports = new BankController();
