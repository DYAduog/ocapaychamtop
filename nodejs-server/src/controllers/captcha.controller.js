const captchaRentalService = require('../services/captchaRental.service');

class CaptchaController {
  /**
   * API Giải Captcha chính thức (Có trừ tiền tài khoản theo API Key)
   * Tương thích với:
   *  - Chuẩn 7Bank: POST /api/v1/captcha/solve
   *  - Chuẩn ThueApiBank / Pay2World: POST /api/captcha
   */
  async solve(req, res) {
    try {
      const authHeader = req.headers['authorization'] || '';
      let apiKey = '';

      if (authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.slice(7).trim();
      } else if (req.headers['x-api-key']) {
        apiKey = String(req.headers['x-api-key']).trim();
      }

      const body = req.body || {};
      if (!apiKey) {
        apiKey = body.apikey || body.api_key || body.token || body.access_token || '';
      }

      const base64Image =
        body.image_base64 ||
        body.base64 ||
        body.image ||
        body.img_base64 ||
        body.img ||
        '';

      const bankType = body.type || body.bank || body.bank_type || 'general';

      const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';

      if (!base64Image) {
        return res.status(400).json({
          status: false,
          code: 400,
          message: 'Thiếu dữ liệu ảnh captcha (base64 hoặc image_base64).',
        });
      }

      const result = await captchaRentalService.solveForUser({
        apiKey,
        base64Image,
        bankType,
        clientIp,
        userAgent,
      });

      const httpCode = result.code >= 200 && result.code < 600 ? result.code : 200;
      return res.status(httpCode).json(result);
    } catch (err) {
      console.error('[CaptchaController:solve] Error:', err);
      return res.status(500).json({
        status: false,
        code: 500,
        message: 'Lỗi máy chủ nội bộ: ' + err.message,
      });
    }
  }

  /**
   * API Dùng thử miễn phí trực tiếp trên Website (Sandbox / Live Demo)
   */
  async demo(req, res) {
    try {
      const body = req.body || {};
      const base64Image =
        body.image_base64 ||
        body.base64 ||
        body.image ||
        body.img_base64 ||
        body.img ||
        '';
      const bankType = body.type || body.bank || 'general';

      const clientIp =
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const userAgent = req.headers['user-agent'] || '';

      if (!base64Image) {
        return res.status(400).json({
          status: false,
          code: 400,
          message: 'Vui lòng cung cấp ảnh Captcha để chạy thử nghiệm.',
        });
      }

      const result = await captchaRentalService.solveDemo({
        base64Image,
        bankType,
        clientIp,
        userAgent,
      });

      const httpCode = result.code >= 200 && result.code < 600 ? result.code : 200;
      return res.status(httpCode).json(result);
    } catch (err) {
      console.error('[CaptchaController:demo] Error:', err);
      return res.status(500).json({
        status: false,
        code: 500,
        message: 'Lỗi máy chủ giải demo: ' + err.message,
      });
    }
  }

  /**
   * Bảng giá và thông tin kỹ thuật API
   */
  async getPricing(req, res) {
    try {
      const price = await captchaRentalService.getPricePerRequest();
      return res.json({
        status: true,
        data: {
          serviceName: 'OcaPay AI Captcha Solver API',
          pricingModel: 'Pay-As-You-Go (Trừ tiền theo từng lượt giải thành công)',
          pricePerRequest: price,
          unit: 'VND / lượt giải thành công',
          failureRefundPolicy: '100% Hoàn tiền nếu nhận diện thất bại hoặc rỗng',
          supportedBanks: [
            { code: 'vcb', name: 'Vietcombank', type: 'Chữ số (1-9)', speed: '0.02s' },
            { code: 'mbbank', name: 'MBBank', type: 'Chữ hoa, thường, số (42 ký tự)', speed: '0.03s' },
            { code: 'bidv', name: 'BIDV', type: 'Chữ và số (33 ký tự)', speed: '0.03s' },
            { code: 'pgbank', name: 'PGBank', type: 'Chữ và số OCR', speed: '0.02s' },
            { code: 'viettel', name: 'ViettelPay / Viettel Money', type: 'Chữ và số (29 ký tự)', speed: '0.02s' },
            { code: 'msb', name: 'MSB DigiBank', type: 'Chữ số', speed: '0.03s' },
            { code: 'tpbank', name: 'TPBank', type: 'Chữ và số TPBank', speed: '0.02s' },
            { code: 'eximbank', name: 'Eximbank EDigi', type: 'Chữ và số', speed: '0.03s' },
            { code: 'general', name: 'Captcha Văn Bản Bất Kỳ', type: 'Deep Learning ONNX OCR', speed: '0.02s' },
          ],
          endpoint: '/api/v1/captcha/solve',
          compatibilityEndpoints: ['/api/captcha/solve', '/api/captcha'],
        },
      });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  }

  /**
   * Thống kê công khai hệ thống (Dùng cho widget trên Landing Page)
   */
  async getStats(req, res) {
    try {
      const stats = await captchaRentalService.getGlobalStats();
      return res.json({ status: true, data: stats });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  }

  /**
   * Lịch sử gọi API của người dùng (Cần token đăng nhập)
   */
  async getHistory(req, res) {
    try {
      const userId = req.user?._id || req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: false, message: 'Vui lòng đăng nhập' });
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const history = await captchaRentalService.getUserHistory(userId, limit);
      return res.json({ status: true, data: history });
    } catch (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
  }
}

module.exports = new CaptchaController();
