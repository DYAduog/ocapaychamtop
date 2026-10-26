# 🚀 HƯỚNG DẪN TRIỂN KHAI VÀ SETUP HỆ THỐNG 7BANK TRÊN VPS
*(Hỗ trợ cả VPS Windows và VPS Linux Ubuntu/Debian - 100% Docker-Free & Tích hợp AI Captcha Tự Động)*

---

## 🌟 ĐẶC ĐIỂM HỆ THỐNG MỚI (BẢN NATIVE VPS)
- ❌ **Không cần Docker:** Toàn bộ hệ thống chạy trực tiếp (Native) trên VPS, tối ưu 100% RAM, CPU và tốc độ phản hồi API.
- 🤖 **Bộ giải Captcha AI nội bộ (100% Offline):** Tích hợp sẵn mô hình Deep Learning ONNX (`ddddocr` + OpenCV) giải mã trực tiếp trong RAM (~25ms). **Không cần đăng ký, không cần nạp tiền vào `thueapibank.vn` hay bất kỳ bên thứ ba nào.**
- 🩺 **Bộ tiền kiểm tra máy chủ thông minh (VPS Doctor):** Tự động phát hiện phiên bản Node.js, Python, MongoDB, thư viện thiếu, kiểm tra cổng mạng và tự động sửa lỗi (Auto-Setup).

---

## 🪟 PHẦN 1: TRIỂN KHAI TRÊN VPS WINDOWS (1-CLICK SETUP)

Nếu bạn thuê VPS Windows (Windows Server 2016/2019/2022 hoặc Windows 10/11):

### Bước 1: Chuẩn bị 3 phần mềm cốt lõi (Bắt buộc)
1. **Node.js (Bắt buộc >= v18, khuyên dùng v20 LTS):**
   - Tải file cài đặt `.msi` tại: [https://nodejs.org/en/download](https://nodejs.org/en/download)
   - Bấm Next để cài đặt mặc định.
2. **Python (3.8 - 3.12, khuyên dùng 3.10 hoặc 3.11):**
   - Tải tại: [https://www.python.org/downloads/](https://www.python.org/downloads/)
   - ⚠️ **LƯU Ý CỰC KỲ QUAN TRỌNG:** Ở màn hình cài đặt đầu tiên, **bắt buộc tích chọn ô:**
     `[x] Add python.exe to PATH` (hoặc `Add Python to environment variables`).
3. **MongoDB Community Server:**
   - Tải tại: [https://www.mongodb.com/try/download/community](https://www.mongodb.com/try/download/community)
   - Chọn "Install MongoDB as a Service" (MongoDB sẽ tự động chạy ngầm dưới nền Windows).

### Bước 2: Tải thư mục `7bank` lên VPS Windows
- Dùng Remote Desktop (RDP) copy-paste thư mục `7bank` vào ổ `C:\7bank` (hoặc `D:\7bank`).

### Bước 3: Chạy Tự Động Setup Hệ Thống
- Vào thư mục `7bank`, click chuột phải vào file **`setup_windows.bat`** -> chọn **"Run as administrator"**.
- Hệ thống sẽ tự động:
  1. Kiểm tra phiên bản Node.js và Python đã đạt chuẩn chưa.
  2. Tự động chạy `pip install -r requirements.txt` để cài đặt AI Captcha (`ddddocr`, `opencv-python`, `cryptography`,...).
  3. Tự động kiểm tra và khởi động dịch vụ MongoDB (`net start MongoDB`).
  4. Tự động chạy `npm install` cài đặt dependencies Node.js.
  5. Tự động sinh cặp khóa mật mã RSA 2048-bit (`keys/`).
  6. Tự động mở cổng **TCP Port 3000** trên Windows Defender Firewall để người dùng bên ngoài có thể truy cập.
  7. Thực hiện bài test giải Captcha ngầm trong RAM (đảm bảo AI hoạt động 100%).

### Bước 4: Khởi động Server
- Sau khi setup xong, click đúp vào file **`start_server.bat`**.
- Màn hình Console màu xanh sẽ hiện ra và trình duyệt web sẽ tự động mở trang chủ `http://localhost:3000/`.

---

## 🐧 PHẦN 2: TRIỂN KHAI TRÊN VPS LINUX (UBUNTU / DEBIAN)

Nếu bạn dùng VPS Linux (Ubuntu 20.04, 22.04, 24.04 LTS hoặc Debian 11/12):

### Bước 1: Đăng nhập vào VPS qua SSH
```bash
ssh root@IP_VPS_CUA_BAN
```

### Bước 2: Tải mã nguồn lên VPS
```bash
sudo mkdir -p /var/www/7bank
cd /var/www/7bank
# Dùng WinSCP / FileZilla tải toàn bộ thư mục 7bank lên /var/www/7bank
```

### Bước 3: Chạy Script Tự Động Cài Đặt (1 Dòng Lệnh)
Chỉ cần chạy lệnh sau:
```bash
cd /var/www/7bank
chmod +x setup_linux.sh
bash setup_linux.sh
```
Script `setup_linux.sh` sẽ tự động 100%:
- Cập nhật apt, cài thư viện đồ họa hệ thống cho OpenCV (`libgl1`, `libglib2.0-0`).
- Cài Node.js 20 LTS từ NodeSource.
- Cài đặt và kích hoạt dịch vụ MongoDB Community 7.x (`systemctl start mongod`).
- Cài thư viện Python AI Captcha từ `requirements.txt`.
- Cài đặt các gói `npm install` trong `nodejs-server`.
- Sinh khóa bảo mật RSA và tạo file `.env`.
- Mở cổng 3000 trên Firewall UFW.
- Cài đặt PM2 để quản lý tiến trình chạy ngầm 24/7.

### Bước 4: Khởi chạy Server ngầm với PM2
```bash
cd /var/www/7bank/nodejs-server
pm2 start src/server.js --name "7bank-server"
pm2 save
pm2 startup
```

---

## ⚙️ PHẦN 3: CẤU HÌNH IP & TÊN MIỀN TRONG FILE .ENV

Mở file `nodejs-server/.env` để chỉnh sửa theo thông số thực tế của VPS:
```env
# 1. CẤU HÌNH IP & DOMAIN
SERVER_IP=103.xxx.xxx.xxx           # Điền địa chỉ IP công khai của VPS
DOMAIN=api.yourdomain.com           # Điền tên miền của bạn (nếu có)
APP_PROTOCOL=http                   # Để http hoặc https
PORT=3000                           # Cổng chạy ứng dụng (mặc định 3000)
HOST=0.0.0.0                        # Để 0.0.0.0 để lắng nghe tất cả kết nối bên ngoài
APP_URL=http://103.xxx.xxx.xxx:3000 # Hoặc https://api.yourdomain.com
TRUST_PROXY=true
CORS_ORIGIN=*

# 2. CƠ SỞ DỮ LIỆU
MONGODB_URI=mongodb://127.0.0.1:27017/bank7gate

# 3. GIẢI CAPTCHA AI 100% OFFLINE (KHÔNG CẦN BÊN THỨ 3)
CAPTCHA_MODE=local_offline
CAPTCHA_LOCAL_ENGINE_URL=http://127.0.0.1:8088

# 4. PYTHON ĐIỀU KHIỂN
# Trên Windows: python
# Trên Linux: python3
PYTHON_PATH=python
```

---

## 🩺 PHẦN 4: SỬ DỤNG BỘ CHẨN ĐOÁN VPS DOCTOR (`vps-doctor.js`)

Bất cứ lúc nào nghi ngờ hệ thống gặp lỗi hoặc thiếu thư viện, bạn có thể chạy:

```bash
# Kiểm tra tình trạng máy chủ:
node nodejs-server/scripts/vps-doctor.js

# Hoặc tự động quét và sửa lỗi (Auto-Fix):
node nodejs-server/scripts/vps-doctor.js --auto-setup
```

Bộ Doctor sẽ tự động kiểm tra 8 chỉ số:
1. Phiên bản Node.js (yêu cầu >= 18).
2. Lệnh thực thi Python (`python` trên Win, `python3` trên Linux).
3. 100% gói Python bắt buộc: `ddddocr`, `cv2`, `PIL`, `cryptography`, `Crypto`, `requests`, `numpy`.
4. Trạng thái kết nối MongoDB tại `127.0.0.1:27017`.
5. Thư mục `node_modules` và các package Express.
6. Cặp khóa mã hóa RSA 2048-bit (`serverPrivate.pem` / `serverPublic.pem`).
7. Bắn thử mẫu ảnh Captcha qua mạng nơ-ron AI ONNX để đo tốc độ nhận diện thực tế (ms).
8. Kiểm tra socket mở cổng 3000 xem có bị phần mềm khác chiếm dụng hay không.

---

## 🌐 PHẦN 5: TRUY CẬP HỆ THỐNG SAU KHI KHỞI CHẠY

Mở trình duyệt truy cập:
- **Trang chủ Client Portal:** `http://IP_VPS:3000/`
- **Trang Quản trị Admin:** `http://IP_VPS:3000/admin.html`
- **Trang Cho Thuê API:** `http://IP_VPS:3000/rental.html`
- **Trang Live Chat Hỗ Trợ:** `http://IP_VPS:3000/livechat-admin.html`
- **Kiểm tra Health Check:** `http://IP_VPS:3000/api/health`
