const User = require('../models/User');
const BankAccount = require('../models/BankAccount');
const Setting = require('../models/Setting');
const { Log, BalanceLog, PusherConfig } = require('../models/Log');
const Invoice = require('../models/Invoice');
const gatewayService = require('../services/gateway.service');


class AdminController {
  // Middleware check admin
  async checkAdmin(req, res, next) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) {
        return res.status(401).json({ status: 'error', msg: 'Yêu cầu quyền quản trị viên (Thiếu Token)' });
      }
      const user = await User.findOne({ token });
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const isEmailAdmin = !!(adminEmail && user && user.email && user.email.toLowerCase() === adminEmail);

      if (!user || (!isEmailAdmin && user.level !== '1' && user.level !== 'admin')) {
        return res.status(403).json({ status: 'error', msg: 'Bạn không có quyền truy cập trang quản trị' });
      }

      if (isEmailAdmin && user.level !== 'admin' && user.level !== '1') {
        user.level = 'admin';
        await user.save();
      }

      req.adminUser = user;
      next();
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // System statistics & analytics
  async getStats(req, res) {
    try {
      const totalUsers = await User.countDocuments();
      const totalBankAccounts = await BankAccount.countDocuments();
      const activeBankAccounts = await BankAccount.countDocuments({ status: 1 });
      const bannedUsers = await User.countDocuments({ banned: 1 });
      const adminUsersCount = await User.countDocuments({ $or: [{ level: 'admin' }, { level: '1' }] });
      
      const users = await User.find().select('money totalMoney');
      const totalMoney = users.reduce((sum, u) => sum + (u.money || 0), 0);
      const totalDeposited = users.reduce((sum, u) => sum + (u.totalMoney || 0), 0);

      // Bank account distribution by bankCode
      const bankAgg = await BankAccount.aggregate([
        { $group: { _id: '$bankCode', count: { $sum: 1 }, activeCount: { $sum: { $cond: [{ $eq: ['$status', 1] }, 1, 0] } } } }
      ]);

      const recentUsers = await User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('username email money level createdAt avatar');

      return res.json({
        status: 'success',
        data: {
          totalUsers,
          totalBankAccounts,
          activeBankAccounts,
          bannedUsers,
          adminUsersCount,
          totalMoney,
          totalDeposited,
          bankAgg,
          recentUsers,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          platform: process.platform,
        },
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Users management
  async getUsers(req, res) {
    try {
      const { search } = req.query;
      const query = {};
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }
      const users = await User.find(query).sort({ createdAt: -1 });
      return res.json({ status: 'success', data: users });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Update user (money, level, banned, timeMomo, password, notifications)
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { money, level, banned, addDays, password, phone, email, telegramNotifyEnabled, zaloNotifyEnabled } = req.body;
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      if (money !== undefined) user.money = Number(money);
      if (level !== undefined) user.level = String(level);
      if (banned !== undefined) user.banned = Number(banned);
      if (phone !== undefined) user.phone = String(phone);
      if (email !== undefined) user.email = String(email);
      if (telegramNotifyEnabled !== undefined) user.telegramNotifyEnabled = Boolean(telegramNotifyEnabled);
      if (zaloNotifyEnabled !== undefined) user.zaloNotifyEnabled = Boolean(zaloNotifyEnabled);
      if (addDays) {
        const currentExp = Math.max(user.timeMomo || 0, Math.floor(Date.now() / 1000));
        user.timeMomo = currentExp + Number(addDays) * 86400;
      }
      if (password) {
        const cryptoService = require('../services/crypto.service');
        user.password = cryptoService.hashUserPassword(password);
      }

      await user.save();
      return res.json({ status: 'success', msg: 'Cập nhật thành viên thành công', data: user });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Bật / Tắt thông báo biến động số dư (Telegram, Zalo hoặc Cả hai) cho từng tài khoản
  async toggleNotification(req, res) {
    try {
      const { id } = req.params;
      const { channel, state } = req.body; // channel: 'telegram' | 'zalo' | 'both'
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      let msg = '';
      if (channel === 'telegram') {
        user.telegramNotifyEnabled = state !== undefined ? Boolean(state) : !user.telegramNotifyEnabled;
        msg = `Đã ${user.telegramNotifyEnabled ? 'BẬT' : 'TẮT'} thông báo Telegram cho ${user.username}`;
      } else if (channel === 'zalo') {
        user.zaloNotifyEnabled = state !== undefined ? Boolean(state) : !user.zaloNotifyEnabled;
        msg = `Đã ${user.zaloNotifyEnabled ? 'BẬT' : 'TẮT'} thông báo Zalo cho ${user.username}`;
      } else if (channel === 'both') {
        const nextState = state !== undefined ? Boolean(state) : (!user.telegramNotifyEnabled || !user.zaloNotifyEnabled);
        user.telegramNotifyEnabled = nextState;
        user.zaloNotifyEnabled = nextState;
        msg = `Đã ${nextState ? 'BẬT CẢ HAI' : 'TẮT CẢ HAI'} thông báo (Tele & Zalo) cho ${user.username}`;
      } else {
        return res.status(400).json({ status: 'error', msg: 'Kênh thông báo không hợp lệ (hỗ trợ: telegram, zalo, both)' });
      }

      await user.save();
      return res.json({
        status: 'success',
        msg,
        data: {
          _id: user._id,
          username: user.username,
          telegramNotifyEnabled: user.telegramNotifyEnabled,
          telegramChatId: user.telegramChatId,
          zaloNotifyEnabled: user.zaloNotifyEnabled,
          zaloChatId: user.zaloChatId,
        }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Adjust balance (Add / Subtract money) with audit log
  async adjustBalance(req, res) {
    try {
      const { id } = req.params;
      const { amount, type, reason } = req.body;
      const parsedAmount = Math.abs(Number(amount));
      if (!parsedAmount || isNaN(parsedAmount)) {
        return res.status(400).json({ status: 'error', msg: 'Số tiền nhập không hợp lệ' });
      }

      const user = await User.findById(id);
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const moneyBefore = user.money || 0;
      const delta = type === 'subtract' ? -parsedAmount : parsedAmount;
      const moneyAfter = Math.max(0, moneyBefore + delta);

      user.money = moneyAfter;
      if (delta > 0) {
        user.totalMoney = (user.totalMoney || 0) + delta;
      }
      await user.save();

      await BalanceLog.create({
        userId: user._id,
        moneyBefore,
        moneyChange: delta,
        moneyAfter,
        note: reason || (delta > 0 ? `Admin cộng tiền (${delta > 0 ? '+' : ''}${delta.toLocaleString()} đ)` : `Admin trừ tiền (${delta.toLocaleString()} đ)`),
      });

      // Tự động bắn thông báo biến động số dư qua Telegram & Zalo Bot nếu user đã liên kết
      const balanceData = {
        amount: Math.abs(delta),
        type: delta > 0 ? 'IN' : 'OUT',
        bank: 'Hệ Thống (Admin)',
        balanceBefore,
        balanceAfter,
        content: reason || (delta > 0 ? `Admin điều chỉnh cộng tiền` : `Admin điều chỉnh trừ tiền`),
        txId: 'ADM_' + Date.now().toString(36).toUpperCase(),
        time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      };

      if (user.telegramNotifyEnabled && user.telegramChatId) {
        try {
          const telegramService = require('../services/telegram.service');
          telegramService.sendBalanceChangeNotification(user, balanceData).catch(() => {});
        } catch (_) {}
      }

      if (user.zaloNotifyEnabled && user.zaloChatId) {
        try {
          const zaloBotService = require('../services/zaloBot.service');
          zaloBotService.sendBalanceChangeNotification(user, balanceData).catch(() => {});
        } catch (_) {}
      }

      return res.json({
        status: 'success',
        msg: `Đã ${delta > 0 ? 'cộng' : 'trừ'} ${parsedAmount.toLocaleString('vi-VN')} đ cho ${user.username}`,
        data: {
          user,
          moneyBefore,
          moneyAfter,
          delta
        }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Extend API subscription days
  async extendSubscription(req, res) {
    try {
      const { id } = req.params;
      const { days } = req.body;
      const numDays = Number(days);
      if (!numDays || isNaN(numDays)) {
        return res.status(400).json({ status: 'error', msg: 'Số ngày gia hạn không hợp lệ' });
      }

      const user = await User.findById(id);
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const now = Math.floor(Date.now() / 1000);
      const currentExp = Math.max(user.timeMomo || now, now);
      user.timeMomo = currentExp + numDays * 86400;
      await user.save();

      return res.json({
        status: 'success',
        msg: `Đã gia hạn thêm ${numDays} ngày dùng API cho ${user.username}`,
        data: user
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Toggle user ban status
  async toggleBan(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      user.banned = user.banned === 1 ? 0 : 1;
      await user.save();

      return res.json({
        status: 'success',
        msg: user.banned === 1 ? `Đã khóa tài khoản ${user.username}` : `Đã mở khóa tài khoản ${user.username}`,
        data: user
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Toggle admin role
  async toggleAdminRole(req, res) {
    try {
      const { id } = req.params;
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const isCurrentAdmin = user.level === 'admin' || user.level === '1';
      user.level = isCurrentAdmin ? 'member' : 'admin';
      await user.save();

      return res.json({
        status: 'success',
        msg: `Đã cập nhật quyền của ${user.username} thành: ${user.level === 'admin' ? 'Quản Trị Viên (Admin)' : 'Thành Viên Thường'}`,
        data: user
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Delete user
  async deleteUser(req, res) {
    try {
      const { id } = req.params;
      await User.findByIdAndDelete(id);
      await BankAccount.deleteMany({ userId: id });
      return res.json({ status: 'success', msg: 'Đã xóa người dùng và tài khoản ngân hàng liên kết' });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // All bank accounts
  async getAllBanks(req, res) {
    try {
      const banks = await BankAccount.find()
        .populate('userId', 'username email avatar')
        .sort({ createdAt: -1 });
      return res.json({ status: 'success', data: banks });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Toggle bank online/offline status
  async toggleBankStatus(req, res) {
    try {
      const { id } = req.params;
      const bank = await BankAccount.findById(id);
      if (!bank) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy tài khoản ngân hàng' });

      bank.status = bank.status === 1 ? 0 : 1;
      await bank.save();

      return res.json({
        status: 'success',
        msg: `Đã chuyển trạng thái sang ${bank.status === 1 ? 'Online (Hoạt động)' : 'Offline (Tạm ngưng)'}`,
        data: bank
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Remove bank account (xóa sạch toàn bộ dữ liệu để khi thêm lại như mới từ đầu)
  async deleteBank(req, res) {
    try {
      const { id } = req.params;
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

      // 1. Xóa trong BankAccount
      await BankAccount.deleteMany({
        $or: [
          { _id: account._id },
          { accountNumber: cleanAcc },
          { bankCode: cleanBank, accountNumber: cleanAcc },
        ],
      });

      // 2. Xóa các tài khoản nạp tiền liên quan trong DepositAccount
      const DepositAccount = require('../models/DepositAccount');
      await DepositAccount.deleteMany({
        $or: [
          { accountNumber: cleanAcc },
          { bankCode: cleanBank, accountNumber: cleanAcc },
        ],
      });

      // 3. Xóa các giao dịch đã xử lý liên quan đến số tài khoản này
      const ProcessedTransaction = require('../models/ProcessedTransaction');
      await ProcessedTransaction.deleteMany({
        $or: [
          { accountNumber: cleanAcc },
          { bankCode: cleanBank, accountNumber: cleanAcc },
        ],
      });

      // 4. Xóa sạch file phiên, file thiết bị (deviceId), OTP chờ và cache của ngân hàng
      const bankFactory = require('../services/banks/bankFactory');
      await bankFactory.cleanAccountData(cleanBank, cleanAcc, username);

      return res.json({
        status: 'success',
        msg: `Đã xóa sạch tài khoản ${cleanAcc} (${cleanBank.toUpperCase()}) và toàn bộ dữ liệu liên quan`,
      });
    } catch (err) {
      console.error('[Admin deleteBank Error]:', err);
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Audit Logs (Balance changes & Actions)
  async getLogs(req, res) {
    try {
      const balanceLogs = await BalanceLog.find()
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .limit(60);

      const activityLogs = await Log.find()
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .limit(60);

      return res.json({
        status: 'success',
        data: { balanceLogs, activityLogs }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Get Captcha Usage Logs
  async getCaptchaLogs(req, res) {
    try {
      const CaptchaLog = require('../models/CaptchaLog');
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const logs = await CaptchaLog.find()
        .sort({ createdAt: -1 })
        .limit(limit);
      const totalCount = await CaptchaLog.countDocuments();
      const successCount = await CaptchaLog.countDocuments({ success: true });
      const [agg] = await CaptchaLog.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$cost' },
            avgTimeMs: { $avg: '$timeMs' },
          },
        },
      ]);

      return res.json({
        status: 'success',
        data: logs,
        stats: {
          total: totalCount,
          success: successCount,
          successRate: totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) + '%' : '100%',
          totalRevenue: agg?.totalRevenue || 0,
          avgLatency: agg?.avgTimeMs ? Math.round(agg.avgTimeMs) + 'ms' : '25ms',
        },
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Settings
  async getSettings(req, res) {
    try {
      const settings = await Setting.find();
      const settingsMap = {};
      settings.forEach((s) => {
        settingsMap[s.name] = s.value;
      });
      if (!settingsMap.server_ip) {
        settingsMap.server_ip = process.env.SERVER_IP || '';
      }
      if (!settingsMap.domain) {
        settingsMap.domain = process.env.DOMAIN || '';
      }
      if (!settingsMap.app_url) {
        settingsMap.app_url = process.env.APP_URL || '';
      }
      if (!settingsMap.admin_email) {
        settingsMap.admin_email = process.env.ADMIN_EMAIL || 'duongle26.1025@gmail.com';
      }
      if (!settingsMap.key_captcha) {
        settingsMap.key_captcha = process.env.KEY_CAPTCHA || process.env.CAPTCHA_API_KEY || 'offline_ai_self_hosted';
      }
      if (!settingsMap.captcha_api_url) {
        settingsMap.captcha_api_url = process.env.CAPTCHA_LOCAL_ENGINE_URL || process.env.CAPTCHA_API_URL || 'http://127.0.0.1:8088';
      }
      if (!settingsMap.telegram_bot_token) {
        settingsMap.telegram_bot_token = process.env.TELEGRAM_BOT_TOKEN || '';
      }
      if (!settingsMap.telegram_bot_username) {
        settingsMap.telegram_bot_username = process.env.TELEGRAM_BOT_USERNAME || '';
      }
      if (!settingsMap.zalo_bot_token) {
        settingsMap.zalo_bot_token = process.env.ZALO_BOT_TOKEN || '';
      }
      if (!settingsMap.zalo_bot_name) {
        settingsMap.zalo_bot_name = process.env.ZALO_BOT_NAME || '';
      }
      if (!settingsMap.zalo_bot_account_name) {
        settingsMap.zalo_bot_account_name = process.env.ZALO_BOT_ACCOUNT_NAME || '';
      }
      if (!settingsMap.zalo_bot_deeplink) {
        settingsMap.zalo_bot_deeplink = process.env.ZALO_BOT_DEEPLINK || 'https://zalo.me/3100879446097204368';
      }
      if (!settingsMap.zalo_admin_chat_id) {
        settingsMap.zalo_admin_chat_id = process.env.ZALO_ADMIN_CHAT_ID || '';
      }
      if (!settingsMap.captcha_price_per_request) {
        settingsMap.captcha_price_per_request = 20;
      }
      return res.json({ status: 'success', data: settingsMap });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async updateSettings(req, res) {
    try {
      const settingsObj = req.body;
      for (const [key, value] of Object.entries(settingsObj)) {
        await Setting.findOneAndUpdate({ name: key }, { value }, { upsert: true });
        if (key === 'server_ip') {
          process.env.SERVER_IP = String(value || '').trim();
        }
        if (key === 'domain') {
          process.env.DOMAIN = String(value || '').trim();
        }
        if (key === 'app_url') {
          process.env.APP_URL = String(value || '').trim();
        }
        if (key === 'key_captcha') {
          process.env.KEY_CAPTCHA = value;
          process.env.CAPTCHA_API_KEY = value;
        }
        if (key === 'captcha_api_url') {
          process.env.CAPTCHA_API_URL = value;
        }
        if (key === 'telegram_bot_token') {
          process.env.TELEGRAM_BOT_TOKEN = value;
        }
        if (key === 'telegram_bot_username') {
          process.env.TELEGRAM_BOT_USERNAME = String(value).replace(/^@/, '');
        }
        if (key === 'zalo_bot_token') {
          process.env.ZALO_BOT_TOKEN = String(value || '').trim();
        }
        if (key === 'zalo_bot_name') {
          process.env.ZALO_BOT_NAME = String(value || '').trim();
        }
        if (key === 'zalo_bot_account_name') {
          process.env.ZALO_BOT_ACCOUNT_NAME = String(value || '').trim();
        }
        if (key === 'zalo_bot_deeplink') {
          process.env.ZALO_BOT_DEEPLINK = String(value || '').trim();
        }
        if (key === 'zalo_admin_chat_id') {
          process.env.ZALO_ADMIN_CHAT_ID = String(value || '').trim();
        }
      }

      // Khởi động lại Bot polling với cấu hình mới
      try {
        const telegramService = require('../services/telegram.service');
        telegramService.stopPolling();
        telegramService.startPolling();
      } catch (_) {}

      try {
        const zaloBotService = require('../services/zaloBot.service');
        zaloBotService.stopPolling();
        zaloBotService.startPolling();
      } catch (_) {}

      return res.json({ status: 'success', msg: 'Đã lưu cấu hình hệ thống' });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Test Telegram Bot Token
  async testTelegramBot(req, res) {
    try {
      const telegramService = require('../services/telegram.service');
      let botToken = req.body?.telegram_bot_token;
      if (!botToken) {
        const sys = await telegramService.getSystemConfig();
        botToken = sys.botToken;
      }
      if (!botToken) {
        return res.status(400).json({ status: 'error', msg: 'Chưa có Bot Token để kiểm tra' });
      }

      const info = await telegramService.getMe(botToken);
      if (info.success) {
        return res.json({
          status: 'success',
          msg: `Kết nối thành công tới Bot: ${info.bot.first_name} (@${info.bot.username})`,
          bot: info.bot,
        });
      }
      return res.status(400).json({ status: 'error', msg: info.error || 'Token không hợp lệ' });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Test Zalo Bot Token
  async testZaloBot(req, res) {
    try {
      const zaloBotService = require('../services/zaloBot.service');
      let botToken = req.body?.zalo_bot_token;
      if (!botToken) {
        const sys = await zaloBotService.getSystemConfig();
        botToken = sys.botToken;
      }
      if (!botToken) {
        return res.status(400).json({ status: 'error', msg: 'Chưa có Zalo Bot Token để kiểm tra' });
      }

      const info = await zaloBotService.getMe(botToken);
      if (info.success) {
        return res.json({
          status: 'success',
          msg: `Kết nối thành công tới Zalo Bot: ${info.bot.display_name || info.bot.account_name} (ID: ${info.bot.id})`,
          bot: info.bot,
        });
      }
      return res.status(400).json({ status: 'error', msg: info.error || 'Token Zalo Bot không hợp lệ' });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Test AI Captcha Solver Offline (100% nội bộ không cần bên thứ 3)
  async testCaptcha(req, res) {
    try {
      const startTime = Date.now();
      const path = require('path');
      const { spawn } = require('child_process');
      const { getPythonExecutable, getPythonProjectRoot } = require('../utils/python');
      const projectRoot = getPythonProjectRoot();
      const pythonExe = getPythonExecutable();

      const testScript = `
import sys, json, os
from captcha_solver import solve_captcha_dict

result = None
sample_file = os.path.join(os.getcwd(), 'captcha_samples.json')
if os.path.isfile(sample_file):
    try:
        with open(sample_file, 'r', encoding='utf-8') as f:
            samples = json.load(f)
            b64 = samples.get('vcb') or samples.get('mbbank') or list(samples.values())[0]
            if isinstance(b64, dict):
                b64 = b64.get('b64') or b64.get('base64') or b64.get('image') or ''
            result = solve_captcha_dict(b64)
            if result and result.get('status'):
                result['source'] = 'sample_offline_ai'
    except Exception as e:
        pass

if not result or not result.get('status'):
    try:
        from vcb import VCB
        v = VCB()
        raw_res = v.getCaptcha()
        parsed = json.loads(raw_res)
        if parsed.get('status') == 'success':
            result = {
                'status': True,
                'prediction': parsed.get('data', {}).get('captcha', ''),
                'source': 'vcb_live_ai',
                'time_ms': 45
            }
        else:
            result = {'status': False, 'msg': parsed.get('msg', 'Không tải được captcha')}
    except Exception as e:
        result = {'status': False, 'msg': str(e)}

print(json.dumps(result, ensure_ascii=False))
`;

      const child = spawn(pythonExe, ['-X', 'utf8', '-c', testScript], {
        cwd: projectRoot,
        timeout: 15000,
      });

      let stdoutData = '';
      let stderrData = '';
      let isErrorHandled = false;

      child.on('error', (spawnErr) => {
        isErrorHandled = true;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        return res.status(400).json({
          status: 'error',
          msg: `Không thể khởi chạy Python (${pythonExe}): ${spawnErr.message}`,
          duration,
        });
      });

      child.stdout.on('data', (d) => { stdoutData += d.toString('utf8'); });
      child.stderr.on('data', (d) => { stderrData += d.toString('utf8'); });

      child.on('close', (code) => {
        if (isErrorHandled) return;
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        if (code !== 0 || !stdoutData.trim()) {
          return res.status(400).json({
            status: 'error',
            msg: `Kiểm tra giải captcha thất bại: ${stderrData || 'Không có phản hồi từ Python'}`,
            duration,
          });
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (parsed.status === true || parsed.status === 'success') {
            const pred = parsed.prediction || parsed.captcha || parsed.data?.captcha || '';
            return res.json({
              status: 'success',
              msg: `✅ AI Offline Captcha Solver hoạt động xuất sắc! Mã nhận diện: '${pred}' (Tốc độ OCR: ${duration}s, Nguồn: ${parsed.source || 'ddddocr'}). Hoàn toàn miễn phí, không cần bên thứ 3!`,
              data: {
                captcha: pred,
                source: parsed.source || 'local_ddddocr',
                offline: true,
              },
              duration,
            });
          } else {
            return res.status(400).json({
              status: 'error',
              msg: `Engine OCR báo lỗi: ${parsed.msg || 'Không rõ lỗi'}`,
              raw: parsed,
              duration,
            });
          }
        } catch (parseErr) {
          return res.status(400).json({
            status: 'error',
            msg: `Kết quả từ OCR không hợp lệ: ${stdoutData.trim() || stderrData.trim()}`,
            duration,
          });
        }
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Get all gateways with status and connected accounts count
  async getGateways(req, res) {
    try {
      const gateways = await gatewayService.getAllGateways();
      const bankAgg = await BankAccount.aggregate([
        {
          $group: {
            _id: '$bankCode',
            count: { $sum: 1 },
            activeCount: { $sum: { $cond: [{ $eq: ['$status', 1] }, 1, 0] } },
          },
        },
      ]);

      const aggMap = {};
      bankAgg.forEach((item) => {
        const normalized = gatewayService.normalizeCode(item._id);
        aggMap[normalized] = (aggMap[normalized] || 0) + (item.count || 0);
      });

      const enriched = gateways.map((g) => {
        const obj = g.toObject ? g.toObject() : { ...g };
        obj.connectedCount = aggMap[g.code] || 0;
        return obj;
      });

      return res.json({ status: 'success', data: enriched });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // Update specific gateway status and notice
  async updateGateway(req, res) {
    try {
      const { code } = req.params;
      const { status, statusText, notice } = req.body;
      if (!status) {
        return res.status(400).json({ status: 'error', msg: 'Vui lòng cung cấp trạng thái (active, maintenance, coming_soon, disabled)' });
      }

      const updated = await gatewayService.updateGatewayStatus(code, { status, statusText, notice });
      return res.json({
        status: 'success',
        msg: `Đã cập nhật cổng ${updated.name} sang trạng thái: "${updated.statusText}"`,
        data: updated,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  // Batch update all gateways
  async updateAllGateways(req, res) {
    try {
      const { status, notice } = req.body;
      if (!status) {
        return res.status(400).json({ status: 'error', msg: 'Thiếu trạng thái cần cập nhật' });
      }

      const updatedList = await gatewayService.updateAllStatuses(status, notice);
      return res.json({
        status: 'success',
        msg: `Đã cập nhật toàn bộ cổng sang trạng thái: "${gatewayService.getStatusText(status)}"`,
        data: updatedList,
      });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  // =========================================================================
  // API PLANS & PRICING CONTROLLER METHODS
  // =========================================================================
  async getPlans(req, res) {
    try {
      const planService = require('../services/plan.service');
      const plans = await planService.getAllPlans(true);
      return res.json({ status: 'success', data: plans });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async createPlan(req, res) {
    try {
      const planService = require('../services/plan.service');
      const plan = await planService.createPlan(req.body);
      return res.json({ status: 'success', msg: `Tạo gói "${plan.name}" thành công!`, data: plan });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  async updatePlan(req, res) {
    try {
      const planService = require('../services/plan.service');
      const { code } = req.params;
      const plan = await planService.updatePlan(code, req.body);
      return res.json({ status: 'success', msg: `Cập nhật gói "${plan.name}" thành công!`, data: plan });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  async deletePlan(req, res) {
    try {
      const planService = require('../services/plan.service');
      const { code } = req.params;
      await planService.deletePlan(code);
      return res.json({ status: 'success', msg: `Đã xóa gói "${code}"!` });
    } catch (err) {
      return res.status(400).json({ status: 'error', msg: err.message });
    }
  }

  async resetDefaultPlans(req, res) {
    try {
      const planService = require('../services/plan.service');
      const plans = await planService.resetDefaultPlans();
      return res.json({ status: 'success', msg: 'Đã khôi phục các gói API về mặc định hệ thống!', data: plans });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  // ===========================================================================
  // TỰ ĐỘNG CẬP NHẬT PHIÊN BẢN (AUTO UPDATE SYSTEM)
  // ===========================================================================
  async getUpdateStatus(req, res) {
    try {
      const updateService = require('../services/update.service');
      const current = updateService.getCurrentVersion();
      const config = await updateService.getUpdateConfig();
      const gitAvailable = updateService.isGitAvailable();

      return res.json({
        status: 'success',
        data: {
          currentVersion: current.version,
          buildDate: current.buildDate,
          title: current.title,
          description: current.description,
          changelog: current.changelog,
          channel: current.channel,
          config,
          gitAvailable,
        },
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async checkForUpdates(req, res) {
    try {
      const updateService = require('../services/update.service');
      const result = await updateService.checkForUpdates();
      return res.json({ status: 'success', data: result });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async applyUpdate(req, res) {
    try {
      const updateService = require('../services/update.service');
      const result = await updateService.applyUpdate(req.body);
      return res.json({
        status: 'success',
        msg: `Cập nhật thành công lên phiên bản v${result.newVersion}!`,
        data: result,
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async uploadUpdatePackage(req, res) {
    try {
      const { zipBase64 } = req.body;
      if (!zipBase64) {
        return res.status(400).json({ status: 'error', msg: 'Không tìm thấy dữ liệu tệp ZIP tải lên!' });
      }
      const zipBuffer = Buffer.from(zipBase64.replace(/^data:application\/zip;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '').replace(/^data:application\/x-zip-compressed;base64,/, ''), 'base64');
      const updateService = require('../services/update.service');
      const result = await updateService.applyUpdate({ zipBuffer });
      return res.json({
        status: 'success',
        msg: `Cập nhật thành công từ tệp ZIP lên phiên bản v${result.newVersion}!`,
        data: result,
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async saveUpdateSettings(req, res) {
    try {
      const updateService = require('../services/update.service');
      const updated = await updateService.saveUpdateConfig(req.body);
      return res.json({
        status: 'success',
        msg: 'Đã lưu cấu hình nguồn cập nhật thành công!',
        data: updated,
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }

  async restartServer(req, res) {
    try {
      const updateService = require('../services/update.service');
      const result = await updateService.restartServer();
      return res.json({
        status: 'success',
        msg: 'Hệ thống đang tiến hành khởi động lại trong giây lát...',
        data: result,
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', msg: err.message });
    }
  }
}

module.exports = new AdminController();


