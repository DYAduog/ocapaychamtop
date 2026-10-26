const mongoose = require('mongoose');

const LiveChatMessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['user', 'admin', 'bot'],
    required: true,
  },
  senderName: {
    type: String,
    default: 'Khách hàng',
  },
  text: {
    type: String,
    required: true,
  },
  html: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const LiveChatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userName: {
      type: String,
      default: 'Khách vãng lai',
      trim: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    userPhone: {
      type: String,
      default: '',
      trim: true,
    },
    userIp: {
      type: String,
      default: '',
    },
    pageUrl: {
      type: String,
      default: '/',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    unreadAdminCount: {
      type: Number,
      default: 0,
    },
    unreadUserCount: {
      type: Number,
      default: 0,
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageSender: {
      type: String,
      enum: ['user', 'admin', 'bot'],
      default: 'user',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    messages: [LiveChatMessageSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LiveChatSession', LiveChatSessionSchema);
