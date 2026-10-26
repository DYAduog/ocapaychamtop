#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Bot Manager - API Gateway & Auto-Poller Server
Cổng máy chủ HTTP REST API cho khách hàng thuê API kết nối
Tích hợp hệ thống tự động quét biến động số dư và bắn Webhook.
=============================================================================
"""

import json
import logging
import os
import sys
import threading
import time
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional, Tuple

import requests

import bot_bank_adapter as adapter
import bot_manager_db as db

# Cấu hình logging
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("APIGateway")


class GatewayHTTPHandler(BaseHTTPRequestHandler):
    """Bộ xử lý các HTTP request từ khách hàng thuê API."""

    def log_message(self, format, *args):
        """Bỏ log mặc định ra stderr để không làm rối console."""
        pass

    def send_json_response(self, status_code: int, data: Dict[str, Any]):
        """Gửi JSON response chuẩn cho client."""
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Xử lý CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key")
        self.end_headers()

    def parse_query_params(self) -> Dict[str, str]:
        """Trích xuất query string parameters."""
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        return {k: v[0] for k, v in qs.items()}

    def get_api_key(self, params: Dict[str, str], body_data: Optional[Dict[str, Any]] = None) -> str:
        """Lấy API key từ Header hoặc Query Param hoặc Body."""
        # 1. Từ Header X-Api-Key hoặc Authorization
        api_key = self.headers.get("X-Api-Key") or ""
        if not api_key and self.headers.get("Authorization"):
            auth = self.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                api_key = auth[7:].strip()
            else:
                api_key = auth.strip()

        # 2. Từ Query param ?api_key=...
        if not api_key:
            api_key = params.get("api_key") or params.get("apiKey") or ""

        # 3. Từ JSON body
        if not api_key and body_data:
            api_key = body_data.get("api_key") or body_data.get("apiKey") or ""

        return api_key.strip()

    def validate_client(self, api_key: str, required_bank: Optional[str] = None) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """Xác thực tính hợp lệ của API Key, thời hạn thuê và quyền truy cập ngân hàng."""
        if not api_key:
            return False, None, "Vui lòng cung cấp API Key qua Header (X-Api-Key: ...) hoặc tham số '?api_key=...'"

        client = db.get_api_key_info(api_key)
        if not client:
            return False, None, "API Key không tồn tại trên hệ thống"

        if client["is_active"] != 1:
            return False, client, "API Key này đang bị tạm khóa hoặc ngừng dịch vụ"

        # Kiểm tra ngày hết hạn hợp đồng thuê
        try:
            exp_date = datetime.strptime(client["expires_at"], "%Y-%m-%d %H:%M:%S")
            if exp_date < datetime.now():
                return False, client, f"API Key đã hết hạn thuê vào ngày {client['expires_at']}. Vui lòng liên hệ quản trị viên để gia hạn."
        except Exception:
            pass

        # Kiểm tra quyền với ngân hàng cụ thể
        if required_bank:
            req_b = required_bank.upper()
            allowed_banks_raw = client.get("allowed_banks", "*")
            if allowed_banks_raw != "*":
                try:
                    allowed_list = json.loads(allowed_banks_raw)
                    if isinstance(allowed_list, list) and req_b not in [b.upper() for b in allowed_list]:
                        return False, client, f"API Key của bạn chưa được cấp quyền sử dụng ngân hàng '{req_b}'"
                except Exception:
                    pass

        # Cập nhật số lượt request
        db.increment_api_key_usage(api_key)

        return True, client, "Hợp lệ"

    def do_GET(self):
        """Xử lý các endpoint GET."""
        start_time = time.time()
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip("/")
        params = self.parse_query_params()
        api_key = self.get_api_key(params)

        # 1. Endpoint kiểm tra sức khỏe Gateway (Public)
        if path in ["", "/api", "/api/v1/ping", "/api/v1/health"]:
            self.send_json_response(200, {
                "status": "success",
                "message": "7Bank API Rental Gateway is running normally",
                "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "version": "2.0.0",
            })
            return

        # Xác thực API Key cho các endpoint bên dưới
        bank_code = params.get("bank", "").upper()
        valid, client, err_msg = self.validate_client(api_key, required_bank=bank_code if bank_code else None)
        client_name = client["client_name"] if client else "Unknown"

        if not valid:
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, bank_code, self.client_address[0], 401, res_ms)
            self.send_json_response(401, {
                "status": "error",
                "code": "UNAUTHORIZED",
                "message": err_msg,
            })
            return

        # 2. Endpoint kiểm tra thông tin gói thuê
        if path == "/api/v1/status":
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, "", self.client_address[0], 200, res_ms)
            self.send_json_response(200, {
                "status": "success",
                "client": {
                    "name": client["client_name"],
                    "expires_at": client["expires_at"],
                    "request_count": client["request_count"],
                    "rate_limit": client["rate_limit"],
                    "allowed_banks": client["allowed_banks"],
                    "webhook_url": client["webhook_url"],
                }
            })
            return

        # 3. Endpoint lấy danh sách các ngân hàng đang hoạt động
        if path == "/api/v1/banks":
            active_banks = db.get_all_banks(active_only=True)
            res_data = []
            for b in active_banks:
                res_data.append({
                    "bankCode": b["bank_code"],
                    "bankName": b["bank_name"],
                    "accountNumber": b["account_number"],
                    "accountName": b["account_name"],
                    "status": b["status"],
                })
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, "", self.client_address[0], 200, res_ms)
            self.send_json_response(200, {
                "status": "success",
                "count": len(res_data),
                "banks": res_data,
            })
            return

        # 4. Endpoint vấn tin số dư tài khoản ngân hàng
        if path == "/api/v1/balance":
            account_no = params.get("account", "").strip()
            if not bank_code:
                self.send_json_response(400, {
                    "status": "error",
                    "message": "Thiếu tham số 'bank' (VD: ?bank=MBBANK)",
                })
                return

            bank_row = None
            if account_no:
                bank_row = db.get_bank_by_code_and_account(bank_code, account_no)
            else:
                # Nếu không truyền STK thì lấy tài khoản đầu tiên của bank đó
                all_b = [b for b in db.get_all_banks(active_only=True) if b["bank_code"] == bank_code]
                if all_b:
                    bank_row = all_b[0]

            if not bank_row:
                self.send_json_response(404, {
                    "status": "error",
                    "message": f"Không tìm thấy bot ngân hàng '{bank_code}' đang hoạt động",
                })
                return

            check_res = adapter.check_health(bank_row)
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, bank_code, self.client_address[0], 200 if check_res["success"] else 500, res_ms)

            self.send_json_response(200 if check_res["success"] else 500, {
                "status": "success" if check_res["success"] else "error",
                "bankCode": bank_code,
                "accountNumber": bank_row["account_number"],
                "accountName": check_res.get("account_name") or bank_row.get("account_name"),
                "balance": check_res["balance"],
                "currency": "VND",
                "message": check_res["message"],
            })
            return

        # 5. Endpoint lấy lịch sử giao dịch (Sao kê biến động)
        if path == "/api/v1/history":
            account_no = params.get("account", "").strip()
            days = int(params.get("days", 6))
            if not bank_code:
                self.send_json_response(400, {
                    "status": "error",
                    "message": "Thiếu tham số 'bank' (VD: ?bank=MBBANK)",
                })
                return

            bank_row = None
            if account_no:
                bank_row = db.get_bank_by_code_and_account(bank_code, account_no)
            else:
                all_b = [b for b in db.get_all_banks(active_only=True) if b["bank_code"] == bank_code]
                if all_b:
                    bank_row = all_b[0]

            if not bank_row:
                self.send_json_response(404, {
                    "status": "error",
                    "message": f"Không tìm thấy bot ngân hàng '{bank_code}' đang hoạt động",
                })
                return

            hist_res = adapter.get_transactions(bank_row, days=days)
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, bank_code, self.client_address[0], 200 if hist_res["success"] else 500, res_ms)

            self.send_json_response(200 if hist_res["success"] else 500, {
                "status": "success" if hist_res["success"] else "error",
                "bankCode": bank_code,
                "accountNumber": bank_row["account_number"],
                "count": hist_res.get("count", 0),
                "transactions": hist_res.get("transactions", []),
                "message": hist_res.get("message", "Thành công"),
            })
            return

        # 404 Không tìm thấy endpoint
        self.send_json_response(404, {
            "status": "error",
            "message": f"Endpoint '{path}' không tồn tại trong hệ thống API",
        })

    def do_POST(self):
        """Xử lý các endpoint POST."""
        start_time = time.time()
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path.rstrip("/")
        params = self.parse_query_params()

        # Đọc request body
        content_len = int(self.headers.get("Content-Length", 0))
        body_data = {}
        if content_len > 0:
            try:
                raw_body = self.wfile.read(content_len) if hasattr(self, "_temp_body") else self.rfile.read(content_len)
                body_data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                body_data = {}

        api_key = self.get_api_key(params, body_data)
        bank_code = str(body_data.get("bank") or params.get("bank", "")).upper()

        valid, client, err_msg = self.validate_client(api_key, required_bank=bank_code if bank_code else None)
        client_name = client["client_name"] if client else "Unknown"

        if not valid:
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, bank_code, self.client_address[0], 401, res_ms)
            self.send_json_response(401, {
                "status": "error",
                "code": "UNAUTHORIZED",
                "message": err_msg,
            })
            return

        # 1. Endpoint tạo mã QR thanh toán động
        if path == "/api/v1/qrcode":
            account_no = str(body_data.get("account") or params.get("account", "")).strip()
            amount = float(body_data.get("amount") or params.get("amount", 0))
            content = str(body_data.get("content") or params.get("content", "THANHTOAN")).strip()

            if not bank_code:
                self.send_json_response(400, {
                    "status": "error",
                    "message": "Vui lòng chỉ định mã ngân hàng trong trường 'bank'",
                })
                return

            bank_row = None
            if account_no:
                bank_row = db.get_bank_by_code_and_account(bank_code, account_no)
            else:
                all_b = [b for b in db.get_all_banks(active_only=True) if b["bank_code"] == bank_code]
                if all_b:
                    bank_row = all_b[0]

            if not bank_row:
                self.send_json_response(404, {
                    "status": "error",
                    "message": f"Không tìm thấy tài khoản ngân hàng '{bank_code}' phù hợp",
                })
                return

            qr_res = adapter.generate_qr_payment(bank_row, amount=amount, content=content)
            res_ms = (time.time() - start_time) * 1000
            db.add_api_log(api_key, client_name, path, bank_code, self.client_address[0], 200, res_ms)

            self.send_json_response(200, {
                "status": "success",
                "bankCode": bank_code,
                "accountNumber": bank_row["account_number"],
                "accountName": bank_row["account_name"],
                "amount": amount,
                "content": content,
                "qrContent": qr_res.get("qr_content"),
                "qrUrl": qr_res.get("qr_url"),
                "qrTransID": qr_res.get("qr_trans_id"),
            })
            return

        self.send_json_response(404, {
            "status": "error",
            "message": f"Endpoint POST '{path}' không tồn tại",
        })


class APIGatewayServer:
    """Quản lý tiến trình Server HTTP API Gateway chạy nền."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8888):
        self.host = host
        self.port = port
        self.httpd: Optional[ThreadingHTTPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.is_running = False

    def start(self) -> bool:
        """Khởi động máy chủ API Gateway."""
        if self.is_running:
            return True

        for try_host in [self.host, "127.0.0.1"]:
            for try_port in [self.port, 8888, 8088, 9090]:
                try:
                    self.httpd = ThreadingHTTPServer((try_host, try_port), GatewayHTTPHandler)
                    self.host = try_host
                    self.port = try_port
                    self.server_thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
                    self.server_thread.start()
                    self.is_running = True
                    logger.info(f"API Gateway Server started at http://{self.host}:{self.port}")
                    return True
                except Exception:
                    continue

        self.is_running = False
        return False

    def stop(self):
        """Dừng máy chủ API Gateway."""
        if not self.is_running or not self.httpd:
            return

        try:
            self.httpd.shutdown()
            self.httpd.server_close()
            self.is_running = False
            logger.info("API Gateway Server stopped.")
        except Exception as e:
            logger.error(f"Error stopping API Gateway: {e}")


class AutoPollerAndWebhook:
    """
    Tiến trình quét tự động lịch sử giao dịch định kỳ
    và bắn Webhook tới các khách hàng thuê API khi có giao dịch tiền vào (IN).
    """

    def __init__(self, interval_sec: int = 30):
        self.interval_sec = interval_sec
        self.is_running = False
        self.poll_thread: Optional[threading.Thread] = None
        self.on_log_callback = None

    def log(self, msg: str):
        if self.on_log_callback:
            try:
                self.on_log_callback(msg)
            except Exception:
                pass
        logger.info(msg)

    def start(self):
        """Khởi động luồng quét tự động."""
        if self.is_running:
            return
        self.is_running = True
        self.poll_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.poll_thread.start()
        self.log(f"[AutoPoller] Khởi động trình quét giao dịch tự động (chu kỳ {self.interval_sec}s)")

    def stop(self):
        """Dừng trình quét tự động."""
        self.is_running = False
        self.log("[AutoPoller] Đã dừng quét tự động.")

    def _run_loop(self):
        """Vòng lặp quét ngầm."""
        while self.is_running:
            try:
                self._poll_all_banks()
            except Exception as e:
                self.log(f"[AutoPoller] Lỗi trong chu kỳ quét: {e}")

            # Đợi theo chu kỳ
            for _ in range(self.interval_sec):
                if not self.is_running:
                    break
                time.sleep(1)

    def _poll_all_banks(self):
        """Quét tất cả các bot ngân hàng đang bật."""
        active_banks = db.get_all_banks(active_only=True)
        if not active_banks:
            return

        for bank_row in active_banks:
            if not self.is_running:
                break

            b_code = bank_row["bank_code"]
            stk = bank_row["account_number"]

            try:
                # 1. Cập nhật số dư & kiểm tra tình trạng
                health = adapter.check_health(bank_row)
                if not health["success"]:
                    continue

                # 2. Lấy biến động giao dịch
                hist_res = adapter.get_transactions(bank_row, days=3)
                if hist_res.get("success"):
                    txs = hist_res.get("transactions", [])
                    # Tìm các giao dịch tiền vào (IN) mới
                    for tx in txs:
                        tx_type = tx.get("type", "IN")
                        if tx_type == "IN":
                            self._dispatch_webhooks_for_transaction(bank_row, tx)

            except Exception as e:
                self.log(f"[AutoPoller] Lỗi kiểm tra {b_code} ({stk}): {e}")

    def _dispatch_webhooks_for_transaction(self, bank_row: Dict[str, Any], tx: Dict[str, Any]):
        """Bắn webhook tới các khách hàng thuê API có cấu hình URL webhook."""
        tx_id = str(tx.get("transactionID") or tx.get("id") or "")
        amount = float(tx.get("amount") or 0.0)
        desc = tx.get("description") or ""
        tx_date = tx.get("transactionDate") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Tìm các khách hàng có quyền sử dụng bank này và có webhook_url
        all_clients = db.get_all_api_keys()
        b_code = bank_row["bank_code"].upper()

        payload = {
            "event": "TRANSACTION_INCOMING",
            "bankCode": b_code,
            "accountNumber": bank_row["account_number"],
            "accountName": bank_row.get("account_name", ""),
            "transactionID": tx_id,
            "amount": amount,
            "type": "IN",
            "description": desc,
            "transactionDate": tx_date,
            "timestamp": int(time.time()),
        }

        for client in all_clients:
            if client["is_active"] != 1:
                continue

            wh_url = client.get("webhook_url", "").strip()
            if not wh_url:
                continue

            # Kiểm tra xem client có quyền với bank này không
            allowed = client.get("allowed_banks", "*")
            has_perm = False
            if allowed == "*":
                has_perm = True
            else:
                try:
                    lst = json.loads(allowed)
                    if b_code in [x.upper() for x in lst]:
                        has_perm = True
                except Exception:
                    pass

            if has_perm:
                # Bắn webhook bất đồng bộ
                threading.Thread(
                    target=self._send_single_webhook,
                    args=(wh_url, payload, client["client_name"], tx_id),
                    daemon=True,
                ).start()

    def _send_single_webhook(self, url: str, payload: Dict[str, Any], client_name: str, tx_id: str):
        """Gửi HTTP POST webhook tới client."""
        try:
            self.log(f"[Webhook] Đang gửi biến động GD {tx_id} (+{payload['amount']:,.0f}đ) -> {client_name} ({url})")
            resp = requests.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json", "User-Agent": "7Bank-Webhook-Dispatcher/2.0"},
                timeout=10,
            )
            if resp.status_code in [200, 201, 204]:
                self.log(f"[Webhook] ✅ Bắn thành công cho {client_name} (HTTP {resp.status_code})")
                db.mark_webhook_sent(tx_id)
            else:
                self.log(f"[Webhook] ⚠️ Phản hồi HTTP {resp.status_code} từ {url}")
        except Exception as e:
            self.log(f"[Webhook] ❌ Lỗi gửi webhook tới {url}: {e}")
