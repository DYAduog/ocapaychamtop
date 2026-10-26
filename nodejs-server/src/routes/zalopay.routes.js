const express = require('express');
const router = express.Router();
const zalopayService = require('../services/banks/zalopay.service');
const zaloQrLoginService = require('../services/zaloQrLogin.service');
const BankAccount = require('../models/BankAccount');
const User = require('../models/User');
const cryptoService = require('../services/crypto.service');

// 0. QR Code Login Flow (Lấy Cookie Tự Động qua mã QR Zalo)
router.post('/qr/start', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ status: 'error', message: 'Vui lòng nhập số điện thoại hoặc tài khoản Zalo' });
    }
    const session = await zaloQrLoginService.startQrSession(phone);
    return res.json(session);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message || 'Lỗi khởi tạo mã QR Zalo' });
  }
});

router.get('/qr/status', async (req, res) => {
  try {
    const { sessionId, phone } = req.query;
    if (!sessionId) {
      return res.status(400).json({ status: 'error', message: 'Thiếu sessionId' });
    }

    const sess = zaloQrLoginService.getSession(sessionId);
    if (!sess) {
      return res.status(404).json({ status: 'error', message: 'Phiên quét mã không tồn tại hoặc đã hết hạn' });
    }

    // Nếu đã xác nhận thành công và chưa lưu tài khoản vào MongoDB
    if (sess.status === 'confirmed' && !sess.accountSaved) {
      const targetPhone = (phone || sess.phone || '').trim();
      let accountName = sess.displayName || `Ví ZaloPay (${targetPhone})`;

      // Thử lấy thêm thông tin KYC ZaloPay nếu có cookie
      try {
        const kyc = await zalopayService.getProfile(sess.cookieString);
        if (kyc && kyc.data) {
          accountName = kyc.data.wrap_zalopay_name || kyc.data.display_name || accountName;
        }
      } catch (_) {}

      // Tìm user sở hữu
      const effectiveToken = req.headers['authorization']?.replace('Bearer ', '') || req.query.userToken;
      let userId = null;
      if (effectiveToken) {
        const u = await User.findOne({ token: effectiveToken });
        if (u) userId = u._id;
      }
      if (!userId) {
        const defaultUser = await User.findOne().sort({ createdAt: 1 });
        if (defaultUser) userId = defaultUser._id;
      }

      const existingAccount = await BankAccount.findOne({ bankCode: 'zalopay', accountNumber: targetPhone });
      const token = existingAccount?.token || cryptoService.generateToken(32);
      const passwordEncrypted = cryptoService.encryptBankPassword('000000');

      const savedAccount = await BankAccount.findOneAndUpdate(
        { bankCode: 'zalopay', accountNumber: targetPhone },
        {
          userId,
          bankCode: 'zalopay',
          accountNumber: targetPhone,
          accountName,
          username: targetPhone,
          passwordEncrypted,
          token,
          sessionData: {
            cookie: sess.cookieString,
            phone: targetPhone,
            zaloUserInfo: sess.userInfo,
            connectedAt: new Date().toISOString(),
          },
          status: 1,
          lastLoginAt: new Date(),
        },
        { upsert: true, new: true }
      );

      sess.accountSaved = true;
      sess.savedAccount = {
        id: savedAccount._id,
        bankCode: 'zalopay',
        accountNumber: savedAccount.accountNumber,
        accountName: savedAccount.accountName,
        token: savedAccount.token,
      };
    }

    return res.json({
      status: 'success',
      qrStatus: sess.status,
      statusText: sess.statusText,
      displayName: sess.displayName || '',
      avatar: sess.avatar || '',
      account: sess.savedAccount || null,
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 0.1 Nhập Cookie Thủ Công (Manual Cookie Input)
router.post('/manual-cookie', async (req, res) => {
  try {
    const { phone, cookie, pin, userToken } = req.body;
    if (!phone || !cookie) {
      return res.status(400).json({ status: 'error', message: 'Vui lòng điền đủ số điện thoại và Cookie ZaloPay' });
    }

    const cleanPhone = String(phone).trim();
    let cleanCookie = String(cookie).trim();

    // Nếu người dùng dán Cookie từ chat.zalo.me, tự động thử đổi sang Cookie ZaloPay (zlp_token)
    if (!cleanCookie.includes('zlp_token') && (cleanCookie.includes('zpw_sek') || cleanCookie.includes('zlogin_session') || cleanCookie.includes('zalo_id'))) {
      try {
        const exchanged = await zaloQrLoginService._exchangeZaloToZaloPay(cleanCookie);
        if (exchanged) {
          console.log('[ZaloPay] Tự động chuyển đổi Cookie Zalo Chat sang ZaloPay SAPI thành công!');
          cleanCookie = exchanged;
        }
      } catch (_) {}
    }

    // Xác thực Cookie với ZaloPay
    let accountName = `Ví ZaloPay (${cleanPhone})`;
    try {
      const kyc = await zalopayService.getProfile(cleanCookie);
      if (kyc && kyc.data) {
        accountName = kyc.data.wrap_zalopay_name || kyc.data.display_name || accountName;
      }
    } catch (err) {
      // Tiếp tục nếu KYC không phản hồi kịp
    }

    const effectiveToken = req.headers['authorization']?.replace('Bearer ', '') || userToken;
    let userId = null;
    if (effectiveToken) {
      const u = await User.findOne({ token: effectiveToken });
      if (u) userId = u._id;
    }
    if (!userId) {
      const defaultUser = await User.findOne().sort({ createdAt: 1 });
      if (defaultUser) userId = defaultUser._id;
    }

    const existingAccount = await BankAccount.findOne({ bankCode: 'zalopay', accountNumber: cleanPhone });
    const token = existingAccount?.token || cryptoService.generateToken(32);
    const passwordEncrypted = cryptoService.encryptBankPassword(pin || '000000');

    const savedAccount = await BankAccount.findOneAndUpdate(
      { bankCode: 'zalopay', accountNumber: cleanPhone },
      {
        userId,
        bankCode: 'zalopay',
        accountNumber: cleanPhone,
        accountName,
        username: cleanPhone,
        passwordEncrypted,
        token,
        sessionData: {
          cookie: cleanCookie,
          phone: cleanPhone,
          pin: pin || '',
          connectedAt: new Date().toISOString(),
        },
        status: 1,
        lastLoginAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({
      status: 'success',
      msg: `Liên kết ví ZaloPay thành công! Chủ ví: ${accountName}`,
      data: {
        id: savedAccount._id,
        bankCode: 'zalopay',
        accountNumber: savedAccount.accountNumber,
        accountName: savedAccount.accountName,
        token: savedAccount.token,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 1. Get profile and balance
router.get('/profile', async (req, res) => {
  try {
    const cookie = req.query.cookie || req.headers['x-zalopay-cookie'];
    const [profile, balance] = await Promise.all([
      zalopayService.getProfile(cookie),
      zalopayService.getBalance(cookie),
    ]);
    res.json({
      status: 'success',
      profile: profile.data,
      balance: balance.balance,
      formatted_balance: balance.formatted,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. Get incoming transactions with Resend QR Codes
router.get('/incoming', async (req, res) => {
  try {
    const cookie = req.query.cookie || req.headers['x-zalopay-cookie'];
    const limit = parseInt(req.query.limit || 30, 10);
    const data = await zalopayService.getIncomingTransactions(cookie, limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Create Deposit QR (FlexQR / VietQR)
router.post('/deposit-qr', async (req, res) => {
  try {
    const cookie = req.body.cookie || req.headers['x-zalopay-cookie'];
    const { amount = 50000, message = 'NAPTIEN 7BANK' } = req.body;
    const data = await zalopayService.createDepositQR(cookie, { amount, message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Lookup recipient by phone
router.get('/lookup-recipient', async (req, res) => {
  try {
    const cookie = req.query.cookie || req.headers['x-zalopay-cookie'];
    const phone = req.query.phone;
    if (!phone) {
      return res.status(400).json({ status: 'error', message: 'Thiếu số điện thoại' });
    }
    const data = await zalopayService.lookupRecipient(cookie, phone);
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Generate custom transfer / resend QR
router.post('/custom-qr', async (req, res) => {
  try {
    const { orderNo, phone, amount, message } = req.body;
    const data = await zalopayService.generateCustomTransferQR({ orderNo, phone, amount, message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
