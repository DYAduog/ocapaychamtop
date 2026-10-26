const mongoose = require('mongoose');

const ProcessedTransactionSchema = new mongoose.Schema(
  {
    bankCode: { type: String, required: true, index: true },
    accountNumber: { type: String, required: true, index: true },
    transactionId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    description: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    username: { type: String, default: '', index: true },
    status: { type: String, default: 'completed' },
    creditedAt: { type: Date, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ProcessedTransactionSchema.index({ bankCode: 1, accountNumber: 1, transactionId: 1 }, { unique: true });

module.exports = mongoose.model('ProcessedTransaction', ProcessedTransactionSchema);
