const BankAccount = require('../models/BankAccount');
const User = require('../models/User');
const bankFactory = require('../services/banks/bankFactory');
const gatewayService = require('../services/gateway.service');


class ApiController {
  /**
   * Handle bank history query by token (legacy & modern API)
   */
  async getHistoryByToken(req, res) {
    try {
      const token = req.query.token || req.body.token || req.params.token;
      let bankCode = req.params.bankCode || req.bankCode;

      if (!token) {
        return res.status(400).json({ status: 'error', msg: 'Thiếu Token' });
      }

      // Query bank account by token (unique per account)
      const account = await BankAccount.findOne({ token });
      if (!account) {
        return res.status(404).json({ status: 'error', msg: 'Token không hợp lệ hoặc tài khoản không tồn tại' });
      }

      // Check User API subscription
      let user = null;
      if (account.userId) {
        user = await User.findById(account.userId);
      } else if (account.legacyUserId) {
        user = await User.findOne({ legacyId: account.legacyUserId });
      }

      if (user && user.timeMomo && user.timeMomo < Math.floor(Date.now() / 1000)) {
        return res.status(403).json({
          status: 'error',
          msg: 'Tài khoản của bạn đã hết hạn sử dụng, vui lòng nâng cấp gói để tiếp tục sử dụng!',
        });
      }

      // Check bank gateway operational status
      const gateway = await gatewayService.getGateway(account.bankCode);
      if (gateway && gateway.status === 'disabled') {
        return res.status(503).json({
          status: 'error',
          code: '503',
          msg: `Cổng ${gateway.name} hiện đã bị tắt${gateway.notice ? ' (' + gateway.notice + ')' : ''}. Vui lòng liên hệ quản trị viên!`,
          disabled: true,
        });
      }
      if (gateway && gateway.status === 'maintenance') {
        return res.status(503).json({
          status: 'error',
          code: '503',
          msg: `Cổng ${gateway.name} hiện đang bảo trì${gateway.notice ? ' (' + gateway.notice + ')' : ''}. Vui lòng thử lại sau!`,
          maintenance: true,
        });
      }

      // Query transaction history: Luôn tra cứu trực tiếp theo thời gian thực ngay khi người dùng gọi GET API
      const defaultDays = ['tpbank', 'tpb', 'timo', 'acb'].includes(String(account.bankCode).toLowerCase()) ? 30 : 6;
      const historyResult = await bankFactory.getTransactionHistory(account, {
        days: req.query.days ? parseInt(req.query.days) : defaultDays,
        force: true, // Luôn tra cứu tức thì từ ngân hàng không qua trung gian, không cần chờ cron
      });

      // Check if caller requests V2 RESTful standard
      const isV2 = req.originalUrl && req.originalUrl.includes('/v2/');

      if (historyResult.status === 'success' && historyResult.transactions) {
        const resolvedAccountName = historyResult.accountName || account.accountName || 'LE MANH DUONG';
        const resolvedBalance = (historyResult.balance !== undefined && historyResult.balance !== null)
          ? historyResult.balance
          : (account.balance || 0);

        if (resolvedAccountName && resolvedAccountName !== 'Tài khoản PGBank') {
          account.accountName = resolvedAccountName;
        }
        if (resolvedBalance !== undefined && resolvedBalance !== null) {
          account.balance = resolvedBalance;
        }
        account.save().catch(() => {});

        if (isV2) {
          return res.json({
            status: 200,
            success: true,
            bank: account.bankCode.toUpperCase(),
            accountNumber: account.accountNumber,
            accountName: resolvedAccountName,
            balance: resolvedBalance,
            total: (historyResult.transactions || []).length,
            transactions: (historyResult.transactions || []).map(t => ({
              transaction_id: t.Reference || t.transactionID || t.id,
              amount: t.Amount !== undefined ? t.Amount : (t.amount !== undefined ? t.amount : 0),
              type: t.CD === '-' || t.type === 'OUT' ? 'OUT' : 'IN',
              content: t.Description || t.description || '',
              date: t.TransactionDate || t.transactionDate || t.date || '',
              balance: resolvedBalance,
            })),
          });
        }

        // Standard API V1 format (clean normalized transactions, removed TranList and data)
        const rawTxs = historyResult.transactions || historyResult.raw?.transactions || [];
        const cleanTransactions = rawTxs.map((t) => ({
          transactionID: String(t.transactionID || t.Reference || t.id || t.refNo || ''),
          amount: Number(t.amount !== undefined ? t.amount : (t.Amount !== undefined ? t.Amount : 0)),
          description: String(t.description || t.Description || t.content || ''),
          transactionDate: String(t.transactionDate || t.TransactionDate || t.date || ''),
          type: (t.type === 'OUT' || t.CD === '-') ? 'OUT' : 'IN',
        }));

        // Return live clean transactions directly from bank

        return res.json({
          code: '00',
          status: 'success',
          message: 'Thành công',
          bank: account.bankCode.toUpperCase(),
          accountNumber: account.accountNumber,
          accountName: resolvedAccountName,
          balance: resolvedBalance,
          transactions: cleanTransactions,
        });
      }

      return res.json({
        code: '99',
        status: 'error',
        message: historyResult.message || 'Phiên đăng nhập ngân hàng đã hết hạn hoặc chưa đăng nhập. Vui lòng bấm [Cập nhật phiên] trên cổng quản trị.',
        transactions: [],
        raw: historyResult,
      });
    } catch (error) {
      console.error('[ApiController] Error:', error);
      return res.status(500).json({
        status: 'error',
        msg: 'Lỗi máy chủ nội bộ: ' + error.message,
      });
    }
  }

  /**
   * Universal status/health check
   */
  async health(req, res) {
    res.json({
      status: 'success',
      service: '7Bank Auto Gateway (Node.js & MongoDB)',
      timestamp: new Date().toISOString(),
      supportedBanks: ['tpbank', 'mbbank', 'acb', 'vcb', 'bidv', 'viettin', 'techcombank', 'timo', 'viettel', 'zalopay', 'msb', 'pgbank', 'ocb', 'bvbank'],
    });
  }

  /**
   * Public list of bank gateways and their operational status
   */
  async getGateways(req, res) {
    try {
      let gateways = await gatewayService.getAllGateways();
      if (req.query.visible_only === 'true' || req.query.active_only === 'true') {
        gateways = gateways.filter((g) => g.status !== 'disabled');
      }
      return res.json({ status: 'success', data: gateways });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }
}

module.exports = new ApiController();
