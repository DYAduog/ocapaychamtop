const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bank.controller');

router.get('/accounts', bankController.listAccounts);
router.post('/accounts', bankController.addAccount);
router.get('/accounts/:id', bankController.getAccountById);
router.patch('/accounts/:id/status', bankController.toggleStatus);
router.patch('/accounts/:id/notify', bankController.toggleNotify);
router.post('/accounts/:id/notify', bankController.toggleNotify);
router.patch('/accounts/:id/webhook', bankController.updateWebhook);
router.post('/accounts/:id/webhook', bankController.updateWebhook);
router.post('/test-webhook', bankController.testWebhook);
router.post('/accounts/test-webhook', bankController.testWebhook);
router.post('/accounts/:id/test-webhook', bankController.testWebhook);
router.delete('/accounts/:id', bankController.removeAccount);
router.post('/accounts/:id/refresh-token', bankController.refreshToken);
router.get('/accounts/:id/history', bankController.getAccountHistory);
router.post('/verify-otp', bankController.verifyOtp);
router.post('/check-confirm', bankController.checkConfirm);

module.exports = router;
