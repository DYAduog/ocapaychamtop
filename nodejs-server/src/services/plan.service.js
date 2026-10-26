const Plan = require('../models/Plan');
const Gateway = require('../models/Gateway');

const DEFAULT_BANKS = [
  { bankCode: 'tpbank', bankName: 'TPBank', priceMonth: 100000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'mbbank', bankName: 'MBBank Quân Đội', priceMonth: 100000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'vcb', bankName: 'Vietcombank', priceMonth: 120000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'acb', bankName: 'ACB Á Châu', priceMonth: 100000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'bidv', bankName: 'BIDV SmartBanking', priceMonth: 100000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'viettin', bankName: 'VietinBank iPay', priceMonth: 100000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'techcombank', bankName: 'Techcombank', priceMonth: 120000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'msb', bankName: 'MSB Hàng Hải', priceMonth: 90000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'timo', bankName: 'Timo Digital Bank', priceMonth: 90000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'zalopay', bankName: 'Ví ZaloPay', priceMonth: 80000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'viettel', bankName: 'Viettel Money', priceMonth: 80000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'ocb', bankName: 'OCB OMNI', priceMonth: 90000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'bvbank', bankName: 'BVBank Bản Việt', priceMonth: 90000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'pgbank', bankName: 'PGBank Omni', priceMonth: 90000, maxAccountsPerBank: 2, enabled: true },
  { bankCode: 'eximbank', bankName: 'Eximbank Edigi', priceMonth: 90000, maxAccountsPerBank: 2, enabled: true },
];

function buildBankPricesForPlan(planCode) {
  return DEFAULT_BANKS.map(b => {
    let price = b.priceMonth;
    let maxAcc = 2;
    let isEnabled = true;

    if (planCode === 'starter') {
      price = Math.round(b.priceMonth * 1.25);
      maxAcc = 1;
      isEnabled = ['tpbank', 'mbbank', 'vcb', 'acb', 'timo', 'zalopay'].includes(b.bankCode);
    } else if (planCode === 'pro') {
      price = b.priceMonth;
      maxAcc = 2;
      isEnabled = true;
    } else if (planCode === 'enterprise') {
      price = Math.round(b.priceMonth * 0.85);
      maxAcc = 5;
      isEnabled = true;
    }

    return {
      bankCode: b.bankCode,
      bankName: b.bankName,
      priceMonth: price,
      price3Month: Math.round(price * 3 * 0.85),
      priceYear: Math.round(price * 12 * 0.7),
      maxAccountsPerBank: maxAcc,
      enabled: isEnabled,
      note: '',
    };
  });
}

const DEFAULT_PLANS = [
  {
    code: 'starter',
    name: 'Gói Starter (Cơ Bản)',
    description: '2 Cổng ngân hàng tùy chọn • Tần suất quét 10s • Phù hợp shop vừa và nhỏ',
    badge: 'Cơ Bản',
    color: '#64748b',
    priceMonth: 250000,
    price3Month: 637500,
    priceYear: 2100000,
    originalPriceMonth: 350000,
    maxAccounts: 2,
    maxGateways: 2,
    accountsPerBank: 1, // Gói 1 tài khoản thì tất cả các cổng trong gói đó chỉ thêm 1 tài khoản mỗi cổng
    scanSpeed: '10s / lần quét',
    features: [
      '2 Cổng ngân hàng tùy chọn (Hỗ trợ Timo)',
      'Tần suất quét: 10s / lần',
      'Tự động giải Captcha bằng AI OCR',
      'Webhook Callback chuẩn JSON',
    ],
    bankPrices: buildBankPricesForPlan('starter'),
    status: 'active',
    order: 1,
  },
  {
    code: 'pro',
    name: 'Gói Pro Business (Bán Chạy)',
    description: '6 Cổng ngân hàng tùy chọn • Quét siêu tốc 3s - 5s • Không giới hạn giao dịch',
    badge: 'Bán Chạy Nhất',
    color: '#00a65a',
    priceMonth: 550000,
    price3Month: 1400000,
    priceYear: 4620000,
    originalPriceMonth: 750000,
    maxAccounts: 12,
    maxGateways: 6,
    accountsPerBank: 2, // Mỗi cổng tối đa 2 tài khoản
    scanSpeed: '3s - 5s / lần quét (0.3s Webhook)',
    features: [
      '6 Cổng ngân hàng tùy chọn (Timo, TPBank, MB, VCB, ACB...)',
      'Tần suất quét siêu tốc: 3s - 5s / lần',
      'KHÔNG GIỚI HẠN giao dịch',
      'Webhook 0.25s + Bot Telegram riêng',
      'Sinh mã VietQR động theo từng đơn',
    ],
    bankPrices: buildBankPricesForPlan('pro'),
    status: 'active',
    order: 2,
  },
  {
    code: 'enterprise',
    name: 'Gói Enterprise (Doanh Nghiệp)',
    description: 'Tất cả 14 Cổng ngân hàng • Quét Realtime Push • Dedicated VPS riêng biệt',
    badge: 'Doanh Nghiệp',
    color: '#0284c7',
    priceMonth: 1250000,
    price3Month: 3180000,
    priceYear: 10500000,
    originalPriceMonth: 1800000,
    maxAccounts: 70,
    maxGateways: 14,
    accountsPerBank: 5, // Mỗi cổng tối đa 5 tài khoản
    scanSpeed: 'Near Realtime (Push 1s - 2s)',
    features: [
      'Toàn bộ 14 Cổng hệ thống',
      'Tần suất quét: Realtime Push (1s - 2s)',
      'Dedicated VPS riêng + Proxy IP sạch',
      'Cam kết SLA Uptime 99.99%',
      'Hỗ trợ kỹ thuật 1-1 riêng biệt 24/7',
    ],
    bankPrices: buildBankPricesForPlan('enterprise'),
    status: 'active',
    order: 3,
  },
];

class PlanService {
  async ensureSeedPlans() {
    try {
      await Plan.updateMany(
        {},
        {
          $pull: {
            bankPrices: { bankCode: { $in: ['ncb', 'thesieure', 'tsr'] } }
          }
        }
      );
    } catch (_) {}

    const count = await Plan.countDocuments();
    if (count === 0) {
      console.log('[PlanService] Seeding default API plans...');
      await Plan.insertMany(DEFAULT_PLANS);
      console.log('[PlanService] Default API plans seeded successfully!');
    }
  }

  async getAllPlans(includeHidden = true) {
    await this.ensureSeedPlans();
    const query = includeHidden ? {} : { status: 'active' };
    return await Plan.find(query).sort({ order: 1, createdAt: 1 });
  }

  async getPlanByCode(code) {
    await this.ensureSeedPlans();
    return await Plan.findOne({ code: code.toLowerCase().trim() });
  }

  async createPlan(data) {
    const code = (data.code || '').toLowerCase().trim();
    if (!code) throw new Error('Mã gói không được để trống');
    if (!data.name) throw new Error('Tên gói không được để trống');

    const existing = await Plan.findOne({ code });
    if (existing) throw new Error(`Mã gói "${code}" đã tồn tại!`);

    if (!data.bankPrices || data.bankPrices.length === 0) {
      data.bankPrices = buildBankPricesForPlan(code);
    }

    const priceMonth = Number(data.priceMonth) || 0;
    const price3Month = data.price3Month !== undefined ? Number(data.price3Month) : Math.round(priceMonth * 3 * 0.85);
    const priceYear = data.priceYear !== undefined ? Number(data.priceYear) : Math.round(priceMonth * 12 * 0.7);
    const accountsPerBank = Number(data.accountsPerBank) || 1;
    const maxGateways = Number(data.maxGateways) || 2;

    const plan = new Plan({
      ...data,
      code,
      priceMonth,
      price3Month,
      priceYear,
      maxGateways,
      accountsPerBank,
      maxAccounts: maxGateways * accountsPerBank,
    });
    return await plan.save();
  }

  async updatePlan(code, updateData) {
    const plan = await Plan.findOne({ code: code.toLowerCase().trim() });
    if (!plan) throw new Error(`Không tìm thấy gói có mã "${code}"`);

    // Whitelist updatable fields
    const fields = [
      'name', 'description', 'badge', 'color',
      'priceMonth', 'price3Month', 'priceYear', 'originalPriceMonth',
      'maxAccounts', 'maxGateways', 'accountsPerBank', 'scanSpeed', 'features',
      'bankPrices', 'status', 'order'
    ];

    fields.forEach(f => {
      if (updateData[f] !== undefined) {
        plan[f] = updateData[f];
      }
    });

    // Auto-calculate 3-month and 1-year if only priceMonth was provided
    if (updateData.priceMonth !== undefined) {
      const pm = Number(updateData.priceMonth) || 0;
      if (updateData.price3Month === undefined) {
        plan.price3Month = Math.round(pm * 3 * 0.85);
      }
      if (updateData.priceYear === undefined) {
        plan.priceYear = Math.round(pm * 12 * 0.7);
      }
    }

    // Auto-sync accountsPerBank across all bank gateways in this plan
    if (updateData.accountsPerBank !== undefined) {
      const apb = Number(updateData.accountsPerBank) || 1;
      plan.accountsPerBank = apb;
      const mg = Number(plan.maxGateways) || 2;
      plan.maxAccounts = mg * apb;

      if (Array.isArray(plan.bankPrices)) {
        plan.bankPrices.forEach(bp => {
          bp.maxAccountsPerBank = apb;
        });
      }
    }

    return await plan.save();
  }

  async deletePlan(code) {
    const plan = await Plan.findOne({ code: code.toLowerCase().trim() });
    if (!plan) throw new Error(`Không tìm thấy gói có mã "${code}"`);
    if (['starter', 'pro', 'enterprise'].includes(plan.code)) {
      throw new Error(`Không thể xóa gói mặc định "${plan.code}". Bạn có thể chọn Tạm Ẩn gói.`);
    }
    await Plan.deleteOne({ code: plan.code });
    return true;
  }

  async resetDefaultPlans() {
    await Plan.deleteMany({ code: { $in: ['starter', 'pro', 'enterprise'] } });
    await Plan.insertMany(DEFAULT_PLANS);
    return await Plan.find().sort({ order: 1 });
  }

  /**
   * Subscribe / Renew plan by deducting directly from user account balance
   */
  async subscribeWithBalance(user, planCode, cycle = '1m') {
    const User = require('../models/User');
    const { BalanceLog } = require('../models/Log');

    const cleanCode = (planCode || '').toLowerCase().trim();
    const plan = await Plan.findOne({ code: cleanCode });
    if (!plan) throw new Error(`Không tìm thấy gói dịch vụ "${planCode}"`);
    if (plan.status === 'hidden') throw new Error(`Gói dịch vụ "${plan.name}" hiện đang tạm ngừng đăng ký`);

    let price = 0;
    let days = 30;
    let cycleLabel = '1 Tháng';

    if (cycle === '3m') {
      price = Number(plan.price3Month) || Math.round((Number(plan.priceMonth) || 0) * 3 * 0.85);
      days = 90;
      cycleLabel = '3 Tháng';
    } else if (cycle === '1y') {
      price = Number(plan.priceYear) || Math.round((Number(plan.priceMonth) || 0) * 12 * 0.7);
      days = 365;
      cycleLabel = '1 Năm';
    } else {
      price = Number(plan.priceMonth) || 0;
      days = 30;
      cycleLabel = '1 Tháng';
    }

    const currentBalance = Number(user.money) || 0;
    if (currentBalance < price) {
      const missing = price - currentBalance;
      const err = new Error(`Số dư tài khoản không đủ (${currentBalance.toLocaleString('vi-VN')} đ). Cần thêm ${missing.toLocaleString('vi-VN')} đ để đăng ký gói ${plan.name}.`);
      err.code = 'INSUFFICIENT_BALANCE';
      err.required = price;
      err.current = currentBalance;
      err.missing = missing;
      throw err;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    // If currently active and same or upgraded, extend from current expiration; otherwise from now
    const currentExp = Math.max(Number(user.timeMomo) || 0, nowSec);
    const newExp = currentExp + (days * 86400);

    const moneyBefore = currentBalance;
    const moneyAfter = moneyBefore - price;

    user.money = moneyAfter;
    user.plan = plan.code;
    user.timeMomo = newExp;
    await user.save();

    await BalanceLog.create({
      userId: user._id,
      legacyUserId: user.legacyId,
      moneyBefore,
      moneyChange: -price,
      moneyAfter,
      note: `Gia hạn API ${plan.name} (${cycleLabel}) trừ số dư tài khoản`,
    });

    // Bắn thông báo biến động số dư (OUT) qua Telegram & Zalo nếu user đã liên kết
    const balanceData = {
      amount: price,
      type: 'OUT',
      bank: 'Hệ Thống (Đăng Ký Gói)',
      balanceBefore,
      balanceAfter,
      content: `Thanh toán gói API ${plan.name} (${cycleLabel})`,
      txId: 'SRV_' + Date.now().toString(36).toUpperCase(),
      time: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    };

    if (user.telegramNotifyEnabled && user.telegramChatId) {
      try {
        const telegramService = require('./telegram.service');
        telegramService.sendBalanceChangeNotification(user, balanceData).catch(() => {});
      } catch (_) {}
    }

    if (user.zaloNotifyEnabled && user.zaloChatId) {
      try {
        const zaloBotService = require('./zaloBot.service');
        zaloBotService.sendBalanceChangeNotification(user, balanceData).catch(() => {});
      } catch (_) {}
    }

    return {
      plan: user.plan,
      planName: plan.name,
      cycle,
      cycleLabel,
      price,
      days,
      moneyBefore,
      moneyAfter,
      timeMomo: newExp,
      expiryDate: new Date(newExp * 1000).toLocaleDateString('vi-VN'),
    };
  }
}

module.exports = new PlanService();
