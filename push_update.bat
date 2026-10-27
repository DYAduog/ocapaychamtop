@echo off
chcp 65001 >nul
title 7BANK - ĐÓNG GÓI MÃ NGUỒN & ĐẨY BẢN CẬP NHẬT LÊN GIT
color 0A
cd /d "%~dp0"

echo ===================================================================
echo   🚀 7BANK / OCAPAY GATEWAY - NÉN BẢO MẬT & ĐẨY CẬP NHẬT LÊN GIT
echo   🔒 Mật khẩu giải nén mặc định: lethutrang123@
echo ===================================================================
echo.

:: 1. Kiểm tra Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [LỖI] Chưa tìm thấy Python trên máy tính của bạn!
    echo Vui lòng cài đặt Python (>= 3.8) và tích chọn "Add python.exe to PATH".
    echo.
    pause
    exit /b 1
)

:: 2. Khởi chạy script Python đóng gói và đẩy Git
python package_and_push.py %*

echo.
echo Nhấn phím bất kỳ để thoát...
pause >nul
