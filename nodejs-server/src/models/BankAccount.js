const mongoose = require('mongoose');

const BankAccountSchema = new mongoose.Schema(
  {
    legacyId: { type: Number },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    legacyUserId: { type: Number, index: true },
    bankCode: {
      type: String,
      required: true,
      enum: ['acb', 'bidv', 'mbbank', 'mb', 'vcb', 'vietcombank', 'viettel', 'viettelpay', 'viettin', 'vietinbank', 'zalopay', 'thesieure', 'tpbank', 'tpb', 'techcombank', 'timo', 'msb', 'pgbank', 'bvbank', 'bvb', 'banviet', 'eximbank', 'eib'],
      index: true,
    },
    accountName: { type: String, default: '' },
    accountNumber: { type: String, required: true, index: true }, // STK / Phone
    username: { type: String, default: '' }, // Login username / phone
    passwordEncrypted: { type: String, default: '' }, // RSA Encrypted password
    token: { type: String, required: true, unique: true, index: true }, // API consumer token
    balance: { type: Number, default: 0 },
    status: { type: Number, default: 1 }, // 1: Kích hoạt, 0: Tạm dừng
    sessionStatus: { type: String, enum: ['active', 'expired', 'error', 'pending'], default: 'active' }, // Trạng thái phiên đăng nhập: Còn hạn / Hết hạn
    sessionError: { type: String, default: '' }, // Thông báo lỗi phiên gần nhất nếu có

    // Bank specific credentials and session states
    sessionData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Notification & Webhook settings for each specific bank account
    telegramNotifyEnabled: { type: Boolean, default: true }, // Bật / Tắt thông báo Telegram cho tài khoản này
    zaloNotifyEnabled: { type: Boolean, default: true }, // Bật / Tắt thông báo Zalo cho tài khoản này
    webhookUrl: { type: String, default: '' }, // URL Webhook riêng của tài khoản này
    webhookEnabled: { type: Boolean, default: false }, // Kích hoạt bắn Webhook riêng
    lastCallbackAt: { type: Date, default: null }, // Thời gian bắn Webhook gần nhất
    lastCallbackResponse: { type: String, default: '' }, // Phản hồi từ server Webhook (ví dụ: HTTP 200 OK)
    lastCallbackStatus: { type: Number, default: 0 }, // HTTP status code gần nhất

    lastLoginAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

BankAccountSchema.index({ bankCode: 1, accountNumber: 1 });
BankAccountSchema.index({ legacyUserId: 1, bankCode: 1 });

module.exports = mongoose.model('BankAccount', BankAccountSchema);
