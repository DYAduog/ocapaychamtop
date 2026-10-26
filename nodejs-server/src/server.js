const path = require('path');
const dotenv = require('dotenv');

// Load environment variables reliably from nodejs-server/.env and root .env
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./config/db');
const apiRoutes = require('./routes/api.routes');
const authRoutes = require('./routes/auth.routes');
const bankRoutes = require('./routes/bank.routes');
const adminRoutes = require('./routes/admin.routes');
const bankPoller = require('./cron/bankPoller');
const depositRoutes = require('./routes/deposit.routes');
const livechatRoutes = require('./routes/livechat.routes');
const zalopayRoutes = require('./routes/zalopay.routes');
const captchaRoutes = require('./routes/captcha.routes');

const app = express();

// ==============================================================================
// CẤU HÌNH IP, PORT, DOMAIN & PUBLIC URL CHO MÁY CHỦ VPS
// ==============================================================================
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || process.env.BIND_IP || '0.0.0.0';
const SERVER_IP = (process.env.SERVER_IP || '127.0.0.1').trim();
const rawDomain = (process.env.DOMAIN || process.env.APP_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
const DOMAIN = rawDomain;
const PROTOCOL = (process.env.APP_PROTOCOL || (DOMAIN && !DOMAIN.includes('localhost') ? 'https' : 'http')).trim();
const APP_URL = (process.env.APP_URL || (DOMAIN ? `${PROTOCOL}://${DOMAIN}` : (SERVER_IP && SERVER_IP !== '127.0.0.1' ? `http://${SERVER_IP}:${PORT}` : `http://localhost:${PORT}`))).replace(/\/+$/, '');

// Trust proxy for reverse proxies (Nginx, Caddy, Cloudflare) on VPS
const trustProxyVal = process.env.TRUST_PROXY;
if (trustProxyVal === 'true' || trustProxyVal === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Configurable CORS for VPS / Domain / External Webhooks
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(s => s.trim()),
  credentials: true,
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', {
    skip: (req, res) => res.statusCode < 400,
  }));
}

// Serve Frontend Static Assets
app.use(express.static(path.join(__dirname, '../public')));

// Public System Config Endpoint (cung cấp Domain, IP, App URL cho Frontend Portal & Client)
app.get(['/api/config', '/api/system/config'], (req, res) => {
  res.json({
    status: 'success',
    appUrl: APP_URL,
    domain: DOMAIN,
    serverIp: SERVER_IP,
    port: PORT,
    protocol: PROTOCOL,
    host: HOST,
  });
});

// API Routes
app.use('/api/captcha', captchaRoutes);
app.use('/api/v1/captcha', captchaRoutes);
app.use('/', apiRoutes);
app.use('/api', apiRoutes);
app.use('/api/zalopay', zalopayRoutes);
app.use('/api/livechat', livechatRoutes);
app.use('/auth', authRoutes);
app.use('/banks', bankRoutes);
app.use('/admin', adminRoutes);
app.use('/api/deposit', depositRoutes);

// Fallback to client dashboard or login for SPA routes
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get(['/rental', '/thue-api', '/landing'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/rental.html'));
});

app.get('/admin-portal', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get(['/livechat-admin', '/livechat', '/cskh', '/support-desk'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/livechat-admin.html'));
});

// 404 Handler for APIs
app.use((req, res) => {
  if (req.accepts('html')) {
    res.redirect('/');
    return;
  }
  res.status(404).json({ status: 'error', msg: 'Đường dẫn không tồn tại: ' + req.originalUrl });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(500).json({ status: 'error', msg: err.message || 'Lỗi hệ thống' });
});

// Start Server
const startServer = async () => {
  await connectDB();
  const gatewayService = require('./services/gateway.service');
  await gatewayService.seedDefaultGateways();
  const depositService = require('./services/deposit.service');
  await depositService.seedDefaultsIfEmpty();
  bankPoller.start();
  const telegramService = require('./services/telegram.service');
  telegramService.startPolling().catch(() => {});
  const zaloBotService = require('./services/zaloBot.service');
  zaloBotService.startPolling().catch(() => {});

  app.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`🚀 OcaPay Node.js Server is running on: ${HOST}:${PORT}`);
    console.log(`🌐 Public URL:     ${APP_URL}`);
    if (DOMAIN) console.log(`🏷️ Domain:         ${DOMAIN}`);
    if (SERVER_IP && SERVER_IP !== '127.0.0.1') console.log(`📌 VPS IP:         ${SERVER_IP}`);
    console.log(`👉 Client Portal:  ${APP_URL}/`);
    console.log(`👉 Cho Thuê API:   ${APP_URL}/rental.html`);
    console.log(`👉 Admin Portal:   ${APP_URL}/admin.html`);
    console.log(`👉 Live Chat Desk: ${APP_URL}/livechat-admin.html`);
    console.log(`👉 Login Page:     ${APP_URL}/login.html`);
    console.log(`👉 Captcha API:    ${APP_URL}/api/v1/captcha/pricing`);
    console.log(`👉 Bank Webhook:   ${APP_URL}/api/webhook/bank`);
    console.log(`👉 Zalo Webhook:   ${APP_URL}/api/zalobot/webhook`);
    console.log(`👉 TG Webhook:     ${APP_URL}/api/telegram/webhook`);
    console.log(`👉 Health Check:   ${APP_URL}/api/health`);
    console.log(`👉 System Config:  ${APP_URL}/api/config`);
    console.log(`====================================================`);
  });
};

startServer();

module.exports = app;
