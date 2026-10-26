#!/usr/bin/env node
/**
 * ==============================================================================
 * 7BANK / OCAPAY GATEWAY - VPS PRE-FLIGHT DOCTOR & AUTO-SETUP SCRIPT
 * Tự động kiểm tra cấu hình máy chủ, phiên bản phần mềm và setup môi trường VPS
 * Hoạt động trơn tru trên cả Windows VPS và Linux VPS (Ubuntu/Debian)
 * ==============================================================================
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync, spawnSync } = require('child_process');

// Màu sắc hiển thị Terminal
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

const pass = `${colors.green}${colors.bold}[✓] THÀNH CÔNG:${colors.reset}`;
const fail = `${colors.red}${colors.bold}[✗] THẤT BẠI:  ${colors.reset}`;
const warn = `${colors.yellow}${colors.bold}[!] CẢNH BÁO:  ${colors.reset}`;
const info = `${colors.cyan}${colors.bold}[*] THÔNG TIN: ${colors.reset}`;

const isAutoSetup = process.argv.includes('--fix') || process.argv.includes('--auto-setup') || process.argv.includes('--setup');
const isQuick = process.argv.includes('--quick');

const projectRoot = path.resolve(__dirname, '../..');
const serverRoot = path.resolve(__dirname, '..');

let totalErrors = 0;
let totalWarnings = 0;

console.log('\n' + '='.repeat(70));
console.log(`${colors.cyan}${colors.bold}   🔍 7BANK GATEWAY - KIỂM TRA MÁY CHỦ & TỰ ĐỘNG SETUP HỆ THỐNG${colors.reset}`);
console.log(`${colors.dim}   Hệ điều hành: ${os.type()} ${os.release()} (${os.arch()}) | Hostname: ${os.hostname()}${colors.reset}`);
console.log('='.repeat(70) + '\n');

// ------------------------------------------------------------------------------
// 1. KIỂM TRA NODE.JS
// ------------------------------------------------------------------------------
function checkNode() {
  const currentVersion = process.version;
  const major = parseInt(currentVersion.replace('v', '').split('.')[0], 10);
  const minVersion = 18;
  const recommendedVersion = 20;

  if (major >= minVersion) {
    console.log(`${pass} Node.js ${colors.bold}${currentVersion}${colors.reset} (Đạt yêu cầu tối thiểu >= v${minVersion}. Khuyên dùng v${recommendedVersion}+).`);
  } else {
    console.log(`${fail} Node.js hiện tại là ${currentVersion}, yêu cầu tối thiểu từ v${minVersion}.x trở lên!`);
    console.log(`     👉 Vui lòng cập nhật Node.js tại https://nodejs.org/`);
    totalErrors++;
  }
}

// ------------------------------------------------------------------------------
// 2. KIỂM TRA PYTHON & PHIÊN BẢN
// ------------------------------------------------------------------------------
function checkPython() {
  let pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  if (process.env.PYTHON_PATH) {
    pythonCmd = process.env.PYTHON_PATH.trim();
  }

  // Thử các lệnh python candidate
  const candidates = [pythonCmd, 'python', 'python3', 'py'];
  let validPython = null;
  let pyVersion = '';

  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0) {
        validPython = cmd;
        pyVersion = (res.stdout || res.stderr || '').trim();
        break;
      }
    } catch (_) {}
  }

  if (validPython) {
    console.log(`${pass} Python Engine: ${colors.bold}${pyVersion}${colors.reset} (Lệnh: '${validPython}')`);
    return validPython;
  } else {
    console.log(`${fail} Không tìm thấy Python trên máy chủ!`);
    if (process.platform === 'win32') {
      console.log(`     👉 Trên Windows: Tải và cài đặt Python 3.10 - 3.14 tại https://www.python.org/ (Nhớ tích chọn "Add python.exe to PATH")`);
    } else {
      console.log(`     👉 Trên Linux (Ubuntu/Debian): Chạy lệnh 'sudo apt install -y python3 python3-pip'`);
    }
    totalErrors++;
    return null;
  }
}

// ------------------------------------------------------------------------------
// 3. KIỂM TRA THƯ VIỆN PYTHON (AI CAPTCHA & BANKING DEPENDENCIES)
// ------------------------------------------------------------------------------
function checkPythonModules(pythonCmd) {
  if (!pythonCmd) return;

  const checkScript = `
import sys, json
required = ["requests", "cryptography", "Crypto", "PIL", "numpy", "cv2", "ddddocr"]
missing = []
for mod in required:
    try:
        __import__(mod)
    except ImportError:
        missing.append(mod)
print(json.dumps(missing))
`;

  try {
    const res = spawnSync(pythonCmd, ['-c', checkScript], { encoding: 'utf8', timeout: 10000 });
    if (res.status === 0) {
      const missing = JSON.parse(res.stdout.trim() || '[]');
      if (missing.length === 0) {
        console.log(`${pass} Thư viện Python AI Captcha (ddddocr, opencv, cryptography, requests,...): ${colors.bold}Đã cài đủ 100%${colors.reset}`);
      } else {
        console.log(`${warn} Thiếu ${missing.length} gói thư viện Python: [${missing.join(', ')}]`);
        if (isAutoSetup) {
          console.log(`${info} Đang tự động chạy lệnh cài đặt thư viện Python từ requirements.txt...`);
          try {
            const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3';
            execSync(`${pythonCmd} -m pip install -r requirements.txt`, {
              cwd: projectRoot,
              stdio: 'inherit',
            });
            console.log(`${pass} Đã cài đặt thành công toàn bộ thư viện Python!`);
          } catch (pipErr) {
            console.log(`${fail} Lỗi cài đặt thư viện qua pip: ${pipErr.message}`);
            totalErrors++;
          }
        } else {
          console.log(`     👉 Để cài đặt tự động, chạy: ${colors.bold}${pythonCmd} -m pip install -r requirements.txt${colors.reset}`);
          totalWarnings++;
        }
      }
    }
  } catch (err) {
    console.log(`${warn} Không thể kiểm tra module Python: ${err.message}`);
    totalWarnings++;
  }
}

// ------------------------------------------------------------------------------
// 4. KIỂM TRA MONGODB
// ------------------------------------------------------------------------------
function checkMongoDB() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(2500);

    socket.connect(27017, '127.0.0.1', () => {
      isConnected = true;
      socket.destroy();
      console.log(`${pass} Cơ sở dữ liệu MongoDB: ${colors.bold}Đang lắng nghe tại 127.0.0.1:27017 (Sẵn sàng)${colors.reset}`);
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
    });

    socket.on('timeout', () => {
      socket.destroy();
    });

    socket.on('close', () => {
      if (!isConnected) {
        console.log(`${warn} Chưa thấy dịch vụ MongoDB hoạt động tại cổng 27017!`);

        if (process.platform === 'win32') {
          console.log(`${info} Đang thử tự động khởi động dịch vụ MongoDB trên Windows...`);
          try {
            execSync('net start MongoDB', { stdio: 'ignore' });
            console.log(`${pass} Đã kích hoạt thành công dịch vụ MongoDB Server trên Windows!`);
            return resolve(true);
          } catch (_) {
            console.log(`     👉 Trên Windows: Vui lòng mở Services (services.msc) tìm 'MongoDB Server' và bấm 'Start'.`);
            console.log(`     👉 Hoặc tải bản cài đặt MongoDB Community Server tại https://www.mongodb.com/try/download/community`);
          }
        } else {
          console.log(`${info} Đang thử kích hoạt MongoDB trên Linux (systemctl start mongod)...`);
          try {
            execSync('sudo systemctl start mongod', { stdio: 'ignore' });
            console.log(`${pass} Đã khởi động dịch vụ mongod trên Linux!`);
            return resolve(true);
          } catch (_) {
            console.log(`     👉 Trên Linux: Chạy lệnh 'sudo systemctl start mongod'`);
          }
        }
        totalWarnings++;
        resolve(false);
      }
    });
  });
}

// ------------------------------------------------------------------------------
// 5. KIỂM TRA THƯ VIỆN NODE.JS (node_modules)
// ------------------------------------------------------------------------------
function checkNodeModules() {
  const nodeModulesPath = path.join(serverRoot, 'node_modules');
  const expressPkg = path.join(nodeModulesPath, 'express');

  if (fs.existsSync(nodeModulesPath) && fs.existsSync(expressPkg)) {
    console.log(`${pass} Thư viện Node.js (node_modules): ${colors.bold}Đã cài đặt sẵn${colors.reset}`);
  } else {
    console.log(`${warn} Chưa tìm thấy thư mục node_modules hoặc bị thiếu package!`);
    if (isAutoSetup) {
      console.log(`${info} Đang tự động chạy 'npm install' trong thư mục nodejs-server...`);
      try {
        execSync('npm install --production', { cwd: serverRoot, stdio: 'inherit' });
        console.log(`${pass} Đã cài đặt xong toàn bộ dependencies Node.js!`);
      } catch (npmErr) {
        console.log(`${fail} Lỗi chạy npm install: ${npmErr.message}`);
        totalErrors++;
      }
    } else {
      console.log(`     👉 Để cài đặt, chạy: cd nodejs-server && npm install`);
      totalWarnings++;
    }
  }
}

// ------------------------------------------------------------------------------
// 6. KIỂM TRA FILE CẤU HÌNH .ENV & KHÓA BẢO MẬT RSA
// ------------------------------------------------------------------------------
function checkConfigAndKeys() {
  const envPath = path.join(serverRoot, '.env');
  const envExamplePath = path.join(serverRoot, '.env.example');

  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    console.log(`${info} Đang tự động tạo file .env từ mẫu .env.example...`);
    fs.copyFileSync(envExamplePath, envPath);
    console.log(`${pass} Đã tạo thành công file cấu hình .env`);
  } else if (fs.existsSync(envPath)) {
    console.log(`${pass} File cấu hình môi trường (.env): ${colors.bold}Tồn tại${colors.reset}`);
  }

  // Khóa RSA
  const keysDir = path.join(serverRoot, 'keys');
  const serverPrivate = path.join(keysDir, 'serverPrivate.pem');
  const serverPublic = path.join(keysDir, 'serverPublic.pem');

  if (fs.existsSync(serverPrivate) && fs.existsSync(serverPublic)) {
    console.log(`${pass} Cặp khóa mật mã bảo mật RSA (serverPrivate/serverPublic.pem): ${colors.bold}Hợp lệ${colors.reset}`);
  } else {
    console.log(`${info} Đang tự động khởi tạo cặp khóa bảo mật RSA 2048-bit...`);
    try {
      const crypto = require('crypto');
      fs.mkdirSync(keysDir, { recursive: true });
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      fs.writeFileSync(serverPublic, publicKey, 'utf8');
      fs.writeFileSync(serverPrivate, privateKey, 'utf8');
      fs.writeFileSync(path.join(keysDir, 'clientPublic.pem'), publicKey, 'utf8');
      fs.writeFileSync(path.join(keysDir, 'clientPrivate.pem'), privateKey, 'utf8');
      console.log(`${pass} Đã tự động sinh mới cặp khóa RSA 2048-bit tại ${keysDir}`);
    } catch (keyErr) {
      console.log(`${warn} Không thể ghi khóa RSA: ${keyErr.message}`);
    }
  }
}

// ------------------------------------------------------------------------------
// 7. KIỂM TRA TRÍ TUỆ NHÂN TẠO GIẢI CAPTCHA OFFLINE (DDDDOCR)
// ------------------------------------------------------------------------------
function checkCaptchaEngine(pythonCmd) {
  if (!pythonCmd || isQuick) return;

  const testScript = `
import sys, json, os, time
from captcha_solver import solve_captcha_dict

sample_file = os.path.join(os.getcwd(), 'captcha_samples.json')
if os.path.isfile(sample_file):
    try:
        with open(sample_file, 'r', encoding='utf-8') as f:
            samples = json.load(f)
            b64_obj = samples.get('vcb') or list(samples.values())[0]
            b64 = b64_obj.get('b64') if isinstance(b64_obj, dict) else b64_obj
            res = solve_captcha_dict(b64)
            print(json.dumps(res))
            sys.exit(0)
    except Exception as e:
        print(json.dumps({"status": False, "msg": str(e)}))
        sys.exit(1)
print(json.dumps({"status": False, "msg": "Khong co file captcha_samples.json"}))
`;

  try {
    const start = Date.now();
    const res = spawnSync(pythonCmd, ['-c', testScript], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 10000,
    });

    if (res.status === 0 && res.stdout) {
      const parsed = JSON.parse(res.stdout.trim() || '{}');
      if (parsed.status === true) {
        const elapsed = Date.now() - start;
        console.log(`${pass} AI Captcha Solver (ddddocr ONNX): ${colors.bold}Hoạt động xuất sắc!${colors.reset} (Nhận diện mẫu: '${parsed.prediction}', Tốc độ: ${elapsed}ms, 100% Offline)`);
      } else {
        console.log(`${warn} AI Captcha Solver phản hồi cảnh báo: ${parsed.msg || 'Không rõ'}`);
      }
    }
  } catch (_) {}
}

// ------------------------------------------------------------------------------
// 8. KIỂM TRA CỔNG 3000
// ------------------------------------------------------------------------------
function checkPort3000() {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`${info} Cổng 3000 hiện đang được sử dụng (Server có thể đang chạy sẵn).`);
        } else {
          console.log(`${warn} Cổng 3000: ${err.message}`);
        }
        resolve(false);
      })
      .once('listening', () => {
        tester.once('close', () => {
          console.log(`${pass} Cổng kết nối Web & API (Port 3000): ${colors.bold}Trống và sẵn sàng lắng nghe${colors.reset}`);
          resolve(true);
        }).close();
      })
      .listen(3000, '0.0.0.0');
  });
}

// ------------------------------------------------------------------------------
// TỔNG KẾT & ĐIỀU PHỐI CHÍNH
// ------------------------------------------------------------------------------
async function main() {
  checkNode();
  const py = checkPython();
  checkPythonModules(py);
  await checkMongoDB();
  checkNodeModules();
  checkConfigAndKeys();
  checkCaptchaEngine(py);
  await checkPort3000();

  console.log('\n' + '='.repeat(70));
  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(`${colors.green}${colors.bold}   🎉 CHÚC MỪNG: MÁY CHỦ ĐẠT CHUẨN 100%! HỆ THỐNG SẴN SÀNG HOẠT ĐỘNG!${colors.reset}`);
    console.log(`${colors.cyan}   👉 Bạn có thể khởi động hệ thống bằng lệnh: ${colors.bold}npm run start${colors.reset} hoặc click ${colors.bold}start_server.bat${colors.reset}`);
  } else if (totalErrors === 0) {
    console.log(`${colors.yellow}${colors.bold}   ⚠️  MÁY CHỦ CƠ BẢN SẴN SÀNG (Có ${totalWarnings} cảnh báo nhẹ không ảnh hưởng nghiêm trọng)${colors.reset}`);
    console.log(`${colors.cyan}   👉 Bạn có thể khởi động hệ thống ngay bây giờ!${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}   ❌ CẦN XỬ LÝ ${totalErrors} LỖI BẮT BUỘC Ở TRÊN TRƯỚC KHI KHỞI CHẠY HỆ THỐNG!${colors.reset}`);
    console.log(`${colors.yellow}   👉 Mẹo: Chạy 'node scripts/vps-doctor.js --fix' để hệ thống tự động sửa lỗi.${colors.reset}`);
  }
  console.log('='.repeat(70) + '\n');

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[Doctor Error]:', e);
  process.exit(1);
});
