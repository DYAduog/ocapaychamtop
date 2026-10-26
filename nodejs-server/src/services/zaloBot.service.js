const axios = require('axios');
const crypto = require('crypto');
const Setting = require('../models/Setting');
const User = require('../models/User');

class ZaloBotService {
  constructor() {
    this.pollingActive = false;
    this.pollTimer = null;
    this.isPollingBusy = false;
    this.lastErrorTime = 0;
    this.defaultBaseUrl = 'https://bot-api.zaloplatforms.com';
  }

  /**
   * Lấy cấu hình Bot Zalo của hệ thống (ưu tiên Database Setting, fallback env)
   */
  async getSystemConfig() {
    let token = process.env.ZALO_BOT_TOKEN || '';
    let botName = process.env.ZALO_BOT_NAME || 'Bot OcaPay';
    let accountName = process.env.ZALO_BOT_ACCOUNT_NAME || 'bot.rHebLNRw';
    let botId = process.env.ZALO_BOT_ID || '12174189287904401';
    let deeplink = process.env.ZALO_BOT_DEEPLINK || 'https://zalo.me/3100879446097204368';

    try {
      const tokenSetting = await Setting.findOne({ name: 'zalo_bot_token' });
      if (tokenSetting && tokenSetting.value) {
        token = String(tokenSetting.value).trim();
      }
      const nameSetting = await Setting.findOne({ name: 'zalo_bot_name' });
      if (nameSetting && nameSetting.value) {
        botName = String(nameSetting.value).trim();
      }
      const accSetting = await Setting.findOne({ name: 'zalo_bot_account_name' });
      if (accSetting && accSetting.value) {
        accountName = String(accSetting.value).trim();
      }
      const idSetting = await Setting.findOne({ name: 'zalo_bot_id' });
      if (idSetting && idSetting.value) {
        botId = String(idSetting.value).trim();
      }
      const deepSetting = await Setting.findOne({ name: 'zalo_bot_deeplink' });
      if (deepSetting && deepSetting.value && deepSetting.value.trim()) {
        deeplink = String(deepSetting.value).trim();
      }
    } catch (_) {}

    return {
      botToken: token,
      botName,
      accountName,
      botId,
      deeplink,
    };
  }

  /**
   * Lấy Bot Token áp dụng cho một user (ưu tiên bot riêng của user nếu có, ngược lại dùng bot hệ thống)
   */
  async getBotTokenForUser(user) {
    if (user && user.zaloBotToken && user.zaloBotToken.trim()) {
      return user.zaloBotToken.trim();
    }
    const sys = await this.getSystemConfig();
    return sys.botToken || '';
  }

  /**
   * Kiểm tra Bot Token hợp lệ bằng Zalo getMe API
   */
  async getMe(botToken = null) {
    let cleanToken = (botToken || '').trim();
    if (!cleanToken) {
      const sys = await this.getSystemConfig();
      cleanToken = sys.botToken;
    }
    if (!cleanToken) throw new Error('Vui lòng cung cấp Zalo Bot Token');
    cleanToken = cleanToken.replace(/^bot/i, '');
    const url = `${this.defaultBaseUrl}/bot${cleanToken}/getMe`;

    try {
      const res = await axios.post(url, {}, { timeout: 10000 });
      if (res.data && res.data.ok) {
        return {
          success: true,
          bot: res.data.result, // { id, account_name, account_type, can_join_groups, display_name }
        };
      }
      return { success: false, error: res.data?.description || 'Không lấy được thông tin Zalo Bot' };
    } catch (err) {
      const msg = err.response?.data?.description || err.message;
      return { success: false, error: msg };
    }
  }

  /**
   * Định dạng văn bản phù hợp với Zalo HTML parser
   */
  formatZaloHtml(text) {
    if (!text) return '';
    // Chuyển đổi <code> thành <b> để hiển thị đậm rõ ràng trên app Zalo
    let formatted = String(text)
      .replace(/<code>(.*?)<\/code>/gi, '<b>$1</b>');
    return formatted;
  }

  /**
   * Gửi tin nhắn Zalo qua HTTP Bot API (sendMessage)
   */
  async sendMessage(botToken, chatId, text, options = {}) {
    if (!botToken || !chatId) {
      return { success: false, error: 'Thiếu Zalo Bot Token hoặc Chat ID' };
    }

    const cleanToken = botToken.trim().replace(/^bot/i, '');
    const url = `${this.defaultBaseUrl}/bot${cleanToken}/sendMessage`;
    const parseMode = options.parse_mode !== undefined ? options.parse_mode : 'html';
    const cleanText = parseMode === 'html' ? this.formatZaloHtml(text) : String(text);

    const payload = {
      chat_id: String(chatId).trim(),
      text: cleanText,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }

    try {
      const response = await axios.post(url, payload, { timeout: 10000 });

      if (response.data && response.data.ok) {
        return { success: true, result: response.data.result };
      }
      return { success: false, error: response.data?.description || 'Gửi tin nhắn Zalo thất bại' };
    } catch (err) {
      const errMsg = err.response?.data?.description || err.message;
      return { success: false, error: errMsg };
    }
  }

  /**
   * Tạo thông tin liên kết tài khoản cho người dùng
   */
  async generateLinkUrl(user) {
    const sys = await this.getSystemConfig();

    if (!sys.botToken) {
      throw new Error('Hệ thống chưa cấu hình Zalo Bot Token. Vui lòng liên hệ Admin để cấu hình!');
    }

    // Tự động kiểm tra và lưu lại accountName, botId nếu chưa có
    if (!sys.accountName || !sys.botId) {
      try {
        const meRes = await this.getMe(sys.botToken);
        if (meRes.success && meRes.bot) {
          if (meRes.bot.account_name) {
            sys.accountName = meRes.bot.account_name;
            await Setting.findOneAndUpdate(
              { name: 'zalo_bot_account_name' },
              { value: sys.accountName },
              { upsert: true }
            );
          }
          if (meRes.bot.id) {
            sys.botId = meRes.bot.id;
            await Setting.findOneAndUpdate(
              { name: 'zalo_bot_id' },
              { value: sys.botId },
              { upsert: true }
            );
          }
          if (meRes.bot.display_name) {
            sys.botName = meRes.bot.display_name;
            await Setting.findOneAndUpdate(
              { name: 'zalo_bot_name' },
              { value: sys.botName },
              { upsert: true }
            );
          }
        }
      } catch (_) {}
    }

    // Sinh mã liên kết ngẫu nhiên an toàn 8 ký tự (zb_xxxx)
    const linkCode = 'zb_' + crypto.randomBytes(4).toString('hex');
    user.zaloLinkCode = linkCode;
    await user.save();

    // URL mở trực tiếp cuộc trò chuyện trên Zalo
    const botAccountName = sys.accountName || 'bot.rHebLNRw';
    const botId = sys.botId || '12174189287904401';
    const configuredDeeplink = (sys.deeplink || '').trim();
    const directUrl = configuredDeeplink || `https://zalo.me/s/${botId}`;
    const directAccountUrl = `https://zalo.me/${botAccountName}`;

    return {
      botName: sys.botName || 'Bot OcaPay',
      botAccountName,
      botId,
      linkCode,
      zaloUrl: directUrl,
      deeplink: directUrl,
      directAccountUrl,
      syntaxGuide: `/start ${linkCode}`,
    };
  }

  /**
   * Hủy liên kết Zalo của người dùng
   */
  async unlinkUser(user) {
    const oldChatId = user.zaloChatId;
    const botToken = await this.getBotTokenForUser(user);

    user.zaloChatId = '';
    user.zaloDisplayName = '';
    user.zaloNotifyEnabled = false;
    user.zaloLinkCode = null;
    await user.save();

    // Gửi thông báo xác nhận hủy nếu có chatId cũ
    if (oldChatId && botToken) {
      this.sendMessage(
        botToken,
        oldChatId,
        `⚠️ <b>ĐÃ HỦY LIÊN KẾT ZALO</b>\n━━━━━━━━━━━━━━━━━━━━\nTài khoản <b>${user.username}</b> đã hủy liên kết với bot thông báo biến động số dư OcaPay trên website.`
      ).catch(() => {});
    }

    return { success: true, msg: 'Đã hủy liên kết Zalo thành công!' };
  }

  /**
   * Gửi tin nhắn test kiểm tra kết nối Zalo
   */
  async sendTestNotification(user, customToken = null, customChatId = null) {
    let token = customToken ? customToken.trim() : await this.getBotTokenForUser(user);
    let chatId = customChatId ? customChatId.trim() : (user.zaloChatId || '').trim();

    if (!token) {
      throw new Error('Chưa cấu hình Zalo Bot Token! Vui lòng liên hệ Admin hoặc nhập Bot Token riêng.');
    }
    if (!chatId) {
      throw new Error('Tài khoản chưa liên kết Zalo Chat ID! Vui lòng liên kết trước khi gửi test.');
    }

    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const formattedMoney = (user.money || 0).toLocaleString('vi-VN');

    const message = `🚀 <b>XÁC NHẬN KẾT NỐI ZALO THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Tài khoản:</b> <b>${user.username || 'Khách hàng'}</b>
💰 <b>Số dư hiện tại:</b> <b>${formattedMoney} đ</b>
🛡️ <b>Trạng thái:</b> 🟢 <b>Đã kích hoạt nhận thông báo 24/7</b>
⏱️ <b>Thời gian:</b> ${now}
⚡ <b>Cổng:</b> OcaPay Quantum FinTech Gateway
━━━━━━━━━━━━━━━━━━━━
✨ <i>Tuyệt vời! Kể từ bây giờ, mỗi khi tài khoản của bạn có biến động số dư hoặc nạp tiền thành công, bot sẽ tự động gửi thông báo tức thì về Zalo này!</i>`;

    const res = await this.sendMessage(token, chatId, message);
    if (!res.success) {
      throw new Error(`Zalo API lỗi: ${res.error}`);
    }
    return res;
  }

  /**
   * Gửi thông báo biến động số dư (nạp tiền / trừ tiền) qua Zalo
   */
  async sendBalanceChangeNotification(user, data = {}) {
    if (!user || !user.zaloNotifyEnabled || !user.zaloChatId) {
      return { skipped: true };
    }

    const token = await this.getBotTokenForUser(user);
    const chatId = (user.zaloChatId || '').trim();
    if (!token || !chatId) {
      return { skipped: true, reason: 'Chưa có token hoặc chat ID' };
    }

    const {
      amount = 0,
      type = 'IN', // 'IN' hoặc 'OUT'
      bank = 'OcaPay',
      balanceBefore = 0,
      balanceAfter = 0,
      content = '',
      txId = '',
      time = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    } = data;

    const isCredit = type === 'IN';
    const icon = isCredit ? '🟢' : '🔴';
    const sign = isCredit ? '+' : '-';
    const formattedAmount = Number(amount).toLocaleString('vi-VN');
    const formattedBalance = Number(balanceAfter).toLocaleString('vi-VN');

    const message = `${icon} <b>THÔNG BÁO BIẾN ĐỘNG SỐ DƯ OCAPAY</b>
━━━━━━━━━━━━━━━━━━━━
💵 <b>Số tiền:</b> <b>${sign}${formattedAmount} đ</b>
🏦 <b>Cổng ngân hàng:</b> <b>${bank.toUpperCase()}</b>
${content ? `📝 <b>Nội dung:</b> <i>${content}</i>\n` : ''}${txId ? `🔢 <b>Mã giao dịch:</b> <b>${txId}</b>\n` : ''}💰 <b>Số dư mới:</b> <b>${formattedBalance} đ</b>
⏱️ <b>Thời gian:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
⚡ <i>Hệ thống tự động OcaPay Webhook Realtime</i>`;

    return await this.sendMessage(token, chatId, message);
  }

  /**
   * Bắn thông báo tin nhắn Live Chat của khách hàng tới Zalo Admin tức thì
   */
  async sendLiveChatAdminAlert(senderName, messageText, pageUrl, ip) {
    const sys = await this.getSystemConfig();
    if (!sys.botToken) return { success: false, error: 'Chưa có botToken' };

    try {
      const adminUser = await User.findOne({
        $or: [
          { isAdmin: true },
          { level: 'admin' },
          { level: '1' },
          { email: 'duongle26.1025@gmail.com' },
        ],
        zaloChatId: { $exists: true, $ne: '' },
      });

      const chatId = adminUser?.zaloChatId || process.env.ZALO_ADMIN_CHAT_ID;
      if (!chatId) {
        return { success: true, pushed: false };
      }

      const html = `💬 <b>[TIN NHẮN LIVE CHAT MỚI]</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Người gửi:</b> ${escapeHtml(senderName || 'Khách hàng')}
📄 <b>Trang:</b> <b>${escapeHtml(pageUrl || '/')}</b>
🌐 <b>IP:</b> <b>${escapeHtml(ip || '127.0.0.1')}</b>
💬 <b>Nội dung:</b>
<i>"${escapeHtml(messageText)}"</i>
⏰ <b>Thời gian:</b> ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}
━━━━━━━━━━━━━━━━━━━━
⚡ <i>OcaPay Realtime Web Desk</i>`;

      const sendRes = await this.sendMessage(sys.botToken, chatId, html);
      return { success: true, pushed: sendRes.success };
    } catch (err) {
      console.error('[LiveChat:ZaloBot] Lỗi gửi thông báo:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Bắn thông báo Ticket hỗ trợ khách hàng mới tới Zalo Admin
   */
  async sendSupportTicketAlert(ticketData = {}) {
    const sys = await this.getSystemConfig();
    if (!sys.botToken) return { success: false, error: 'Chưa có botToken' };

    try {
      const adminUsers = await User.find({
        $or: [{ level: 'admin' }, { level: '1' }, { isAdmin: true }],
        zaloChatId: { $exists: true, $ne: '' },
      }).limit(5);

      const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const { username, category, contact, content } = ticketData;

      const message = `🆘 <b>YÊU CẦU HỖ TRỢ KHÁCH HÀNG MỚI (TICKET 24/7)</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khách hàng:</b> <b>${username || 'Khách vãng lai'}</b>
📌 <b>Vấn đề:</b> <b>${category || 'Kỹ thuật'}</b>
📞 <b>Kênh liên hệ:</b> <b>${contact || 'Không có'}</b>
⏰ <b>Thời gian:</b> ${timeStr}
━━━━━━━━━━━━━━━━━━━━
💬 <b>Nội dung chi tiết:</b>
<i>${content || '(Không có nội dung)'}</i>
━━━━━━━━━━━━━━━━━━━━
⚡ <i>OcaPay Support System - Vui lòng phản hồi sớm cho khách hàng!</i>`;

      for (const admin of adminUsers) {
        if (admin.zaloChatId) {
          this.sendMessage(sys.botToken, admin.zaloChatId, message).catch(() => {});
        }
      }
      return { success: true };
    } catch (err) {
      console.warn('[SupportTicket:ZaloBot] Lỗi thông báo:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Khởi động cơ chế Polling nhận tin nhắn tự động từ Zalo Bot
   */
  async startBot() {
    return this.startPolling();
  }

  async startPolling() {
    if (this.pollingActive) return;

    const sys = await this.getSystemConfig();
    if (!sys.botToken) {
      console.log('[ZaloBot] ⚠️ Chưa cấu hình Zalo Bot Token, tạm dừng Polling.');
      return;
    }

    this.pollingActive = true;
    console.log(`[ZaloBot] 🤖 Đang khởi động Zalo Bot Polling (${sys.botName || 'Bot OcaPay'} - @${sys.accountName || 'bot.rHebLNRw'})...`);

    const pollLoop = async () => {
      if (!this.pollingActive) return;
      try {
        await this.pollOnce();
      } catch (err) {
        // Tránh flood log khi timeout
        const now = Date.now();
        if (now - this.lastErrorTime > 30000) {
          console.warn('[ZaloBot] Polling notice:', err.message || err);
          this.lastErrorTime = now;
        }
      } finally {
        if (this.pollingActive) {
          this.pollTimer = setTimeout(pollLoop, 2000);
        }
      }
    };

    pollLoop();
  }

  /**
   * Dừng Polling (khi Admin đổi token hoặc tắt server)
   */
  stopPolling() {
    this.pollingActive = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[ZaloBot] ⏹️ Đã dừng Zalo Bot Polling.');
  }

  /**
   * Gọi getUpdates một lần để xử lý tin nhắn mới
   */
  async pollOnce() {
    if (this.isPollingBusy) return;
    this.isPollingBusy = true;

    try {
      const sys = await this.getSystemConfig();
      if (!sys.botToken) return;

      const cleanToken = sys.botToken.trim().replace(/^bot/i, '');
      const url = `${this.defaultBaseUrl}/bot${cleanToken}/getUpdates`;

      // Timeout 15s cho mỗi chu kỳ long poll
      const res = await axios.post(url, { timeout: 15 }, { timeout: 20000 });

      if (res.data && res.data.ok && res.data.result) {
        const update = res.data.result;
        await this.handleIncomingUpdate(update, cleanToken);
      }
    } catch (err) {
      // 408 Request Timeout là bình thường với long polling khi không có tin nhắn mới
      if (err.response?.status !== 408 && err.response?.data?.error_code !== 408) {
        throw err;
      }
    } finally {
      this.isPollingBusy = false;
    }
  }

  /**
   * Xử lý một Update gửi đến Bot (từ Polling hoặc Webhook)
   */
  async handleIncomingUpdate(update, botToken) {
    if (!update) return;

    // Cấu trúc Zalo Bot: { event_name: 'message.text.received', message: { ... } }
    const eventName = update.event_name;
    const msg = update.message;

    if (!msg) return;

    if (eventName === 'message.text.received' || msg.message_type === 'CHAT_TEXT' || msg.text) {
      await this.handleIncomingMessage(msg, botToken);
    }
  }

  /**
   * Xử lý tin nhắn văn bản từ người dùng
   */
  async handleIncomingMessage(msg, botToken) {
    const text = (msg.text || '').trim();
    const chatId = msg.chat?.id || msg.from?.id;
    const fromName = msg.from?.display_name || msg.from?.id || 'Quý khách';

    if (!chatId || !text) return;

    // 1. Lệnh: /start <code> hoặc liên kết tài khoản
    // Chấp nhận: /start zb_xxx, start zb_xxx, lienket zb_xxx, hoặc chỉ gửi mã zb_xxxx
    const linkMatch = text.match(/^(?:\/start|start|lienket|lk)?\s*(zb_[a-zA-Z0-9_-]+)/i);
    const bareStartMatch = text.match(/^\/start$/i) || text.match(/^start$/i);

    if (linkMatch) {
      const linkCode = linkMatch[1].trim();
      const user = await User.findOne({
        $or: [
          { zaloLinkCode: linkCode },
          { token: linkCode },
        ],
      });

      if (user) {
        user.zaloChatId = String(chatId);
        user.zaloDisplayName = fromName;
        user.zaloNotifyEnabled = true;
        user.zaloLinkCode = null; // Xóa mã sau khi liên kết thành công
        await user.save();

        console.log(`[ZaloBot] 🎉 Đã liên kết Zalo thành công cho user [${user.username}] với Chat ID: [${chatId}] (${fromName})!`);

        const welcomeMsg = `🎉 <b>LIÊN KẾT TÀI KHOẢN OCAPAY THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Tài khoản OcaPay:</b> <b>${user.username}</b>
👤 <b>Người dùng Zalo:</b> <b>${fromName}</b>
💰 <b>Số dư ví:</b> <b>${Number(user.money || 0).toLocaleString('vi-VN')} đ</b>
🛡️ <b>Trạng thái:</b> 🟢 <b>Đã kích hoạt thông báo biến động 24/7</b>
━━━━━━━━━━━━━━━━━━━━
✨ <i>Kể từ bây giờ, mỗi khi có biến động số dư hoặc nạp tiền thành công, bạn sẽ nhận được thông báo biến động số dư tức thì ngay trên Zalo này!</i>

💡 <i>Một số lệnh hữu ích:</i>
• <b>/sodu</b> : Kiểm tra số dư tài khoản
• <b>/id</b> : Xem Zalo Chat ID của bạn
• <b>/unlink</b> : Hủy liên kết với bot`;

        await this.sendMessage(botToken, chatId, welcomeMsg);
        return;
      } else {
        await this.sendMessage(
          botToken,
          chatId,
          `⚠️ <b>Mã liên kết không hợp lệ hoặc đã hết hạn!</b>\nVui lòng quay lại website OcaPay > <b>Hồ sơ cá nhân</b> và bấm <b>[Liên Kết Ngay Với Zalo]</b> để tạo mã mới.`
        );
        return;
      }
    }

    if (bareStartMatch) {
      await this.sendMessage(
        botToken,
        chatId,
        `👋 <b>Xin chào ${escapeHtml(fromName)}!</b>

Đây là <b>Bot Thông Báo Biến Động Số Dư Tự Động OcaPay</b> qua Zalo.

👉 Để nhận thông báo biến động số dư:
1. Đăng nhập vào website OcaPay
2. Vào mục <b>Hồ Sơ Cá Nhân</b>
3. Bấm nút <b>[Liên Kết Ngay Với Zalo]</b> và gửi mã liên kết vào đây!

💡 Hoặc gõ <b>/help</b> để xem danh sách lệnh hỗ trợ.`
      );
      return;
    }

    // 2. Lệnh: /sodu hoặc /balance (Kiểm tra số dư tài khoản)
    if (/^\/(sodu|balance|tien)/i.test(text) || text.toLowerCase() === 'số dư') {
      const user = await User.findOne({ zaloChatId: String(chatId) });
      if (user) {
        const moneyFormatted = Number(user.money || 0).toLocaleString('vi-VN');
        const totalFormatted = Number(user.totalMoney || 0).toLocaleString('vi-VN');
        const planText = user.plan || 'Starter';

        const balMsg = `💳 <b>THÔNG TIN SỐ DƯ TÀI KHOẢN</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Tài khoản:</b> <b>${user.username}</b>
💰 <b>Số dư khả dụng:</b> <b>${moneyFormatted} đ</b>
📊 <b>Tổng tiền đã nạp:</b> <b>${totalFormatted} đ</b>
🏷️ <b>Gói dịch vụ:</b> <b>${planText.toUpperCase()}</b>
🛡️ <b>Trạng thái thông báo:</b> ${user.zaloNotifyEnabled ? '🟢 Đang bật' : '🔴 Đang tắt'}
━━━━━━━━━━━━━━━━━━━━
⚡ <i>Cổng thanh toán tự động OcaPay Gateway</i>`;
        await this.sendMessage(botToken, chatId, balMsg);
      } else {
        await this.sendMessage(
          botToken,
          chatId,
          `ℹ️ <b>Tài khoản Zalo này chưa được liên kết với OcaPay!</b>\nVui lòng đăng nhập website > <b>Hồ Sơ Cá Nhân</b> > Bấm <b>[Liên Kết Ngay Với Zalo]</b>.`
        );
      }
      return;
    }

    // 3. Lệnh: /unlink hoặc /huy (Hủy liên kết)
    if (/^\/(unlink|huy|cancel)/i.test(text) || text.toLowerCase() === 'hủy liên kết') {
      const user = await User.findOne({ zaloChatId: String(chatId) });
      if (user) {
        user.zaloChatId = '';
        user.zaloDisplayName = '';
        user.zaloNotifyEnabled = false;
        await user.save();

        await this.sendMessage(
          botToken,
          chatId,
          `❌ <b>ĐÃ HỦY LIÊN KẾT THÀNH CÔNG!</b>\nTài khoản <b>${user.username}</b> đã ngắt kết nối với Bot Zalo.`
        );
      } else {
        await this.sendMessage(botToken, chatId, `ℹ️ Bạn chưa liên kết tài khoản nào với bot này.`);
      }
      return;
    }

    // 4. Lệnh: /id (Xem Chat ID)
    if (/^\/(id|myid|info)/i.test(text)) {
      await this.sendMessage(
        botToken,
        chatId,
        `🆔 <b>Zalo Chat ID của bạn là:</b> <b>${chatId}</b>\n👤 <b>Tên hiển thị:</b> <b>${fromName}</b>`
      );
      return;
    }

    // 5. Lệnh: /help hoặc trợ giúp
    if (/^\/(help|trogiup|huongdan)/i.test(text) || text.toLowerCase() === 'menu' || text.toLowerCase() === 'help') {
      await this.sendMessage(
        botToken,
        chatId,
        `🤖 <b>DANH SÁCH LỆNH BOT OCAPAY</b>
━━━━━━━━━━━━━━━━━━━━
• <b>/start [mã]</b> : Kích hoạt & liên kết tài khoản với mã từ website
• <b>/sodu</b> : Tra cứu số dư ví OcaPay hiện tại
• <b>/id</b> : Lấy Zalo Chat ID của bạn
• <b>/unlink</b> : Hủy liên kết nhận thông báo
• <b>/help</b> : Hiển thị bảng trợ giúp này
━━━━━━━━━━━━━━━━━━━━
📞 Hỗ trợ kỹ thuật 24/7 qua cổng OcaPay Support!`
      );
      return;
    }

    // Phản hồi mặc định nếu chưa hiểu lệnh
    const linkedUser = await User.findOne({ zaloChatId: String(chatId) });
    if (linkedUser) {
      await this.sendMessage(
        botToken,
        chatId,
        `Xin chào <b>${linkedUser.username}</b>! Bạn có thể gửi lệnh <b>/sodu</b> để kiểm tra ví hoặc <b>/help</b> để xem hướng dẫn.`
      );
    } else {
      await this.sendMessage(
        botToken,
        chatId,
        `👋 Chào bạn! Đây là Bot OcaPay. Để liên kết nhận thông báo biến động số dư, vui lòng vào website OcaPay > <b>Hồ sơ</b> > <b>Liên kết Zalo</b> rồi gửi mã vào đây.`
      );
    }
  }

  /**
   * Xử lý webhook trực tiếp từ Zalo nếu máy chủ được cấu hình webhook
   */
  async handleWebhookPayload(body, secretHeader) {
    if (!body) return { success: false, error: 'Thiếu update payload' };
    const sys = await this.getSystemConfig();
    const cleanToken = (sys.botToken || '').trim().replace(/^bot/i, '');
    if (!cleanToken) return { success: false, error: 'Chưa cấu hình Zalo Bot Token' };

    // Hỗ trợ linh hoạt cả payload là mảng updates hoặc object đơn lẻ
    if (Array.isArray(body)) {
      for (const item of body) {
        await this.handleIncomingUpdate(item, cleanToken);
      }
    } else if (body.result && Array.isArray(body.result)) {
      for (const item of body.result) {
        await this.handleIncomingUpdate(item, cleanToken);
      }
    } else if (body.result && typeof body.result === 'object') {
      await this.handleIncomingUpdate(body.result, cleanToken);
    } else if (body.message) {
      await this.handleIncomingUpdate(body, cleanToken);
    } else if (body.text) {
      await this.handleIncomingMessage(body, cleanToken);
    } else {
      await this.handleIncomingUpdate(body, cleanToken);
    }
    return { success: true };
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = new ZaloBotService();
