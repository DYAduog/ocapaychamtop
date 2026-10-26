const mongoose = require('mongoose');

const DepositAccountSchema = new mongoose.Schema(
  {
    bankCode: {
      type: String,
      required: true,
      enum: ['techcombank', 'vietcombank', 'vcb', 'acb', 'mbbank', 'mb', 'timo', 'tpbank', 'tpb', 'bidv', 'vietinbank', 'viettin', 'zalopay', 'viettelpay', 'thesieure', 'msb', 'pgbank', 'bvbank', 'bvb', 'banviet', 'eximbank', 'eib'],
      index: true,
    },
    bankName: { type: String, default: '' },
    bin: { type: String, default: '' },
    accountNumber: { type: String, required: true, unique: true, index: true },
    accountName: { type: String, required: true },
    username: { type: String, default: '' },
    passwordEncrypted: { type: String, default: '' },
    token: { type: String, unique: true, sparse: true, index: true },
    status: { type: Number, default: 1 }, // 1: Kích hoạt nhận nạp, 0: Tắt
    sessionData: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastSyncAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    loginStatus: { type: String, default: 'active' }, // 'active', 'need_login', 'error'
    loginError: { type: String, default: '' },
  },
  { timestamps: true }
);

DepositAccountSchema.index({ bankCode: 1, status: 1 });

module.exports = mongoose.model('DepositAccount', DepositAccountSchema);
