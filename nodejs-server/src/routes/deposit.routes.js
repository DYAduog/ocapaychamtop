const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');

// Public & User Deposit Endpoints
router.get('/banks', (req, res) => depositController.getPublicBanks(req, res));
router.post('/check-status', (req, res) => depositController.checkDepositStatus(req, res));
router.get('/history', (req, res) => depositController.getUserHistory(req, res));

module.exports = router;
