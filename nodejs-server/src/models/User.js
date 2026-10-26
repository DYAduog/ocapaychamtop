const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    legacyId: { type: Number, index: true },
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, default: '' },
    googleId: { type: String, default: null, index: true },
    avatar: { type: String, default: '' },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    money: { type: Number, default: 0 },
    totalMoney: { type: Number, default: 0 },
    barier: { type: Number, default: 0 },
    status: { type: Number, default: 1 },
    banned: { type: Number, default: 0 },
    level: { type: String, default: 'member' },
    plan: { type: String, default: 'starter' },
    otp: { type: String, default: null },
    token: { type: String, unique: true, index: true },
    timeMomo: { type: Number, default: 0 }, // API subscription expiration timestamp
    timeSession: { type: Number, default: 0 },
    ip: { type: String, default: '' },
    device: { type: String, default: '' },
    telegramChatId: { type: String, trim: true, default: '' },
    telegramUsername: { type: String, trim: true, default: '' },
    telegramBotToken: { type: String, trim: true, default: '' },
    telegramNotifyEnabled: { type: Boolean, default: false },
    telegramLinkCode: { type: String, trim: true, default: null, index: true },
    zaloChatId: { type: String, trim: true, default: '' },
    zaloDisplayName: { type: String, trim: true, default: '' },
    zaloBotToken: { type: String, trim: true, default: '' },
    zaloNotifyEnabled: { type: Boolean, default: false },
    zaloLinkCode: { type: String, trim: true, default: null, index: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
