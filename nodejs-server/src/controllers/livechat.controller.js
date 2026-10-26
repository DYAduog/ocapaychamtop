const LiveChatSession = require('../models/LiveChatSession');
const telegramService = require('../services/telegram.service');

class LiveChatController {
  /**
   * Lấy danh sách tất cả các phiên Live Chat (Dành cho trang Admin)
   */
  async getSessions(req, res) {
    try {
      const { search, status, limit = 50 } = req.query;
      const query = {};

      if (status && status !== 'all') {
        query.status = status;
      }

      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
          { userName: regex },
          { userPhone: regex },
          { userEmail: regex },
          { lastMessage: regex },
          { sessionId: regex },
          { userIp: regex },
        ];
      }

      const sessions = await LiveChatSession.find(query)
        .sort({ lastMessageAt: -1 })
        .limit(parseInt(limit, 10))
        .select('-messages'); // Không load toàn bộ tin nhắn để tăng tốc độ tải danh sách

      // Tính tổng số tin nhắn chưa đọc của toàn hệ thống
      const totalUnread = await LiveChatSession.aggregate([
        { $group: { _id: null, count: { $sum: '$unreadAdminCount' } } },
      ]);

      const unreadCount = totalUnread[0]?.count || 0;

      return res.json({
        status: 'success',
        unreadTotal: unreadCount,
        count: sessions.length,
        data: sessions,
      });
    } catch (err) {
      console.error('[LiveChat:getSessions]', err);
      return res.status(500).json({ status: 'error', msg: 'Lỗi tải danh sách hội thoại' });
    }
  }

  /**
   * Lấy chi tiết lịch sử tin nhắn của một phiên chat
   */
  async getSession(req, res) {
    try {
      const { sessionId } = req.params;
      const { markRead } = req.query;

      const session = await LiveChatSession.findOne({ sessionId });
      if (!session) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy phiên chat' });
      }

      // Nếu Admin mở xem, tự động reset số tin chưa đọc của Admin
      if (markRead === 'true' || markRead === '1') {
        session.unreadAdminCount = 0;
        await session.save();
      }

      return res.json({
        status: 'success',
        data: session,
      });
    } catch (err) {
      console.error('[LiveChat:getSession]', err);
      return res.status(500).json({ status: 'error', msg: 'Lỗi tải chi tiết cuộc hội thoại' });
    }
  }

  /**
   * Gửi tin nhắn mới (Dùng chung cho cả Khách hàng và Admin)
   */
  async sendMessage(req, res) {
    try {
      const {
        sessionId,
        sender = 'user',
        senderName,
        text,
        html = null,
        pageUrl,
        userIp,
        userPhone,
        userEmail,
      } = req.body;

      if (!sessionId || !text || !text.trim()) {
        return res.status(400).json({ status: 'error', msg: 'Thiếu thông tin tin nhắn hoặc sessionId' });
      }

      const clientIp = userIp || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const cleanText = text.trim();

      let session = await LiveChatSession.findOne({ sessionId });

      if (!session) {
        session = new LiveChatSession({
          sessionId,
          userName: senderName || (sender === 'admin' ? 'Kỹ thuật viên OcaPay' : 'Khách vãng lai'),
          userEmail: userEmail || '',
          userPhone: userPhone || '',
          userIp: clientIp,
          pageUrl: pageUrl || '/',
          status: 'open',
          unreadAdminCount: 0,
          unreadUserCount: 0,
          messages: [],
        });
      }

      // Cập nhật thông tin khách nếu có
      if (sender === 'user' && senderName && senderName !== 'Khách vãng lai') {
        session.userName = senderName;
      }
      if (userPhone) session.userPhone = userPhone;
      if (userEmail) session.userEmail = userEmail;
      if (pageUrl) session.pageUrl = pageUrl;

      const newMsg = {
        sender,
        senderName: senderName || (sender === 'admin' ? 'Kỹ thuật viên OcaPay' : session.userName),
        text: cleanText,
        html: html || null,
        createdAt: new Date(),
      };

      session.messages.push(newMsg);
      session.lastMessage = cleanText;
      session.lastMessageSender = sender;
      session.lastMessageAt = new Date();

      if (sender === 'user') {
        session.unreadAdminCount += 1;
        if (session.status === 'resolved' || session.status === 'closed') {
          session.status = 'open'; // Mở lại phiên nếu khách nhắn tiếp
        }

        // Bắn thông báo Telegram cho Admin
        telegramService
          .sendLiveChatAdminAlert(session.userName, cleanText, session.pageUrl, clientIp)
          .catch((e) => console.warn('[LiveChat:Telegram Alert Error]', e.message));
      } else if (sender === 'admin') {
        session.unreadUserCount += 1;
        session.unreadAdminCount = 0; // Admin đã phản hồi thì đánh dấu đã đọc
        session.status = 'in_progress';
      }

      await session.save();

      const createdMsg = session.messages[session.messages.length - 1];

      return res.json({
        status: 'success',
        msg: 'Gửi tin nhắn thành công',
        data: {
          session: {
            sessionId: session.sessionId,
            userName: session.userName,
            status: session.status,
            unreadAdminCount: session.unreadAdminCount,
            unreadUserCount: session.unreadUserCount,
          },
          message: createdMsg,
        },
      });
    } catch (err) {
      console.error('[LiveChat:sendMessage]', err);
      return res.status(500).json({ status: 'error', msg: 'Lỗi gửi tin nhắn Live Chat' });
    }
  }

  /**
   * Realtime Polling tin nhắn mới (Cho cả Client widget và Admin desk)
   */
  async poll(req, res) {
    try {
      const { sessionId, after } = req.query;

      if (!sessionId) {
        return res.status(400).json({ status: 'error', msg: 'Thiếu sessionId' });
      }

      const session = await LiveChatSession.findOne({ sessionId });
      if (!session) {
        return res.json({ status: 'success', messages: [], sessionStatus: 'not_found' });
      }

      let newMessages = session.messages;

      if (after) {
        const afterDate = new Date(after);
        if (!isNaN(afterDate.getTime())) {
          newMessages = session.messages.filter((m) => new Date(m.createdAt) > afterDate);
        }
      }

      return res.json({
        status: 'success',
        sessionStatus: session.status,
        unreadAdminCount: session.unreadAdminCount,
        unreadUserCount: session.unreadUserCount,
        messages: newMessages,
      });
    } catch (err) {
      console.error('[LiveChat:poll]', err);
      return res.status(500).json({ status: 'error', msg: 'Lỗi polling tin nhắn' });
    }
  }

  /**
   * Cập nhật trạng thái phiên (Đánh dấu đã xử lý / đóng / mở lại)
   */
  async updateStatus(req, res) {
    try {
      const { sessionId, status } = req.body;
      if (!sessionId || !status) {
        return res.status(400).json({ status: 'error', msg: 'Thiếu sessionId hoặc status' });
      }

      const session = await LiveChatSession.findOne({ sessionId });
      if (!session) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy phiên chat' });
      }

      session.status = status;
      if (status === 'resolved' || status === 'closed') {
        session.unreadAdminCount = 0;
      }
      await session.save();

      return res.json({
        status: 'success',
        msg: `Đã cập nhật trạng thái sang "${status}"`,
        data: session,
      });
    } catch (err) {
      console.error('[LiveChat:updateStatus]', err);
      return res.status(500).json({ status: 'error', msg: 'Lỗi cập nhật trạng thái' });
    }
  }

  /**
   * Xóa một phiên chat
   */
  async deleteSession(req, res) {
    try {
      const { sessionId } = req.params;
      const result = await LiveChatSession.findOneAndDelete({ sessionId });
      if (!result) {
        return res.status(404).json({ status: 'error', msg: 'Không tìm thấy phiên chat để xóa' });
      }
      return res.json({ status: 'success', msg: 'Đã xóa phiên chat thành công' });
    } catch (err) {
      console.error('[LiveChat:deleteSession]', err);
      return res.status(500).json({ status: 'error', msg: 'Lỗi xóa phiên chat' });
    }
  }
}

module.exports = new LiveChatController();
