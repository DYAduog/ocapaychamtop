/**
 * TPBank (Tien Phong Commercial Joint Stock Bank) API Client
 * Phiên bản Node.js ES Module & CommonJS tương thích cho 7Bank Gateway
 *
 * Tính năng:
 *   - Login Step 1: Khởi tạo đăng nhập (username, password, deviceId)
 *   - Check Transaction: Kiểm tra trạng thái xác thực Smart OTP / FacePay
 *   - Resend Notification: Gửi lại thông báo xác thực tới ứng dụng TPBank
 *   - Login Step 2: Hoàn tất phiên đăng nhập và nhận Bearer Access Token
 *   - Vấn tin thông tin khách hàng (getCustomers)
 *   - Vấn tin tài khoản & số dư (getAccounts, getBalance)
 *   - Tra cứu lịch sử giao dịch (getTransactions)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

// Helper chờ người dùng nhấn phím
function promptUser(promptText = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(promptText, ans => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'nodejs-server/.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../nodejs-server/.env'),
    path.resolve(__dirname, 'nodejs-server/.env')
  ];

  for (const envFile of candidates) {
    if (fs.existsSync(envFile)) {
      try {
        const text = fs.readFileSync(envFile, 'utf8');
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (e) {
        // bỏ qua nếu không đọc được
      }
    }
  }
}
loadEnv();

// Bản đồ giải mã lỗi thường gặp của TPBank eBank
const ERROR_MAP = {
  '50525': 'Sai tên đăng nhập hoặc mật khẩu (INVALID_CREDENTIAL)',
  '50526': 'Tài khoản tạm thời bị khóa do nhập sai nhiều lần',
  '70115': 'Phiên bản ứng dụng không còn được hỗ trợ, cần cập nhật app_version',
  '40001': 'Phiên đăng nhập đã hết hạn (TOKEN_EXPIRED)',
  '40003': 'Thiết bị chưa được tin cậy hoặc chưa đăng ký Smart OTP'
};

// ----------------------------------------------------
// TPBank API Client Class
// ----------------------------------------------------
class TPBankClient {
  constructor(config = {}) {
    this.deviceId = config.deviceId || process.env.TPB_DEVICE_ID || 'KpWCqmyUvmiul5EQ26Xm4JW6dNSVNQ0Y1z0dhTKLQw3Pa';
    this.username = config.username || process.env.TPB_USERNAME || '';
    this.password = config.password || process.env.TPB_PASSWORD || '';
    this.token = config.token || process.env.TPB_TOKEN || null;
    this.accountNo = config.accountNo || process.env.TPB_ACCOUNT_NO || '';
    this.appVersion = config.appVersion || '2026.05.22';
  }

  getHeaders(customHeaders = {}) {
    return {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
      'app_version': this.appVersion,
      'Authorization': this.token ? `Bearer ${this.token}` : 'Bearer',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
      'device_id': this.deviceId,
      'device_name': 'Chrome',
      'platform_name': 'WEB',
      'platform_version': '146',
      'Pragma': 'no-cache',
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'Origin': 'https://ebank.tpb.vn',
      'Referer': 'https://ebank.tpb.vn/',
      'source_app': 'HYDRO',
      'user_name': 'HYD',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      ...customHeaders
    };
  }

  /**
   * Helper parse error payload từ TPBank response
   */
  parseError(status, errorText) {
    try {
      const errJson = JSON.parse(errorText);
      const code = errJson?.error?.error_code || errJson?.code || '';
      const msg = ERROR_MAP[code] || errJson?.error?.error_message || errJson?.message || errorText;
      return `[Mã ${code || status}] ${msg}`;
    } catch {
      return `[HTTP ${status}] ${errorText}`;
    }
  }

  /**
   * Step 1: Submit username and password.
   */
  async loginStep1() {
    if (!this.username || !this.password) {
      throw new Error('Thiếu tên đăng nhập (username) hoặc mật khẩu (password)');
    }

    const url = 'https://ebank.tpb.vn/gateway/api/auth/login/v4/non-trust';
    const body = {
      username: this.username,
      password: this.password,
      deviceId: this.deviceId,
      transactionId: ''
    };

    console.log(`[TPBank Client] Gửi yêu cầu Đăng nhập Bước 1 (User: ${this.username})...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    const resText = await response.text();
    let data;
    try {
      data = JSON.parse(resText);
    } catch {
      throw new Error(`Phản hồi máy chủ không hợp lệ: [HTTP ${response.status}] ${resText}`);
    }

    // TPBank trả về mã 70101: Yêu cầu xác thực 2FA (eToken, Smart OTP hoặc FacePay)
    if (data?.error?.error_code === '70101' || (data?.error?.transaction_id && data?.error?.rsa_token)) {
      console.log('🔔 [Yêu Cầu 2FA] Thông tin tài khoản chính xác! TPBank yêu cầu xác thực 2FA.');
      return {
        require2FA: true,
        transactionId: data.error.transaction_id,
        rsaToken: data.error.rsa_token,
        authMethod: data.error.high_risk_auth_method || 'etoken',
        message: 'Tài khoản yêu cầu xác thực 2FA trên ứng dụng TPBank'
      };
    }

    if (!response.ok) {
      throw new Error(`Đăng nhập Bước 1 thất bại: ${this.parseError(response.status, resText)}`);
    }

    if (data.access_token) {
      this.token = data.access_token;
    }
    return data;
  }

  /**
   * Step 2: Check authentication / transaction status.
   */
  async checkTransaction(transactionId, rsaToken) {
    const url = 'https://ebank.tpb.vn/gateway/api/auth/transaction/check';
    const body = {
      rsaToken: rsaToken,
      transactionId: transactionId
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    const resText = await response.text();
    let resJson;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = { status: response.status, raw: resText };
    }

    return resJson;
  }

  /**
   * Gửi lại mã Smart OTP/FacePay login notification tới điện thoại
   */
  async resendNotification(cif, rsaToken) {
    const url = 'https://ebank.tpb.vn/gateway/api/facepay-pandp-service/v1/smart-face/resend-noti-login';
    const body = {
      deviceId: this.deviceId,
      rsaToken: rsaToken,
      cif: cif || this.username
    };

    console.log('[TPBank Client] Đang gửi lệnh kích hoạt thông báo tới ứng dụng TPBank...');
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[TPBank Client] Gửi thông báo thất bại: [HTTP ${response.status}] ${errorText}`);
      return false;
    }

    console.log('📲 ✅ [ĐÃ GỬI THÔNG BÁO] Kiểm tra thông báo hoặc mở App TPBank trên điện thoại để xác nhận!');
    return true;
  }

  /**
   * Step 3: Complete login process once verified.
   */
  async loginStep2(transactionId) {
    const url = 'https://ebank.tpb.vn/gateway/api/auth/login/v4/non-trust';
    const body = {
      username: this.username,
      password: this.password,
      deviceId: this.deviceId,
      transactionId: transactionId
    };

    console.log('[TPBank Client] Hoàn tất Đăng nhập Bước 2...');
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Đăng nhập Bước 2 thất bại: ${this.parseError(response.status, errorText)}`);
    }

    const data = await response.json();
    if (data.access_token) {
      this.token = data.access_token;
    }
    return data;
  }

  /**
   * Fetch authenticated client information
   */
  async getCustomers() {
    const url = 'https://ebank.tpb.vn/gateway/api/customers-presentation-service/v1/customers';
    console.log('[TPBank Client] Đang lấy thông tin chủ tài khoản...');
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lấy thông tin khách hàng thất bại: ${this.parseError(response.status, errorText)}`);
    }

    return await response.json();
  }

  /**
   * Fetch account balances and details
   */
  async getAccounts() {
    const url = 'https://ebank.tpb.vn/gateway/api/common-presentation-service/v1/bank-accounts?function=inquiry';
    console.log('[TPBank Client] Đang tra cứu danh sách tài khoản & số dư...');
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lấy danh sách tài khoản thất bại: ${this.parseError(response.status, errorText)}`);
    }

    return await response.json();
  }

  /**
   * Lấy số dư khả dụng
   */
  async getBalance(accountNo = null) {
    const accounts = await this.getAccounts();
    if (Array.isArray(accounts) && accounts.length > 0) {
      if (accountNo) {
        const found = accounts.find(a => (a.BBAN === accountNo || a.accountNo === accountNo));
        return found ? found.availableBalance : null;
      }
      return accounts[0].availableBalance;
    }
    return null;
  }

  /**
   * Fetch transaction history for a specific account
   */
  async getTransactions(accountNo, fromDate = null, toDate = null, keyword = '') {
    const targetAccount = accountNo || this.accountNo;
    if (!targetAccount) {
      throw new Error('Vui lòng cung cấp số tài khoản cần tra cứu biến động');
    }

    // Tự động tính toán ngày nếu không truyền vào (mặc định lấy 30 ngày gần nhất)
    const now = new Date();
    const formatYYYYMMDD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    };

    const finalToDate = toDate || formatYYYYMMDD(now);
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const finalFromDate = fromDate || formatYYYYMMDD(pastDate);

    const url = 'https://ebank.tpb.vn/gateway/api/smart-search-presentation-service-v2/v2/account-transactions/find';
    const body = {
      pageNumber: 1,
      pageSize: 400,
      accountNo: targetAccount,
      currency: 'VND',
      maxAcentrysrno: '',
      fromDate: finalFromDate,
      toDate: finalToDate,
      keyword: keyword
    };

    console.log(`[TPBank Client] Đang quét lịch sử giao dịch TK ${targetAccount} (${finalFromDate} -> ${finalToDate})...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tra cứu lịch sử giao dịch thất bại: ${this.parseError(response.status, errorText)}`);
    }

    return await response.json();
  }

  /**
   * Kiểm tra kết nối tới máy chủ TPBank eBank (Diagnostic Ping)
   */
  async testConnectivity() {
    try {
      console.log('[Diagnostic] Đang kiểm tra kết nối tới máy chủ ebank.tpb.vn...');
      const response = await fetch('https://ebank.tpb.vn/gateway/api/auth/login/v4/non-trust', {
        method: 'OPTIONS',
        headers: this.getHeaders()
      });
      return {
        ok: true,
        status: response.status,
        message: 'Kết nối mạng tới TPBank eBank hoạt động tốt (Status: ' + response.status + ')'
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message
      };
    }
  }
}

// ----------------------------------------------------
// CLI & Execution Flow Runner
// ----------------------------------------------------
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Phân tích tham số dòng lệnh (CLI args: --username=... --password=... hoặc -u ... -p ...)
function parseCliArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--username=')) result.username = a.split('=')[1];
    else if (a === '-u' && args[i + 1]) result.username = args[++i];
    else if (a.startsWith('--password=')) result.password = a.split('=')[1];
    else if (a === '-p' && args[i + 1]) result.password = args[++i];
    else if (a.startsWith('--token=')) result.token = a.split('=')[1];
    else if (a.startsWith('--device=')) result.deviceId = a.split('=')[1];
    else if (a === '--test' || a === '--diagnostic') result.diagnosticOnly = true;
  }
  return result;
}

async function run() {
  const cli = parseCliArgs();

  const config = {
    username: cli.username || process.env.TPB_USERNAME || '',
    password: cli.password || process.env.TPB_PASSWORD || '',
    token: cli.token || process.env.TPB_TOKEN || '',
    deviceId: cli.deviceId || process.env.TPB_DEVICE_ID || 'KpWCqmyUvmiul5EQ26Xm4JW6dNSVNQ0Y1z0dhTKLQw3Pa'
  };

  console.log('====================================================');
  console.log('🚀 TPBank Banking API Client - 7Bank Gateway Tool');
  console.log('====================================================');

  const client = new TPBankClient(config);

  // 1. Kiểm tra kết nối mạng tới TPBank
  const conn = await client.testConnectivity();
  if (conn.ok) {
    console.log(`✅ [Kiểm Tra Mạng] ${conn.message}`);
  } else {
    console.error(`❌ [Lỗi Mạng] Không thể kết nối tới TPBank: ${conn.error}`);
    return;
  }

  // Nếu người dùng chỉ muốn test kết nối hoặc chưa nhập tài khoản
  if (cli.diagnosticOnly || (!config.username && !config.token)) {
    console.log('\n📌 [Hướng Dẫn Sử Dụng]');
    console.log('Bạn có thể cấu hình tài khoản qua 1 trong các cách sau:');
    console.log('  1. Điền vào file .env:');
    console.log('     TPB_USERNAME=0987654321');
    console.log('     TPB_PASSWORD=MatKhauCuaBan');
    console.log('     TPB_DEVICE_ID=KpWCqmyUvmiul5EQ26Xm4JW6dNSVNQ0Y1z0dhTKLQw3Pa (Tùy chọn)');
    console.log('     TPB_TOKEN=... (Nếu đã có token sẵn)');
    console.log('\n  2. Hoặc truyền trực tiếp qua dòng lệnh:');
    console.log('     node core/class/tpbank.js -u 0987654321 -p MatKhau123');
    console.log('     node core/class/tpbank.js --token=eyJh... (Nếu đã có token)');
    console.log('====================================================\n');
    return;
  }

  try {
    // Nếu đã có token sẵn -> bỏ qua bước đăng nhập
    if (client.token) {
      console.log('🔑 Sử dụng Token phiên có sẵn để tra cứu...');
    } else {
      // BƯỚC 1: Đăng nhập
      const step1 = await client.loginStep1();
      console.log('📥 [Kết Quả Bước 1]', JSON.stringify(step1, null, 2));

      if (step1.access_token) {
        client.token = step1.access_token;
      }

      if (step1.transactionId) {
        const transactionId = step1.transactionId;
        const rsaToken = step1.rsaToken || process.env.TPB_RSA_TOKEN;
        const authMethod = step1.authMethod || 'eToken';

        console.log(`\n⏳ Mã Giao Dịch (Transaction ID): ${transactionId}`);
        console.log(`📱 Phương thức xác thực: ${authMethod.toUpperCase()}`);

        // Tự động kích hoạt thông báo Push về ứng dụng TPBank trên điện thoại 1 lần duy nhất
        await client.resendNotification(client.username, rsaToken);

        console.log('\n----------------------------------------------------------------------');
        console.log('👉 BƯỚC TIẾP THEO: Hãy mở App TPBank trên điện thoại và bấm [Xác Nhận].');
        console.log('----------------------------------------------------------------------');

        let authenticated = false;
        let continueTrying = true;

        while (!authenticated && continueTrying) {
          await promptUser('👉 Nhấn phím [ENTER] sau khi bạn đã bấm xác nhận trên App để kiểm tra: ');

          console.log('[Xác Thực 2FA] Đang kiểm tra xác nhận từ máy chủ TPBank (1 lần)...');
          const check = await client.checkTransaction(transactionId, rsaToken);
          const currentStatus = check?.status || check?.data?.status || 'N/A';
          console.log(`📥 Trạng thái máy chủ phản hồi: [${currentStatus}]`);

          // TPBank eBank Web trả về status: "CONFIRM" hoặc "SUCCESS" khi người dùng xác nhận trên điện thoại
          if (currentStatus === 'CONFIRM' || currentStatus === 'SUCCESS') {
            console.log('\n🎉 ĐÃ XÁC THỰC THÀNH CÔNG TRÊN APP ĐIỆN THOẠI!');
            authenticated = true;
          } else {
            console.log(`⚠️ Máy chủ TPBank báo chưa nhận được xác nhận (Trạng thái hiện tại: ${currentStatus}).`);
            const ans = await promptUser('Bạn có muốn kiểm tra lại không? (Nhấn ENTER để kiểm tra lại, hoặc gõ "q" để thoát): ');
            if (ans.toLowerCase() === 'q') {
              continueTrying = false;
              console.log('Đã dừng quy trình đăng nhập.');
              return;
            }
          }
        }

        if (authenticated) {
          console.log('🚀 Đang gửi lệnh hoàn tất đăng nhập Bước 2...');
          const step2 = await client.loginStep2(transactionId);
          if (step2.access_token) {
            client.token = step2.access_token;
            console.log('\n====================================================');
            console.log('✅ ĐĂNG NHẬP THÀNH CÔNG! ĐÃ CẤP ACCESS TOKEN:');
            console.log(client.token);
            console.log('💡 Mẹo: Bạn có thể thêm dòng sau vào file .env để dùng trực tiếp:');
            console.log(`TPB_TOKEN=${client.token}`);
            console.log('====================================================\n');
          }
        } else {
          console.log('\n⚠️ Chưa hoàn tất xác thực.');
          return;
        }
      }
    }

    // BƯỚC 4: Vấn tin tài khoản & Lịch sử giao dịch khi đã có token
    if (client.token) {
      try {
        const customer = await client.getCustomers();
        console.log('👤 [Thông Tin Chủ Tài Khoản]', JSON.stringify(customer, null, 2));
      } catch (err) {
        console.warn('⚠️ Không thể lấy thông tin khách hàng:', err.message);
      }

      try {
        const accounts = await client.getAccounts();
        console.log('\n💳 [Danh Sách Tài Khoản & Số Dư]');
        if (Array.isArray(accounts)) {
          accounts.forEach((acc, idx) => {
            const stk = acc.BBAN || acc.accountNo;
            console.log(`  Tài khoản ${idx + 1}:`);
            console.log(`    - Số tài khoản: ${stk}`);
            console.log(`    - Số dư khả dụng: ${new Intl.NumberFormat('vi-VN').format(acc.availableBalance)} ${acc.currency}`);
            console.log(`    - Tên chủ thẻ: ${acc.name}`);
          });

          if (accounts.length > 0) {
            const firstSTK = accounts[0].BBAN || accounts[0].accountNo;
            if (firstSTK) {
              try {
                const history = await client.getTransactions(firstSTK);
                console.log(`\n📜 [Biến Động Giao Dịch Gần Nhất - TK: ${firstSTK}]`);
                if (history && history.transactionInfos && history.transactionInfos.length > 0) {
                  history.transactionInfos.slice(0, 10).forEach((tx, idx) => {
                    const date = tx.bookingDate || tx.valueDate || tx.txDate || 'N/A';
                    console.log(`  [${idx + 1}] ${date} | Số tiền: ${tx.amount} VND | ND: ${tx.description}`);
                  });
                } else {
                  console.log('  (Không có giao dịch nào trong 30 ngày qua)');
                }
              } catch (txErr) {
                console.warn(`⚠️ Không thể lấy lịch sử giao dịch của ${firstSTK}:`, txErr.message);
              }
            }
          }
        } else {
          console.log(JSON.stringify(accounts, null, 2));
        }
      } catch (err) {
        console.warn('⚠️ Lỗi tra cứu tài khoản:', err.message);
      }
    }
  } catch (error) {
    console.error('❌ [Lỗi Quy Trình]', error.message);
  }
}

// Khởi chạy runner khi gọi trực tiếp từ command line
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  run();
}

// Hỗ trợ xuất module cho cả ES Module & CommonJS
export default TPBankClient;
export { TPBankClient };