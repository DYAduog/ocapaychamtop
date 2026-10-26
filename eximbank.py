#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Gateway - Eximbank Edigi Client & Adapter
Tích hợp bộ module Eximbank từ core/bank/eximbank_python-main
Tương thích hoàn toàn với hệ thống 7Bank Gateway và python_bridge.py.
=============================================================================
"""

import os
import sys
import json
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import importlib.util

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
EXIM_CORE_DIR = os.path.join(CURRENT_DIR, "core", "bank", "eximbank_python-main", "eximbank_python-main")
core_file = os.path.join(EXIM_CORE_DIR, "eximbank.py")

spec = importlib.util.spec_from_file_location("eximbank_core", core_file)
eximbank_core = importlib.util.module_from_spec(spec)
sys.modules["eximbank_core"] = eximbank_core
spec.loader.exec_module(eximbank_core)
CoreEximbank = eximbank_core.EXIMBANK


class EximbankClient:
    """
    Adapter chuẩn 7Bank cho cổng Eximbank Edigi
    """

    def __init__(
        self,
        username: str,
        password: str,
        account_number: str,
        proxy_list: Optional[List[str]] = None,
        key_captcha: Optional[str] = None,
        captcha_url: Optional[str] = None,
        session_data: Optional[Dict[str, Any]] = None,
    ):
        self.username = str(username or account_number).strip()
        self.password = str(password or "").strip()
        self.account_number = str(account_number or username).strip()
        self.key_captcha = key_captcha or os.environ.get("KEY_CAPTCHA", "offline_ai_self_hosted")
        self.captcha_url = captcha_url or os.environ.get("CAPTCHA_LOCAL_ENGINE_URL") or os.environ.get("CAPTCHA_API_URL", "http://127.0.0.1:8088")
        self.proxy_list = proxy_list

        self.core = CoreEximbank(
            username=self.username,
            password=self.password,
            account_number=self.account_number,
            proxy_list=self.proxy_list,
            captcha_key=self.key_captcha,
            captcha_url=self.captcha_url,
        )

        if session_data and isinstance(session_data, dict):
            self.core.load_session_data(session_data)

    def verify_login(self) -> Dict[str, Any]:
        """
        Thực hiện đăng nhập tài khoản Eximbank Edigi
        """
        try:
            res = self.core.do_login()
            if not res or not isinstance(res, dict):
                return {
                    "success": False,
                    "status": "error",
                    "bank": "eximbank",
                    "message": "Không nhận được phản hồi từ Eximbank",
                    "raw": res,
                }

            code = res.get("code")
            # Trường hợp cần xác thực mã OTP gửi về SMS/Smart OTP
            if (code in (302, 304) or res.get("requiresOtp")) and not (code == 200 and res.get("success")):
                raw_data = res.get("data", {}) if isinstance(res.get("data"), dict) else {}
                nested_data = raw_data.get("data", {}) if isinstance(raw_data.get("data"), dict) else {}

                otp_token = nested_data.get("otpToken") or self.core.otp_token or ""
                token_val = nested_data.get("token") or self.core.token or ""
                acc_name = nested_data.get("name") or "Chủ tài khoản Eximbank"
                expires_in = nested_data.get("otpExpireTime") or 120

                import urllib.parse
                qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=4&data={urllib.parse.quote(otp_token)}" if otp_token else ""

                return {
                    "success": False,
                    "status": "requires_otp",
                    "requiresOtp": True,
                    "bank": "eximbank",
                    "accountNumber": self.account_number,
                    "username": self.username,
                    "accountName": acc_name,
                    "qrData": otp_token,
                    "qrUrl": qr_url,
                    "token": token_val,
                    "expiresIn": expires_in,
                    "sessionData": self.core.get_session_data(),
                    "message": "Quý khách vui lòng xác thực SmartOTP để thực hiện đăng nhập vào Eximbank EDigi",
                    "raw": res,
                }

            if res.get("success") or code == 200:
                bal = 0.0
                acc_name = getattr(self.core, 'account_name', '') or "Chủ tài khoản Eximbank"
                try:
                    bal_res = self.core.get_balance(self.account_number)
                    if isinstance(bal_res, dict) and bal_res.get("success"):
                        data_part = bal_res.get("data", {})
                        if isinstance(data_part, dict):
                            bal = float(data_part.get("balance", 0.0))
                            if data_part.get("account_name"):
                                acc_name = data_part.get("account_name")
                except Exception:
                    pass

                return {
                    "success": True,
                    "status": "success",
                    "bank": "eximbank",
                    "accountNumber": self.account_number,
                    "accountName": acc_name,
                    "balance": bal,
                    "sessionData": self.core.get_session_data(),
                    "message": res.get("message") or "Đăng nhập Eximbank thành công",
                    "raw": res,
                }

            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": res.get("message") or res.get("msg") or "Đăng nhập Eximbank thất bại",
                "raw": res,
            }
        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": f"Lỗi ngoại lệ đăng nhập Eximbank: {str(e)}",
            }

    def verify_otp(self, otp: str) -> Dict[str, Any]:
        """
        Xác thực mã OTP gửi về điện thoại để hoàn tất đăng nhập
        """
        try:
            res = self.core.verify_otp(str(otp).strip())
            if not res or not isinstance(res, dict):
                return {
                    "success": False,
                    "status": "error",
                    "bank": "eximbank",
                    "message": "Không nhận được phản hồi xác thực OTP từ Eximbank",
                }

            if res.get("success") or res.get("code") == 200:
                bal = 0.0
                acc_name = getattr(self.core, "account_name", "") or "Chủ tài khoản Eximbank"
                acc_no = self.core.account_number or self.account_number
                try:
                    bal_res = self.core.get_balance(self.account_number)
                    if isinstance(bal_res, dict) and bal_res.get("success"):
                        data_part = bal_res.get("data", {})
                        if isinstance(data_part, dict):
                            bal = float(data_part.get("balance", 0.0))
                            if data_part.get("account_number"):
                                acc_no = data_part.get("account_number")
                            if data_part.get("account_name"):
                                acc_name = data_part.get("account_name")
                except Exception:
                    pass

                return {
                    "success": True,
                    "status": "success",
                    "bank": "eximbank",
                    "accountNumber": acc_no,
                    "accountName": acc_name,
                    "balance": bal,
                    "sessionData": self.core.get_session_data(),
                    "message": "Xác thực OTP Eximbank thành công",
                    "raw": res,
                }

            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": res.get("message") or "Mã OTP Eximbank không hợp lệ hoặc đã hết hạn",
                "raw": res,
            }
        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": f"Lỗi ngoại lệ xác thực OTP Eximbank: {str(e)}",
            }

    def check_confirm(self) -> Dict[str, Any]:
        """
        Kiểm tra trạng thái xác nhận Smart OTP qua quét mã QR
        """
        try:
            res = self.core.check_confirm()
            if res and isinstance(res, dict) and res.get("code") == "00":
                bal = 0.0
                acc_name = getattr(self.core, "account_name", "") or "Chủ tài khoản Eximbank"
                acc_no = self.core.account_number or self.account_number
                try:
                    bal_res = self.core.get_balance(self.account_number)
                    if isinstance(bal_res, dict) and bal_res.get("success"):
                        data_part = bal_res.get("data", {})
                        if isinstance(data_part, dict):
                            bal = float(data_part.get("balance", 0.0))
                            if data_part.get("account_number"):
                                acc_no = data_part.get("account_number")
                            if data_part.get("account_name"):
                                acc_name = data_part.get("account_name")
                except Exception:
                    pass

                self.core.is_login = True
                self.core.save_data()

                return {
                    "success": True,
                    "status": "success",
                    "bank": "eximbank",
                    "accountNumber": acc_no,
                    "accountName": acc_name,
                    "balance": bal,
                    "sessionData": self.core.get_session_data(),
                    "message": "Xác thực Smart OTP thành công",
                    "raw": res,
                }

            err_code = str(res.get("code") if isinstance(res, dict) else "")
            des_msg = (res.get("des") if isinstance(res, dict) else "") or "Chờ quét mã xác thực trên ứng dụng"

            # Mã chờ xác thực từ điện thoại: 3605 (SOFT_OTP_RETRY), 2968, 2930, 96
            if err_code in ("3605", "2968", "2930", "96") or "vui lòng xác thực" in des_msg.lower():
                return {
                    "success": False,
                    "status": "pending",
                    "code": err_code,
                    "message": des_msg or "Đang chờ bạn quét mã QR trên điện thoại...",
                }

            # Mã hết hạn / hủy phiên: 97, 98, V22, 3606
            if err_code in ("97", "98", "V22", "3606") or "hết phiên" in des_msg.lower() or "hết hạn" in des_msg.lower():
                return {
                    "success": False,
                    "status": "expired",
                    "code": err_code,
                    "message": des_msg or "Mã QR xác thực đã hết hạn, vui lòng bấm đăng nhập lại để lấy mã mới",
                }

            return {
                "success": False,
                "status": "pending",
                "code": err_code or "unknown",
                "message": des_msg,
            }
        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": f"Lỗi kiểm tra xác nhận Eximbank: {str(e)}",
            }

    def get_formatted_history(self, days: int = 6, auto_relogin: bool = True) -> Dict[str, Any]:
        """
        Lấy lịch sử giao dịch và chuẩn hóa theo quy chuẩn 7Bank
        """
        now = datetime.now()
        to_date = now.strftime("%d/%m/%Y")
        from_date = (now - timedelta(days=days)).strftime("%d/%m/%Y")

        try:
            res = self.core.get_transactions(self.account_number, from_date, to_date)

            # Auto relogin nếu phiên hết hạn hoặc bị đăng nhập thiết bị khác
            if (not res or not res.get("success")) and auto_relogin and self.password:
                login_res = self.core.do_login()
                if not (isinstance(login_res, dict) and (login_res.get("success") or login_res.get("code") == 200)):
                    login_res = self.core.re_login()
                if isinstance(login_res, dict) and (login_res.get("success") or login_res.get("code") == 200):
                    res = self.core.get_transactions(self.account_number, from_date, to_date)

            if res and isinstance(res, dict) and res.get("success"):
                tx_data = res.get("data", {}).get("transactions", [])
                normalized: List[Dict[str, Any]] = []

                for t in tx_data:
                    ref_id = str(
                        t.get("tranRef")
                        or t.get("refNo")
                        or t.get("tranId")
                        or t.get("transactionId")
                        or t.get("reference")
                        or t.get("id")
                        or f"EIB{int(time.time() * 1000)}"
                    )

                    try:
                        amt = abs(float(t.get("amount") or t.get("tranAmount") or t.get("totalAmount") or 0.0))
                    except (ValueError, TypeError):
                        amt = 0.0

                    dorc = str(t.get("tranType") or t.get("dorc") or t.get("cd") or t.get("creditDebit") or t.get("type") or "").strip().upper()
                    tx_type = "OUT" if dorc in ("-", "D", "DEBIT", "OUT") else "IN"

                    desc = str(
                        t.get("tranDesc")
                        or t.get("remark")
                        or t.get("description")
                        or t.get("content")
                        or t.get("narrative")
                        or ""
                    ).strip()

                    tx_date = str(
                        t.get("tranTime")
                        or t.get("tranDate")
                        or t.get("postDate")
                        or t.get("transactionDate")
                        or t.get("date")
                        or now.strftime("%d/%m/%Y %H:%M:%S")
                    ).strip()

                    normalized.append({
                        "transactionID": ref_id,
                        "amount": amt,
                        "type": tx_type,
                        "description": desc,
                        "transactionDate": tx_date,
                    })

                # Sắp xếp mới nhất lên đầu
                normalized.sort(key=lambda x: str(x.get("transactionDate", "")), reverse=True)

                # Lấy số dư hiện tại
                bal = None
                try:
                    bal_res = self.core.get_balance(self.account_number)
                    if isinstance(bal_res, dict) and bal_res.get("success"):
                        data_part = bal_res.get("data", {})
                        if isinstance(data_part, dict):
                            bal = float(data_part.get("balance", 0.0))
                except Exception:
                    pass

                if bal is None and tx_data and isinstance(tx_data[0], dict) and tx_data[0].get("balance") is not None:
                    try:
                        bal = float(tx_data[0]["balance"])
                    except Exception:
                        pass

                return {
                    "success": True,
                    "status": "success",
                    "bank": "eximbank",
                    "count": len(normalized),
                    "transactions": normalized,
                    "balance": bal,
                    "sessionData": self.core.get_session_data(),
                }

            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": (res.get("message") if isinstance(res, dict) else "") or "Không thể lấy lịch sử Eximbank hoặc phiên hết hạn",
                "transactions": [],
            }
        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": f"Lỗi ngoại lệ lấy lịch sử Eximbank: {str(e)}",
                "transactions": [],
            }


Eximbank = EximbankClient

