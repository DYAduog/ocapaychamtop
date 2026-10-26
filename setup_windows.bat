@echo off
chcp 65001 >nul
title 7BANK - KIỂM TRA MÁY CHỦ & TỰ ĐỘNG SETUP HỆ THỐNG (VPS WINDOWS)
color 0A
cd /d "%~dp0"

echo ===================================================================
echo    7BANK / OCAPAY GATEWAY - AUTO SETUP & PRE-FLIGHT (VPS WINDOWS)
echo ===================================================================
echo.

:: 1. Kiểm tra quyền Administrator
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [THÔNG BÁO] Bạn đang chạy dưới quyền người dùng thông thường.
    echo [*] Mẹo: Nếu muốn tự động cấu hình Tường lửa (Firewall Port 3000),
    echo     bạn nên chuột phải vào setup_windows.bat và chọn "Run as Administrator".
    echo.
) else (
    echo [✓] Đã kích hoạt quyền Administrator (Sẵn sàng mở Port 3000 Firewall).
    echo.
)

:: 2. Kiểm tra bắt buộc Node.js
echo [*] Bước 1: Kiểm tra Node.js Runtime...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [LỖI BẮT BUỘC] Máy chủ chưa được cài đặt Node.js!
    echo Node.js là nền tảng cốt lõi bắt buộc để chạy Web Gateway và API.
    echo 👉 Yêu cầu phiên bản: Node.js 18.x trở lên (Khuyên dùng Node.js 20 LTS).
    echo 👉 Link tải bản cài đặt Windows: https://nodejs.org/en/download
    echo.
    pause
    exit /b 1
)

:: 3. Kiểm tra Python
echo [*] Bước 2: Kiểm tra Python Engine & AI Captcha...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0E
    echo.
    echo [CẢNH BÁO QUAN TRỌNG] Chưa tìm thấy Python trên máy chủ!
    echo Hệ thống cần Python (3.8 - 3.12) để chạy AI giải Captcha tự động (ddddocr)
    echo và điều phối các ngân hàng PGBank, BVBank, ACB, VCB,...
    echo 👉 Link tải: https://www.python.org/downloads/
    echo ⚠️  LƯU Ý: Khi cài đặt Python, BẮT BUỘC tích chọn:
    echo     [x] "Add python.exe to PATH"
    echo.
    echo Bấm phím bất kỳ để tiếp tục quá trình setup các thành phần còn lại...
    pause >nul
    color 0A
)

:: 4. Chạy bộ tiền kiểm tra thông minh & Auto-Setup (vps-doctor.js)
echo.
echo [*] Bước 3: Đang khởi chạy 7Bank VPS Doctor (Kiểm tra phiên bản & Tự động setup)...
echo.
node nodejs-server/scripts/vps-doctor.js --auto-setup
set DOCTOR_CODE=%ERRORLEVEL%

:: 5. Mở cổng 3000 trên Windows Defender Firewall
echo.
echo [*] Bước 4: Kiểm tra và cấu hình Tường lửa (Firewall Port 3000)...
net session >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    netsh advfirewall firewall show rule name="7Bank Gateway Port 3000" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo [*] Đang thêm quy tắc tường lửa cho phép kết nối Port 3000 Inbound...
        netsh advfirewall firewall add rule name="7Bank Gateway Port 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
        echo [✓] Đã mở thành công Port 3000 trên Windows Firewall!
    ) else (
        echo [✓] Quy tắc tường lửa Port 3000 đã tồn tại sẵn.
    )
) else (
    echo [!] Bỏ qua bước mở Firewall (Cần quyền Administrator). Bạn có thể mở thủ công Port 3000 TCP.
)

echo.
echo ===================================================================
if %DOCTOR_CODE% EQU 0 (
    echo   🎉 QUÁ TRÌNH SETUP MÁY CHỦ HOÀN TẤT THÀNH CÔNG 100%!
) else (
    echo   ⚠️ QUÁ TRÌNH SETUP HOÀN TẤT VỚI MỘT SỐ CẢNH BÁO Ở TRÊN.
)
echo ===================================================================
echo.
set /p START_NOW="Bạn có muốn khởi động Server 7Bank ngay bây giờ không? (Y/N, mặc định Y): "
if /i "%START_NOW%"=="" set START_NOW=Y
if /i "%START_NOW%"=="Y" (
    echo.
    echo [*] Đang kích hoạt 7Bank Server...
    start start_server.bat
    exit /b 0
)

echo.
echo [*] Bạn có thể khởi động server bất cứ lúc nào bằng cách click vào 'start_server.bat'.
echo.
pause
