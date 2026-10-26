const axios = require('axios');
const crypto = require('crypto');
const Setting = require('../models/Setting');
const User = require('../models/User');

class TelegramService {
  constructor() {
    this.pollingActive = false;
    this.lastUpdateId = 0;
    this.pollTimer = null;
  }

  /**
   * Lấy cấu hình Bot Telegram của hệ thống (ưu tiên Database Setting, fallback env)
   */
  async getSystemConfig() {
    let token = process.env.TELEGRAM_BOT_TOKEN || '';
    let username = process.env.TELEGRAM_BOT_USERNAME || '';

    try {
      const tokenSetting = await Setting.findOne({ name: 'telegram_bot_token' });
      if (tokenSetting && tokenSetting.value) {
        token = String(tokenSetting.value).trim();
      }
      const userSetting = await Setting.findOne({ name: 'telegram_bot_username' });
      if (userSetting && userSetting.value) {
        username = String(userSetting.value).trim().replace(/^@/, '');
      }
    } catch (_) {}

    return {
      botToken: token,
      botUsername: username,
    };
  }

  /**
   * Lấy Bot Token áp dụng cho một user (ưu tiên bot riêng của user nếu có, ngược lại dùng bot hệ thống)
   */
  async getBotTokenForUser(user) {
    if (user && user.telegramBotToken && user.telegramBotToken.trim()) {
      return user.telegramBotToken.trim();
    }
    const sys = await this.getSystemConfig();
    return sys.botToken || '';
  }

  /**
   * Kiểm tra Bot Token hợp lệ bằng Telegram getMe API
   */
  async getMe(botToken) {
    if (!botToken) throw new Error('Vui lòng cung cấp Bot Token');
    const cleanToken = botToken.trim().replace(/^bot/i, '');
    const url = `https://api.telegram.org/bot${cleanToken}/getMe`;

    try {
      const res = await axios.get(url, { timeout: 8000 });
      if (res.data && res.data.ok) {
        return {
          success: true,
          bot: res.data.result, // { id, is_bot, first_name, username }
        };
      }
      return { success: false, error: res.data?.description || 'Không lấy được thông tin bot' };
    } catch (err) {
      const msg = err.response?.data?.description || err.message;
      return { success: false, error: msg };
    }
  }

  /**
   * Gửi tin nhắn Telegram qua HTTP Bot API (hỗ trợ tự động retry khi mạng chập chờn)
   */
  async sendMessage(botToken, chatId, htmlText, retries = 2) {
    if (!botToken || !chatId) {
      return { success: false, error: 'Thiếu Telegram Bot Token hoặc Chat ID' };
    }

    const cleanToken = botToken.trim().replace(/^bot/i, '');
    const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await axios.post(
          url,
          {
            chat_id: String(chatId).trim(),
            text: htmlText,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          },
          {
            timeout: 10000,
            headers: { 'Connection': 'keep-alive' },
          }
        );

        if (response.data && response.data.ok) {
          return { success: true, result: response.data.result };
        }
        return { success: false, error: response.data?.description || 'Gửi tin nhắn thất bại' };
      } catch (err) {
        const errMsg = err.response?.data?.description || err.message;
        const isNetworkErr = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND';
        if (attempt < retries && isNetworkErr) {
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        return { success: false, error: errMsg };
      }
    }
  }

  /**
   * Tạo đường dẫn Deep Link (https://t.me/bot?start=code) để người dùng bấm vào là liên kết ngay
   */
  async generateLinkUrl(user) {
    const sys = await this.getSystemConfig();
    let botUsername = sys.botUsername;

    // Nếu chưa có botUsername nhưng có botToken, tự động lấy username từ getMe
    if (!botUsername && sys.botToken) {
      try {
        const meRes = await this.getMe(sys.botToken);
        if (meRes.success && meRes.bot && meRes.bot.username) {
          botUsername = meRes.bot.username;
          await Setting.findOneAndUpdate(
            { name: 'telegram_bot_username' },
            { value: botUsername },
            { upsert: true }
          );
        }
      } catch (_) {}
    }

    if (!botUsername) {
      throw new Error('Hệ thống chưa cấu hình Telegram Bot. Vui lòng liên hệ Admin cấu hình Bot Token trong Trang Quản Trị!');
    }

    // Sinh mã liên kết ngẫu nhiên an toàn 8 ký tự
    const linkCode = '7b_' + crypto.randomBytes(4).toString('hex');
    user.telegramLinkCode = linkCode;
    await user.save();

    const telegramUrl = `https://t.me/${botUsername}?start=${linkCode}`;

    return {
      botUsername,
      linkCode,
      telegramUrl,
    };
  }

  /**
   * Hủy liên kết Telegram của người dùng
   */
  async unlinkUser(user) {
    const oldChatId = user.telegramChatId;
    const botToken = await this.getBotTokenForUser(user);

    user.telegramChatId = '';
    user.telegramUsername = '';
    user.telegramNotifyEnabled = false;
    user.telegramLinkCode = null;
    await user.save();

    // Gửi thông báo xác nhận hủy nếu có chatId cũ
    if (oldChatId && botToken) {
      this.sendMessage(
        botToken,
        oldChatId,
        `⚠️ <b>ĐÃ HỦY LIÊN KẾT TELEGRAM</b>\n━━━━━━━━━━━━━━━━━━━━\nTài khoản <b>${user.username}</b> đã hủy liên kết với bot thông báo biến động số dư 7Bank trên website.`
      ).catch(() => {});
    }

    return { success: true, msg: 'Đã hủy liên kết Telegram thành công!' };
  }

  /**
   * Gửi tin nhắn test kiểm tra kết nối
   */
  async sendTestNotification(user, customToken = null, customChatId = null) {
    let token = customToken ? customToken.trim() : await this.getBotTokenForUser(user);
    let chatId = customChatId ? customChatId.trim() : (user.telegramChatId || '').trim();

    if (!token) {
      throw new Error('Chưa cấu hình Telegram Bot Token! Vui lòng liên kết với Bot hệ thống hoặc nhập Bot Token riêng.');
    }
    if (!chatId) {
      throw new Error('Tài khoản chưa liên kết Telegram Chat ID! Vui lòng bấm [Liên Kết Ngay] trước khi gửi test.');
    }

    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const formattedMoney = (user.money || 0).toLocaleString('vi-VN');

    const message = `🚀 <b>XÁC NHẬN KẾT NỐI TELEGRAM THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Tài khoản:</b> <code>${user.username || 'Khách hàng'}</code>
💰 <b>Số dư hiện tại:</b> <code>${formattedMoney} đ</code>
🛡️ <b>Trạng thái:</b> 🟢 <b>Đã kích hoạt nhận thông báo 24/7</b>
⏱️ <b>Thời gian:</b> ${now}
⚡ <b>Cổng:</b> OcaPay Quantum FinTech Gateway
━━━━━━━━━━━━━━━━━━━━
✨ <i>Tuyệt vời! Kể từ bây giờ, mỗi khi tài khoản của bạn có biến động số dư hoặc nạp tiền thành công, bot sẽ tự động gửi thông báo tức thì về đây!</i>`;

    const res = await this.sendMessage(token, chatId, message);
    if (!res.success) {
      throw new Error(`Telegram API lỗi: ${res.error}`);
    }
    return res;
  }

  /**
   * Gửi thông báo biến động số dư (nạp tiền / trừ tiền)
   */
  async sendBalanceChangeNotification(user, data = {}) {
    if (!user || !user.telegramNotifyEnabled || !user.telegramChatId) {
      return { skipped: true };
    }

    const token = await this.getBotTokenForUser(user);
    const chatId = (user.telegramChatId || '').trim();
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
💵 <b>Số tiền:</b> <code>${sign}${formattedAmount} đ</code>
🏦 <b>Cổng ngân hàng:</b> <b>${bank.toUpperCase()}</b>
${content ? `📝 <b>Nội dung:</b> <i>${content}</i>\n` : ''}${txId ? `🔢 <b>Mã giao dịch:</b> <code>${txId}</code>\n` : ''}💰 <b>Số dư mới:</b> <code>${formattedBalance} đ</code>
⏱️ <b>Thời gian:</b> ${time}
━━━━━━━━━━━━━━━━━━━━
⚡ <i>Hệ thống tự động OcaPay Webhook Realtime</i>`;

    return await this.sendMessage(token, chatId, message);
  }

  /**
   * Khởi động cơ chế Polling nhận tin nhắn tự động từ Telegram Bot (Tự động liên kết khi bấm /start)
   */
  async startPolling() {
    if (this.pollingActive) return;

    const sys = await this.getSystemConfig();
    if (!sys.botToken) {
      console.log('[TelegramBot] ⚠️ Chưa cấu hình Telegram Bot Token trong Admin, tạm dừng Polling.');
      return;
    }

    this.pollingActive = true;
    console.log(`[TelegramBot] 🤖 Đang khởi động Bot Telegram Polling (@${sys.botUsername || 'SystemBot'})...`);

    // Chạy vòng lặp lấy update định kỳ 2.5s
    const pollLoop = async () => {
      if (!this.pollingActive) return;
      try {
        await this.pollOnce();
      } catch (err) {
        // Im lặng các lỗi mạng thông thường để không làm loãng log
      } finally {
        if (this.pollingActive) {
          this.pollTimer = setTimeout(pollLoop, 2500);
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
    console.log('[TelegramBot] ⏹️ Đã dừng Telegram Bot Polling.');
  }

  /**
   * Gọi getUpdates một lần để xử lý các tin nhắn mới
   */
  async pollOnce() {
    const sys = await this.getSystemConfig();
    if (!sys.botToken) return;

    const cleanToken = sys.botToken.trim().replace(/^bot/i, '');
    const url = `https://api.telegram.org/bot${cleanToken}/getUpdates`;

    const params = {
      offset: this.lastUpdateId > 0 ? this.lastUpdateId + 1 : 0,
      timeout: 2,
      limit: 10,
    };

    const res = await axios.get(url, { params, timeout: 6000 });
    if (!res.data || !res.data.ok || !Array.isArray(res.data.result)) {
      return;
    }

    const updates = res.data.result;
    for (const update of updates) {
      this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
      await this.handleIncomingUpdate(update, cleanToken);
    }
  }

  /**
   * Xử lý một Update gửi đến Bot
   */
  async handleIncomingUpdate(update, botToken) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const text = msg.text.trim();
    const chatId = msg.chat?.id;
    const fromUser = msg.from?.username || msg.from?.first_name || '';

    // 1. Xử lý lệnh: /start <code>
    const startMatch = text.match(/^\/start(?:\s+([a-zA-Z0-9_\-\.]+))?/i);
    if (startMatch) {
      const payload = startMatch[1] ? startMatch[1].trim() : '';

      if (payload) {
        // Tìm User khớp với payload (linkCode hoặc token)
        const user = await User.findOne({
          $or: [
            { telegramLinkCode: payload },
            { token: payload },
          ],
        });

        if (user) {
          user.telegramChatId = String(chatId);
          user.telegramUsername = fromUser;
          user.telegramNotifyEnabled = true;
          user.telegramLinkCode = null; // xóa mã sau khi liên kết
          await user.save();

          console.log(`[TelegramBot] 🎉 Đã tự động liên kết thành công user [${user.username}] với Telegram Chat ID: [${chatId}] (@${fromUser})!`);

          const welcomeMsg = `🎉 <b>LIÊN KẾT TÀI KHOẢN THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Tài khoản OcaPay:</b> <code>${user.username}</code>
💰 <b>Số dư ví:</b> <code>${Number(user.money || 0).toLocaleString('vi-VN')} đ</code>
🛡️ <b>Trạng thái:</b> 🟢 <b>Đã kích hoạt thông báo biến động 24/7</b>
━━━━━━━━━━━━━━━━━━━━
✨ <i>Kể từ bây giờ, mỗi khi phát sinh giao dịch hoặc nạp tiền thành công, bạn sẽ nhận được thông báo biến động số dư tức thì tại đây!</i>

💡 <i>Nếu muốn hủy liên kết sau này, bạn có thể gửi lệnh <code>/unlink</code> hoặc thao tác trên trang Hồ sơ cá nhân.</i>`;

          await this.sendMessage(botToken, chatId, welcomeMsg);
          return;
        } else {
          await this.sendMessage(
            botToken,
            chatId,
            `⚠️ <b>Mã liên kết không hợp lệ hoặc đã hết hạn!</b>\nVui lòng quay lại website OcaPay > <b>Hồ sơ cá nhân</b> và bấm <b>[Liên Kết Ngay Với Telegram]</b> để tạo mã mới.`
          );
          return;
        }
      }

      // /start không kèm mã -> Hướng dẫn
      await this.sendMessage(
        botToken,
        chatId,
        `👋 <b>Xin chào ${escapeHtml(fromUser || 'bạn')}!</b>\n\nĐây là Bot thông báo biến động số dư tự động của hệ thống <b>OcaPay FinTech Quantum Gateway</b>.\n\n👉 Để nhận thông báo biến động số dư, vui lòng đăng nhập vào website OcaPay > vào mục <b>Hồ Sơ Cá Nhân</b> > bấm nút <b>[Liên Kết Ngay Với Telegram]</b>!`
      );
      return;
    }

    // 2. Xử lý lệnh: /unlink hoặc /huy
    if (/^\/(unlink|huy|cancel)/i.test(text)) {
      const user = await User.findOne({ telegramChatId: String(chatId) });
      if (user) {
        user.telegramChatId = '';
        user.telegramUsername = '';
        user.telegramNotifyEnabled = false;
        await user.save();

        await this.sendMessage(
          botToken,
          chatId,
          `❌ <b>ĐÃ HỦY LIÊN KẾT THÀNH CÔNG!</b>\nTài khoản <b>${user.username}</b> đã được ngắt kết nối với bot Telegram.`
        );
      } else {
        await this.sendMessage(botToken, chatId, `ℹ️ Bạn chưa liên kết tài khoản nào với bot này.`);
      }
      return;
    }

    // 3. Xử lý lệnh: /id (Xem ID của chat)
    if (/^\/(id|myid|info)/i.test(text)) {
      await this.sendMessage(
        botToken,
        chatId,
        `🆔 <b>Telegram Chat ID của bạn là:</b> <code>${chatId}</code>`
      );
      return;
    }
  }

  /**
   * Bắn thông báo tin nhắn Live Chat của khách hàng tới Telegram Admin tức thì
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
          { email: 'duongle26.1025@gmail.com' }
        ],
        telegramChatId: { $exists: true, $ne: '' }
      });

      const chatId = adminUser?.telegramChatId || process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (!chatId) {
        console.log(`[LiveChat] Đã nhận tin nhắn từ "${senderName}": ${messageText} (Admin chưa liên kết telegramChatId)`);
        return { success: true, pushed: false };
      }

      const html = `💬 <b>[TIN NHẮN LIVE CHAT MỚI]</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Người gửi:</b> ${escapeHtml(senderName || 'Khách hàng')}
📄 <b>Trang:</b> <code>${escapeHtml(pageUrl || '/')}</code>
🌐 <b>IP:</b> <code>${escapeHtml(ip || '127.0.0.1')}</code>
💬 <b>Nội dung:</b>
<i>"${escapeHtml(messageText)}"</i>
⏰ <b>Thời gian:</b> ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}
━━━━━━━━━━━━━━━━━━━━
⚡ <i>OcaPay Realtime Web Desk</i>`;

      const sendRes = await this.sendMessage(sys.botToken, chatId, html);
      return { success: true, pushed: sendRes.success };
    } catch (err) {
      console.error('[LiveChat:Telegram] Lỗi gửi thông báo:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Xử lý webhook update trực tiếp từ Telegram
   */
  async handleWebhookPayload(body) {
    if (!body) return { success: false, error: 'Thiếu update body' };
    const sys = await this.getSystemConfig();
    if (!sys.botToken) return { success: false, error: 'Chưa cấu hình Telegram Bot Token' };

    const msg = body.message || body.edited_message || body.channel_post;
    if (msg) {
      await this.handleIncomingMessage(msg, sys.botToken);
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

module.exports = new TelegramService();
