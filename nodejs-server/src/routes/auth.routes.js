const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleLogin);
router.get('/profile', authController.getProfile);
router.put('/profile', (req, res) => authController.updateProfile(req, res));
router.post('/change-password', (req, res) => authController.changePassword(req, res));
router.post('/regenerate-token', (req, res) => authController.regenerateToken(req, res));
router.post('/telegram-test', (req, res) => authController.testTelegram(req, res));
router.post('/telegram-link', (req, res) => authController.getTelegramLink(req, res));
router.post('/telegram-unlink', (req, res) => authController.unlinkTelegram(req, res));
router.all(['/zalo-link', '/api/zalo-link'], (req, res) => authController.getZaloLink(req, res));
router.post('/zalo-unlink', (req, res) => authController.unlinkZalo(req, res));
router.post('/zalo-test', (req, res) => authController.testZalo(req, res));

module.exports = router;
