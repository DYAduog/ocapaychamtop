const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
  {
    legacyId: { type: Number },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    legacyUserId: { type: Number },
    transId: { type: String, required: true, index: true },
    paymentMethod: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    pay: { type: Number, default: 0 },
    status: { type: String, default: 'pending' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', InvoiceSchema);
