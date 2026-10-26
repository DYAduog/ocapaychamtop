import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CREDS_FILE = path.join(__dirname, 'timo_credentials.json');

const APP_VERSION = '332';
const API_HOSTNAME = 'app2.timo.vn';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildDeviceKey(timoDeviceId, signature) {
  return `${timoDeviceId}${signature}`;
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

function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

async function run() {
  if (!fs.existsSync(CREDS_FILE)) {
    console.error('[-] Không tìm thấy file timo_credentials.json!');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
  console.log('================================================================');
  console.log('🏦 TRUY VẤN THÔNG TIN & LỊCH SỬ GIAO DỊCH TIMO BANK');
  console.log('================================================================');
  console.log(`[+] Tài khoản (SĐT): ${creds.username}`);
  console.log(`[+] Device ID:       ${creds.deviceId}`);
  console.log(`[+] Timo Device ID:  ${creds.timoDeviceId}`);

  const contextId = buildContextId(creds.deviceId);
  const deviceReg = buildDeviceReg(creds.deviceId, creds.browserSignature);

  console.log('\n[*] Đang tự động đăng nhập bằng thiết bị đã xác thực (Bypass OTP)...');
  const loginRes = await request(
    'POST',
    '/login',
    {
      'x-timo-devicereg': deviceReg,
      'x-gofs-context-id': contextId,
    },
    {
      username: creds.username,
      password: creds.password,
      lang: 'vn',
    }
  );

  if (!loginRes.json || !loginRes.json.success || loginRes.json.code !== 200) {
    console.error('[-] Đăng nhập thất bại:', JSON.stringify(loginRes.json || loginRes.raw, null, 2));
    process.exit(1);
  }

  const sessionToken = loginRes.json.data.token;
  const userId = loginRes.json.data.userId;
  console.log(`✅ [ĐĂNG NHẬP THÀNH CÔNG] User ID: ${userId} (Không cần hỏi lại OTP!)`);

  const sessionHeaders = {
    token: sessionToken,
    'x-gofs-context-id': contextId,
    'x-timo-devicekey': buildDeviceKey(creds.timoDeviceId, creds.browserSignature),
  };

  // 1. Lấy thông tin chủ tài khoản (Profile)
  console.log('\n[*] Đang lấy thông tin chủ tài khoản (/user/getProfile)...');
  const profileRes = await request('GET', '/user/getProfile', sessionHeaders);
  if (profileRes.json && profileRes.json.data) {
    const p = profileRes.json.data;
    console.log('----------------------------------------------------------------');
    console.log(`👤 HỌ VÀ TÊN CHỦ TK: ${p.fullName || 'Chưa cập nhật'}`);
    console.log(`📱 Số điện thoại:     ${p.phoneNumber || creds.username}`);
    console.log(`📧 Email liên kết:    ${p.userEmail || 'Chưa có'}`);
    console.log(`🆔 CCCD/CMND:         ${p.nationalId || p.legalId || 'Chưa có'}`);
    console.log(`🎂 Ngày sinh:         ${p.dateOfBirth || 'Chưa có'}`);
    console.log('----------------------------------------------------------------');
  }

  // 2. Lấy danh sách tài khoản & số dư (/user/accountPreview)
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

  // 3. Lấy lịch sử giao dịch (/user/account/transaction/list)
  if (spendAccountNo) {
    console.log(`\n[*] Đang truy vấn lịch sử giao dịch cho STK [${spendAccountNo}] (30 ngày gần nhất)...`);
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const txRes = await request(
      'POST',
      '/user/account/transaction/list',
      sessionHeaders,
      {
        format: 'group',
        index: 0,
        offset: -1,
        accountNo: spendAccountNo,
        accountType: '1025',
        fromDate: formatDate(thirtyDaysAgo),
        toDate: formatDate(today),
      }
    );

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
        console.log('   (Không có giao dịch nào phát sinh trong 30 ngày qua)');
      } else {
        for (const it of items) {
          const type = it.txnType === 'CR' ? '➕ NHẬN' : '➖ CHUYỂN';
          const time = it.txnTime || it.transactionTime || 'N/A';
          const amt = Number(it.txnAmount || 0).toLocaleString('vi-VN');
          console.log(`   • [${time}] ${type} ${amt} đ | ${it.txnDesc}`);
          if (it.txnBankName || it.txnBankAccount) {
            console.log(`     -> Đến/Từ: ${it.txnBankName || ''} - STK: ${it.txnBankAccount || ''}`);
          }
        }
      }
    }
  }

  console.log('\n================================================================');
  console.log('✅ HOÀN THÀNH TRUY VẤN DỮ LIỆU TIMO BANK THÀNH CÔNG 100%!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('[-] Lỗi thực thi:', err);
});
