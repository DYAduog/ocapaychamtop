@echo off
chcp 65001 >nul
title 7Bank Gateway - Auto Banking & API Server 24/7 (Native Windows)
color 0A
cd /d "%~dp0"

echo ===================================================================
echo     7BANK / OCAPAY GATEWAY - AUTO BANKING & API PORTAL 24/7
echo ===================================================================
echo.
echo [*] Đang kiểm tra môi trường máy chủ và dịch vụ MongoDB...

node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [LỖI] Không tìm thấy Node.js. Vui lòng chạy setup_windows.bat trước!
    pause
    exit /b 1
)

:: Khởi động MongoDB service trên Windows nếu chưa chạy
net start MongoDB >nul 2>&1

:: Kiểm tra nhanh các thành phần
node nodejs-server/scripts/vps-doctor.js --quick >nul 2>&1

echo [✓] Máy chủ sẵn sàng!
echo [*] Đang khởi động 7Bank Server tại cổng 3000 (MongoDB 127.0.0.1)...
echo.

cd /d "%~dp0\nodejs-server"
timeout /t 2 >nul
start http://localhost:3000/
node src/server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Server đã dừng hoặc gặp sự cố. Nhấn phím bất kỳ để thoát.
    pause > nul
)
