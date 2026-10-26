const Setting = require('../models/Setting');
const DepositAccount = require('../models/DepositAccount');
const BankAccount = require('../models/BankAccount');
const User = require('../models/User');
const { BalanceLog } = require('../models/Log');
const Invoice = require('../models/Invoice');
const ProcessedTransaction = require('../models/ProcessedTransaction');
const bankFactory = require('./banks/bankFactory');
const cryptoService = require('./crypto.service');

const BANK_METAS = {
  techcombank: {
    bin: '970407',
    name: 'Techcombank',
    fullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
    logo: '/images/techcombank.jpg',
  },
  tcb: {
    bin: '970407',
    name: 'Techcombank',
    fullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam',
    logo: '/images/techcombank.jpg',
  },
  vietcombank: {
    bin: '970436',
    name: 'Vietcombank',
    fullName: 'Ngân hàng Ngoại Thương Việt Nam (VCB)',
    logo: '/images/vietcombank.png',
  },
  vcb: {
    bin: '970436',
    name: 'Vietcombank',
    fullName: 'Ngân hàng Ngoại Thương Việt Nam (VCB)',
    logo: '/images/vietcombank.png',
  },
  acb: {
    bin: '970416',
    name: 'ACB',
    fullName: 'Ngân hàng TMCP Á Châu (ACB)',
    logo: '/images/acb.png',
  },
  mbbank: {
    bin: '970422',
    name: 'MBBank',
    fullName: 'Ngân hàng TMCP Quân Đội (MBBank)',
    logo: '/images/mbbank.png',
  },
  mb: {
    bin: '970422',
    name: 'MBBank',
    fullName: 'Ngân hàng TMCP Quân Đội (MBBank)',
    logo: '/images/mbbank.png',
  },
  tpbank: {
    bin: '970423',
    name: 'TPBank',
    fullName: 'Ngân hàng TMCP Tiên Phong (TPBank)',
    logo: '/images/tpbank.png',
  },
  tpb: {
    bin: '970423',
    name: 'TPBank',
    fullName: 'Ngân hàng TMCP Tiên Phong (TPBank)',
    logo: '/images/tpbank.png',
  },
  timo: {
    bin: '963388',
    name: 'Timo',
    fullName: 'Timo Digital Bank (BVBank)',
    logo: '/images/timo-icon.png',
  },
  bidv: {
    bin: '970418',
    name: 'BIDV',
    fullName: 'Ngân hàng Đầu tư và Phát triển (BIDV)',
    logo: '/images/bidv.png',
  },
  vietinbank: {
    bin: '970415',
    name: 'VietinBank',
    fullName: 'Ngân hàng TMCP Công Thương (VietinBank)',
    logo: '/images/vietinbank.png',
  },
  msb: {
    bin: '970426',
    name: 'MSB',
    fullName: 'Ngân hàng TMCP Hàng Hải Việt Nam (MSB)',
    logo: '/images/msb.png',
  },
  pgbank: {
    bin: '970430',
    name: 'PGBank',
    fullName: 'Ngân hàng TMCP Thịnh vượng và Phát triển (PGBank)',
    logo: '/images/pgbank.png',
  },
  pg: {
    bin: '970430',
    name: 'PGBank',
    fullName: 'Ngân hàng TMCP Thịnh vượng và Phát triển (PGBank)',
    logo: '/images/pgbank.png',
  },
  bvbank: {
    bin: '970454',
    name: 'BVBank',
    fullName: 'Ngân hàng TMCP Bản Việt (BVBank)',
    logo: '/images/bvbank.png',
  },
  bvb: {
    bin: '970454',
    name: 'BVBank',
    fullName: 'Ngân hàng TMCP Bản Việt (BVBank)',
    logo: '/images/bvbank.png',
  },
};

class DepositService {
  constructor() {
    this.seedDefaultsIfEmpty();
  }

  /**
   * Khởi tạo sẵn tài khoản nạp tiền mặc định nếu bảng DepositAccount hoàn toàn rỗng
   */
  async seedDefaultsIfEmpty() {
    try {
      const count = await DepositAccount.countDocuments();
      if (count === 0) {
        console.log('[DepositService] Đang khởi tạo các tài khoản nhận nạp tiền riêng mặc định...');

        // Lấy sessionData có sẵn từ BankAccount nếu có để tái sử dụng phiên
        const existingAccounts = await BankAccount.find();
        const getSession = (code) => {
          const acc = existingAccounts.find((a) => String(a.bankCode).toLowerCase().includes(code));
          return acc ? { sessionData: acc.sessionData || {}, passwordEncrypted: acc.passwordEncrypted || '' } : {};
        };

        const tcbData = getSession('techcombank');
        const vcbData = getSession('vcb');
        const acbData = getSession('acb');
        const mbData = getSession('mb');

        const initialAccounts = [
          {
            bankCode: 'techcombank',
            bankName: 'Techcombank',
            bin: '970407',
            accountNumber: '19071955696013',
            accountName: 'LE MANH DUONG',
            username: '19071955696013',
            status: 1,
            passwordEncrypted: tcbData.passwordEncrypted || '',
            sessionData: tcbData.sessionData || { arrangementId: '66d391e8-73e9-4927-a8c3-b799e07ba79a' },
            token: cryptoService.generateToken(32),
          },
          {
            bankCode: 'vietcombank',
            bankName: 'Vietcombank',
            bin: '970436',
            accountNumber: '1028613199',
            accountName: 'LE MANH DUONG',
            username: '1028613199',
            status: 1,
            passwordEncrypted: vcbData.passwordEncrypted || '',
            sessionData: vcbData.sessionData || {},
            token: cryptoService.generateToken(32),
          },
          {
            bankCode: 'acb',
            bankName: 'ACB',
            bin: '970416',
            accountNumber: '15322911',
            accountName: 'DUONG LE MANH',
            username: '15322911',
            status: 1,
            passwordEncrypted: acbData.passwordEncrypted || '',
            sessionData: acbData.sessionData || {},
            token: cryptoService.generateToken(32),
          },
          {
            bankCode: 'mbbank',
            bankName: 'MBBank',
            bin: '970422',
            accountNumber: '0987654321',
            accountName: 'LE MANH DUONG',
            username: '0987654321',
            status: 1,
            passwordEncrypted: mbData.passwordEncrypted || '',
            sessionData: mbData.sessionData || {},
            token: cryptoService.generateToken(32),
          },
        ];

        for (const item of initialAccounts) {
          await DepositAccount.findOneAndUpdate(
            { accountNumber: item.accountNumber },
            { $setOnInsert: item },
            { upsert: true }
          );
        }
        console.log('[DepositService] ✅ Đã khởi tạo 4 tài khoản nạp tiền riêng biệt (Techcombank, Vietcombank, ACB, MBBank)');
      }
    } catch (err) {
      console.warn('[DepositService] Warning seeding deposit accounts:', err.message);
    }
  }

  /**
   * Lấy cấu hình chung (Cú pháp, mức nạp tối thiểu)
   */
  async getGeneralSettings() {
    const s = await Setting.findOne({ name: 'deposit_general_settings' });
    return (
      s?.value || {
        memo_prefix: 'NAPTIEN',
        min_amount: 10000,
        system_notice: '',
      }
    );
  }

  /**
   * Lưu cấu hình chung
   */
  async saveGeneralSettings(settings) {
    await Setting.findOneAndUpdate(
      { name: 'deposit_general_settings' },
      { value: settings },
      { upsert: true }
    );
    return settings;
  }

  /**
   * Lấy toàn bộ danh sách tài khoản nạp tiền riêng (Cho Admin)
   */
  async getAllDepositAccounts() {
    await this.seedDefaultsIfEmpty();
    return await DepositAccount.find().sort({ createdAt: 1 });
  }

  /**
   * Thêm một tài khoản ngân hàng nhận nạp tiền riêng
   */
  async addDepositAccount({ bankCode, accountNumber, accountName, username, password }) {
    if (!bankCode || !accountNumber || !accountName) {
      throw new Error('Vui lòng chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản');
    }

    const cleanStk = String(accountNumber).trim();
    const existing = await DepositAccount.findOne({ accountNumber: cleanStk });
    if (existing) {
      throw new Error(`Số tài khoản '${cleanStk}' đã tồn tại trong danh sách nhận nạp tiền`);
    }

    const normalizedCode = String(bankCode).toLowerCase().trim();
    const meta = BANK_METAS[normalizedCode] || {
      bin: '970407',
      name: normalizedCode.toUpperCase(),
      fullName: normalizedCode.toUpperCase(),
      logo: '/images/bank.png',
    };

    let passwordEncrypted = '';
    if (password) {
      passwordEncrypted = cryptoService.encryptBankPassword(password);
    }

    const token = cryptoService.generateToken(32);

    let sessionData = {};
    let loginStatus = 'active';
    let loginError = '';

    // Thử xác thực đăng nhập nếu có cung cấp mật khẩu
    if (password) {
      try {
        console.log(`[DepositService] Đang xác thực đăng nhập cổng nạp riêng: ${normalizedCode.toUpperCase()} (${cleanStk})...`);
        const loginRes = await bankFactory.verifyLogin(normalizedCode, {
          accountNumber: cleanStk,
          username: username || cleanStk,
          password,
        });

        if (loginRes.success) {
          sessionData = loginRes.sessionData || {};
          loginStatus = 'active';
        } else {
          loginStatus = loginRes.requiresApproval ? 'pending_approval' : 'error';
          loginError = loginRes.message || 'Đăng nhập không thành công';
        }
      } catch (err) {
        loginStatus = 'error';
        loginError = err.message;
      }
    }

    const newAcc = await DepositAccount.create({
      bankCode: normalizedCode,
      bankName: meta.name,
      bin: meta.bin,
      accountNumber: cleanStk,
      accountName: String(accountName).trim().toUpperCase(),
      username: username ? String(username).trim() : cleanStk,
      passwordEncrypted,
      token,
      status: 1,
      sessionData,
      loginStatus,
      loginError,
      lastLoginAt: new Date(),
    });

    console.log(`[DepositService] ✅ Đã thêm tài khoản nạp riêng mới: ${meta.name} - STK: ${cleanStk} (${newAcc.accountName})`);
    return newAcc;
  }

  /**
   * Cập nhật thông tin tài khoản nạp tiền riêng
   */
  async updateDepositAccount(id, { accountName, username, password, status }) {
    const acc = await DepositAccount.findById(id);
    if (!acc) throw new Error('Không tìm thấy tài khoản nhận nạp tiền');

    if (accountName) acc.accountName = String(accountName).trim().toUpperCase();
    if (username !== undefined) acc.username = String(username).trim();
    if (status !== undefined) acc.status = Number(status);

    if (password && password.trim()) {
      acc.passwordEncrypted = cryptoService.encryptBankPassword(password.trim());
      // Re-login
      try {
        const loginRes = await bankFactory.verifyLogin(acc.bankCode, {
          accountNumber: acc.accountNumber,
          username: acc.username || acc.accountNumber,
          password: password.trim(),
        });
        if (loginRes.success) {
          acc.sessionData = loginRes.sessionData || acc.sessionData;
          acc.loginStatus = 'active';
          acc.loginError = '';
          acc.lastLoginAt = new Date();
        } else {
          acc.loginStatus = 'error';
          acc.loginError = loginRes.message || 'Lỗi đăng nhập';
        }
      } catch (err) {
        acc.loginStatus = 'error';
        acc.loginError = err.message;
      }
    }

    await acc.save();
    return acc;
  }

  /**
   * Bật / Tắt trạng thái nhận nạp
   */
  async toggleDepositAccount(id) {
    const acc = await DepositAccount.findById(id);
    if (!acc) throw new Error('Không tìm thấy tài khoản');
    acc.status = acc.status === 1 ? 0 : 1;
    await acc.save();
    return acc;
  }

  /**
   * Xóa tài khoản nạp tiền riêng (xóa sạch toàn bộ dữ liệu để khi thêm lại như mới từ đầu)
   */
  async deleteDepositAccount(id) {
    let acc = null;
    if (id && String(id).match(/^[0-9a-fA-F]{24}$/)) {
      acc = await DepositAccount.findById(id);
    }
    if (!acc && id) {
      acc = await DepositAccount.findOne({
        $or: [{ accountNumber: String(id).trim() }, { _id: id }],
      });
    }

    if (!acc) throw new Error('Không tìm thấy tài khoản để xóa');

    const { bankCode, accountNumber, username } = acc;
    const cleanAcc = String(accountNumber).trim();
    const cleanBank = String(bankCode).toLowerCase().trim();

    // 1. Xóa trong DepositAccount
    await DepositAccount.deleteMany({
      $or: [
        { _id: acc._id },
        { accountNumber: cleanAcc },
        { bankCode: cleanBank, accountNumber: cleanAcc },
      ],
    });

    // 2. Xóa các giao dịch liên quan
    await ProcessedTransaction.deleteMany({
      $or: [
        { accountNumber: cleanAcc },
        { bankCode: cleanBank, accountNumber: cleanAcc },
      ],
    });

    // 3. Xóa file phiên, thiết bị và cache
    await bankFactory.cleanAccountData(cleanBank, cleanAcc, username);

    return acc;
  }

  /**
   * Đăng nhập lại tài khoản nhận nạp tiền
   */
  async reloginDepositAccount(id, overridePassword = null) {
    const acc = await DepositAccount.findById(id);
    if (!acc) throw new Error('Không tìm thấy tài khoản');

    let password = overridePassword;
    if (!password && acc.passwordEncrypted) {
      try {
        password = cryptoService.decryptBankPassword(acc.passwordEncrypted);
      } catch (_) {}
    }

    if (!password) {
      throw new Error('Tài khoản chưa lưu mật khẩu, vui lòng nhập mật khẩu để đăng nhập');
    }

    console.log(`[DepositService] 🔑 Đang đăng nhập lại cổng nạp riêng [${acc.bankCode.toUpperCase()} - ${acc.accountNumber}]...`);
    const loginRes = await bankFactory.verifyLogin(acc.bankCode, {
      accountNumber: acc.accountNumber,
      username: acc.username || acc.accountNumber,
      password,
      sessionData: acc.sessionData || {},
    });

    if (loginRes.success) {
      acc.sessionData = loginRes.sessionData || acc.sessionData;
      acc.loginStatus = 'active';
      acc.loginError = '';
      acc.lastLoginAt = new Date();
      await acc.save();
      return { success: true, msg: 'Đăng nhập thành công, phiên kết nối đã sẵn sàng!', account: acc };
    }

    acc.loginStatus = loginRes.requiresApproval ? 'pending_approval' : 'error';
    acc.loginError = loginRes.message || 'Đăng nhập thất bại';
    await acc.save();

    return {
      success: false,
      requiresApproval: !!loginRes.requiresApproval,
      msg: loginRes.message || 'Đăng nhập thất bại',
      account: acc,
    };
  }

  /**
   * Lấy danh sách ngân hàng nạp tiền công khai cho Client Portal
   * Lấy trực tiếp từ các tài khoản nạp riêng đang kích hoạt (status: 1)
   */
  async getPublicBanks() {
    await this.seedDefaultsIfEmpty();
    const activeAccounts = await DepositAccount.find({ status: 1 }).sort({ createdAt: 1 });
    const general = await this.getGeneralSettings();

    const banks = activeAccounts.map((acc) => {
      const code = (acc.bankCode || 'techcombank').toLowerCase();
      const meta = BANK_METAS[code] || {
        bin: acc.bin || '970407',
        name: acc.bankName || code.toUpperCase(),
        fullName: acc.bankName || code.toUpperCase(),
        logo: `/images/${code}.png`,
      };

      return {
        id: acc._id,
        code,
        name: acc.bankName || meta.name,
        fullName: meta.fullName || acc.bankName,
        bin: acc.bin || meta.bin,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        logo: meta.logo || `/images/${code}.png`,
        minAmount: general.min_amount || 10000,
        memoPrefix: general.memo_prefix || 'NAPTIEN',
      };
    });

    return {
      memo_prefix: general.memo_prefix || 'NAPTIEN',
      min_amount: general.min_amount || 10000,
      banks,
    };
  }

  /**
   * Tìm người dùng từ nội dung chuyển khoản (Memo)
   */
  async findUserFromDescription(description) {
    if (!description || typeof description !== 'string') return null;
    const cleanDesc = description.toUpperCase().replace(/[^A-Z0-9\s_\-\.]/g, ' ');

    // 1. Tìm theo regex bắt từ khóa: NAP7BANK / 7BANK / NAPTIEN / GIAHAN7B / NAP / 7B
    const match = cleanDesc.match(/(?:NAP7BANK|7BANK|NAPTIEN|GIAHAN7B|NAP|7B)(?:\s+|:|-)*([A-Z0-9_\-\.]+)/i);
    let candidate = match ? match[1].trim() : '';

    if (candidate) {
      // Tìm chính xác theo username
      let user = await User.findOne({ username: new RegExp(`^${candidate}$`, 'i') });
      if (user) return { user, candidate };

      // Tìm theo email prefix
      user = await User.findOne({ email: new RegExp(`^${candidate}@`, 'i') });
      if (user) return { user, candidate };

      // Tìm theo short ID
      if (candidate.length >= 6) {
        user = await User.findOne({
          $or: [
            { _id: candidate.length === 24 ? candidate : null },
            { username: new RegExp(candidate, 'i') },
          ].filter(Boolean),
        });
        if (user) return { user, candidate };
      }
    }

    // 2. Fallback: Quét tất cả usernames
    const allUsers = await User.find().select('username email');
    for (const u of allUsers) {
      const uName = u.username.toUpperCase();
      if (uName.length >= 3 && cleanDesc.includes(uName)) {
        const fullUser = await User.findById(u._id);
        return { user: fullUser, candidate: fullUser.username };
      }
    }

    return null;
  }

  /**
   * Xử lý giao dịch nhận tiền và cộng tiền tự động vào ví
   */
  async processIncomingTransaction(tx, depositAccount) {
    const isIncoming = tx.type === 'IN' || tx.CD === '+';
    const amount = Number(tx.Amount !== undefined ? tx.Amount : tx.amount || 0);

    if (!isIncoming || amount <= 0) {
      return { skipped: true, reason: 'Không phải giao dịch nhận tiền' };
    }

    const reference = String(tx.Reference || tx.transactionID || tx.transaction_id || tx.id || '').trim();
    if (!reference) {
      return { skipped: true, reason: 'Giao dịch thiếu mã tham chiếu (Reference)' };
    }

    const bankCode = depositAccount.bankCode || 'unknown';
    const accountNumber = depositAccount.accountNumber || '';
    const description = String(tx.Description || tx.description || tx.content || '').trim();

    // 1. Kiểm tra chống cộng trùng lặp
    const existing = await ProcessedTransaction.findOne({
      bankCode,
      accountNumber,
      transactionId: reference,
    });

    if (existing) {
      return {
        alreadyProcessed: true,
        transactionId: reference,
        userId: existing.userId,
        amount: existing.amount,
      };
    }

    // 2. Tìm người dùng
    const matchResult = await this.findUserFromDescription(description);
    if (!matchResult || !matchResult.user) {
      console.log(`[DepositService] ⚠️ Giao dịch +${amount.toLocaleString()} đ [${reference}] không nhận diện được người dùng. Nội dung: "${description}"`);
      return {
        matched: false,
        amount,
        reference,
        description,
        reason: 'Không tìm thấy người dùng khớp với nội dung chuyển khoản',
      };
    }

    // Nạp lại đầy đủ các trường của người dùng từ DB để đảm bảo không bị thiếu zaloChatId, telegramChatId...
    const targetUser = await User.findById(matchResult.user._id);
    if (!targetUser) {
      return { matched: false, reason: 'Người dùng không còn tồn tại trong hệ thống' };
    }

    // 3. Cộng tiền ví
    const moneyBefore = targetUser.money || 0;
    const moneyChange = amount;
    const moneyAfter = moneyBefore + moneyChange;

    targetUser.money = moneyAfter;
    targetUser.totalMoney = (targetUser.totalMoney || 0) + moneyChange;
    await targetUser.save();

    const bankDisplayName = (depositAccount.bankName || depositAccount.bankCode || '').toUpperCase();
    const logNote = `Nạp tiền tự động qua ${bankDisplayName} (${accountNumber}) - Mã GD: ${reference}`;

    // 4. Lưu BalanceLog
    await BalanceLog.create({
      userId: targetUser._id,
      legacyUserId: targetUser.legacyId,
      moneyBefore,
      moneyChange,
      moneyAfter,
      note: logNote,
    });

    // 5. Lưu ProcessedTransaction
    const processedTx = await ProcessedTransaction.create({
      bankCode,
      accountNumber,
      transactionId: reference,
      amount,
      description,
      userId: targetUser._id,
      username: targetUser.username,
      status: 'completed',
      creditedAt: new Date(),
      raw: tx,
    });

    // 6. Cập nhật hóa đơn
    try {
      await Invoice.findOneAndUpdate(
        { userId: targetUser._id, status: 'pending', amount },
        { status: 'completed', pay: amount }
      );
    } catch (_) {}

    console.log(`[DepositService] 🎉 Đã nạp thành công +${amount.toLocaleString()} đ cho ${targetUser.username} qua ${bankDisplayName} [${reference}]!`);

    const notifyPayload = {
      amount: moneyChange,
      type: 'IN',
      bank: bankDisplayName,
      balanceBefore: moneyBefore,
      balanceAfter: moneyAfter,
      content: description,
      txId: reference,
      time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    };

    // Kiểm tra cấu hình thông báo và Webhook riêng của tài khoản ngân hàng này (nếu có)
    let bankAcc = null;
    if (depositAccount?.accountNumber) {
      try {
        bankAcc = await BankAccount.findOne({
          accountNumber: depositAccount.accountNumber,
          bankCode: (depositAccount.bankCode || '').toLowerCase(),
        });
      } catch (_) {}
    }

    const allowTele = bankAcc ? (bankAcc.telegramNotifyEnabled !== false) : true;
    const allowZalo = bankAcc ? (bankAcc.zaloNotifyEnabled !== false) : true;

    // 7. Gửi thông báo Telegram tức thì nếu người dùng và tài khoản đều bật
    if (allowTele && targetUser.telegramNotifyEnabled && targetUser.telegramChatId) {
      try {
        const telegramService = require('./telegram.service');
        telegramService.sendBalanceChangeNotification(targetUser, notifyPayload)
          .catch(tErr => console.warn('[DepositService:Telegram] ⚠️ Lỗi gửi thông báo Telegram:', tErr.message));
      } catch (tErr) {
        console.warn('[DepositService:Telegram] Lỗi khởi tạo Telegram:', tErr.message);
      }
    }

    // 8. Gửi thông báo Zalo Bot tức thì nếu người dùng và tài khoản đều bật
    if (allowZalo && targetUser.zaloNotifyEnabled && targetUser.zaloChatId) {
      try {
        const zaloBotService = require('./zaloBot.service');
        zaloBotService.sendBalanceChangeNotification(targetUser, notifyPayload)
          .catch(zErr => console.warn('[DepositService:ZaloBot] ⚠️ Lỗi gửi thông báo Zalo:', zErr.message));
      } catch (zErr) {
        console.warn('[DepositService:ZaloBot] Lỗi khởi tạo ZaloBot:', zErr.message);
      }
    }

    // 9. Bắn Webhook riêng cho tài khoản ngân hàng nếu kích hoạt
    if (bankAcc && bankAcc.webhookEnabled && bankAcc.webhookUrl) {
      try {
        const axios = require('axios');
        const userSig = user?.token || bankAcc.token || 'd978a2a5b9566e49bf672fb876d5568c';
        const tid = reference || String(Date.now());
        const webhookPayload = {
          status: 'success',
          message: 'Thành công',
          transactions: [
            {
              type: 'IN',
              transactionID: tid,
              amount: String(moneyChange),
              description: description,
              date: new Date().toISOString(),
              bank: (bankAcc.bankCode || '').toUpperCase(),
              accountNumber: bankAcc.accountNumber,
            }
          ],
          // Các trường bổ trợ tương thích ngược
          bank: (bankAcc.bankCode || '').toUpperCase(),
          accountNumber: bankAcc.accountNumber,
          accountName: bankAcc.accountName,
          transactionId: tid,
          amount: moneyChange,
          type: 'IN',
          content: description,
          date: new Date().toISOString(),
          balance: moneyAfter,
        };

        axios.post(bankAcc.webhookUrl, webhookPayload, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'User-Agent': '7Bank-WebHub-Engine/1.0',
            'signature': userSig,
            'Signature': userSig,
          }
        }).then(async (wRes) => {
          console.log(`[Webhook:Account] 🚀 Đã gửi webhook thành công tới ${bankAcc.webhookUrl} [HTTP ${wRes.status}]`);
          bankAcc.lastCallbackAt = new Date();
          bankAcc.lastCallbackResponse = `HTTP ${wRes.status} OK`;
          bankAcc.lastCallbackStatus = wRes.status;
          await bankAcc.save().catch(() => {});
        }).catch(async (wErr) => {
          console.warn(`[Webhook:Account] ⚠️ Bắn webhook thất bại tới ${bankAcc.webhookUrl}:`, wErr.message);
          bankAcc.lastCallbackAt = new Date();
          bankAcc.lastCallbackResponse = `HTTP ${wErr.response?.status || 500} ${wErr.response?.statusText || 'Error'}`;
          bankAcc.lastCallbackStatus = wErr.response?.status || 500;
          await bankAcc.save().catch(() => {});
        });
      } catch (wErr) {
        console.warn('[Webhook:Account] Lỗi bắn webhook:', wErr.message);
      }
    }

    return {
      success: true,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        moneyBefore,
        moneyAfter,
      },
      amount,
      transactionId: reference,
      creditedAt: processedTx.creditedAt,
    };
  }

  /**
   * Quét lịch sử giao dịch cho một tài khoản nạp tiền riêng
   */
  async syncDepositAccount(accountIdOrCode, days = 2) {
    let account = null;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(accountIdOrCode));

    if (isObjectId) {
      account = await DepositAccount.findById(accountIdOrCode);
    } else {
      const code = String(accountIdOrCode).toLowerCase();
      account = await DepositAccount.findOne({
        $or: [{ bankCode: code }, { accountNumber: code }],
        status: 1,
      });
    }

    if (!account) {
      throw new Error(`Không tìm thấy tài khoản nhận nạp tiền cho '${accountIdOrCode}'`);
    }

    console.log(`[DepositService] 🚀 Đang quét biến động nạp tiền [${account.bankCode.toUpperCase()} - STK: ${account.accountNumber}]...`);
    const historyResult = await bankFactory.getTransactionHistory(account, { days });

    if (!historyResult || (historyResult.status !== 'success' && !historyResult.success)) {
      throw new Error(historyResult?.message || `Lỗi truy vấn lịch sử từ ngân hàng ${account.bankCode.toUpperCase()}`);
    }

    account.lastSyncAt = new Date();
    await account.save();

    const txs = historyResult.transactions || [];
    const newlyCredited = [];
    const alreadyProcessed = [];
    const unallocated = [];

    for (const tx of txs) {
      try {
        const res = await this.processIncomingTransaction(tx, account);
        if (res.success) {
          newlyCredited.push(res);
        } else if (res.alreadyProcessed) {
          alreadyProcessed.push(res);
        } else if (res.matched === false) {
          unallocated.push(res);
        }
      } catch (err) {
        console.warn(`[DepositService] Lỗi khi xử lý giao dịch ${tx.Reference}:`, err.message);
      }
    }

    return {
      status: 'success',
      bankCode: account.bankCode,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      totalTransactions: txs.length,
      newlyCreditedCount: newlyCredited.length,
      newlyCredited,
      alreadyProcessedCount: alreadyProcessed.length,
      unallocatedCount: unallocated.length,
      unallocated,
    };
  }

  /**
   * Quét toàn bộ các tài khoản nạp riêng đang kích hoạt (dùng cho Cron Job)
   */
  async syncAllActiveDepositBanks() {
    await this.seedDefaultsIfEmpty();
    const activeAccounts = await DepositAccount.find({ status: 1 });
    const summary = [];

    for (const acc of activeAccounts) {
      try {
        const res = await this.syncDepositAccount(acc._id, 2);
        summary.push(res);
      } catch (err) {
        console.warn(`[DepositService:Cron] Bỏ qua quét cổng ${acc.bankCode.toUpperCase()} (${acc.accountNumber}): ${err.message}`);
      }
    }

    return summary;
  }

  /**
   * Alias cho controller quét nhanh
   */
  async syncBankTransactions(bankCode, days = 2) {
    return await this.syncDepositAccount(bankCode, days);
  }

  /**
   * Xử lý webhook biến động số dư ngân hàng từ bên ngoài (Inbound Bank Webhook)
   * Hỗ trợ format chuẩn, SePay, Casso, Hub, SMS app forwarder...
   */
  async processInboundWebhook(rawPayload) {
    if (!rawPayload) {
      return { success: false, msg: 'Payload webhook rỗng' };
    }

    // 1. Trích xuất danh sách giao dịch từ payload
    let transactions = [];
    if (Array.isArray(rawPayload)) {
      transactions = rawPayload;
    } else if (Array.isArray(rawPayload.transactions)) {
      transactions = rawPayload.transactions;
    } else if (Array.isArray(rawPayload.data)) {
      transactions = rawPayload.data;
    } else if (rawPayload.data && typeof rawPayload.data === 'object' && !Array.isArray(rawPayload.data)) {
      transactions = [rawPayload.data];
    } else {
      transactions = [rawPayload];
    }

    const results = [];

    for (const rawTx of transactions) {
      if (!rawTx || typeof rawTx !== 'object') continue;

      // Chuẩn hóa số tiền
      const amount = Number(rawTx.amount || rawTx.transferAmount || rawTx.money || rawTx.amount_in || 0);
      const type = String(rawTx.type || rawTx.transferType || rawTx.CD || 'IN').toUpperCase();
      const isIncoming = type === 'IN' || type === '+' || type === 'CR' || type.includes('IN');

      if (!isIncoming || amount <= 0) {
        results.push({ skipped: true, reason: 'Giao dịch không phải nạp tiền (amount <= 0 hoặc giao dịch trừ tiền)' });
        continue;
      }

      // Chuẩn hóa mã giao dịch
      const reference = String(
        rawTx.reference ||
        rawTx.transactionId ||
        rawTx.transactionID ||
        rawTx.transaction_id ||
        rawTx.referenceCode ||
        rawTx.id ||
        rawTx.transId ||
        rawTx.refNo ||
        ''
      ).trim();

      if (!reference) {
        results.push({ skipped: true, reason: 'Thiếu mã tham chiếu giao dịch (reference/transactionId)' });
        continue;
      }

      // Chuẩn hóa nội dung chuyển khoản
      const description = String(
        rawTx.description ||
        rawTx.content ||
        rawTx.memo ||
        rawTx.message ||
        rawTx.remark ||
        ''
      ).trim();

      const bankCode = String(
        rawTx.bankCode ||
        rawTx.gateway ||
        rawTx.bank_code ||
        rawTx.bank ||
        rawTx.bankName ||
        'BANK'
      ).toUpperCase();

      const accountNumber = String(
        rawTx.accountNumber ||
        rawTx.subAccount ||
        rawTx.stk ||
        rawTx.account_no ||
        ''
      ).trim();

      // Kiểm tra chống cộng trùng lặp
      const existing = await ProcessedTransaction.findOne({
        $or: [
          { transactionId: reference },
          { bankCode: bankCode.toLowerCase(), accountNumber, transactionId: reference },
        ]
      });

      if (existing) {
        results.push({
          alreadyProcessed: true,
          reference,
          userId: existing.userId,
          amount: existing.amount,
          msg: `Giao dịch ${reference} đã được xử lý trước đó`
        });
        continue;
      }

      // Nhận diện người dùng từ nội dung chuyển khoản
      const matchResult = await this.findUserFromDescription(description);

      if (!matchResult || !matchResult.user) {
        console.warn(`[Webhook:Bank] ⚠️ Giao dịch +${amount.toLocaleString()} đ [${reference}] không nhận diện được người dùng. Nội dung: "${description}"`);

        // Bắn cảnh báo cho Admin qua Zalo & Telegram để đối soát tay nếu cần
        try {
          const alertContent = `⚠️ Có giao dịch nạp tiền +${amount.toLocaleString()}đ [${reference}] qua ${bankCode} chưa nhận diện được user: "${description}"`;
          const zaloBotService = require('./zaloBot.service');
          zaloBotService.sendLiveChatAdminAlert('Hệ Thống Webhook', alertContent, '/webhook').catch(() => {});
        } catch (_) {}

        results.push({
          matched: false,
          reference,
          amount,
          description,
          reason: 'Không tìm thấy người dùng khớp với nội dung chuyển khoản'
        });
        continue;
      }

      const targetUser = await User.findById(matchResult.user._id);
      if (!targetUser) {
        continue;
      }
      const moneyBefore = Number(targetUser.money || 0);
      const moneyChange = amount;
      const moneyAfter = moneyBefore + moneyChange;

      // Cộng tiền vào tài khoản
      targetUser.money = moneyAfter;
      targetUser.totalMoney = (targetUser.totalMoney || 0) + moneyChange;
      await targetUser.save();

      const logNote = `Nạp tiền tự động qua Webhook ${bankCode} (${accountNumber || 'API'}) - Mã GD: ${reference}`;

      // Lưu BalanceLog
      await BalanceLog.create({
        userId: targetUser._id,
        legacyUserId: targetUser.legacyId,
        moneyBefore,
        moneyChange,
        moneyAfter,
        note: logNote,
      });

      // Lưu ProcessedTransaction
      await ProcessedTransaction.create({
        bankCode: bankCode.toLowerCase(),
        accountNumber,
        transactionId: reference,
        amount,
        description,
        userId: targetUser._id,
        username: targetUser.username,
        status: 'completed',
        creditedAt: new Date(),
        raw: rawTx,
      });

      // Cập nhật hóa đơn
      try {
        await Invoice.findOneAndUpdate(
          { userId: targetUser._id, status: 'pending', amount },
          { status: 'completed', pay: amount }
        );
      } catch (_) {}

      console.log(`[Webhook:Bank] 🎉 Đã nạp thành công +${amount.toLocaleString()} đ cho ${targetUser.username} qua ${bankCode} [${reference}]!`);

      const notifyPayload = {
        amount: moneyChange,
        type: 'IN',
        bank: bankCode,
        balanceBefore: moneyBefore,
        balanceAfter: moneyAfter,
        content: description,
        txId: reference,
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      };

      // Tìm xem có BankAccount nào ứng với accountNumber này không
      let targetBankAcc = null;
      if (accountNumber) {
        try {
          targetBankAcc = await BankAccount.findOne({
            accountNumber,
            bankCode: bankCode.toLowerCase(),
          });
        } catch (_) {}
      }

      const allowTele = targetBankAcc ? (targetBankAcc.telegramNotifyEnabled !== false) : true;
      const allowZalo = targetBankAcc ? (targetBankAcc.zaloNotifyEnabled !== false) : true;

      // 1. Tự động gửi thông báo Telegram tức thì cho khách hàng (nếu cả user và tài khoản đều cho phép)
      if (allowTele && targetUser.telegramNotifyEnabled && targetUser.telegramChatId) {
        try {
          const telegramService = require('./telegram.service');
          telegramService.sendBalanceChangeNotification(targetUser, notifyPayload)
            .catch(tErr => console.warn('[Webhook:Telegram] Lỗi gửi tin:', tErr.message));
        } catch (_) {}
      }

      // 2. Tự động gửi thông báo Zalo Bot tức thì cho khách hàng (nếu cả user và tài khoản đều cho phép)
      if (allowZalo && targetUser.zaloNotifyEnabled && targetUser.zaloChatId) {
        try {
          const zaloBotService = require('./zaloBot.service');
          zaloBotService.sendBalanceChangeNotification(targetUser, notifyPayload)
            .catch(zErr => console.warn('[Webhook:ZaloBot] Lỗi gửi tin:', zErr.message));
        } catch (_) {}
      }

      // 3. Tự động bắn Webhook riêng của tài khoản ngân hàng nếu kích hoạt
      if (targetBankAcc && targetBankAcc.webhookEnabled && targetBankAcc.webhookUrl) {
        try {
          const axios = require('axios');
          const userSig = targetUser.token || targetBankAcc.token || 'd978a2a5b9566e49bf672fb876d5568c';
          const tid = reference || String(Date.now());
          const webhookPayload = {
            status: 'success',
            message: 'Thành công',
            transactions: [
              {
                type: 'IN',
                transactionID: tid,
                amount: String(moneyChange),
                description: description,
                date: new Date().toISOString(),
                bank: bankCode.toUpperCase(),
                accountNumber: targetBankAcc.accountNumber,
              }
            ],
            // Các trường bổ trợ tương thích ngược
            bank: bankCode.toUpperCase(),
            accountNumber: targetBankAcc.accountNumber,
            accountName: targetBankAcc.accountName,
            transactionId: tid,
            amount: moneyChange,
            type: 'IN',
            content: description,
            date: new Date().toISOString(),
            balance: moneyAfter,
          };

          axios.post(targetBankAcc.webhookUrl, webhookPayload, {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'User-Agent': '7Bank-WebHub-Engine/1.0',
              'signature': userSig,
              'Signature': userSig,
            }
          }).then(async (wRes) => {
            console.log(`[Webhook:Account] 🚀 Đã gửi webhook thành công tới ${targetBankAcc.webhookUrl} [HTTP ${wRes.status}]`);
            targetBankAcc.lastCallbackAt = new Date();
            targetBankAcc.lastCallbackResponse = `HTTP ${wRes.status} OK`;
            targetBankAcc.lastCallbackStatus = wRes.status;
            await targetBankAcc.save().catch(() => {});
          }).catch(async (wErr) => {
            console.warn(`[Webhook:Account] ⚠️ Bắn webhook thất bại tới ${targetBankAcc.webhookUrl}:`, wErr.message);
            targetBankAcc.lastCallbackAt = new Date();
            targetBankAcc.lastCallbackResponse = `HTTP ${wErr.response?.status || 500} ${wErr.response?.statusText || 'Error'}`;
            targetBankAcc.lastCallbackStatus = wErr.response?.status || 500;
            await targetBankAcc.save().catch(() => {});
          });
        } catch (wErr) {
          console.warn('[Webhook:Account] Lỗi bắn webhook:', wErr.message);
        }
      }

      // 3. Tự động thông báo tới Admin qua Zalo Bot
      try {
        const zaloBotService = require('./zaloBot.service');
        zaloBotService.sendLiveChatAdminAlert('OcaPay Webhook', `Nạp tiền thành công: +${amount.toLocaleString()}đ cho user [${targetUser.username}] qua ${bankCode}`, '/webhook').catch(() => {});
      } catch (_) {}

      results.push({
        success: true,
        username: targetUser.username,
        amount,
        reference,
        moneyBefore,
        moneyAfter,
      });
    }

    const successCount = results.filter(r => r.success).length;
    return {
      status: 'success',
      totalReceived: transactions.length,
      successCount,
      results,
    };
  }
}

module.exports = new DepositService();
