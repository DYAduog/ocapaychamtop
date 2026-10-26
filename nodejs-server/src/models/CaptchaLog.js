const mongoose = require('mongoose');

const CaptchaLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    username: {
      type: String,
      default: 'guest',
      index: true,
    },
    apiKey: {
      type: String,
      default: '',
      index: true,
    },
    bank: {
      type: String,
      default: 'general',
      lowercase: true,
      trim: true,
    },
    captcha: {
      type: String,
      default: '',
    },
    success: {
      type: Boolean,
      default: false,
      index: true,
    },
    cost: {
      type: Number,
      default: 0,
    },
    userBalanceAfter: {
      type: Number,
      default: null,
    },
    timeMs: {
      type: Number,
      default: 0,
    },
    method: {
      type: String,
      default: 'local_ai_ocr',
    },
    ip: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Tự động dọn dẹp log sau 30 ngày để tối ưu dung lượng DB
CaptchaLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('CaptchaLog', CaptchaLogSchema);
