@echo off
title 7Bank Bot Hub - Quan Ly Bot & Cho Thue API
cd /d "%~dp0"
echo ========================================================
echo   7BANK BOT HUB - HE THONG QUAN LY & CHO THUE API
echo   Dang khoi dong ung dung Desktop GUI...
echo ========================================================
python bot_manager_gui.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Gap loi khi khoi dong ung dung. Nhan phim bat ky de thoat.
    pause > nul
)
