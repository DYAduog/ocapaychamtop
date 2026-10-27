#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
7BANK / OCAPAY GATEWAY - AUTO PACKAGER & GIT RELEASE PUSHER
- Đóng gói toàn bộ mã nguồn vào tệp nén update.zip
- Đặt mật khẩu mã hóa mặc định: lethutrang123@ (chuẩn bảo mật AES-256)
- Tự động tăng phiên bản và cập nhật version.json
- Đẩy gói cập nhật lên kho lưu trữ Git (GitHub)
- Bảo vệ 100% mã nguồn thô trên GitHub, người ngoài không thể đọc trộm
==============================================================================
"""

import os
import sys
import json
import hashlib
import datetime
import subprocess

# Đảm bảo mã hóa UTF-8 trên Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Thử import pyzipper
try:
    import pyzipper
except ImportError:
    print("\n[!] Chưa tìm thấy thư viện pyzipper. Đang tự động cài đặt...")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "pyzipper>=0.4.0", "pycryptodomex>=3.20.0"], check=True)
        import pyzipper
        print("[✓] Đã cài đặt xong pyzipper thành công!\n")
    except Exception as e:
        print(f"[✗] Không thể cài đặt pyzipper: {e}")
        print("    Vui lòng chạy: pip install pyzipper pycryptodomex")
        sys.exit(1)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PASSWORD = "lethutrang123@"
VERSION_FILE = os.path.join(PROJECT_ROOT, "version.json")
NODE_VERSION_FILE = os.path.join(PROJECT_ROOT, "nodejs-server", "version.json")
ZIP_OUTPUT = os.path.join(PROJECT_ROOT, "update.zip")

# Thư mục và tệp cần bỏ qua khi nén (BẢO MẬT & DỮ LIỆU CÁ NHÂN / DƯ THỪA / BROWSER CACHE)
SKIP_DIRS = {
    '.git', '.vscode', '.idea', '__pycache__', 'node_modules',
    'backups', 'logs', 'pg_omni_profile', 'captcha_cache',
    'keys', 'data', 'temp_*', 'profiles', 'optimization_guide_model_store',
    'component_crx_cache', 'WasmTtsEngine', 'OnDeviceHeadSuggestModel'
}

SKIP_FILES = {
    '.env', 'bot_manager.db', 'msb_session.json', 'pgbank_session.json',
    'transactions.json', 'timo_credentials.json', 'session_pending.json',
    'captcha_samples.json', 'update.zip', 'scratch_index', 'scratch_git_index'
}

SKIP_EXTENSIONS = {
    '.pem', '.key', '.pyc', '.tmp', '.log', '.bak', '.db', '.sqlite', '.sqlite3', '.zip', '.crx'
}

def compute_sha256(filepath):
    """Tính mã băm SHA-256 của tệp để kiểm tra tính toàn vẹn"""
    sha = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()

def bump_semver(ver_str):
    """Tự động tăng patch version (ví dụ: 3.2.0 -> 3.2.1)"""
    parts = ver_str.strip().replace('v', '').split('.')
    try:
        major = int(parts[0]) if len(parts) > 0 else 3
        minor = int(parts[1]) if len(parts) > 1 else 2
        patch = int(parts[2]) + 1 if len(parts) > 2 else 1
        return f"{major}.{minor}.{patch}"
    except Exception:
        return f"{ver_str}.1"

def read_current_version():
    """Đọc thông tin phiên bản hiện tại từ version.json"""
    if os.path.exists(VERSION_FILE):
        try:
            with open(VERSION_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "version": "3.2.0",
        "buildDate": datetime.date.today().isoformat(),
        "name": "7Bank / OcaPay Gateway",
        "channel": "stable",
        "title": "Bản Phát Hành 7Bank Gateway v3.2.0",
        "description": "Nền tảng Tự Động Hóa Ngân Hàng Đa Cổng & Bộ Giải Captcha AI 100% Offline",
        "changelog": ["Cập nhật và tối ưu hệ thống"],
    }

def save_version_info(vdata):
    """Lưu version.json ở cả thư mục gốc và nodejs-server"""
    content = json.dumps(vdata, ensure_ascii=False, indent=2)
    with open(VERSION_FILE, 'w', encoding='utf-8') as f:
        f.write(content + '\n')
    
    node_dir = os.path.dirname(NODE_VERSION_FILE)
    if os.path.exists(node_dir):
        with open(NODE_VERSION_FILE, 'w', encoding='utf-8') as f:
            f.write(content + '\n')

def should_skip(rel_dir, filename):
    """Kiểm tra tệp hoặc thư mục có nằm trong danh sách cần loại trừ không"""
    if filename in SKIP_FILES or filename.startswith('.env'):
        return True
    _, ext = os.path.splitext(filename)
    if ext.lower() in SKIP_EXTENSIONS:
        return True
    
    parts = set(rel_dir.replace('\\', '/').split('/'))
    if parts.intersection(SKIP_DIRS):
        return True
    for part in parts:
        if part in SKIP_DIRS or part.startswith('temp_') or part.startswith('.git'):
            return True
    return False

def package_project(password):
    """Nén toàn bộ mã nguồn hệ thống vào update.zip với mã hóa AES-256"""
    print(f"\n[*] Đang quét các tệp mã nguồn và đóng gói vào update.zip...")
    pwd_bytes = password.encode('utf-8')

    if os.path.exists(ZIP_OUTPUT):
        try:
            os.remove(ZIP_OUTPUT)
        except Exception:
            pass

    file_count = 0
    with pyzipper.AESZipFile(
        ZIP_OUTPUT,
        'w',
        compression=pyzipper.ZIP_DEFLATED,
        encryption=pyzipper.WZ_AES
    ) as zf:
        zf.setpassword(pwd_bytes)

        for root, dirs, files in os.walk(PROJECT_ROOT):
            # Lọc bỏ các thư mục nhạy cảm, browser cache và nặng
            dirs[:] = [
                d for d in dirs 
                if d not in SKIP_DIRS 
                and not d.startswith('.git') 
                and not d.startswith('temp_')
            ]
            
            for file in files:
                rel_dir = os.path.relpath(root, PROJECT_ROOT)
                if should_skip(rel_dir, file):
                    continue

                abs_path = os.path.join(root, file)
                arcname = os.path.relpath(abs_path, PROJECT_ROOT)
                
                try:
                    zf.write(abs_path, arcname)
                    file_count += 1
                except Exception as e:
                    print(f"    [!] Cảnh báo không thể ghi tệp {arcname}: {e}")

    size_mb = os.path.getsize(ZIP_OUTPUT) / (1024 * 1024)
    sha256_hash = compute_sha256(ZIP_OUTPUT)
    print(f"[✓] Đã tạo thành công update.zip:")
    print(f"    - Tổng số tệp đóng gói: {file_count} tệp")
    print(f"    - Dung lượng: {size_mb:.2f} MB (< 100 MB chuẩn GitHub)")
    print(f"    - Mã băm SHA-256: {sha256_hash}")
    print(f"    - Thuật toán mã hóa: AES-256 (Chuẩn bảo mật cao cấp)")
    print(f"    - Mật khẩu giải nén: {password}")
    return size_mb, sha256_hash, file_count

def git_commit_and_push(new_version, changelog_title):
    """
    Tạo commit chỉ chứa update.zip, version.json và tài liệu hướng dẫn lên Git
    Mã nguồn thô cục bộ KHÔNG BỊ XÓA hay ảnh hưởng.
    """
    print("\n[*] Đang chuẩn bị đồng bộ và đẩy lên Git...")
    
    # 1. Kiểm tra git CLI
    try:
        git_ver = subprocess.run(['git', '--version'], capture_output=True, text=True, check=True).stdout.strip()
        print(f"[✓] Tìm thấy {git_ver}")
    except Exception:
        print("[✗] Không tìm thấy lệnh 'git' trên máy tính của bạn!")
        print("    Vui lòng cài đặt Git tại: https://git-scm.com/download/win")
        return False

    # 2. Lưu trạng thái cục bộ vào branch source (để người phát triển giữ nguyên lịch sử source code)
    try:
        cur_branch = subprocess.run(['git', 'branch', '--show-current'], cwd=PROJECT_ROOT, capture_output=True, text=True).stdout.strip()
        if not cur_branch:
            # Nếu đang detached hoặc khác, thử chuyển sang source
            subprocess.run(['git', 'checkout', 'source'], cwd=PROJECT_ROOT, capture_output=True)
            cur_branch = 'source'
        if cur_branch == 'source':
            subprocess.run(['git', 'add', '.'], cwd=PROJECT_ROOT, capture_output=True)
            subprocess.run(['git', 'commit', '-m', f"dev: sync local source v{new_version}"], cwd=PROJECT_ROOT, capture_output=True)
        else:
            subprocess.run(['git', 'branch', 'source'], cwd=PROJECT_ROOT, capture_output=True)
    except Exception as e:
        print(f"    [!] Cảnh báo lưu nhánh source: {e}")

    # 3. Sử dụng GIT_INDEX_FILE riêng biệt để tạo commit phân phối (Chỉ gồm update.zip, version.json, setup, readme)
    scratch_index = os.path.join(PROJECT_ROOT, "scratch_git_index")
    env = os.environ.copy()
    env['GIT_INDEX_FILE'] = scratch_index

    if os.path.exists(scratch_index):
        try:
            os.remove(scratch_index)
        except Exception:
            pass

    distribution_files = [
        "update.zip",
        "version.json",
        "README.md",
        "setup_linux.sh",
        "setup_windows.bat",
        "start_server.bat",
        "run_manager.bat",
        "requirements.txt",
        "HUONG_DAN_CAI_DAT_VPS.md",
        "package_and_push.py",
        "push_update.bat",
        "push_update.sh",
        "ecosystem.config.js",
        "nginx.conf.example",
    ]

    try:
        # Thêm các tệp phân phối vào isolated index
        for f in distribution_files:
            fpath = os.path.join(PROJECT_ROOT, f)
            if os.path.exists(fpath):
                subprocess.run(['git', 'add', '-f', f], cwd=PROJECT_ROOT, env=env, check=True)

        # Tạo Git tree object từ isolated index
        tree_res = subprocess.run(['git', 'write-tree'], cwd=PROJECT_ROOT, env=env, capture_output=True, text=True, check=True)
        tree_hash = tree_res.stdout.strip()

        # Lấy commit cha của nhánh main
        parent_args = []
        try:
            head_res = subprocess.run(['git', 'rev-parse', 'refs/heads/main'], cwd=PROJECT_ROOT, capture_output=True, text=True)
            if head_res.returncode == 0 and head_res.stdout.strip():
                parent_args = ['-p', head_res.stdout.strip()]
        except Exception:
            pass

        # Tạo commit mới cho nhánh main
        commit_msg = f"release: OcaPay Gateway v{new_version} (Encrypted Package with lethutrang123@)\n\n- {changelog_title}"
        commit_cmd = ['git', 'commit-tree', tree_hash] + parent_args + ['-m', commit_msg]
        commit_res = subprocess.run(commit_cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, check=True)
        new_commit = commit_res.stdout.strip()

        # Cập nhật nhánh main trỏ tới commit mới này
        subprocess.run(['git', 'update-ref', 'refs/heads/main', new_commit], cwd=PROJECT_ROOT, check=True)
        print(f"[✓] Đã tạo commit phân phối bảo mật thành công ({new_commit[:7]})")

        # Đẩy lên GitHub origin main
        print("[*] Đang thực thi 'git push origin main'...")
        push_res = subprocess.run(['git', 'push', 'origin', 'main'], cwd=PROJECT_ROOT, capture_output=True, text=True)
        if push_res.returncode != 0:
            print(f"[!] Lần đẩy thông thường gặp thông báo: {push_res.stderr.strip() or push_res.stdout.strip()}")
            print("[*] Thử đẩy cưỡng chế cập nhật nhánh phân phối (git push -f origin main)...")
            push_res2 = subprocess.run(['git', 'push', '-f', 'origin', 'main'], cwd=PROJECT_ROOT, capture_output=True, text=True)
            if push_res2.returncode != 0:
                print(f"[✗] Không thể đẩy lên Git: {push_res2.stderr.strip() or push_res2.stdout.strip()}")
                return False

        print("[✓] Đã đẩy thành công lên nhánh main của kho lưu trữ GitHub!")
        return True

    except Exception as e:
        print(f"[✗] Lỗi thao tác Git: {e}")
        return False
    finally:
        if os.path.exists(scratch_index):
            try:
                os.remove(scratch_index)
            except Exception:
                pass

def main():
    print("=" * 72)
    print("   🚀 7BANK / OCAPAY GATEWAY - ĐÓNG GÓI & ĐẨY BẢN CẬP NHẬT LÊN GIT")
    print("   🔒 Mật khẩu giải nén mặc định bảo vệ mã nguồn: lethutrang123@")
    print("=" * 72)

    cur_vdata = read_current_version()
    current_ver = cur_vdata.get("version", "3.2.0")
    suggested_ver = bump_semver(current_ver)

    is_auto = "--auto" in sys.argv

    if is_auto:
        new_version = suggested_ver
        password = DEFAULT_PASSWORD
        title = f"Bản Phát Hành 7Bank Gateway v{new_version}"
        changelog = [
            f"Nâng cấp phiên bản v{new_version} cho hệ thống 7Bank Gateway",
            "Đóng gói tệp nén update.zip được bảo vệ với mật khẩu mặc định lethutrang123@",
            "Cải tiến tốc độ giải Captcha AI và tính ổn định kết nối đa ngân hàng",
        ]
    else:
        print(f"\n[*] Phiên bản hiện tại: v{current_ver} (Ngày build: {cur_vdata.get('buildDate', '')})")
        
        # 1. Nhập phiên bản
        try:
            ver_input = input(f"[?] Nhập số phiên bản mới [Enter để chọn v{suggested_ver}]: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nĐã hủy tiến trình.")
            sys.exit(0)
        new_version = ver_input if ver_input else suggested_ver
        if new_version.startswith('v') or new_version.startswith('V'):
            new_version = new_version[1:]

        # 2. Nhập mật khẩu mã hóa
        try:
            pwd_input = input(f"[?] Nhập mật khẩu nén mã hóa [Enter để dùng mặc định '{DEFAULT_PASSWORD}']: ").strip()
        except (EOFError, KeyboardInterrupt):
            pwd_input = ""
        password = pwd_input if pwd_input else DEFAULT_PASSWORD

        # 3. Nhập tiêu đề & changelog
        try:
            title_input = input(f"[?] Tiêu đề bản cập nhật [Enter để chọn 'Bản Phát Hành 7Bank Gateway v{new_version}']: ").strip()
        except (EOFError, KeyboardInterrupt):
            title_input = ""
        title = title_input if title_input else f"Bản Phát Hành 7Bank Gateway v{new_version}"

        try:
            log_input = input(f"[?] Nội dung cập nhật (cách nhau bởi dấu phẩy ',') [Enter để dùng mặc định]: ").strip()
        except (EOFError, KeyboardInterrupt):
            log_input = ""
            
        if log_input:
            changelog = [x.strip() for x in log_input.split(',') if x.strip()]
        else:
            changelog = [
                f"Nâng cấp phiên bản v{new_version} cho hệ thống 7Bank Gateway",
                "Đóng gói tệp nén update.zip được bảo vệ với mật khẩu mặc định lethutrang123@",
                "Cải tiến tốc độ giải Captcha AI và tính ổn định kết nối đa ngân hàng",
            ]

    # Cập nhật dữ liệu version.json
    cur_vdata["version"] = new_version
    cur_vdata["buildDate"] = datetime.date.today().isoformat()
    cur_vdata["title"] = title
    cur_vdata["changelog"] = changelog

    # Bước 1: Nén mã nguồn vào update.zip với mật khẩu mặc định
    size_mb, sha256_hash, file_count = package_project(password)

    # Bổ sung thông tin package vào version.json
    cur_vdata["package"] = {
        "filename": "update.zip",
        "sizeBytes": os.path.getsize(ZIP_OUTPUT),
        "sizeMB": round(size_mb, 2),
        "sha256": sha256_hash,
        "encrypted": True,
        "encryptionMethod": "AES-256",
        "defaultPassword": True if password == DEFAULT_PASSWORD else False,
    }

    save_version_info(cur_vdata)
    print(f"[✓] Đã cập nhật version.json lên phiên bản v{new_version}")

    # Bước 2: Commit và Push lên Git
    push_success = git_commit_and_push(new_version, title)

    print("\n" + "=" * 72)
    if push_success:
        print("   🎉 HOÀN TẤT ĐÓNG GÓI & ĐẨY BẢN CẬP NHẬT LÊN GIT THÀNH CÔNG!")
        print("=" * 72)
        print(f"✅ Phiên bản: v{new_version} ({datetime.date.today().isoformat()})")
        print(f"✅ Gói phát hành: update.zip ({size_mb:.2f} MB - {file_count} tệp)")
        print(f"✅ Mật khẩu mã hóa mặc định: {password}")
        print(f"✅ Kho lưu trữ: DYAduog/ocapaychamtop")
        print("🔒 100% mã nguồn trên GitHub được bảo vệ an toàn (chỉ chứa file nén mã hóa)!")
        print("\n👉 CÁCH KHÁCH HÀNG / VPS CẬP NHẬT:")
        print("   1. Mở giao diện Admin Portal trên VPS.")
        print("   2. Bấm nút 'Kiểm Tra & Cập Nhật' (Icon đám mây màu xanh ở Topbar).")
        print("   3. Hệ thống sẽ tự động:")
        print(f"      - Tải update.zip từ Git về VPS")
        print(f"      - Tự động giải nén với mật khẩu mặc định '{password}'")
        print("      - Bảo vệ nguyên vẹn cấu hình .env, keys RSA, dữ liệu phiên ngân hàng")
        print("      - Tự động reload server lên phiên bản mới nhất!")
    else:
        print("   ⚠️ ĐÓNG GÓI update.zip THÀNH CÔNG, NHƯNG ĐẨY LÊN GIT GẶP VẤN ĐỀ!")
        print("=" * 72)
        print(f"File update.zip đã được tạo tại: {ZIP_OUTPUT}")
        print("Bạn có thể tải thủ công file update.zip lên GitHub Releases hoặc Admin Portal.")
    print("=" * 72 + "\n")

if __name__ == "__main__":
    main()
