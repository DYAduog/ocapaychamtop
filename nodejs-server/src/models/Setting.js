const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', SettingSchema);
