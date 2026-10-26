const express = require('express');
const router = express.Router();
const livechatController = require('../controllers/livechat.controller');

// Disable cache for realtime livechat
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Admin endpoints
router.get('/sessions', livechatController.getSessions);
router.get('/session/:sessionId', livechatController.getSession);
router.post('/status', livechatController.updateStatus);
router.delete('/session/:sessionId', livechatController.deleteSession);

// Shared endpoints (Customer widget & Admin desk)
router.post('/send', livechatController.sendMessage);
router.get('/poll', livechatController.poll);

module.exports = router;
