const axios = require('axios');
const QRCode = require('qrcode');

class ZaloPayService {
  constructor() {
    this.baseUrl = 'https://sapi.zalopay.vn';
    this.defaultCookie = (
      'has_device_id=0; zalo_id=3954786889234261929; zalopay_id=200109000031545; ' +
      'zalo_oauth=__fUYiV9p1YVrZd5wS-U4QRh3yMbuOaTu-HumP_pjMQNzJV5-kp46Os0SUJpcU4z-ffivhoaYIgCZdg7XOdu8UYL3FYKZ883qw51zkAdsZhQap7Stx3RVT_fIVYVYkDjiieX-DhIh2dAo4wisv_a39IaRioCe-npuRO9lBM5aNp9Y4ghpPFV1iBGThIfhj1h-EnDpvRrfXFa-I2iwu2P09UU3821ngnt-hWBYAsdcLgO-pFOkVYi7yhxBxpQd9y3nCaxff5opJAeP0sYnKZeIO19T_tDPE0yz5TLrAjdq0-NT3ISh8-Ppvk1MY3VnnWVA-gx_XlvNr8pwT-XNTTFQpp7gD0emI8MFBpCjLZKImPDig2p9jGBAcV7xveU; ' +
      'zlp_token=3ho1bwcou9Enzr5U1pTizWc32Cxv25DFG8i2bB5AxUxEakZ9wDgn8sswMMCDYxJwyx2sUoSY6dy1z8oQYxAu4VoBTWFrzsnXi2vfAMqefG9oef8CWvwiDnazTvKSKjTwCWuLLghGvvXFoVbGGsBVvL6MDMD7wbj2kNNwumUpgpTkR2SrA9VVw'
    );
  }

  _getHeaders(cookie, host = 'sapi.zalopay.vn') {
    return {
      'Host': host,
      'Cookie': cookie || this.defaultCookie,
      'Accept': '*/*',
      'Origin': 'https://social.zalopay.vn',
      'Referer': 'https://social.zalopay.vn/spa/v2',
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ZaloPayClient/8.29.2 OS/16.0.2 Platform/ios Secured/true ZaloPayWebClient/8.29.2',
      'Accept-Language': 'vi-VN,vi;q=0.9',
    };
  }

  /**
   * Verify login / session with ZaloPay via Cookie
   */
  async verifyLogin({ phone, password, cookie }) {
    try {
      const activeCookie = cookie || this.defaultCookie;
      const url = `${this.baseUrl}/v2/user/profile/kyc`;
      const response = await axios.get(url, { headers: this._getHeaders(activeCookie), timeout: 15000 });
      const data = response.data;

      if (data && (data.error === 0 || data.data?.display_name || data.data?.phone_number)) {
        return {
          success: true,
          accountName: data.data?.wrap_zalopay_name || data.data?.display_name || `Ví ZaloPay (${phone})`,
          sessionData: {
            cookie: activeCookie,
            zaloId: data.data?.zalo_id,
            zalopayId: data.data?.zalopay_id,
            phone: phone || data.data?.phone_number,
            profileLevel: data.data?.profile_level,
          },
          raw: data,
        };
      }

      return {
        success: false,
        message: data?.error_description || data?.message || 'Cookie ZaloPay không hợp lệ hoặc đã hết hạn',
        raw: data,
      };
    } catch (err) {
      return {
        success: false,
        message: 'Lỗi xác thực ZaloPay API: ' + (err.response?.data?.message || err.message),
        detail: err.response?.data,
      };
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(cookie) {
    try {
      const activeCookie = cookie || this.defaultCookie;
      const url = 'https://api.zalopay.vn/v2/user/balance';
      const response = await axios.get(url, { headers: this._getHeaders(activeCookie, 'api.zalopay.vn'), timeout: 10000 });
      const data = response.data;
      const balance = parseInt(data?.data?.balance || 0, 10);
      return {
        status: 'success',
        balance,
        formatted: balance.toLocaleString('vi-VN') + ' VND',
        raw: data,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi lấy số dư ví: ' + (err.response?.data?.message || err.message),
        balance: 0,
      };
    }
  }

  /**
   * Get user profile KYC
   */
  async getProfile(cookie) {
    try {
      const activeCookie = cookie || this.defaultCookie;
      const url = `${this.baseUrl}/v2/user/profile/kyc`;
      const response = await axios.get(url, { headers: this._getHeaders(activeCookie), timeout: 10000 });
      return {
        status: 'success',
        data: response.data?.data,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi lấy hồ sơ ZaloPay: ' + (err.response?.data?.message || err.message),
      };
    }
  }

  /**
   * Get incoming transactions and generate Resend QR Codes
   */
  async getIncomingTransactions(cookie, limit = 20) {
    try {
      const activeCookie = cookie || this.defaultCookie;
      const url = `${this.baseUrl}/v2/history/transactions?page_size=${limit}`;
      const response = await axios.get(url, { headers: this._getHeaders(activeCookie), timeout: 15000 });
      const raw = response.data;

      if (!raw || !raw.data || !raw.data.transactions) {
        return {
          status: 'error',
          message: raw?.message || 'Không thể lấy lịch sử giao dịch ZaloPay',
          incoming_transactions: [],
        };
      }

      const incomingList = [];
      const txs = raw.data.transactions;

      for (const tx of txs) {
        // Only successful incoming transactions (sign === 1 && status === 1)
        if (tx.sign !== 1 || tx.status_info?.status !== 1) {
          continue;
        }

        const transId = tx.trans_id;
        let detailData = tx;
        let senderName = '';
        let senderPhone = '';
        let orderNo = tx.app_trans_id || '';
        let resendLink = '';

        try {
          const detailUrl = `${this.baseUrl}/v2/history/transactions/${transId}?type=1`;
          const detailResp = await axios.get(detailUrl, { headers: this._getHeaders(activeCookie), timeout: 8000 });
          if (detailResp.data?.data?.transaction) {
            detailData = detailResp.data.data.transaction;
            orderNo = detailData.app_trans_id || orderNo;

            const customFields = detailData.template_info?.custom_fields || [];
            for (const f of customFields) {
              if (f.name?.includes('Người gửi')) senderName = f.value;
              if (f.name?.includes('Số điện thoại')) senderPhone = f.value;
              if (f.name?.includes('Mã đơn hàng') && !orderNo) orderNo = f.value;
            }

            const customButtons = detailData.template_info?.custom_buttons || [];
            for (const b of customButtons) {
              if (b.label?.includes('Chuyển lại') || b.link?.includes('resend')) {
                resendLink = b.link;
                break;
              }
            }
          }
        } catch (e) {
          // fallback to tx
        }

        const appDeeplink = orderNo
          ? `zalopay://launch/f/transfer?app_id=450&from_source=ctgd_p2p_resend&order_no=${orderNo}`
          : (resendLink.startsWith('zalopay://') ? resendLink : '');

        let webLink = '';
        if (resendLink && resendLink.includes('resend')) {
          webLink = resendLink.startsWith('http')
            ? resendLink
            : `https://social.zalopay.vn${resendLink.startsWith('/') ? '' : '/'}${resendLink}`;
        } else if (orderNo) {
          webLink = `https://social.zalopay.vn/chuyen-tien?app_id=450&from_source=ctgd_p2p_resend&order_no=${orderNo}`;
        }

        // Generate scan-ready Base64 QR Codes
        let qrAppUrl = '';
        let qrWebUrl = '';
        const targetLink = appDeeplink || webLink;

        if (targetLink) {
          try {
            qrAppUrl = await QRCode.toDataURL(appDeeplink || targetLink, {
              width: 320,
              margin: 2,
              color: {
                dark: '#0055ff', // ZaloPay Brand Blue
                light: '#ffffff',
              },
            });
          } catch (e) {
            qrAppUrl = '';
          }
        }

        if (webLink) {
          try {
            qrWebUrl = await QRCode.toDataURL(webLink, {
              width: 320,
              margin: 2,
              color: {
                dark: '#0068ff',
                light: '#ffffff',
              },
            });
          } catch (e) {
            qrWebUrl = '';
          }
        }

        const isP2P = !senderName.includes('Ví điện tử') && !senderName.includes('nạp tiền');

        incomingList.push({
          trans_id: transId,
          order_no: orderNo,
          sender_name: senderName || detailData.title?.replace('Nhận tiền từ ', '') || 'Khách hàng ZaloPay',
          sender_phone_masked: senderPhone || 'N/A',
          is_p2p: isP2P,
          can_resend: !!orderNo && isP2P,
          amount: parseInt(detailData.trans_amount || tx.trans_amount || 0, 10),
          formatted_amount: parseInt(detailData.trans_amount || tx.trans_amount || 0, 10).toLocaleString('vi-VN') + ' VND',
          message: detailData.description || tx.description || 'Không có lời nhắn',
          trans_time: detailData.trans_time || tx.trans_time || '',
          app_deeplink: appDeeplink,
          web_link: webLink,
          resend_link: appDeeplink || webLink,
          qr_code_base64: qrAppUrl,
          qr_code_web_base64: qrWebUrl,
        });
      }

      return {
        status: 'success',
        count: incomingList.length,
        incoming_transactions: incomingList,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi lấy giao dịch tiền đến: ' + (err.response?.data?.message || err.message),
        incoming_transactions: [],
      };
    }
  }

  /**
   * Create Deposit Flex QR / VietQR
   */
  async createDepositQR(cookie, { amount = 50000, message = 'NAPTIEN 7BANK' }) {
    try {
      const activeCookie = cookie || this.defaultCookie;
      const url = `${this.baseUrl}/v1/mt/flex-qrcode/generate`;
      const payload = {
        amount: parseInt(amount, 10),
        message,
        size: 250,
      };

      const headers = {
        ...this._getHeaders(activeCookie),
        'Content-Type': 'text/plain;charset=UTF-8',
        'Referer': 'https://social.zalopay.vn/spa/v2/qr-code',
      };

      const response = await axios.post(url, JSON.stringify(payload), { headers, timeout: 10000 });
      const data = response.data;

      let qrImage = data.qrcode || '';
      if (qrImage && !qrImage.startsWith('data:image')) {
        qrImage = `data:image/png;base64,${qrImage}`;
      }

      return {
        status: 'success',
        bank_name: data.bank_name || 'Ngân hàng Bản Việt (BVBank)',
        bank_number: data.bank_number || '',
        bank_holder_name: data.bank_holder_name || '',
        emvco_qrcode: data.emvco_qrcode || '',
        qr_image: qrImage,
        amount: parseInt(amount, 10),
        message,
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi tạo mã QR nạp tiền: ' + (err.response?.data?.message || err.message),
      };
    }
  }

  /**
   * Lookup recipient by phone number
   */
  async lookupRecipient(cookie, phone) {
    try {
      const activeCookie = cookie || this.defaultCookie;
      let cleanPhone = (phone || '').trim();
      if (cleanPhone.startsWith('+84')) cleanPhone = '84' + cleanPhone.slice(3);
      else if (cleanPhone.startsWith('0')) cleanPhone = '84' + cleanPhone.slice(1);
      else if (!cleanPhone.startsWith('84')) cleanPhone = '84' + cleanPhone;

      const url = `${this.baseUrl}/v3/ibft/web/get-user-info?phone=${cleanPhone}`;
      const response = await axios.get(url, { headers: this._getHeaders(activeCookie), timeout: 10000 });
      const data = response.data;

      if (data?.data) {
        return {
          status: 'success',
          name: data.data.name,
          avatar: data.data.avatar,
          phone: cleanPhone,
          zpp: data.data.zpp,
        };
      }

      return {
        status: 'error',
        message: data?.error?.details?.localized_message?.message || 'Không tìm thấy người nhận',
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi tra cứu người nhận: ' + (err.response?.data?.message || err.message),
      };
    }
  }

  /**
   * Generate Custom Transfer QR (for Resend or P2P Transfer with custom amount & message)
   */
  async generateCustomTransferQR({ orderNo, phone, amount, message }) {
    try {
      let deeplink = '';
      let webLink = '';

      const numAmount = parseInt(amount || 0, 10);
      const encodedMsg = encodeURIComponent(message || '');

      if (orderNo) {
        deeplink = `zalopay://launch/f/transfer?app_id=450&from_source=ctgd_p2p_resend&order_no=${orderNo}`;
        if (numAmount > 0) deeplink += `&amount=${numAmount}`;
        if (message) deeplink += `&message=${encodedMsg}`;

        webLink = `https://social.zalopay.vn/chuyen-tien?app_id=450&from_source=ctgd_p2p_resend&order_no=${orderNo}`;
        if (numAmount > 0) webLink += `&amount=${numAmount}`;
        if (message) webLink += `&message=${encodedMsg}`;
      } else if (phone) {
        let cleanPhone = (phone || '').trim();
        if (cleanPhone.startsWith('+84')) cleanPhone = '0' + cleanPhone.slice(3);
        else if (cleanPhone.startsWith('84')) cleanPhone = '0' + cleanPhone.slice(2);

        deeplink = `zalopay://launch/f/transfer?phone=${cleanPhone}`;
        if (numAmount > 0) deeplink += `&amount=${numAmount}`;
        if (message) deeplink += `&message=${encodedMsg}`;

        webLink = `https://social.zalopay.vn/chuyen-tien?phone=${cleanPhone}`;
        if (numAmount > 0) webLink += `&amount=${numAmount}`;
        if (message) webLink += `&message=${encodedMsg}`;
      } else {
        throw new Error('Cần cung cấp mã đơn hàng (orderNo) hoặc số điện thoại (phone)');
      }

      const qrCode = await QRCode.toDataURL(deeplink, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0055ff',
          light: '#ffffff',
        },
      });

      return {
        status: 'success',
        deeplink,
        web_link: webLink,
        qr_code_base64: qrCode,
        amount: numAmount,
        formatted_amount: numAmount > 0 ? numAmount.toLocaleString('vi-VN') + ' VND' : 'Tự nhập trên app',
        message: message || '',
      };
    } catch (err) {
      return {
        status: 'error',
        message: 'Lỗi tạo mã QR chuyển tiền: ' + err.message,
      };
    }
  }
}

module.exports = new ZaloPayService();
