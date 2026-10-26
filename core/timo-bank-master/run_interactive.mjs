import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = '0869482825';
const PASSWORD_RAW = 'Anhduong123@';
const APP_VERSION = '332';
const API_HOSTNAME = 'app2.timo.vn';
const CREDS_FILE = path.join(__dirname, 'timo_credentials.json');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function sha512(input) {
  return crypto.createHash('sha512').update(input).digest('hex');
}

function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

function buildBrowserSignature() {
  return `:WEB:WEB:${APP_VERSION}:WEB:desktop:chrome`;
}

function buildDeviceReg(deviceId, signature) {
  return `${deviceId}${signature}`;
}

function buildContextId(deviceId) {
  const inputString = `WEB.${deviceId}.${APP_VERSION}`;
  const hashPart = sha256(inputString);
  const uuid = crypto.randomUUID();
  return `${hashPart}.${uuid}`;
}

function buildDeviceKey(timoDeviceId, signature) {
  return `${timoDeviceId}${signature}`;
}

function encodeCredentials(data) {
  const json = JSON.stringify(data);
  const base64 = Buffer.from(json, 'utf-8').toString('base64');
  return `timo_v1_${base64}`;
}

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const reqHeaders = {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json; charset=UTF-8',
      'origin': 'https://my.timo.vn',
      'referer': 'https://my.timo.vn/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      ...headers,
    };

    if (body) {
      reqHeaders['content-length'] = Buffer.byteLength(postData).toString();
    }

    const options = {
      hostname: API_HOSTNAME,
      port: 443,
      path: path,
      method: method,
      headers: reqHeaders,
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            json: JSON.parse(data),
            raw: data
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            raw: data
          });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Yêu cầu hết thời gian chờ (Request timeout)'));
    });

    if (body) {
      req.write(postData);
    }
    req.end();
  });
}

function promptOtp(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function fetchBankData(token, timoDeviceId, contextId, signature) {
  const sessionHeaders = {
    token: token,
    'x-gofs-context-id': contextId,
    'x-timo-devicekey': buildDeviceKey(timoDeviceId, signature),
  };

  console.log('\n[*] Đang lấy thông tin chủ tài khoản (/user/getProfile)...');
  const profileRes = await request('GET', '/user/getProfile', sessionHeaders);
  if (profileRes.json && profileRes.json.data) {
    const p = profileRes.json.data;
    console.log('----------------------------------------------------------------');
    console.log(`👤 HỌ VÀ TÊN CHỦ TK: ${p.fullName || 'Chưa cập nhật'}`);
    console.log(`📱 Số điện thoại:     ${p.phoneNumber || USERNAME}`);
    console.log(`📧 Email liên kết:    ${p.userEmail || 'Chưa có'}`);
    console.log(`🆔 CCCD/CMND:         ${p.nationalId || p.legalId || 'Chưa có'}`);
    console.log(`🎂 Ngày sinh:         ${p.dateOfBirth || 'Chưa có'}`);
    console.log('----------------------------------------------------------------');
  }

  console.log('\n[*] Đang lấy danh sách tài khoản (/user/accountPreview)...');
  const accRes = await request('GET', '/user/accountPreview', sessionHeaders);
  let spendAccountNo = null;

  if (accRes.json && accRes.json.data && accRes.json.data.accounts) {
    const accList = accRes.json.data.accounts;
    console.log(`\n📋 DANH SÁCH TÀI KHOẢN HIỆN CÓ (${accList.length} tài khoản):`);
    for (const acc of accList) {
      console.log(`  🔹 [${acc.name || 'Tài khoản'}] - Loại: ${acc.accountType}`);
      console.log(`     STK:               ${acc.no}`);
      console.log(`     Số dư khả dụng:    ${Number(acc.availableAmount ?? acc.balance ?? 0).toLocaleString('vi-VN')} VND`);
      console.log(`     Số dư thực tế:     ${Number(acc.accountBalance ?? acc.balance ?? 0).toLocaleString('vi-VN')} VND`);

      if (acc.accountType === '1025' || !spendAccountNo) {
        spendAccountNo = acc.no;
      }
    }
  }

  if (spendAccountNo) {
    console.log(`\n[*] Đang truy vấn lịch sử giao dịch cho STK [${spendAccountNo}]...`);
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const txRes = await request('POST', '/user/account/transaction/list', sessionHeaders, {
      format: 'group',
      index: 0,
      offset: -1,
      accountNo: spendAccountNo,
      accountType: '1025',
      fromDate: fmt(thirtyDaysAgo),
      toDate: fmt(today),
    });

    if (txRes.json && txRes.json.data) {
      const data = txRes.json.data;
      console.log(`\n💰 SỐ DƯ TÀI KHOẢN THANH TOÁN (STK: ${spendAccountNo}):`);
      console.log(`   Khả dụng: ${Number(data.availableAmount ?? 0).toLocaleString('vi-VN')} VND`);
      console.log(`   Thực tế:  ${Number(data.accountBalance ?? 0).toLocaleString('vi-VN')} VND`);

      const items = [];
      for (const grp of data.items ?? []) {
        for (const item of grp.item ?? grp.itemDetailList ?? []) {
          items.push(item);
        }
      }

      console.log(`\n📜 LỊCH SỬ GIAO DỊCH (${items.length} giao dịch gần nhất):`);
      if (items.length === 0) {
        console.log('   (Không có giao dịch nào phát sinh)');
      } else {
        for (const it of items) {
          const type = it.txnType === 'CR' ? '➕ NHẬN' : '➖ CHUYỂN';
          const time = it.txnTime || it.transactionTime || 'N/A';
          const amt = Number(it.txnAmount || 0).toLocaleString('vi-VN');
          console.log(`   • [${time}] ${type} ${amt} đ | ${it.txnDesc}`);
        }
      }
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log('🏦 CHƯƠNG TRÌNH KIỂM THỬ TỰ ĐỘNG TIMO BANK (INTERACTIVE CLI)');
  console.log('================================================================');
  console.log(`[+] Tài khoản đăng nhập: ${USERNAME}`);
  console.log(`[+] Mật khẩu:             ${PASSWORD_RAW.substring(0, 3)}*****`);

  const deviceId = generateDeviceId();
  const signature = buildBrowserSignature();
  const hashedPassword = sha512(PASSWORD_RAW);
  const deviceReg = buildDeviceReg(deviceId, signature);
  const contextId = buildContextId(deviceId);

  console.log('\n[*] Đang gửi yêu cầu đăng nhập tới Timo Bank (app2.timo.vn)...');

  const res = await request(
    'POST',
    '/login',
    {
      'x-timo-devicereg': deviceReg,
      'x-gofs-context-id': contextId,
    },
    {
      username: USERNAME,
      password: hashedPassword,
      lang: 'vn',
    }
  );

  if (!res.json) {
    console.error('[-] Lỗi kết nối tới máy chủ Timo:', res.raw);
    return;
  }

  if (res.json.code === 6001 || res.json.code === 6006) {
    const is2FA = res.json.code === 6006;
    const { refNo, token, phoneNumber } = res.json.data;

    console.log(`\n✅ [XÁC THỰC THIẾT BỊ MỚI - MÃ OTP ĐÃ ĐƯỢC GỬI]`);
    console.log(`👉 Mã tham chiếu (refNo):   ${refNo}`);
    console.log(`👉 Số điện thoại đăng ký:   ${phoneNumber || USERNAME}`);
    console.log(`💡 Lưu ý: Mã OTP của Timo gồm 4 số (được gửi qua SMS hoặc Email).`);
    console.log(`          Vui lòng kiểm tra tin nhắn có mã tham chiếu [${refNo}].`);
    console.log('----------------------------------------------------------------');

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const otp = await promptOtp(`🔑 Nhập mã OTP 4 số (Lần thử ${attempts + 1}/${maxAttempts}, hoặc gõ 'r' để gửi lại mã): `);

      if (!otp) {
        console.log('[-] Bạn chưa nhập mã OTP.');
        continue;
      }

      if (otp.toLowerCase() === 'r') {
        console.log(`[*] Đang gửi lại mã OTP cho phiên [${refNo}]...`);
        const resendRes = await request(
          'POST',
          '/login/resend/otp',
          {
            'x-timo-devicereg': deviceReg,
            'x-gofs-context-id': contextId,
            token: token,
          },
          {
            refNo: refNo,
            notification: 'sms',
          }
        );
        console.log('[+] Đã gửi lại OTP qua SMS! Vui lòng đợi tin nhắn mới.');
        continue;
      }

      console.log(`\n[*] Đang gửi mã OTP [${otp}] lên máy chủ Timo để kích hoạt...`);

      const commitPath = is2FA ? '/login/afs/commit' : '/login/commit';
      const commitBody = {
        lang: 'vn',
        refNo: refNo,
        otp: otp,
        securityChallenge: otp,
        securityCode: otp,
        ...(is2FA ? { smsOTP: otp } : {}),
      };

      const commitRes = await request(
        'POST',
        commitPath,
        {
          'x-timo-devicereg': deviceReg,
          'x-gofs-context-id': contextId,
          token: token,
        },
        commitBody
      );

      if (commitRes.json && commitRes.json.code === 200 && commitRes.json.success) {
        console.log('\n🎉🎉🎉 [ĐĂNG NHẬP THÀNH CÔNG RỰC RỠ] 🎉🎉🎉');
        const { timoDeviceId, token: authToken, userId } = commitRes.json.data;
        console.log(`- Mã người dùng (userId): ${userId}`);
        console.log(`- Mã thiết bị (timoDeviceId): ${timoDeviceId}`);

        const creds = {
          username: USERNAME,
          password: hashedPassword,
          deviceId: deviceId,
          timoDeviceId: timoDeviceId,
          browserSignature: signature,
          createdAt: new Date().toISOString(),
        };
        const credentialsToken = encodeCredentials(creds);
        fs.writeFileSync(CREDS_FILE, JSON.stringify({ credentialsToken, ...creds }, null, 2), 'utf-8');

        console.log('\n🔑 Chuỗi TIMO_CREDENTIALS token (dùng chạy 24/7 không cần OTP nữa):');
        console.log(credentialsToken);

        await fetchBankData(authToken, timoDeviceId, contextId, signature);
        return;
      } else {
        const errCode = commitRes.json?.code;
        if (errCode === 8102) {
          console.error(`\n❌ [LỖI 8102 - SAI MÃ OTP]: Mã [${otp}] không đúng với mã tham chiếu [${refNo}]!`);
          console.error(`👉 Có thể tin nhắn SMS bị trễ của lần gửi trước. Hãy kiểm tra tin nhắn mới nhất có mã [${refNo}] hoặc kiểm tra thêm cả hộp thư Email.`);
        } else if (errCode === 8106) {
          console.error(`\n❌ [LỖI 8106 - OTP HẾT HẠN]: Mã OTP đã hết thời gian hiệu lực.`);
        } else {
          console.error(`\n❌ [LỖI ${errCode}]:`, JSON.stringify(commitRes.json || commitRes.raw, null, 2));
        }
        attempts++;
      }
    }

    console.log('\n[-] Đã quá số lần thử OTP. Vui lòng chạy lại lệnh để nhận phiên mới.');
  } else if (res.json.code === 200 && res.json.success) {
    console.log('\n🎉 [ĐĂNG NHẬP THÀNH CÔNG] Thiết bị đã tin cậy từ trước!');
    const { timoDeviceId, token: authToken } = res.json.data;
    await fetchBankData(authToken, timoDeviceId, contextId, signature);
  } else {
    console.error(`\n❌ [LỖI ĐĂNG NHẬP]: ${res.json.message || 'Thất bại'}`);
    console.error(JSON.stringify(res.json, null, 2));
  }
}

main().catch(console.error);
