# ACB Python API

Dự án này cung cấp API cho các chức năng ngân hàng ACB sử dụng FastAPI.

## Tính năng
- Đăng nhập tài khoản
- Lấy số dư tài khoản
- Lấy lịch sử giao dịch
- Lấy tên ngân hàng thụ hưởng
- Lấy chi tiết tài khoản
- Xác nhận chuyển khoản
- Thực hiện chuyển khoản
- Kiểm tra giới hạn chuyển khoản
- Danh sách ngân hàng Napas
- Thông tin ngân hàng thụ hưởng

## Yêu cầu hệ thống
- Python >= 3.9
- Docker (tuỳ chọn)

## Cài đặt

### 1. Chạy trực tiếp bằng Python

```bash
# Cài đặt các thư viện cần thiết
pip install -r requirements.txt

# Chạy ứng dụng
python app.py
```

Ứng dụng sẽ chạy tại địa chỉ: http://localhost:3000

### 2. Chạy bằng Docker

```bash
# Build image
docker build -t acb-api .

# Chạy container
# Mặc định public port 3035

docker run -p 3035:3000 acb-api
```

Hoặc sử dụng docker-compose:

```bash
docker-compose up --build
```

Ứng dụng sẽ chạy tại địa chỉ: http://localhost:3035

## API Docs
- Swagger: http://localhost:3035/docs
- Redoc: http://localhost:3035/redoc

## Hướng dẫn sử dụng
- Gửi dữ liệu tới các API bằng `application/x-www-form-urlencoded`
- Tham khảo mô tả chi tiết từng API tại trang docs

git commit -m "Initial commit"
git remote add origin <URL_GITHUB_REPO>
git push -u origin master
## Đẩy code lên GitLab

### 1. Cấu hình Git local cho dự án này
```bash
git config --local user.name "HiTechCloud Dev"
git config --local user.email "gitlab_admin_b5e10a@example.com"
```

### 2. Đẩy folder hiện tại lên GitLab
```bash
git init --initial-branch=main
git remote add origin git@gitlab.hitechcloud.dev:hitechcloud/acbbank.git
git add .
git commit -m "Initial commit"
git push --set-upstream origin main
```

### 3. Đẩy repo đã có lên GitLab
```bash
git remote rename origin old-origin
git remote add origin git@gitlab.hitechcloud.dev:hitechcloud/acbbank.git
git push --set-upstream origin --all
git push --set-upstream origin --tags
```

## Liên hệ & đóng góp
- Nếu có vấn đề hoặc cần đóng góp, vui lòng tạo issue hoặc merge request trên Github.
