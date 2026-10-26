const depositService = require('../services/deposit.service');
const BankAccount = require('../models/BankAccount');
const User = require('../models/User');
const ProcessedTransaction = require('../models/ProcessedTransaction');
const { BalanceLog } = require('../models/Log');

class DepositController {
  /**
   * Helper trích xuất User từ header Authorization hoặc token
   */
  async getAuthUser(req) {
    const authHeader = req.headers['authorization'];
    const token =
      (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) ||
      req.query.token ||
      req.body?.token;

    if (!token) return null;
    return await User.findOne({ token }).select('-password');
  }

  /**
   * GET /api/deposit/banks
   * Lấy danh sách ngân hàng nhận nạp tiền tự động (Public cho Portal)
   */
  async getPublicBanks(req, res) {
    try {
      const data = await depositService.getPublicBanks();
      return res.json({ status: 'success', data });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * POST /api/deposit/check-status
   * Người dùng bấm "Tôi đã chuyển khoản - Kiểm tra số dư" hoặc Client tự động thăm dò
   */
  async checkDepositStatus(req, res) {
    try {
      const user = await this.getAuthUser(req);
      const { bankCode } = req.body;

      // Nếu có truyền mã ngân hàng, thực hiện quét nhanh biến động ngay lập tức
      let syncResult = null;
      if (bankCode) {
        try {
          syncResult = await depositService.syncBankTransactions(bankCode, 2);
        } catch (syncErr) {
          console.warn(`[DepositController] Quét nhanh ${bankCode} thông báo:`, syncErr.message);
        }
      }

      // Lấy thông tin số dư mới nhất của người dùng
      let updatedUser = null;
      let recentDeposits = [];

      if (user) {
        updatedUser = await User.findById(user._id).select('username money totalMoney level');
        recentDeposits = await ProcessedTransaction.find({ userId: user._id })
          .sort({ createdAt: -1 })
          .limit(10);
      }

      const newlyFound = syncResult?.newlyCredited || [];
      const userCredited = newlyFound.find(
        (n) => user && (String(n.user?.id) === String(user._id) || n.user?.username === user.username)
      );

      return res.json({
        status: 'success',
        credited: !!userCredited,
        amount: userCredited ? userCredited.amount : 0,
        balance: updatedUser ? updatedUser.money : undefined,
        user: updatedUser,
        recentDeposits,
        syncResult: syncResult
          ? {
              totalTransactions: syncResult.totalTransactions,
              newlyCreditedCount: syncResult.newlyCreditedCount,
            }
          : null,
        msg: userCredited
          ? `🎉 Đã cộng +${userCredited.amount.toLocaleString('vi-VN')} đ vào tài khoản!`
          : 'Hệ thống đã kiểm tra đối soát với ngân hàng.',
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * GET /api/deposit/history
   * Lịch sử nạp tiền của người dùng hiện tại
   */
  async getUserHistory(req, res) {
    try {
      const user = await this.getAuthUser(req);
      if (!user) {
        return res.status(401).json({ status: 'error', msg: 'Vui lòng đăng nhập' });
      }

      const deposits = await ProcessedTransaction.find({
        $or: [{ userId: user._id }, { username: user.username }]
      })
        .sort({ createdAt: -1 })
        .limit(100);

      const balanceLogs = await BalanceLog.find({
        $or: [{ userId: user._id }, { legacyUserId: user.legacyId }]
      })
        .sort({ createdAt: -1 })
        .limit(100);

      const totalDeposits = deposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      return res.json({
        status: 'success',
        data: deposits,
        balanceLogs,
        summary: {
          totalDeposits,
          depositCount: deposits.length,
          balance: user.money || 0,
          totalMoney: user.totalMoney || 0,
        }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * GET /admin/deposit-accounts
   * Lấy toàn bộ danh sách tài khoản nhận nạp tiền riêng của hệ thống và cài đặt chung
   */
  async getAllDepositAccounts(req, res) {
    try {
      const accounts = await depositService.getAllDepositAccounts();
      const settings = await depositService.getGeneralSettings();
      return res.json({
        status: 'success',
        data: {
          accounts,
          settings,
        },
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * POST /admin/deposit-accounts
   * Admin thêm một tài khoản ngân hàng nhận nạp tiền riêng (độc lập với web)
   */
  async addDepositAccount(req, res) {
    try {
      const { bankCode, accountNumber, accountName, username, password } = req.body;
      const account = await depositService.addDepositAccount({
        bankCode,
        accountNumber,
        accountName,
        username,
        password,
      });
      return res.json({
        status: 'success',
        msg: `Đã thêm tài khoản nhận nạp riêng [${account.bankName} - ${account.accountNumber}] thành công!`,
        data: account,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * PUT /admin/deposit-accounts/:id
   * Admin cập nhật thông tin tài khoản nạp riêng
   */
  async updateDepositAccount(req, res) {
    try {
      const { id } = req.params;
      const { accountName, username, password, status } = req.body;
      const account = await depositService.updateDepositAccount(id, {
        accountName,
        username,
        password,
        status,
      });
      return res.json({
        status: 'success',
        msg: `Đã cập nhật thông tin tài khoản [${account.bankName} - ${account.accountNumber}]!`,
        data: account,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * POST /admin/deposit-accounts/:id/toggle
   * Admin bật / tắt trạng thái nhận nạp của tài khoản
   */
  async toggleDepositAccount(req, res) {
    try {
      const { id } = req.params;
      const account = await depositService.toggleDepositAccount(id);
      return res.json({
        status: 'success',
        msg: `Đã ${account.status === 1 ? 'bật' : 'tắt'} nhận nạp cho tài khoản [${account.bankName} - ${account.accountNumber}]!`,
        data: account,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * DELETE /admin/deposit-accounts/:id
   * Admin xóa tài khoản nhận nạp riêng
   */
  async deleteDepositAccount(req, res) {
    try {
      const { id } = req.params;
      const account = await depositService.deleteDepositAccount(id);
      return res.json({
        status: 'success',
        msg: `Đã xóa tài khoản nhận nạp [${account.bankName} - ${account.accountNumber}]!`,
        data: account,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * POST /admin/deposit-accounts/:id/relogin
   * Đăng nhập lại phiên Internet Banking cho tài khoản nạp riêng
   */
  async reloginDepositAccount(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body || {};
      const result = await depositService.reloginDepositAccount(id, password);
      return res.json({
        status: result.success ? 'success' : 'error',
        msg: result.msg,
        data: result,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * POST /admin/deposit-accounts/:id/sync
   * Admin bấm nút quét đối soát giao dịch cho tài khoản nhận nạp
   */
  async syncDepositAccount(req, res) {
    try {
      const { id } = req.params;
      const days = parseInt(req.query.days) || 2;
      const result = await depositService.syncDepositAccount(id, days);
      return res.json({
        status: 'success',
        msg: `Đồng bộ [${result.bankCode.toUpperCase()} - ${result.accountNumber}] hoàn tất! Tổng ${result.totalTransactions} GD, nạp mới: ${result.newlyCreditedCount} GD.`,
        data: result,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * POST /admin/deposit-settings
   * Admin lưu cấu hình chung (Cú pháp Memo, Mức nạp tối thiểu)
   */
  async saveGeneralSettings(req, res) {
    try {
      const { memo_prefix, min_amount, system_notice } = req.body || {};
      const settings = await depositService.saveGeneralSettings({
        memo_prefix: (memo_prefix || 'NAPTIEN').trim().toUpperCase(),
        min_amount: parseInt(min_amount) || 10000,
        system_notice: system_notice || '',
      });
      return res.json({
        status: 'success',
        msg: 'Đã lưu cấu hình nạp tiền hệ thống thành công!',
        data: settings,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  /**
   * Legacy endpoints for backward compatibility
   */
  async getAdminDepositConfig(req, res) {
    return this.getAllDepositAccounts(req, res);
  }

  async updateAdminDepositConfig(req, res) {
    return this.saveGeneralSettings(req, res);
  }

  async triggerAdminSync(req, res) {
    return this.syncDepositAccount(req, res);
  }
}

module.exports = new DepositController();
