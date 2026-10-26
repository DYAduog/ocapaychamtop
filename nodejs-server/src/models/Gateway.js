const mongoose = require('mongoose');

const GatewaySchema = new mongoose.Schema(
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
    fullName: { type: String, default: '' },
    logo: { type: String, default: '' },
    fallbackLogo: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'maintenance', 'coming_soon', 'disabled'],
      default: 'active',
      index: true,
    },
    statusText: {
      type: String,
      default: 'Hoạt động',
    },
    badge: { type: String, default: '' },
    notice: { type: String, default: '' },
    color: { type: String, default: '#38bdf8' },
    order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Gateway', GatewaySchema);
