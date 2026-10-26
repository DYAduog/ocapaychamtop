const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const depositController = require('../controllers/deposit.controller');

// Protect all admin endpoints with checkAdmin
router.use(adminController.checkAdmin);

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/users/:id/adjust-balance', adminController.adjustBalance);
router.post('/users/:id/extend-subscription', adminController.extendSubscription);
router.post('/users/:id/toggle-ban', adminController.toggleBan);
router.post('/users/:id/toggle-role', adminController.toggleAdminRole);
router.post('/users/:id/toggle-notify', adminController.toggleNotification);

router.get('/banks', adminController.getAllBanks);
router.delete('/banks/:id', adminController.deleteBank);
router.put('/banks/:id/toggle-status', adminController.toggleBankStatus);

router.get('/gateways', adminController.getGateways);
router.put('/gateways/:code', adminController.updateGateway);
router.post('/gateways/bulk', adminController.updateAllGateways);

router.get('/logs', adminController.getLogs);
router.get('/captcha-logs', adminController.getCaptchaLogs);

router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSettings);
router.post('/settings/test-captcha', adminController.testCaptcha);
router.post('/settings/test-telegram', adminController.testTelegramBot);
router.post('/settings/test-zalo', adminController.testZaloBot);

// Dedicated System Deposit Accounts Management (Độc lập với web)
router.get('/deposit-accounts', (req, res) => depositController.getAllDepositAccounts(req, res));
router.post('/deposit-accounts', (req, res) => depositController.addDepositAccount(req, res));
router.put('/deposit-accounts/:id', (req, res) => depositController.updateDepositAccount(req, res));
router.post('/deposit-accounts/:id/toggle', (req, res) => depositController.toggleDepositAccount(req, res));
router.delete('/deposit-accounts/:id', (req, res) => depositController.deleteDepositAccount(req, res));
router.post('/deposit-accounts/:id/relogin', (req, res) => depositController.reloginDepositAccount(req, res));
router.post('/deposit-accounts/:id/sync', (req, res) => depositController.syncDepositAccount(req, res));
router.post('/deposit-settings', (req, res) => depositController.saveGeneralSettings(req, res));

// Legacy compatibility routes
router.get('/deposit-banks', (req, res) => depositController.getAdminDepositConfig(req, res));
router.post('/deposit-banks', (req, res) => depositController.updateAdminDepositConfig(req, res));
// API Plans & Pricing Management
router.get('/plans', adminController.getPlans);
router.post('/plans', adminController.createPlan);
router.put('/plans/:code', adminController.updatePlan);
router.delete('/plans/:code', adminController.deletePlan);
router.post('/plans/reset-defaults', adminController.resetDefaultPlans);

// System Update (1-Click Auto Update)
router.get('/update/status', adminController.getUpdateStatus);
router.get('/update/check', adminController.checkForUpdates);
router.post('/update/apply', adminController.applyUpdate);
router.post('/update/upload', adminController.uploadUpdatePackage);
router.post('/update/settings', adminController.saveUpdateSettings);
router.post('/update/restart', adminController.restartServer);

module.exports = router;


