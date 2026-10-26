const express = require('express');
const router = express.Router();
const captchaController = require('../controllers/captcha.controller');
const User = require('../models/User');

// Middleware xác thực token người dùng nếu cần
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token =
      (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null) ||
      req.headers['x-api-key'] ||
      req.query.token ||
      req.body.token;

    if (!token) {
      return res.status(401).json({ status: false, message: 'Vui lòng cung cấp token đăng nhập' });
    }

    const user = await User.findOne({ token });
    if (!user) {
      return res.status(401).json({ status: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};

// 1. Endpoint giải captcha chính thức (Trừ tiền Pay-as-you-go)
router.post('/solve', (req, res) => captchaController.solve(req, res));
router.post('/', (req, res) => captchaController.solve(req, res)); // Tương thích POST /api/captcha

// 2. Endpoint thử nghiệm miễn phí trên Web (Sandbox / Live Demo)
router.post('/demo', (req, res) => captchaController.demo(req, res));

// 3. Thông tin bảng giá & thông số kỹ thuật
router.get('/pricing', (req, res) => captchaController.getPricing(req, res));

// 4. Thống kê công khai hệ thống
router.get('/stats', (req, res) => captchaController.getStats(req, res));

// 5. Lịch sử sử dụng của người dùng
router.get('/history', authenticateUser, (req, res) => captchaController.getHistory(req, res));

module.exports = router;
