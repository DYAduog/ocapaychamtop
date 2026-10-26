const User = require('../models/User');
const cryptoService = require('../services/crypto.service');

class AuthController {
  async register(req, res) {
    try {
      const { username, password, email, phone } = req.body;
      if (!username || !password) {
        return res.status(400).json({ status: 'error', msg: 'Vui lòng nhập tài khoản và mật khẩu' });
      }

      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ status: 'error', msg: 'Tài khoản đã tồn tại' });
      }

      // Hash password with SHA-1 (compatible with PHP sha1())
      const hashedPassword = cryptoService.hashUserPassword(password);
      const userToken = cryptoService.generateToken(32);
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const isAdminEmail = !!(adminEmail && email && email.trim().toLowerCase() === adminEmail);

      const newUser = await User.create({
        username,
        password: hashedPassword,
        email: email || '',
        phone: phone || '',
        token: userToken,
        level: isAdminEmail ? 'admin' : 'member',
        money: 0,
        totalMoney: 0,
        timeMomo: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 days trial
      });

      return res.json({
        status: 'success',
        msg: 'Đăng ký tài khoản thành công',
        data: {
          id: newUser._id,
          username: newUser.username,
          token: newUser.token,
          level: newUser.level,
          isAdmin: isAdminEmail,
        },
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ status: 'error', msg: 'Tài khoản/Email và mật khẩu không được để trống' });
      }

      const user = await User.findOne({
        $or: [{ username: username }, { email: username.toLowerCase() }]
      });
      if (!user) {
        return res.status(401).json({ status: 'error', msg: 'Thông tin đăng nhập không chính xác' });
      }

      const hashedInput = cryptoService.hashUserPassword(password);
      if (user.password !== hashedInput) {
        return res.status(401).json({ status: 'error', msg: 'Thông tin đăng nhập không chính xác' });
      }

      if (user.banned === 1) {
        return res.status(403).json({ status: 'error', msg: 'Tài khoản của bạn đã bị khoá truy cập' });
      }

      // Refresh token if needed
      user.timeSession = Math.floor(Date.now() / 1000);
      user.ip = req.ip;

      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const isEmailAdmin = !!(adminEmail && user.email && user.email.toLowerCase() === adminEmail);
      if (isEmailAdmin && user.level !== 'admin' && user.level !== '1') {
        user.level = 'admin';
      }
      await user.save();

      const isAdmin = isEmailAdmin || user.level === 'admin' || user.level === '1';

      return res.json({
        status: 'success',
        msg: 'Đăng nhập thành công',
        token: user.token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar || '',
          money: user.money,
          timeMomo: user.timeMomo,
          level: user.level,
          isAdmin,
        },
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  async googleLogin(req, res) {
    try {
      const { credential, email, name, googleId, avatar } = req.body;
      let userEmail = email || '';
      let userName = name || '';
      let userGoogleId = googleId || '';
      let userAvatar = avatar || '';

      // If credential JWT was sent from Google Identity Services
      if (credential) {
        try {
          const axios = require('axios');
          const googleRes = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`, { timeout: 5000 });
          if (googleRes.data && googleRes.data.email) {
            userEmail = googleRes.data.email;
            userName = googleRes.data.name || googleRes.data.email.split('@')[0];
            userGoogleId = googleRes.data.sub;
            userAvatar = googleRes.data.picture || '';
          }
        } catch (gErr) {
          // If tokeninfo failed (e.g. timeout), decode JWT base64 payload
          try {
            const parts = credential.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
              userEmail = payload.email || userEmail;
              userName = payload.name || userName || (userEmail ? userEmail.split('@')[0] : '');
              userGoogleId = payload.sub || userGoogleId;
              userAvatar = payload.picture || userAvatar;
            }
          } catch (_) {}
        }
      }

      if (!userEmail && !userGoogleId) {
        return res.status(400).json({ status: 'error', msg: 'Không thể xác thực thông tin tài khoản Google' });
      }

      // Check if user already exists by googleId or email
      let user = null;
      if (userGoogleId) {
        user = await User.findOne({ googleId: userGoogleId });
      }
      if (!user && userEmail) {
        user = await User.findOne({ email: userEmail.toLowerCase() });
      }

      const userToken = cryptoService.generateToken(32);
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const isEmailAdmin = !!(adminEmail && userEmail && userEmail.toLowerCase() === adminEmail);

      if (user) {
        if (!user.googleId && userGoogleId) user.googleId = userGoogleId;
        if (!user.avatar && userAvatar) user.avatar = userAvatar;
        if (isEmailAdmin && user.level !== 'admin' && user.level !== '1') {
          user.level = 'admin';
        }
        user.token = userToken;
        user.timeSession = Math.floor(Date.now() / 1000);
        user.ip = req.ip;
        await user.save();
      } else {
        // Create new user from Google
        let baseUsername = (userEmail ? userEmail.split('@')[0] : 'user')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (!baseUsername || baseUsername.length < 3) baseUsername = 'google_user';

        let finalUsername = baseUsername;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${baseUsername}${counter}`;
          counter++;
        }

        const dummyPassword = cryptoService.hashUserPassword(cryptoService.generateToken(16));

        user = await User.create({
          username: finalUsername,
          password: dummyPassword,
          email: userEmail.toLowerCase(),
          googleId: userGoogleId || '',
          avatar: userAvatar || '',
          token: userToken,
          level: isEmailAdmin ? 'admin' : 'member',
          money: 0,
          totalMoney: 0,
          timeMomo: Math.floor(Date.now() / 1000) + 30 * 86400,
          timeSession: Math.floor(Date.now() / 1000),
          ip: req.ip
        });
      }

      if (user.banned === 1) {
        return res.status(403).json({ status: 'error', msg: 'Tài khoản của bạn đã bị khoá truy cập' });
      }

      const isAdmin = isEmailAdmin || user.level === 'admin' || user.level === '1';

      return res.json({
        status: 'success',
        msg: 'Đăng nhập Google thành công',
        token: user.token,
        user: {
          id: user._id,
          username: user.username,
          name: userName || user.username,
          email: user.email,
          avatar: user.avatar,
          money: user.money,
          timeMomo: user.timeMomo,
          level: user.level,
          isAdmin,
        }
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  async getProfile(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token }).select('-password');
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const isEmailAdmin = !!(adminEmail && user.email && user.email.toLowerCase() === adminEmail);
      if (isEmailAdmin && user.level !== 'admin' && user.level !== '1') {
        user.level = 'admin';
        await user.save();
      }

      const userObj = user.toObject();
      userObj.isAdmin = isEmailAdmin || user.level === 'admin' || user.level === '1';

      return res.json({ status: 'success', user: userObj });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const {
        email, phone, avatar,
        telegramChatId, telegramBotToken, telegramNotifyEnabled,
        zaloChatId, zaloBotToken, zaloNotifyEnabled
      } = req.body;
      if (email !== undefined) user.email = String(email).trim().toLowerCase();
      if (phone !== undefined) user.phone = String(phone).trim();
      if (avatar !== undefined) user.avatar = String(avatar).trim();
      if (telegramChatId !== undefined) user.telegramChatId = String(telegramChatId).trim();
      if (telegramBotToken !== undefined) user.telegramBotToken = String(telegramBotToken).trim();
      if (telegramNotifyEnabled !== undefined) user.telegramNotifyEnabled = Boolean(telegramNotifyEnabled);
      if (zaloChatId !== undefined) user.zaloChatId = String(zaloChatId).trim();
      if (zaloBotToken !== undefined) user.zaloBotToken = String(zaloBotToken).trim();
      if (zaloNotifyEnabled !== undefined) user.zaloNotifyEnabled = Boolean(zaloNotifyEnabled);

      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const isEmailAdmin = !!(adminEmail && user.email && user.email.toLowerCase() === adminEmail);
      if (isEmailAdmin && user.level !== 'admin' && user.level !== '1') {
        user.level = 'admin';
      }

      await user.save();

      const userObj = user.toObject();
      delete userObj.password;
      userObj.isAdmin = isEmailAdmin || user.level === 'admin' || user.level === '1';

      return res.json({
        status: 'success',
        msg: 'Cập nhật thông tin hồ sơ thành công!',
        user: userObj,
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  async testTelegram(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const { chatId, botToken } = req.body;
      const targetChatId = (chatId !== undefined && chatId !== null) ? String(chatId).trim() : (user.telegramChatId || '');
      const targetBotToken = (botToken !== undefined && botToken !== null) ? String(botToken).trim() : (user.telegramBotToken || '');

      const telegramService = require('../services/telegram.service');
      await telegramService.sendTestNotification(user, targetBotToken, targetChatId);

      return res.json({
        status: 'success',
        msg: 'Đã gửi thông báo thử nghiệm thành công tới Telegram của bạn!',
      });
    } catch (error) {
      return res.status(400).json({ status: 'error', msg: error.message });
    }
  }

  async getTelegramLink(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const telegramService = require('../services/telegram.service');
      const linkData = await telegramService.generateLinkUrl(user);

      return res.json({
        status: 'success',
        data: linkData,
      });
    } catch (error) {
      return res.status(400).json({ status: 'error', msg: error.message });
    }
  }

  async unlinkTelegram(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const telegramService = require('../services/telegram.service');
      await telegramService.unlinkUser(user);

      return res.json({
        status: 'success',
        msg: 'Đã hủy liên kết Telegram thành công!',
        user: {
          telegramChatId: '',
          telegramUsername: '',
          telegramNotifyEnabled: false,
        },
      });
    } catch (error) {
      return res.status(400).json({ status: 'error', msg: error.message });
    }
  }

  async testZalo(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const { chatId, botToken } = req.body || {};
      const targetChatId = (chatId !== undefined && chatId !== null) ? String(chatId).trim() : (user.zaloChatId || '');
      const targetBotToken = (botToken !== undefined && botToken !== null) ? String(botToken).trim() : (user.zaloBotToken || '');

      const zaloBotService = require('../services/zaloBot.service');
      await zaloBotService.sendTestNotification(user, targetBotToken, targetChatId);

      return res.json({
        status: 'success',
        msg: 'Đã gửi thông báo thử nghiệm thành công tới Zalo của bạn!',
      });
    } catch (error) {
      return res.status(400).json({ status: 'error', msg: error.message });
    }
  }

  async getZaloLink(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const zaloBotService = require('../services/zaloBot.service');
      const linkData = await zaloBotService.generateLinkUrl(user);

      return res.json({
        status: 'success',
        data: linkData,
      });
    } catch (error) {
      return res.status(400).json({ status: 'error', msg: error.message });
    }
  }

  async unlinkZalo(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const zaloBotService = require('../services/zaloBot.service');
      await zaloBotService.unlinkUser(user);

      return res.json({
        status: 'success',
        msg: 'Đã hủy liên kết Zalo thành công!',
        user: {
          zaloChatId: '',
          zaloDisplayName: '',
          zaloNotifyEnabled: false,
        },
      });
    } catch (error) {
      return res.status(400).json({ status: 'error', msg: error.message });
    }
  }

  async changePassword(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const { oldPassword, newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ status: 'error', msg: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
      }

      // If user has a set password, verify old password
      if (user.password) {
        if (!oldPassword) {
          return res.status(400).json({ status: 'error', msg: 'Vui lòng nhập mật khẩu hiện tại' });
        }
        const hashedOld = cryptoService.hashUserPassword(oldPassword);
        if (user.password !== hashedOld) {
          return res.status(400).json({ status: 'error', msg: 'Mật khẩu hiện tại không chính xác' });
        }
      }

      user.password = cryptoService.hashUserPassword(newPassword);
      await user.save();

      return res.json({ status: 'success', msg: 'Đổi mật khẩu bảo mật thành công!' });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }

  async regenerateToken(req, res) {
    try {
      const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
      if (!token) return res.status(401).json({ status: 'error', msg: 'Vui lòng cung cấp token' });

      const user = await User.findOne({ token });
      if (!user) return res.status(404).json({ status: 'error', msg: 'Không tìm thấy người dùng' });

      const newToken = cryptoService.generateToken(32);
      user.token = newToken;
      await user.save();

      return res.json({
        status: 'success',
        msg: 'Tạo Master Token mới thành công!',
        token: newToken,
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', msg: error.message });
    }
  }
}

module.exports = new AuthController();
