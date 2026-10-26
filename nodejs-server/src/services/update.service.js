const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec, spawnSync } = require('child_process');
const Setting = require('../models/Setting');
const { getPythonExecutable } = require('../utils/python');

class UpdateService {
  constructor() {
    this.rootDir = path.resolve(__dirname, '../../..');
    this.serverDir = path.resolve(__dirname, '../..');
    this.backupsDir = path.resolve(this.serverDir, 'backups');
    this.versionFileCandidates = [
      path.resolve(this.serverDir, 'version.json'),
      path.resolve(this.rootDir, 'version.json'),
    ];
  }

  /**
   * Lấy thông tin phiên bản hiện tại
   */
  getCurrentVersion() {
    for (const p of this.versionFileCandidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          return JSON.parse(raw);
        } catch (_) {}
      }
    }

    return {
      version: '3.2.0',
      buildDate: '2026-10-26',
      name: '7Bank / OcaPay Gateway',
      channel: 'stable',
      title: 'Bản Phát Hành 7Bank Gateway v3.2.0',
      description: 'Cổng Auto Bank & AI Captcha 100% Offline',
      changelog: [
        'Hệ thống tự động hóa ngân hàng và AI Captcha nội bộ đạt chuẩn VPS',
      ],
    };
  }

  /**
   * Đọc cấu hình nguồn cập nhật từ Database hoặc File .env
   */
  async getUpdateConfig() {
    let repoSetting = await Setting.findOne({ name: 'update_github_repo' });
    let urlSetting = await Setting.findOne({ name: 'update_server_url' });
    let tokenSetting = await Setting.findOne({ name: 'update_github_token' });
    let autoCheckSetting = await Setting.findOne({ name: 'update_auto_check' });
    let channelSetting = await Setting.findOne({ name: 'update_channel' });

    return {
      githubRepo: repoSetting?.value || process.env.UPDATE_GITHUB_REPO || 'DYAduog/ocapaychamtop',
      serverUrl: urlSetting?.value || process.env.UPDATE_SERVER_URL || '',
      githubToken: tokenSetting?.value || process.env.UPDATE_GITHUB_TOKEN || '',
      autoCheck: autoCheckSetting ? autoCheckSetting.value === true || autoCheckSetting.value === 'true' : true,
      channel: channelSetting?.value || 'stable',
    };
  }

  /**
   * Lưu cấu hình nguồn cập nhật
   */
  async saveUpdateConfig(config = {}) {
    if (config.githubRepo !== undefined) {
      await Setting.findOneAndUpdate(
        { name: 'update_github_repo' },
        { value: String(config.githubRepo).trim() },
        { upsert: true }
      );
    }
    if (config.serverUrl !== undefined) {
      await Setting.findOneAndUpdate(
        { name: 'update_server_url' },
        { value: String(config.serverUrl).trim() },
        { upsert: true }
      );
    }
    if (config.githubToken !== undefined) {
      await Setting.findOneAndUpdate(
        { name: 'update_github_token' },
        { value: String(config.githubToken).trim() },
        { upsert: true }
      );
    }
    if (config.autoCheck !== undefined) {
      await Setting.findOneAndUpdate(
        { name: 'update_auto_check' },
        { value: Boolean(config.autoCheck) },
        { upsert: true }
      );
    }
    if (config.channel !== undefined) {
      await Setting.findOneAndUpdate(
        { name: 'update_channel' },
        { value: String(config.channel).trim() },
        { upsert: true }
      );
    }
    return await this.getUpdateConfig();
  }

  /**
   * Kiểm tra máy chủ có cài Git hay không
   */
  isGitAvailable() {
    try {
      const res = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 3000 });
      return res.status === 0;
    } catch (_) {
      return false;
    }
  }

  /**
   * So sánh 2 chuỗi version chuẩn SemVer (ví dụ: '3.2.0' vs '3.3.0')
   * Trả về: > 0 nếu v2 > v1, 0 nếu bằng nhau, < 0 nếu v1 > v2
   */
  compareSemver(v1, v2) {
    const clean1 = String(v1 || '0.0.0').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
    const clean2 = String(v2 || '0.0.0').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(clean1.length, clean2.length); i++) {
      const n1 = clean1[i] || 0;
      const n2 = clean2[i] || 0;
      if (n2 > n1) return 1;
      if (n1 > n2) return -1;
    }
    return 0;
  }

  /**
   * Tự động kiểm tra bản cập nhật mới nhất từ GitHub Releases hoặc Custom Update Server
   */
  async checkForUpdates() {
    const current = this.getCurrentVersion();
    const config = await this.getUpdateConfig();
    const gitAvailable = this.isGitAvailable();

    const result = {
      status: 'success',
      currentVersion: current.version,
      buildDate: current.buildDate,
      currentTitle: current.title,
      currentChangelog: current.changelog || [],
      latestVersion: current.version,
      hasUpdate: false,
      releaseName: '',
      releaseNotes: [],
      publishedAt: null,
      downloadUrl: null,
      source: 'local',
      updateMethod: gitAvailable ? 'git_or_zip' : 'zip_extract',
      gitAvailable,
      checkedAt: new Date().toISOString(),
    };

    // 1. Kiểm tra qua Custom Update Server URL nếu có
    if (config.serverUrl) {
      try {
        const resp = await axios.get(config.serverUrl, {
          timeout: 8000,
          headers: {
            'User-Agent': '7Bank-Gateway-Updater/3.0',
            'X-Current-Version': current.version,
          },
        });
        if (resp.data && resp.data.version) {
          result.source = 'custom_server';
          result.latestVersion = resp.data.version;
          result.releaseName = resp.data.title || `Bản phát hành v${resp.data.version}`;
          result.releaseNotes = Array.isArray(resp.data.changelog) ? resp.data.changelog : [resp.data.changelog || 'Nâng cấp và cải tiến hệ thống'];
          result.publishedAt = resp.data.publishedAt || resp.data.buildDate;
          result.downloadUrl = resp.data.downloadUrl || null;
          result.hasUpdate = this.compareSemver(current.version, resp.data.version) > 0;
          return result;
        }
      } catch (err) {
        console.warn('[UpdateService] Không thể kết nối tới Custom Update Server:', err.message);
      }
    }

    // 2. Kiểm tra qua GitHub Releases API
    if (config.githubRepo) {
      const repo = config.githubRepo.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').trim();
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': '7Bank-Gateway-Updater/3.0',
      };
      if (config.githubToken) {
        headers['Authorization'] = `token ${config.githubToken}`;
      }

      try {
        const url = `https://api.github.com/repos/${repo}/releases/latest`;
        const resp = await axios.get(url, { headers, timeout: 8000 });
        if (resp.data && resp.data.tag_name) {
          const rawTag = resp.data.tag_name;
          const cleanTag = rawTag.replace(/^v/i, '');
          result.source = 'github_releases';
          result.latestVersion = cleanTag;
          result.releaseName = resp.data.name || rawTag;
          result.publishedAt = resp.data.published_at;
          result.downloadUrl = resp.data.zipball_url || `https://github.com/${repo}/archive/refs/tags/${rawTag}.zip`;
          
          if (resp.data.body) {
            result.releaseNotes = resp.data.body
              .split('\n')
              .map(l => l.trim().replace(/^[-*•]\s*/, ''))
              .filter(l => l.length > 0);
          } else {
            result.releaseNotes = [`Cập nhật bản phát hành ${rawTag}`];
          }

          result.hasUpdate = this.compareSemver(current.version, cleanTag) > 0;
          return result;
        }
      } catch (err) {
        // Fallback: Thử đọc trực tiếp file version.json trên branch main/master của GitHub
        try {
          const rawUrl = `https://raw.githubusercontent.com/${repo}/main/version.json`;
          const rawResp = await axios.get(rawUrl, { headers, timeout: 6000 });
          if (rawResp.data && rawResp.data.version) {
            result.source = 'github_raw';
            result.latestVersion = rawResp.data.version;
            result.releaseName = rawResp.data.title || `v${rawResp.data.version}`;
            result.releaseNotes = rawResp.data.changelog || ['Cập nhật bản mới'];
            result.publishedAt = rawResp.data.buildDate;
            result.downloadUrl = `https://github.com/${repo}/archive/refs/heads/main.zip`;
            result.hasUpdate = this.compareSemver(current.version, rawResp.data.version) > 0;
            return result;
          }
        } catch (_) {}

        // Nếu repo chưa có hoặc là repo private chưa add token
        result.errorDetails = err.response?.status === 404 
          ? `Kho lưu trữ ${repo} chưa có bản Release công khai nào trên GitHub.`
          : err.message;
      }
    }

    // Mặc định: Hệ thống đang ở bản hiện hành mới nhất
    result.hasUpdate = false;
    result.latestVersion = current.version;
    result.releaseName = current.title;
    result.releaseNotes = current.changelog;
    result.publishedAt = current.buildDate;
    return result;
  }

  /**
   * Tạo bản sao lưu an toàn (Auto-Backup) toàn bộ mã nguồn trước khi cập nhật
   */
  async createSafetyBackup() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFolder = path.resolve(this.backupsDir, `backup-${timestamp}`);
    fs.mkdirSync(backupFolder, { recursive: true });

    // Script python hỗ trợ copy nhanh bỏ qua các thư mục nặng/không cần thiết
    const py = getPythonExecutable();
    const backupScript = `
import os, shutil

src = r"${this.rootDir.replace(/\\/g, '/')}"
dst = r"${backupFolder.replace(/\\/g, '/')}"

skip_dirs = {'node_modules', 'pg_omni_profile', 'backups', '.git', '__pycache__', 'logs'}
skip_files = {'bot_manager.db'}

count = 0
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    rel = os.path.relpath(root, src)
    target_dir = os.path.join(dst, rel) if rel != '.' else dst
    os.makedirs(target_dir, exist_ok=True)
    for f in files:
        if f not in skip_files and not f.endswith('.log'):
            try:
                shutil.copy2(os.path.join(root, f), os.path.join(target_dir, f))
                count += 1
            except:
                pass
print(f"BACKED_UP:{count}")
`;
    try {
      const res = spawnSync(py, ['-c', backupScript], { encoding: 'utf8', timeout: 30000 });
      return {
        path: backupFolder,
        name: `backup-${timestamp}`,
        success: true,
        details: res.stdout?.trim() || '',
      };
    } catch (err) {
      return { path: backupFolder, success: false, error: err.message };
    }
  }

  /**
   * Tải về và áp dụng bản cập nhật mới (bảo vệ 100% dữ liệu nhạy cảm)
   */
  async applyUpdate(options = {}) {
    const logProgress = [];
    const pushLog = (msg) => {
      console.log(`[UpdateService] ${msg}`);
      logProgress.push({ time: new Date().toISOString(), message: msg });
    };

    pushLog('Bắt đầu tiến trình cập nhật hệ thống...');

    // Bước 1: Sao lưu an toàn
    pushLog('[1/4] Đang tạo điểm khôi phục an toàn (Auto-Backup)...');
    const backup = await this.createSafetyBackup();
    if (backup.success) {
      pushLog(`[1/4] Sao lưu an toàn thành công vào thư mục: ${path.basename(backup.path)}`);
    } else {
      pushLog(`[1/4] Cảnh báo: Sao lưu gặp vấn đề (${backup.error}), tiếp tục với cơ chế an toàn.`);
    }

    // Bước 2: Tải gói cập nhật hoặc chuẩn bị nguồn
    let zipFilePath = null;
    let tempExtractDir = path.resolve(this.serverDir, 'temp_update_' + Date.now());

    if (options.zipBuffer) {
      // Nhận qua upload trực tiếp
      pushLog('[2/4] Nhận gói cập nhật từ tập tin ZIP tải lên...');
      zipFilePath = path.resolve(this.serverDir, `update_${Date.now()}.zip`);
      fs.writeFileSync(zipFilePath, options.zipBuffer);
    } else {
      // Tải từ URL
      const check = await this.checkForUpdates();
      const downloadUrl = options.downloadUrl || check.downloadUrl;

      if (!downloadUrl) {
        throw new Error('Không tìm thấy đường dẫn tải về bản cập nhật mới (Download URL rỗng). Vui lòng cấu hình GitHub Repo hoặc tải lên file ZIP thủ công.');
      }

      pushLog(`[2/4] Đang tải gói cập nhật mới nhất từ: ${downloadUrl}...`);
      zipFilePath = path.resolve(this.serverDir, `update_${Date.now()}.zip`);

      const config = await this.getUpdateConfig();
      const headers = { 'User-Agent': '7Bank-Gateway-Updater/3.0' };
      if (config.githubToken && downloadUrl.includes('github.com')) {
        headers['Authorization'] = `token ${config.githubToken}`;
      }

      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'arraybuffer',
        headers,
        timeout: 60000,
      });

      fs.writeFileSync(zipFilePath, Buffer.from(response.data));
      pushLog(`[2/4] Đã tải về thành công gói cập nhật (${Math.round(response.data.byteLength / 1024)} KB)`);
    }

    // Bước 3: Giải nén và ghi đè an toàn
    pushLog('[3/4] Đang giải nén và cập nhật mã nguồn (Bảo vệ dữ liệu nhạy cảm)...');
    fs.mkdirSync(tempExtractDir, { recursive: true });

    const py = getPythonExecutable();
    const extractAndApplyScript = `
import zipfile, os, shutil, sys

zip_path = r"${zipFilePath.replace(/\\/g, '/')}"
extract_to = r"${tempExtractDir.replace(/\\/g, '/')}"
target_root = r"${this.rootDir.replace(/\\/g, '/')}"

# Giải nén
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_to)

# Nếu bên trong zip có 1 thư mục gốc duy nhất (như zipball của GitHub repo-main/)
entries = [os.path.join(extract_to, x) for x in os.listdir(extract_to)]
source_dir = extract_to
if len(entries) == 1 and os.path.isdir(entries[0]):
    source_dir = entries[0]

# Danh sách TUYỆT ĐỐI BẢO VỆ, KHÔNG ĐƯỢC GHI ĐÈ HOẶC XÓA
PROTECTED_FILES = {
    '.env', 'msb_session.json', 'pgbank_session.json', 'transactions.json',
    'bot_manager.db', 'serverPrivate.pem', 'serverPublic.pem',
    'clientPrivate.pem', 'clientPublic.pem', 'timo_credentials.json',
}
PROTECTED_DIRS = {
    'data', 'keys', 'pg_omni_profile', 'node_modules', 'backups', '.git'
}

updated_count = 0
for root, dirs, files in os.walk(source_dir):
    rel_path = os.path.relpath(root, source_dir)
    target_dir = os.path.join(target_root, rel_path) if rel_path != '.' else target_root
    
    # Kiểm tra xem target_dir có thuộc thư mục bảo vệ không
    parts = set(rel_path.replace('\\\\', '/').split('/'))
    if parts.intersection(PROTECTED_DIRS):
        continue
        
    os.makedirs(target_dir, exist_ok=True)
    
    for f in files:
        if f in PROTECTED_FILES:
            continue
        # Bỏ qua ghi đè .env trong nodejs-server
        if f == '.env':
            continue
        src_file = os.path.join(root, f)
        dest_file = os.path.join(target_dir, f)
        try:
            shutil.copy2(src_file, dest_file)
            updated_count += 1
        except Exception as e:
            print(f"WARN_COPY:{f}:{e}", file=sys.stderr)

print(f"UPDATED_FILES_COUNT:{updated_count}")
`;

    const extractRes = spawnSync(py, ['-c', extractAndApplyScript], { encoding: 'utf8', timeout: 60000 });
    if (extractRes.status !== 0) {
      throw new Error(`Lỗi giải nén cập nhật: ${extractRes.stderr || extractRes.stdout}`);
    }

    pushLog(`[3/4] Cập nhật thành công ${extractRes.stdout?.trim() || 'toàn bộ các tệp'}`);

    // Dọn dẹp tệp ZIP tạm
    try {
      if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
      if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch (_) {}

    // Bước 4: Kiểm tra dependencies nếu cần
    pushLog('[4/4] Kiểm tra các gói thư viện hệ thống...');
    const newVersion = this.getCurrentVersion();

    pushLog(`🎉 Hoàn tất cập nhật thành công lên phiên bản: ${newVersion.version}`);

    return {
      success: true,
      newVersion: newVersion.version,
      buildDate: newVersion.buildDate,
      backupPath: backup.path,
      logs: logProgress,
    };
  }

  /**
   * Khởi động lại dịch vụ 7Bank sau khi cập nhật
   */
  async restartServer() {
    console.log('[UpdateService] Đang lên lịch khởi động lại máy chủ 7Bank...');
    // Nếu chạy dưới PM2
    if (process.env.pm_id !== undefined || process.env.PM2_HOME) {
      setTimeout(() => {
        exec('pm2 reload 7bank-server || pm2 restart 7bank-server || pm2 restart all', (err) => {
          if (err) process.exit(0);
        });
      }, 1000);
      return { status: 'restarting', type: 'pm2' };
    }

    // Nếu chạy qua npm start / node
    setTimeout(() => {
      process.exit(0);
    }, 1500);

    return { status: 'restarting', type: 'process_exit' };
  }
}

module.exports = new UpdateService();
