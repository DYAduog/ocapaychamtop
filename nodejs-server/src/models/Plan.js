const mongoose = require('mongoose');

const BankPriceSchema = new mongoose.Schema(
  {
    bankCode: { type: String, required: true },
    bankName: { type: String, default: '' },
    priceMonth: { type: Number, default: 0 },
    price3Month: { type: Number, default: 0 },
    priceYear: { type: Number, default: 0 },
    maxAccountsPerBank: { type: Number, default: 1 },
    enabled: { type: Boolean, default: true },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const PlanSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    badge: { type: String, default: '' },
    color: { type: String, default: '#00a65a' },
    priceMonth: { type: Number, default: 0 },
    price3Month: { type: Number, default: 0 },
    priceYear: { type: Number, default: 0 },
    originalPriceMonth: { type: Number, default: 0 },
    maxAccounts: { type: Number, default: 2 },
    maxGateways: { type: Number, default: 2 },
    accountsPerBank: { type: Number, default: 1 }, // Số lượng tài khoản của gói: tất cả các cổng trong gói chỉ thêm N tài khoản mỗi cổng
    scanSpeed: { type: String, default: '10s / lần quét' },
    features: [{ type: String }],
    bankPrices: [BankPriceSchema],
    status: {
      type: String,
      enum: ['active', 'hidden'],
      default: 'active',
      index: true,
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', PlanSchema);
