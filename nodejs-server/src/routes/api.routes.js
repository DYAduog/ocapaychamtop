const express = require('express');
const router = express.Router();
const apiController = require('../controllers/api.controller');

// Disable all browser & proxy caching for financial history APIs
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Health check
router.get('/health', apiController.health);

// Public Gateways status
router.get('/gateways', apiController.getGateways);

// Public API Plans & Pricing
router.get('/plans', async (req, res) => {
  try {
    const planService = require('../services/plan.service');
    const plans = await planService.getAllPlans(false);
    return res.json({ status: 'success', data: plans });
  } catch (err) {
    return res.status(500).json({ status: 'error', msg: err.message });
  }
});

// Subscribe / Renew Plan using Account Balance
router.post('/plans/subscribe', async (req, res) => {
  try {
    const User = require('../models/User');
    const planService = require('../services/plan.service');

    const authHeader = req.headers['authorization'];
    const token = (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null) || req.body.token || req.query.token;
    if (!token) {
      return res.status(401).json({ status: 'error', msg: 'Vui lòng đăng nhập để thực hiện gia hạn' });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.status(401).json({ status: 'error', msg: 'Tài khoản không tồn tại hoặc phiên đăng nhập đã hết hạn' });
    }

    const { planCode, cycle } = req.body;
    if (!planCode) {
      return res.status(400).json({ status: 'error', msg: 'Vui lòng chọn gói cước cần gia hạn' });
    }

    const result = await planService.subscribeWithBalance(user, planCode, cycle || '1m');

    return res.json({
      status: 'success',
      msg: `Chúc mừng! Bạn đã gia hạn thành công ${result.planName} (${result.cycleLabel})`,
      data: result,
    });
  } catch (err) {
    const isBalanceErr = err.code === 'INSUFFICIENT_BALANCE';
    return res.status(isBalanceErr ? 400 : 500).json({
      status: 'error',
      msg: err.message,
      code: err.code || 'SUBSCRIBE_ERROR',
      missing: err.missing,
      current: err.current,
      required: err.required,
    });
  }
});


// Modern RESTful API endpoint V1 & V2
router.all('/v1/bank/:bankCode/history', apiController.getHistoryByToken);
router.all('/api/v1/bank/:bankCode/history', apiController.getHistoryByToken);
router.all('/v2/:bankCode/history', apiController.getHistoryByToken);
router.all('/api/v2/:bankCode/history', apiController.getHistoryByToken);

// Legacy 1-to-1 Compatible Endpoints (supporting all bank code formats and aliases)
const legacyBanks = [
  { path: 'historymbbank', code: 'mbbank', aliases: ['mb', 'mbbank'] },
  { path: 'historyacb', code: 'acb', aliases: ['acb'] },
  { path: 'historyvcb', code: 'vcb', aliases: ['vcb', 'vietcombank'] },
  { path: 'historybidv', code: 'bidv', aliases: ['bidv'] },
  { path: 'historyviettin', code: 'viettin', aliases: ['vtb', 'viettin', 'vietinbank'] },
  { path: 'historyviettel', code: 'viettel', aliases: ['viettel', 'viettelpay'] },
  { path: 'historytpbank', code: 'tpbank', aliases: ['tpb', 'tpbank'] },
  { path: 'historyzalopay', code: 'zalopay', aliases: ['zalopay', 'zalo'] },
  { path: 'historytechcombank', code: 'techcombank', aliases: ['tcb', 'techcombank'] },
  { path: 'historythesieure', code: 'thesieure', aliases: ['thesieure', 'tsr'] },
  { path: 'historytimo', code: 'timo', aliases: ['timo'] },
  { path: 'historymsb', code: 'msb', aliases: ['msb', 'maritime', 'maritimebank'] },
  { path: 'historypgbank', code: 'pgbank', aliases: ['pgbank', 'pg'] },
  { path: 'historyocb', code: 'ocb', aliases: ['ocb', 'ocbomni'] },
  { path: 'historybvbank', code: 'bvbank', aliases: ['bvbank', 'bvb', 'banviet', 'banvietbank'] },
  { path: 'historyeximbank', code: 'eximbank', aliases: ['eximbank', 'eib', 'exim'] },
];

legacyBanks.forEach(({ path, code, aliases }) => {
  // Query param format: /historymbbank?token=xyz
  router.all(`/${path}`, (req, res, next) => {
    req.bankCode = code;
    return apiController.getHistoryByToken(req, res, next);
  });

  const allCodes = Array.from(new Set([code, ...(aliases || [])]));
  allCodes.forEach(alias => {
    // Path param format: /historyapi${alias}/:token
    router.all(`/historyapi${alias}/:token`, (req, res, next) => {
      req.bankCode = code;
      return apiController.getHistoryByToken(req, res, next);
    });
    router.all(`/history${alias}`, (req, res, next) => {
      req.bankCode = code;
      return apiController.getHistoryByToken(req, res, next);
    });
  });
});

// Realtime PGBank Smart OTP reader for Web UI
router.get(['/pgbank-otp', '/api/pgbank-otp'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  const fs = require('fs');
  const path = require('path');
  const otpPaths = [
    process.env.PGBANK_OTP_PATH,
    path.resolve(__dirname, '../../../pgbank_otp.txt'),
    path.resolve(__dirname, '../../pgbank_otp.txt'),
    path.resolve(process.cwd(), 'pgbank_otp.txt'),
    path.resolve(process.cwd(), '../pgbank_otp.txt'),
    'D:/7bank/pgbank_otp.txt',
    'D:/7bank/nodejs-server/pgbank_otp.txt',
  ].filter(Boolean);
  for (const p of otpPaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        if (Date.now() - stat.mtimeMs < 180000) {
          const otp = fs.readFileSync(p, 'utf8').trim();
          if (otp) {
            return res.json({ status: 'success', otp });
          }
        }
      } catch (_) {}
    }
  }
  return res.json({ status: 'waiting', otp: null });
});

// ==========================================
// Endpoint Tiếp Nhận Yêu Cầu Hỗ Trợ 24/7 (Support Ticket)
// ==========================================
router.post(['/support/ticket', '/api/support/ticket'], async (req, res) => {
  try {
    const { category, categoryText, contact, content, username } = req.body;
    console.log(`[OcaPay Support Ticket] Nhận yêu cầu từ ${username || 'Khách'} | Danh mục: ${categoryText || category} | Liên hệ: ${contact} | Nội dung: ${content}`);

    // Gửi thông báo đến Telegram Admin nếu có cấu hình
    try {
      const telegramService = require('../services/telegram.service');
      const User = require('../models/User');
      const sys = await telegramService.getSystemConfig();

      if (sys.botToken) {
        // Tìm admin có telegramChatId
        const adminUsers = await User.find({
          $or: [{ level: 'admin' }, { level: '1' }, { isAdmin: true }],
          telegramChatId: { $exists: true, $ne: '' }
        }).limit(5);

        const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const message = `🆘 <b>YÊU CẦU HỖ TRỢ KHÁCH HÀNG MỚI (TICKET 24/7)</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khách hàng:</b> <code>${username || 'Khách vãng lai'}</code>
📌 <b>Vấn đề:</b> <b>${categoryText || category || 'Kỹ thuật'}</b>
📞 <b>Kênh liên hệ:</b> <code>${contact || 'Không có'}</code>
⏰ <b>Thời gian:</b> ${timeStr}
━━━━━━━━━━━━━━━━━━━━
💬 <b>Nội dung chi tiết:</b>
<i>${content || '(Không có nội dung)'}</i>
━━━━━━━━━━━━━━━━━━━━
⚡ <i>OcaPay Support System - Vui lòng phản hồi sớm cho khách hàng!</i>`;

        for (const admin of adminUsers) {
          if (admin.telegramChatId) {
            telegramService.sendMessage(sys.botToken, admin.telegramChatId, message).catch(() => {});
          }
        }
      }
    } catch (tgErr) {
      console.warn('[Support Ticket TG Notice Error]', tgErr.message);
    }

    // Gửi thông báo đến Zalo Bot Admin nếu có cấu hình
    try {
      const zaloBotService = require('../services/zaloBot.service');
      zaloBotService.sendSupportTicketAlert({
        username: username || 'Khách vãng lai',
        category: categoryText || category || 'Kỹ thuật',
        contact: contact || 'Không có',
        content: content || '(Không có nội dung)',
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      }).catch(zErr => console.warn('[Support Ticket Zalo Notice Error]', zErr.message));
    } catch (zErr) {
      console.warn('[Support Ticket Zalo Init Error]', zErr.message);
    }

    return res.json({
      status: 'success',
      msg: 'Đã tiếp nhận yêu cầu hỗ trợ thành công. Đội ngũ kỹ thuật OcaPay sẽ liên hệ lại ngay!'
    });
  } catch (err) {
    console.error('[Support Ticket Error]', err);
    return res.status(500).json({ status: 'error', msg: 'Lỗi xử lý yêu cầu hỗ trợ' });
  }
});

// Live Chat message endpoint from frontend widgets
router.post(['/support/livechat-message', '/api/support/livechat-message'], async (req, res) => {
  try {
    const { message, user, page } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ status: 'error', msg: 'Nội dung tin nhắn không được để trống' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    
    // Gửi cảnh báo qua Telegram
    const telegramService = require('../services/telegram.service');
    telegramService.sendLiveChatAdminAlert(user || 'Khách vãng lai', message.trim(), page || '/', clientIp)
      .catch(err => console.warn('[LiveChat Alert Error]', err.message));

    // Gửi cảnh báo qua Zalo Bot
    const zaloBotService = require('../services/zaloBot.service');
    zaloBotService.sendLiveChatAdminAlert(user || 'Khách vãng lai', message.trim(), page || '/', clientIp)
      .catch(err => console.warn('[LiveChat Zalo Alert Error]', err.message));

    return res.json({
      status: 'success',
      msg: 'Đã gửi tin nhắn đến bộ phận kỹ thuật OcaPay'
    });
  } catch (err) {
    console.error('[LiveChat API Error]', err);
    return res.status(500).json({ status: 'error', msg: 'Lỗi gửi tin nhắn' });
  }
});

// =========================================================================
// 1. INBOUND BANK WEBHOOK ENDPOINTS (Tự động nạp tiền & bắn thông báo Zalo/Telegram)
// =========================================================================
router.get(['/webhook/bank', '/api/webhook/bank', '/api/webhook/deposit'], (req, res) => {
  return res.json({
    status: 'success',
    msg: 'OcaPay Bank Webhook Endpoint is ready to receive incoming transactions',
    usage: 'POST JSON payload with: amount, description, transactionId, bankCode, accountNumber',
    supported_formats: ['OcaPay Native', 'SePay', 'Casso', 'SMS Forwarder', 'Hub']
  });
});

router.post(['/webhook/bank', '/api/webhook/bank', '/api/webhook/deposit', '/webhook/deposit', '/api/v1/webhook'], async (req, res) => {
  try {
    const depositService = require('../services/deposit.service');
    const result = await depositService.processInboundWebhook(req.body);

    if (result && result.status === 'success') {
      return res.json(result);
    }
    return res.status(400).json(result);
  } catch (err) {
    console.error('[Bank Inbound Webhook Error]', err.message);
    return res.status(500).json({ status: 'error', msg: err.message });
  }
});

// =========================================================================
// 2. BOT WEBHOOK ENDPOINTS (Telegram & Zalo)
// =========================================================================

// Zalo Bot Webhook Endpoint
router.post(['/zalobot/webhook', '/api/zalobot/webhook', '/webhook/zalobot'], async (req, res) => {
  try {
    const zaloBotService = require('../services/zaloBot.service');
    const result = await zaloBotService.handleWebhookPayload(req.body);
    return res.json({ status: 'success', result });
  } catch (err) {
    console.error('[ZaloBot Webhook Error]', err.message);
    return res.status(500).json({ status: 'error', msg: err.message });
  }
});

// Telegram Bot Webhook Endpoint
router.post(['/telegram/webhook', '/api/telegram/webhook', '/webhook/telegram'], async (req, res) => {
  try {
    const telegramService = require('../services/telegram.service');
    const result = await telegramService.handleWebhookPayload(req.body);
    return res.json({ status: 'success', result });
  } catch (err) {
    console.error('[Telegram Webhook Error]', err.message);
    return res.status(500).json({ status: 'error', msg: err.message });
  }
});

module.exports = router;

