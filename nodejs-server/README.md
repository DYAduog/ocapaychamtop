# 7Bank Auto Gateway - Node.js & MongoDB Server

Phiên bản Node.js & MongoDB được chuyển đổi và tối ưu hóa từ mã nguồn gốc PHP & MySQL (7Bank Auto Banking Gateway: ACB, BIDV, MBBank, VCB, VietinBank, ViettelPay, ZaloPay, Thẻ Siêu Rẻ).

---

## 🖥️ 1. Giao Diện Người Dùng (Client) & Quản Trị Viên (Admin)

Hệ thống đã được trang bị giao diện web hiện đại (Dark Glassmorphism UI, Responsive, tải trang siêu nhanh):

1. **Cổng Khách Hàng (Client Portal):** [http://localhost:3000](http://localhost:3000)
   - 📊 **Tổng quan (Dashboard):** Xem số dư ví, hạn gói API, mã Master Token tài khoản, danh sách tài khoản ngân hàng hoạt động.
   - 🏦 **Quản lý Tài khoản Ngân hàng:** Thêm mới kết nối (ACB, MBBank, VCB, BIDV, Vietin, Viettel, ZaloPay, TSR) với mã hóa RSA 2048-bit, xem trạng thái phiên, làm mới token, xóa tài khoản.
   - 📜 **Lịch sử Sao kê Trực quan:** Tra cứu biến động số dư theo ngày, nội dung chuyển tiền, số dư cuối.
   - 💳 **Nạp Tiền & Gói Cước:** Tích hợp mã VietQR nạp tiền tự động theo cú pháp `NAPTIEN <username>`, mua gói cước API (1 tháng, 3 tháng, 1 năm).
   - 📖 **Tài liệu API:** Hướng dẫn tích hợp với code mẫu tự sinh (Node.js, cURL, PHP).
   - 👤 **Hồ sơ Cá nhân:** Đổi mật khẩu tài khoản.

2. **Cổng Quản Trị Viên (Admin Portal):** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
   - 📈 **Báo cáo Thống kê:** Tổng thành viên, tổng tài khoản bank kết nối, tổng số dư, tình trạng máy chủ Node.js & MongoDB.
   - 👥 **Quản lý Thành viên:** Danh sách người dùng, tìm kiếm, cộng/trừ tiền trong ví, gia hạn thêm ngày dùng API, phân quyền Admin, khóa/mở khóa tài khoản.
   - 🏦 **Quản lý Tất cả Cổng Bank:** Giám sát toàn bộ tài khoản ngân hàng của tất cả khách hàng.
   - ⚙️ **Cấu hình Hệ thống:** Cài đặt API Key giải Captcha OCR, Pusher Realtime credentials.

3. **Trang Đăng Nhập / Đăng Ký:** [http://localhost:3000/login.html](http://localhost:3000/login.html)
   - **Tài khoản Demo Admin:** `taquangminh` / `admin123` *(Đã nạp sẵn từ file SQL dump)*. Có nút bấm "Đăng nhập Demo Admin" tự động điền trong 1 click.

---

## 📌 2. Điểm Cải Tiến Khi Chuyển Sang Node.js & MongoDB

1. **Hiệu năng & Bất đồng bộ (Async I/O):**
   - PHP cURL dạng đồng bộ (blocking) gây nghẽn khi có nhiều request kiểm tra lịch sử cùng lúc.
   - Node.js với cơ chế Event Loop và `axios` xử lý hàng trăm request ngân hàng đồng thời mà không nghẽn luồng.

2. **Hợp nhất Mô hình Dữ liệu (Polymorphic Document Model):**
   - Thay vì phân mảnh thành 8 bảng MySQL riêng biệt (`account_acb`, `account_bidv`, `account_mbbank`,...), MongoDB gom toàn bộ về Collection `BankAccount` với trường `bankCode`.
   - Tìm kiếm nhanh bằng token chỉ với 1 query index: `BankAccount.findOne({ token })`.

3. **Bảo mật RSA Tương Thích 100%:**
   - Sử dụng trực tiếp module `node:crypto` với cặp key PEM (`serverPrivate.pem`, `serverPublic.pem`) từ hệ thống cũ. Mật khẩu ngân hàng được giải mã/mã hóa tương thích hoàn toàn.

4. **Tương thích ngược API Cũ (Zero Downtime Migration):**
   - Các hệ thống bên ngoài gọi vào `/api/historymbbank?token=...` hoặc `/api/historyacb?token=...` vẫn hoạt động bình thường, không cần sửa URL.

5. **Auto Polling bằng `node-cron`:**
   - Không cần phụ thuộc vào Linux Crontab thủ công; server tự động quét lịch sử giao dịch và bắn sự kiện qua Pusher.

---

## 🚀 3. Hướng Dẫn Cài Đặt & Chạy Local

### Bước 1: Di chuyển dữ liệu từ MySQL sang MongoDB (Migration)
```bash
cd d:\7bank\nodejs-server
npm run migrate
```

### Bước 2: Khởi chạy Server
```bash
# Chạy ở chế độ thông thường:
npm start

# Hoặc chế độ tự động reload khi sửa code (Dev):
npm run dev
```

Truy cập trình duyệt:
- Client Portal: [http://localhost:3000](http://localhost:3000)
- Admin Portal: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
- Đăng nhập: [http://localhost:3000/login.html](http://localhost:3000/login.html)
- Health Check: [http://localhost:3000/api/health](http://localhost:3000/api/health)
