const cron = require('node-cron');
const BankAccount = require('../models/BankAccount');
const bankFactory = require('../services/banks/bankFactory');
const depositService = require('../services/deposit.service');

class BankPoller {
  constructor() {
    this.isPolling = false;
  }

  start() {
    // Mặc định chạy quét 1 phút / lần (hoặc theo biến môi trường CRON_INTERVAL)
    const cronSchedule = process.env.CRON_INTERVAL || '* * * * *';
    const isEnabled = process.env.CRON_ENABLED !== 'false';

    console.log(`[Cron] Khởi tạo hệ thống tự động quét nạp tiền (Chu kỳ: ${cronSchedule}, Bật: ${isEnabled})`);

    if (!isEnabled) {
      console.log('[Cron] Quét tự động tạm tắt theo biến môi trường CRON_ENABLED=false');
      return;
    }

    cron.schedule(cronSchedule, async () => {
      await this.pollAll();
    });

    // Khởi chạy bộ duy trì phiên độc lập cho PGBank Omni (chạy đều 75s/lần không phụ thuộc các cổng nạp khác)
    this.startPGBankKeepAlive();

    // Khởi chạy bộ duy trì phiên liên tục cho BVBank DigiBank (chu kỳ 45s để session không bao giờ bị timeout)
    this.startBVBankKeepAlive();
  }

  startBVBankKeepAlive() {
    console.log('[Cron] Khởi tạo bộ duy trì phiên liên tục cho BVBank DigiBank (chu kỳ 45s)');
    setInterval(async () => {
      try {
        const bvbankAccounts = await BankAccount.find({
          bankCode: { $in: ['bvbank', 'bvb', 'banviet'] },
          status: 1,
          sessionStatus: 'active',
        });

        for (const bvb of bvbankAccounts) {
          try {
            if (!bvb.sessionData?.cookies) continue;
            const hist = await bankFactory.getTransactionHistory(bvb, { days: 1, force: true });
            if (hist && hist.status === 'success' && hist.code === '00') {
              if (hist.balance !== undefined && hist.balance !== null) bvb.balance = Number(hist.balance);
              if (hist.accountName && !hist.accountName.toLowerCase().includes('thông tin')) {
                bvb.accountName = hist.accountName;
              }
              if (Array.isArray(hist.transactions) && hist.transactions.length > 0) {
                bvb.sessionData = bvb.sessionData || {};
                bvb.sessionData.latestTransactions = hist.transactions;
                bvb.markModified('sessionData');
              }
              bvb.lastSyncAt = new Date();
              await bvb.save();
              if (this._reportedBvb) this._reportedBvb.delete(bvb.accountNumber);
            } else {
              if (!this._reportedBvb) this._reportedBvb = new Set();
              if (!this._reportedBvb.has(bvb.accountNumber)) {
                this._reportedBvb.add(bvb.accountNumber);
                console.warn(`[KeepAlive:BVBank] ⚠️ Phiên BVBank (${bvb.accountNumber}) đã hết hạn. Vui lòng bấm [Đăng nhập lại] để cấp quyền mới.`);
              }
            }
          } catch (syncErr) {
            console.warn(`[KeepAlive:BVBank] ⚠️ Lỗi duy trì phiên BVBank:`, syncErr.message);
          }
        }
      } catch (err) {}
    }, 45000);
  }

  startPGBankKeepAlive() {
    console.log('[Cron] Khởi tạo bộ duy trì phiên liên tục cho PGBank Omni (chu kỳ 35s)');
    setInterval(async () => {
      try {
        const pgbankAccounts = await BankAccount.find({ bankCode: 'pgbank', status: 1 });
        for (const pgb of pgbankAccounts) {
          try {
            const hist = await bankFactory.getTransactionHistory(pgb, { days: 1, force: true });
            if (hist && hist.status === 'success' && hist.code === '00') {
              if (hist.balance !== undefined && hist.balance !== null) pgb.balance = Number(hist.balance);
              if (hist.accountName && hist.accountName !== 'Tài khoản PGBank') {
                pgb.accountName = hist.accountName;
              }
              if (Array.isArray(hist.transactions) && hist.transactions.length > 0) {
                pgb.sessionData = pgb.sessionData || {};
                pgb.sessionData.latestTransactions = hist.transactions;
                pgb.markModified('sessionData');
              }
              pgb.lastSyncAt = new Date();
              await pgb.save();
              if (this._reportedPgb) this._reportedPgb.delete(pgb.accountNumber);
            } else {
              if (!this._reportedPgb) this._reportedPgb = new Set();
              if (!this._reportedPgb.has(pgb.accountNumber)) {
                this._reportedPgb.add(pgb.accountNumber);
                console.warn(`[KeepAlive:PGBank] ❌ Phiên PGBank (${pgb.accountNumber}) đã hết hạn hoặc chưa đăng nhập. Cần xác thực Smart OTP.`);
              }
            }
          } catch (syncErr) {
            console.warn(`[KeepAlive:PGBank] ⚠️ Lỗi duy trì phiên PGBank:`, syncErr.message);
          }
        }
      } catch (err) {}
    }, 35000);
  }

  /**
   * Quét tất cả ngân hàng nạp tiền đang kích hoạt
   */
  async pollAll() {
    if (this.isPolling) {
      console.log('[Cron] Phiên quét trước đang thực thi, bỏ qua lần này để tránh nghẽn.');
      return;
    }

    this.isPolling = true;
    try {
      const results = await depositService.syncAllActiveDepositBanks();

      let totalNew = 0;
      results.forEach((r) => {
        if (r && r.newlyCreditedCount > 0) {
          totalNew += r.newlyCreditedCount;
          console.log(`[Cron] ✨ Đã tự động cộng tiền cho ${r.newlyCreditedCount} giao dịch mới qua [${r.bankCode.toUpperCase()} - ${r.accountNumber}]`);
        }
      });

      // Tự động gia hạn và duy trì phiên ngân hàng token (MSB, v.v.)
      await this.keepAliveSessions();
    } catch (err) {
      console.error('[Cron] Lỗi trong quá trình quét tự động:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Tự động duy trì phiên (keep-alive) cho MSB để token không bao giờ bị hết hạn
   */
  async keepAliveSessions() {
    try {
      const msbService = require('../services/banks/msb.service');
      const msbAccounts = await BankAccount.find({ bankCode: 'msb', status: 1 });
      for (const acc of msbAccounts) {
        const refToken = acc.sessionData?.refreshToken;
        if (!refToken) continue;

        const rf = await msbService.refreshAccessToken(refToken);
        if (rf.success && rf.accessToken) {
          acc.sessionData.accessToken = rf.accessToken;
          if (rf.refreshToken) acc.sessionData.refreshToken = rf.refreshToken;
          acc.markModified('sessionData');
          await acc.save();
        } else {
          if (!this._reportedMsb) this._reportedMsb = new Set();
          if (!this._reportedMsb.has(acc.accountNumber)) {
            this._reportedMsb.add(acc.accountNumber);
            console.warn(`[Cron:MSB] ⚠️ Phiên MSB (${acc.accountNumber}) đã hết hạn token (${rf.error}). Cần cập nhật phiên để tiếp tục gia hạn tự động.`);
          }
        }
      }
    } catch (e) {
      console.warn('[Cron:KeepAlive] Lỗi duy trì phiên:', e.message);
    }
  }
}

module.exports = new BankPoller();
