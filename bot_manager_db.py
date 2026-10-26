#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Bot Manager - Database Module (SQLite)
Quản lý cơ sở dữ liệu cục bộ cho Bot Ngân Hàng, Khách Thuê API,
Lịch sử giao dịch biến động số dư và Webhook.
=============================================================================
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot_manager.db")


def get_connection() -> sqlite3.Connection:
    """Tạo kết nối tới SQLite Database với row_factory dict-like."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Khởi tạo cấu trúc các bảng cho hệ thống."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. Bảng bot ngân hàng
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS banks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bank_code TEXT NOT NULL,          -- ACB, BIDV, MBBANK, TPBANK, VCB, VIETTIN, TECHCOMBANK, ZALOPAY
                bank_name TEXT NOT NULL,          -- Tên hiển thị đầy đủ
                account_number TEXT NOT NULL,     -- Số tài khoản hoặc số điện thoại
                username TEXT NOT NULL,           -- Tên đăng nhập
                password TEXT NOT NULL,           -- Mật khẩu
                extra_data TEXT DEFAULT '{}',     -- JSON chứa cookie, token, deviceId, sessionData...
                account_name TEXT DEFAULT '',     -- Tên chủ tài khoản
                balance REAL DEFAULT 0.0,         -- Số dư khả dụng
                status TEXT DEFAULT 'UNKNOWN',    -- ONLINE, OFFLINE, ERROR, EXPIRED, UNKNOWN
                last_checked TEXT DEFAULT '',     -- Thời gian kiểm tra gần nhất
                last_message TEXT DEFAULT '',     -- Chi tiết thông báo lần cuối
                is_active INTEGER DEFAULT 1,      -- 1: Bật, 0: Tạm dừng
                created_at TEXT NOT NULL
            )
        """)

        # 2. Bảng khách thuê API & API Keys
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_name TEXT NOT NULL,        -- Tên khách hàng / đối tác thuê API
                api_key TEXT UNIQUE NOT NULL,     -- Key xác thực (7b_live_...)
                allowed_banks TEXT DEFAULT '*',   -- JSON list ['MBBANK', 'VCB'] hoặc '*' (tất cả)
                webhook_url TEXT DEFAULT '',      -- URL webhook nhận thông báo tiền vào
                rate_limit INTEGER DEFAULT 60,    -- Số request / phút
                request_count INTEGER DEFAULT 0,  -- Tổng số request đã gọi
                expires_at TEXT NOT NULL,         -- Ngày hết hạn hợp đồng thuê
                is_active INTEGER DEFAULT 1,      -- 1: Hoạt động, 0: Đã khóa
                notes TEXT DEFAULT '',            -- Ghi chú khách thuê
                created_at TEXT NOT NULL
            )
        """)

        # 3. Bảng lịch sử giao dịch biến động số dư
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bank_code TEXT NOT NULL,
                account_number TEXT NOT NULL,
                transaction_id TEXT UNIQUE NOT NULL,
                amount REAL NOT NULL,
                type TEXT NOT NULL,               -- IN hoặc OUT
                description TEXT DEFAULT '',
                transaction_date TEXT NOT NULL,
                raw_data TEXT DEFAULT '{}',
                webhook_sent INTEGER DEFAULT 0,   -- 1 nếu đã bắn webhook thành công
                created_at TEXT NOT NULL
            )
        """)

        # 4. Bảng nhật ký gọi API từ khách thuê
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key TEXT NOT NULL,
                client_name TEXT DEFAULT '',
                endpoint TEXT NOT NULL,
                bank_code TEXT DEFAULT '',
                ip_address TEXT DEFAULT '',
                status_code INTEGER DEFAULT 200,
                response_time_ms REAL DEFAULT 0.0,
                created_at TEXT NOT NULL
            )
        """)

        # 5. Bảng cài đặt hệ thống
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # Cài đặt mặc định nếu chưa có
        default_settings = {
            "api_port": "8888",
            "api_host": "127.0.0.1",
            "auto_poll_enabled": "1",
            "poll_interval_sec": "30",
            "webhook_retry_count": "3",
            "ocr_captcha_key": "",
        }
        for k, v in default_settings.items():
            cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

        # Nạp dữ liệu mẫu ban đầu nếu bảng khách thuê trống
        cursor.execute("SELECT COUNT(*) as cnt FROM api_keys")
        if cursor.fetchone()["cnt"] == 0:
            now = datetime.now()
            exp = (now + timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT INTO api_keys (client_name, api_key, allowed_banks, webhook_url, rate_limit, expires_at, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "Khách Hàng Mẫu (Shop ABC)",
                f"7b_live_{uuid.uuid4().hex[:18]}",
                json.dumps(["MBBANK", "ACB", "TPBANK", "VCB", "BIDV", "VIETTIN", "TECHCOMBANK", "ZALOPAY"]),
                "https://webhook.site/sample-demo",
                120,
                exp,
                "Gói thuê full cổng ngân hàng 1 tháng",
                now.strftime("%Y-%m-%d %H:%M:%S"),
            ))

        conn.commit()


# =============================================================================
# HÀM XỬ LÝ DỮ LIỆU BOT NGÂN HÀNG
# =============================================================================

def get_all_banks(active_only: bool = False) -> List[Dict[str, Any]]:
    """Lấy danh sách các tài khoản ngân hàng."""
    with get_connection() as conn:
        cursor = conn.cursor()
        sql = "SELECT * FROM banks"
        if active_only:
            sql += " WHERE is_active = 1"
        sql += " ORDER BY id DESC"
        cursor.execute(sql)
        return [dict(row) for row in cursor.fetchall()]


def get_bank_by_id(bank_id: int) -> Optional[Dict[str, Any]]:
    """Lấy thông tin bot ngân hàng theo ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM banks WHERE id = ?", (bank_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_bank_by_code_and_account(bank_code: str, account_number: str) -> Optional[Dict[str, Any]]:
    """Lấy thông tin bot theo mã ngân hàng và STK."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM banks WHERE UPPER(bank_code) = UPPER(?) AND account_number = ? AND is_active = 1",
            (bank_code, account_number),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def add_bank(
    bank_code: str,
    bank_name: str,
    account_number: str,
    username: str,
    password: str,
    extra_data: Optional[Dict[str, Any]] = None,
    account_name: str = "",
) -> int:
    """Thêm tài khoản ngân hàng mới."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    extra_json = json.dumps(extra_data or {}, ensure_ascii=False)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO banks (bank_code, bank_name, account_number, username, password, extra_data, account_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            bank_code.upper(),
            bank_name,
            account_number.strip(),
            username.strip(),
            password,
            extra_json,
            account_name.strip(),
            now_str,
        ))
        conn.commit()
        return cursor.lastrowid


def update_bank_status(
    bank_id: int,
    status: str,
    balance: Optional[float] = None,
    account_name: Optional[str] = None,
    message: str = "",
    extra_data: Optional[Dict[str, Any]] = None,
):
    """Cập nhật trạng thái sống/chết, số dư và token của bot ngân hàng."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        cursor = conn.cursor()
        fields = ["status = ?", "last_checked = ?", "last_message = ?"]
        params: List[Any] = [status, now_str, message]

        if balance is not None:
            fields.append("balance = ?")
            params.append(balance)
        if account_name:
            fields.append("account_name = ?")
            params.append(account_name)
        if extra_data is not None:
            fields.append("extra_data = ?")
            params.append(json.dumps(extra_data, ensure_ascii=False))

        params.append(bank_id)
        sql = f"UPDATE banks SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(sql, params)
        conn.commit()


def delete_bank(bank_id: int):
    """Xóa tài khoản ngân hàng."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM banks WHERE id = ?", (bank_id,))
        conn.commit()


def toggle_bank_active(bank_id: int) -> int:
    """Bật/tắt trạng thái hoạt động của bot ngân hàng."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_active FROM banks WHERE id = ?", (bank_id,))
        row = cursor.fetchone()
        new_val = 0 if row and row["is_active"] == 1 else 1
        cursor.execute("UPDATE banks SET is_active = ? WHERE id = ?", (new_val, bank_id))
        conn.commit()
        return new_val


# =============================================================================
# HÀM XỬ LÝ KHÁCH THUÊ API (API KEYS)
# =============================================================================

def get_all_api_keys() -> List[Dict[str, Any]]:
    """Lấy danh sách tất cả API Keys của khách thuê."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM api_keys ORDER BY id DESC")
        return [dict(row) for row in cursor.fetchall()]


def get_api_key_info(api_key: str) -> Optional[Dict[str, Any]]:
    """Kiểm tra và lấy thông tin API Key."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM api_keys WHERE api_key = ?", (api_key.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None


def add_api_key(
    client_name: str,
    allowed_banks: Union[str, List[str]] = "*",
    days: int = 30,
    webhook_url: str = "",
    rate_limit: int = 60,
    notes: str = "",
) -> Tuple[int, str]:
    """Tạo API Key cho khách thuê mới."""
    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    exp_str = (now + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    new_key = f"7b_live_{uuid.uuid4().hex[:20]}"

    if isinstance(allowed_banks, list):
        banks_str = json.dumps([b.upper() for b in allowed_banks])
    else:
        banks_str = allowed_banks

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO api_keys (client_name, api_key, allowed_banks, webhook_url, rate_limit, expires_at, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            client_name.strip(),
            new_key,
            banks_str,
            webhook_url.strip(),
            rate_limit,
            exp_str,
            notes.strip(),
            now_str,
        ))
        conn.commit()
        return cursor.lastrowid, new_key


def extend_api_key(key_id: int, extra_days: int = 30) -> str:
    """Gia hạn thời hạn thuê API Key."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT expires_at FROM api_keys WHERE id = ?", (key_id,))
        row = cursor.fetchone()
        if not row:
            return ""

        try:
            curr_exp = datetime.strptime(row["expires_at"], "%Y-%m-%d %H:%M:%S")
            if curr_exp < datetime.now():
                curr_exp = datetime.now()
        except Exception:
            curr_exp = datetime.now()

        new_exp = curr_exp + timedelta(days=extra_days)
        new_exp_str = new_exp.strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("UPDATE api_keys SET expires_at = ?, is_active = 1 WHERE id = ?", (new_exp_str, key_id))
        conn.commit()
        return new_exp_str


def toggle_api_key_active(key_id: int) -> int:
    """Khóa hoặc mở khóa API Key."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_active FROM api_keys WHERE id = ?", (key_id,))
        row = cursor.fetchone()
        new_val = 0 if row and row["is_active"] == 1 else 1
        cursor.execute("UPDATE api_keys SET is_active = ? WHERE id = ?", (new_val, key_id))
        conn.commit()
        return new_val


def delete_api_key(key_id: int):
    """Xóa API Key của khách thuê."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
        conn.commit()


def increment_api_key_usage(api_key: str):
    """Tăng số lượt gọi của API Key."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE api_keys SET request_count = request_count + 1 WHERE api_key = ?", (api_key,))
        conn.commit()


# =============================================================================
# HÀM XỬ LÝ LỊCH SỬ GIAO DỊCH & LOG
# =============================================================================

def add_transaction(
    bank_code: str,
    account_number: str,
    transaction_id: str,
    amount: float,
    tx_type: str,
    description: str,
    transaction_date: str,
    raw_data: Optional[Dict[str, Any]] = None,
) -> bool:
    """Lưu giao dịch mới vào DB nếu chưa tồn tại. Trả về True nếu là giao dịch mới."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    raw_json = json.dumps(raw_data or {}, ensure_ascii=False)
    with get_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO transactions (bank_code, account_number, transaction_id, amount, type, description, transaction_date, raw_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                bank_code.upper(),
                account_number,
                str(transaction_id),
                float(amount),
                tx_type.upper(),
                description,
                str(transaction_date),
                raw_json,
                now_str,
            ))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            # Đã tồn tại giao dịch này
            return False


def get_transactions(limit: int = 50, bank_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lấy danh sách giao dịch mới nhất."""
    with get_connection() as conn:
        cursor = conn.cursor()
        sql = "SELECT * FROM transactions"
        params: List[Any] = []
        if bank_code:
            sql += " WHERE UPPER(bank_code) = UPPER(?)"
            params.append(bank_code)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        cursor.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]


def mark_webhook_sent(transaction_id: str):
    """Đánh dấu giao dịch đã được bắn webhook thành công."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE transactions SET webhook_sent = 1 WHERE transaction_id = ?", (str(transaction_id),))
        conn.commit()


def add_api_log(
    api_key: str,
    client_name: str,
    endpoint: str,
    bank_code: str = "",
    ip_address: str = "",
    status_code: int = 200,
    response_time_ms: float = 0.0,
):
    """Lưu nhật ký cuộc gọi API."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO api_logs (api_key, client_name, endpoint, bank_code, ip_address, status_code, response_time_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            api_key,
            client_name,
            endpoint,
            bank_code,
            ip_address,
            status_code,
            response_time_ms,
            now_str,
        ))
        conn.commit()


def get_api_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Lấy nhật ký gọi API mới nhất."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM api_logs ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(row) for row in cursor.fetchall()]


# =============================================================================
# HÀM THỐNG KÊ (DASHBOARD METRICS)
# =============================================================================

def get_dashboard_stats() -> Dict[str, Any]:
    """Tổng hợp số liệu thống kê cho Dashboard."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Thống kê banks
        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'ONLINE' THEN 1 ELSE 0 END) as online, SUM(balance) as total_bal FROM banks WHERE is_active = 1")
        bank_stats = cursor.fetchone()
        total_banks = bank_stats["total"] or 0
        online_banks = bank_stats["online"] or 0
        total_balance = bank_stats["total_bal"] or 0.0

        # Thống kê khách thuê
        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN is_active = 1 AND expires_at >= datetime('now') THEN 1 ELSE 0 END) as active FROM api_keys")
        key_stats = cursor.fetchone()
        total_clients = key_stats["total"] or 0
        active_clients = key_stats["active"] or 0

        # Thống kê giao dịch hôm nay
        today_prefix = datetime.now().strftime("%Y-%m-%d")
        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END) as in_amt FROM transactions WHERE created_at LIKE ?", (f"{today_prefix}%",))
        tx_stats = cursor.fetchone()
        today_tx_count = tx_stats["total"] or 0
        today_in_amount = tx_stats["in_amt"] or 0.0

        # Tổng request gọi vào hôm nay
        cursor.execute("SELECT COUNT(*) as total FROM api_logs WHERE created_at LIKE ?", (f"{today_prefix}%",))
        today_requests = cursor.fetchone()["total"] or 0

        return {
            "total_banks": total_banks,
            "online_banks": online_banks,
            "total_balance": total_balance,
            "total_clients": total_clients,
            "active_clients": active_clients,
            "today_tx_count": today_tx_count,
            "today_in_amount": today_in_amount,
            "today_requests": today_requests,
        }


def get_setting(key: str, default: str = "") -> str:
    """Lấy giá trị cài đặt theo khóa."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str):
    """Cập nhật hoặc thêm mới cài đặt."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()


# Tự động khởi tạo DB khi module được load
init_db()
