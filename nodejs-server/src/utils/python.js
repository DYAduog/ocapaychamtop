const path = require('path');
const fs = require('fs');

/**
 * Tự động nhận diện chính xác đường dẫn thực thi của Python trên mọi hệ điều hành
 * - Trên Windows: Tự động dùng 'python' (kể cả khi file .env vô tình ghi 'python3')
 * - Trên Linux/Docker: Tự động dùng 'python3' (hoặc giá trị trong PYTHON_PATH)
 */
function getPythonExecutable() {
  const envVal = (process.env.PYTHON_PATH || '').trim();

  if (process.platform === 'win32') {
    // Nếu chạy trên Windows mà env ghi là 'python3' -> Sửa thành 'python' để không bao giờ bị lỗi ENOENT
    if (!envVal || envVal.toLowerCase() === 'python3' || envVal.toLowerCase() === 'python3.exe') {
      return 'python';
    }
    return envVal;
  }

  // Trên Linux / Docker / macOS
  if (!envVal || envVal.toLowerCase() === 'python') {
    return 'python3';
  }
  return envVal;
}

/**
 * Dò tìm đường dẫn thư mục gốc chứa các script Python (captcha_solver.py, python_bridge.py)
 */
function getPythonProjectRoot() {
  const candidates = [
    process.env.PROJECT_ROOT,
    path.resolve(__dirname, '../../..'),
    path.resolve(__dirname, '../..'),
    path.resolve(process.cwd(), '..'),
    process.cwd(),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'captcha_solver.py')) || fs.existsSync(path.join(dir, 'python_bridge.py'))) {
        return dir;
      }
    } catch (_) {}
  }

  return path.resolve(__dirname, '../../..');
}

module.exports = {
  getPythonExecutable,
  getPythonProjectRoot,
};
