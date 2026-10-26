import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = '0869482825';
const PASSWORD_RAW = 'Anhduong123@';
const APP_VERSION = '332';
const API_HOSTNAME = 'app2.timo.vn';
const PENDING_FILE = path.join(__dirname, 'session_pending.json');
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
      reject(new Error('Request timed out'));
    });

    if (body) {
      req.write(postData);
    }
    req.end();
  });
}

// ----------------------------------------------------
// BƯỚC 1: GỬI YÊU CẦU ĐĂNG NHẬP (GỬI OTP VỀ ĐIỆN THOẠI)
// ----------------------------------------------------
async function initiateLogin() {
  console.log('====================================================');
  console.log('🚀 TIMO BANK GATEWAY - GỬI YÊU CẦU ĐĂNG NHẬP');
  console.log('====================================================');
  console.log(`[+] Tài khoản: 0869482825`);

  const deviceId = generateDeviceId();
  const signature = buildBrowserSignature();
  const hashedPassword = sha512(PASSWORD_RAW);
  const deviceReg = buildDeviceReg(deviceId, signature);
  const contextId = buildContextId(deviceId);

  console.log('[*] Đang kết nối tới máy chủ Timo (app2.timo.vn)...');

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

  if (res.json && res.json.code === 6001) {
    const data = res.json.data;
    console.log('\n✅ [THÀNH CÔNG] MÃ OTP ĐÃ ĐƯỢC GỬI VỀ ĐIỆN THOẠI!');
    console.log(`👉 Mã tham chiếu (refNo): ${data.refNo}`);
    console.log(`👉 Số điện thoại nhận:     ${data.phoneNumber}`);

    // Lưu session chờ OTP
    const pendingData = {
      username: USERNAME,
      hashedPassword,
      deviceId,
      signature,
      contextId,
      token: data.token,
      refNo: data.refNo,
      type: 'device',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pendingData, null, 2), 'utf-8');

    console.log('\n----------------------------------------------------');
    console.log('📌 VUI LÒNG NHẬP MÃ OTP ĐỂ HOÀN TẤT:');
    console.log('   Cú pháp: node timo_tool.mjs otp <MÃ_OTP>');
    console.log('   Ví dụ:   node timo_tool.mjs otp 1234');
    console.log('----------------------------------------------------');
  } else if (res.json && res.json.code === 6006) {
    const data = res.json.data;
    console.log('\n✅ [THÀNH CÔNG] MÃ 2FA OTP ĐÃ ĐƯỢC GỬI VỀ ĐIỆN THOẠI!');
    const pendingData = {
      username: USERNAME,
      hashedPassword,
      deviceId,
      signature,
      contextId,
      token: data.token,
      refNo: data.refNo,
      type: 'twoFactor',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pendingData, null, 2), 'utf-8');
    console.log(`👉 Cú pháp nhập OTP: node timo_tool.mjs otp <MÃ_OTP>`);
  } else if (res.json && res.json.code === 200 && res.json.success) {
    console.log('\n🎉 [ĐĂNG NHẬP THÀNH CÔNG] Thiết bị đã tin cậy từ trước!');
    await onLoginSuccess(res.json.data, deviceId, signature, hashedPassword, contextId);
  } else {
    console.log('\n❌ [THẤT BÀI]:', JSON.stringify(res.json || res.raw, null, 2));
  }
}

// ----------------------------------------------------
// BƯỚC 2: XÁC THỰC MÃ OTP
// ----------------------------------------------------
async function verifyOtp(otp) {
  if (!fs.existsSync(PENDING_FILE)) {
    console.error('[-] Không tìm thấy phiên đăng nhập chờ OTP. Vui lòng chạy: node timo_tool.mjs login');
    return;
  }

  const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
  console.log('====================================================');
  console.log(`🚀 XÁC THỰC MÃ OTP: [${otp}]`);
  console.log('====================================================');
  console.log(`[+] Mã tham chiếu (refNo): ${pending.refNo}`);

  const path = pending.type === 'twoFactor' ? '/login/afs/commit' : '/login/commit';
  const body = {
    lang: 'vn',
    refNo: pending.refNo,
    otp: otp.trim(),
    securityChallenge: otp.trim(),
    securityCode: otp.trim(),
    ...(pending.type === 'twoFactor' ? { smsOTP: otp.trim() } : {}),
  };

  const headers = {
    'x-timo-devicereg': buildDeviceReg(pending.deviceId, pending.signature),
    'x-gofs-context-id': pending.contextId,
    token: pending.token,
  };

  const res = await request('POST', path, headers, body);
  console.log(`[+] Phản hồi từ Timo: HTTP ${res.statusCode}`);
  console.log(JSON.stringify(res.json || res.raw, null, 2));

  if (res.json && res.json.code === 200 && res.json.success && res.json.data) {
    console.log('\n🎉 [XÁC THỰC OTP THÀNH CÔNG!] Thiết bị đã được đăng ký vĩnh viễn!');
    await onLoginSuccess(res.json.data, pending.deviceId, pending.signature, pending.hashedPassword, pending.contextId);
  } else {
    console.log('\n❌ [LỖI]: Mã OTP không chính xác hoặc đã hết hạn.');
  }
}

// ----------------------------------------------------
// BƯỚC 3: SAU KHI ĐĂNG NHẬP THÀNH CÔNG
// ----------------------------------------------------
async function onLoginSuccess(data, deviceId, signature, hashedPassword, contextId) {
  const timoDeviceId = data.timoDeviceId;
  const token = data.token;
  const userId = data.userId;

  const creds = {
    username: USERNAME,
    password: hashedPassword,
    deviceId: deviceId,
    timoDeviceId: timoDeviceId,
    browserSignature: signature,
    createdAt: new Date().toISOString(),
  };

  const tokenString = encodeCredentials(creds);
  fs.writeFileSync(CREDS_FILE, JSON.stringify({ credentialsToken: tokenString, ...creds }, null, 2), 'utf-8');
  if (fs.existsSync(PENDING_FILE)) fs.unlinkSync(PENDING_FILE);

  console.log('\n🔑 [CREDENTIALS TOKEN]:');
  console.log(tokenString);

  // Vấn tin số tài khoản và số dư
  await fetchBankData(token, timoDeviceId, contextId, signature);
}

// ----------------------------------------------------
// BƯỚC 4: VẤN TIN TÀI KHOẢN, SỐ DƯ & LỊCH SỬ GIAO DỊCH
// ----------------------------------------------------
async function fetchBankData(token, timoDeviceId, contextId, signature) {
  const sessionHeaders = {
    token: token,
    'x-gofs-context-id': contextId,
    'x-timo-devicekey': buildDeviceKey(timoDeviceId, signature),
  };

  console.log('\n[*] Đang lấy danh sách tài khoản (Spend Accounts)...');
  const accRes = await request('GET', '/user/accounts', sessionHeaders);

  let targetAccountNo = '';
  if (accRes.json && accRes.json.data && accRes.json.data.accounts) {
    const accounts = accRes.json.data.accounts;
    for (const acc of accounts) {
      console.log(`- Tài khoản [${acc.accountType}]: STK ${acc.accountNo} | Tên: ${acc.accountName}`);
      if (acc.accountType === '1025' || !targetAccountNo) {
        targetAccountNo = acc.accountNo;
      }
    }
  }

  if (targetAccountNo) {
    console.log(`\n[*] Đang lấy số dư tài khoản STK: ${targetAccountNo}...`);
    const balRes = await request('GET', `/user/account/${targetAccountNo}/balance`, sessionHeaders);
    if (balRes.json && balRes.json.data) {
      const bal = balRes.json.data;
      console.log(`💰 SỐ DƯ KHẢ DỤNG:  ${Number(bal.availableBalance || 0).toLocaleString('vi-VN')} VND`);
      console.log(`💰 SỐ DƯ THỰC TẾ:   ${Number(bal.accountBalance || 0).toLocaleString('vi-VN')} VND`);
    }

    console.log(`\n[*] Đang lấy 10 giao dịch gần nhất...`);
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

    const txRes = await request('POST', '/user/account/transaction/list', sessionHeaders, {
      format: 'group',
      index: 0,
      offset: -1,
      accountNo: targetAccountNo,
      accountType: '1025',
      fromDate: fmt(thirtyDaysAgo),
      toDate: fmt(today),
    });

    if (txRes.json && txRes.json.data && txRes.json.data.items) {
      console.log(`\n📜 [LỊCH SỬ GIAO DỊCH] (${txRes.json.data.items.length} nhóm giao dịch):`);
      for (const grp of txRes.json.data.items) {
        for (const item of (grp.itemDetailList || grp.items || [grp])) {
          console.log(`   • [${item.txnTime || item.transactionTime}] | ${item.txnType} ${Number(item.txnAmount || 0).toLocaleString('vi-VN')} đ | Nội dung: ${item.txnDesc}`);
        }
      }
    }
  }
}

// Main CLI router
const args = process.argv.slice(2);
const command = args[0] || 'login';

if (command === 'login' || command === 'test') {
  initiateLogin();
} else if (command === 'otp') {
  const otpCode = args[1];
  if (!otpCode) {
    console.log('Thiếu mã OTP! Cú pháp: node timo_tool.mjs otp <MÃ_OTP>');
  } else {
    verifyOtp(otpCode);
  }
} else {
  console.log('Lệnh không hợp lệ. Sử dụng:');
  console.log('  node timo_tool.mjs login');
  console.log('  node timo_tool.mjs otp <mã_otp>');
}
