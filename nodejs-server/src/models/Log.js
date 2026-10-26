const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    legacyUserId: { type: Number },
    action: { type: String, required: true },
    ip: { type: String, default: '' },
    device: { type: String, default: '' },
  },
  { timestamps: true }
);

const BalanceLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    legacyUserId: { type: Number },
    moneyBefore: { type: Number, default: 0 },
    moneyChange: { type: Number, default: 0 },
    moneyAfter: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

const PusherConfigSchema = new mongoose.Schema(
  {
    appId: { type: String, default: '' },
    key: { type: String, default: '' },
    secret: { type: String, default: '' },
    cluster: { type: String, default: 'ap1' },
  },
  { timestamps: true }
);

module.exports = {
  Log: mongoose.model('Log', LogSchema),
  BalanceLog: mongoose.model('BalanceLog', BalanceLogSchema),
  PusherConfig: mongoose.model('PusherConfig', PusherConfigSchema),
};
