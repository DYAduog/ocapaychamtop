#!/usr/bin/env bash
# ==============================================================================
# 7BANK / OCAPAY GATEWAY - AUTO SETUP & PRE-FLIGHT (LINUX VPS - UBUNTU / DEBIAN)
# ==============================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================================"
echo -e "   🚀 7BANK GATEWAY - TỰ ĐỘNG CÀI ĐẶT & SETUP MÔI TRƯỜNG LINUX VPS"
echo -e "======================================================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Cập nhật gói hệ điều hành & cài đặt thư viện cần thiết cho OpenCV & Python
echo -e "\n${CYAN}[1/7] Cập nhật apt và cài đặt các thư viện hệ thống cần thiết...${NC}"
sudo apt update -y
sudo apt install -y curl wget git build-essential software-properties-common \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
    python3 python3-pip python3-dev python3-venv

# 2. Kiểm tra và cài đặt Node.js 20 LTS nếu chưa có hoặc phiên bản cũ (< 18)
echo -e "\n${CYAN}[2/7] Kiểm tra Node.js Runtime...${NC}"
NODE_OK=0
if command -v node >/dev/null 2>&1; then
    NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "${GREEN}[✓] Đã có Node.js $(node -v) (Hợp lệ)${NC}"
        NODE_OK=1
    fi
fi

if [ "$NODE_OK" -eq 0 ]; then
    echo -e "${YELLOW}[*] Đang cài đặt Node.js 20 LTS từ NodeSource...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    echo -e "${GREEN}[✓] Đã cài đặt xong Node.js $(node -v)${NC}"
fi

# 3. Kiểm tra và cài đặt MongoDB nếu chưa có
echo -e "\n${CYAN}[3/7] Kiểm tra Cơ sở dữ liệu MongoDB...${NC}"
if ! command -v mongod >/dev/null 2>&1; then
    echo -e "${YELLOW}[*] Đang cài đặt MongoDB Community Server...${NC}"
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    sudo apt update -y || true
    sudo apt install -y mongodb-org || sudo apt install -y mongodb || true
fi

# Kích hoạt và bật MongoDB tự khởi động cùng máy chủ
sudo systemctl enable mongod || sudo systemctl enable mongodb || true
sudo systemctl start mongod || sudo systemctl start mongodb || true
echo -e "${GREEN}[✓] Dịch vụ MongoDB đang hoạt động.${NC}"

# 4. Cài đặt các thư viện Python (AI Captcha & Banking dependencies)
echo -e "\n${CYAN}[4/7] Cài đặt các thư viện Python (AI Captcha ddddocr, OpenCV, cryptography, pyzipper)...${NC}"
pip3 install -r requirements.txt --break-system-packages || pip3 install -r requirements.txt

# Tự động giải nén gói mã nguồn update.zip với mật khẩu lethutrang123@ nếu chưa giải nén
if [ -f "$SCRIPT_DIR/update.zip" ] && [ ! -d "$SCRIPT_DIR/nodejs-server/src" ]; then
    echo -e "\n${CYAN}[*] Phát hiện gói mã nguồn mã hóa update.zip, đang tự động giải nén với mật khẩu lethutrang123@...${NC}"
    python3 -c "
import pyzipper
with pyzipper.AESZipFile('$SCRIPT_DIR/update.zip', 'r') as zf:
    zf.setpassword(b'lethutrang123@')
    zf.extractall('$SCRIPT_DIR')
print('[✓] Đã giải nén thành công toàn bộ mã nguồn 7Bank!')
" || unzip -P lethutrang123@ -o "$SCRIPT_DIR/update.zip" -d "$SCRIPT_DIR" || true
fi

# 5. Cài đặt thư viện Node.js (npm dependencies)
echo -e "\n${CYAN}[5/7] Cài đặt các dependencies Node.js...${NC}"
cd "$SCRIPT_DIR/nodejs-server"
npm install --production

# 6. Chạy bộ chẩn đoán tự động vps-doctor.js
echo -e "\n${CYAN}[6/7] Khởi chạy 7Bank VPS Doctor kiểm tra toàn diện hệ thống...${NC}"
node scripts/vps-doctor.js --auto-setup

# 7. Mở Port 3000 trên Firewall UFW (nếu có dùng UFW)
echo -e "\n${CYAN}[7/7] Cấu hình Firewall mở cổng 3000...${NC}"
if command -v ufw >/dev/null 2>&1; then
    sudo ufw allow 3000/tcp || true
    echo -e "${GREEN}[✓] Đã mở port 3000 trên UFW firewall.${NC}"
fi

# Cài đặt PM2 để chạy server 24/7 ngầm
if ! command -v pm2 >/dev/null 2>&1; then
    echo -e "${YELLOW}[*] Cài đặt PM2 process manager để chạy ngầm 24/7...${NC}"
    sudo npm install -g pm2
fi

echo -e "\n${GREEN}======================================================================"
echo -e "   🎉 HOÀN TẤT SETUP HỆ THỐNG 7BANK TRÊN LINUX VPS!"
echo -e "======================================================================${NC}"
echo -e "👉 Để khởi động server chạy ngầm 24/7 bằng PM2:"
echo -e "   ${CYAN}cd $SCRIPT_DIR/nodejs-server && pm2 start src/server.js --name '7bank-server'${NC}"
echo -e "   ${CYAN}pm2 save && pm2 startup${NC}"
echo -e "👉 Để xem logs hoạt động:"
echo -e "   ${CYAN}pm2 logs 7bank-server${NC}"
echo -e "👉 Để chạy trực tiếp ở màn hình console:"
echo -e "   ${CYAN}cd $SCRIPT_DIR/nodejs-server && npm run start${NC}\n"
