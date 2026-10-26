import crypto from 'node:crypto';
import https from 'node:https';

const USERNAME = '0869482825';
const PASSWORD_RAW = 'Anhduong123@';
const APP_VERSION = '332';
const API_HOSTNAME = 'app2.timo.vn';

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

async function request(method, path, headers, body) {
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

async function runTest() {
  console.log('====================================================');
  console.log('🚀 TIMO BANK API CLIENT - KIỂM THỬ ĐĂNG NHẬP THỰC TẾ');
  console.log('====================================================');
  console.log(`[+] Số điện thoại (Username): ${USERNAME}`);
  console.log(`[+] Mật khẩu:                 ${PASSWORD_RAW.substring(0, 3)}*****`);

  const deviceId = generateDeviceId();
  const signature = buildBrowserSignature();
  const hashedPassword = sha512(PASSWORD_RAW);
  const deviceReg = buildDeviceReg(deviceId, signature);
  const contextId = buildContextId(deviceId);

  console.log(`[+] Device ID sinh ngẫu nhiên: ${deviceId}`);
  console.log(`[+] Chữ ký trình duyệt:       ${signature}`);
  console.log(`[+] SHA512 Password hash:     ${hashedPassword.substring(0, 16)}...`);
  console.log(`[+] Header x-timo-devicereg:  ${deviceReg}`);
  console.log(`[+] Header x-gofs-context-id: ${contextId}`);

  console.log('\n[*] Đang gửi yêu cầu đăng nhập tới https://app2.timo.vn/login ...');
  
  try {
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

    console.log(`\n[+] HTTP Status: ${res.statusCode}`);
    console.log('[+] Phản hồi từ Timo Bank:');
    console.log(JSON.stringify(res.json || res.raw, null, 2));

    if (res.json) {
      const { code, success, message, data } = res.json;
      if (code === 200 && success) {
        console.log('\n🎉 [KẾT QUẢ] ĐĂNG NHẬP THÀNH CÔNG NGAY LẬP TỨC (Không cần OTP)!');
        console.log(`- Token: ${data?.token}`);
        console.log(`- User ID: ${data?.userId}`);
        console.log(`- Timo Device ID: ${data?.timoDeviceId}`);
      } else if (code === 6001) {
        console.log('\n📲 [KẾT QUẢ] YÊU CẦU XÁC MINH THIẾT BỊ (OTP DEVICE CODE 6001)');
        console.log('👉 Mã OTP đã được gửi về số điện thoại hoặc app Timo của bạn!');
        console.log(`- refNo: ${data?.refNo}`);
        console.log(`- token tạm: ${data?.token}`);
        console.log('💡 Ghi chú: Nhập mã OTP này gửi tới endpoint /login/commit để hoàn tất liên kết thiết bị.');
      } else if (code === 6006) {
        console.log('\n📲 [KẾT QUẢ] YÊU CẦU XÁC MINH 2 LỚP (TWO-FACTOR OTP CODE 6006)');
        console.log('👉 Mã xác thực 2 lớp đã được gửi!');
        console.log(`- refNo: ${data?.refNo}`);
        console.log(`- token tạm: ${data?.token}`);
      } else if (code === 401) {
        console.log('\n❌ [KẾT QUẢ] THÔNG TIN ĐĂNG NHẬP KHÔNG ĐÚNG (Mã 401: Invalid phone number or password)');
        console.log('👉 Sai số điện thoại hoặc mật khẩu!');
      } else {
        console.log(`\n⚠️ [KẾT QUẢ] MÃ PHẢN HỒI: ${code} - Thông báo: ${message || 'Không có mô tả'}`);
      }
    }
  } catch (err) {
    console.error('\n❌ [LỖI KẾT NỐI]:', err.message);
  }
}

runTest();
