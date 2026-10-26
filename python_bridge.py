#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Gateway - Python Bridge API Engine
Cầu nối trung tâm giữa máy chủ Node.js / Web Application và các bộ Client API
ngân hàng viết bằng Python (MBBank, ACB, VCB, BIDV, VietinBank, Techcombank, ZaloPay, TPBank).
=============================================================================
"""

import json
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

# UTF-8 stdout configuration
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure current directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Import Bank Clients
from acb import ACB
from bidv import BIDV
from mbbank import MBBANK
from vcb import VCB
from viettin import VietinBank
from techcombank import Techcombank
from zalopay import ZaloPay
from bot_bank_adapter import TPBank

try:
    from msb import MSB
except ImportError:
    MSB = None

try:
    from pgbank import PGBank
except ImportError:
    PGBank = None

try:
    from eximbank import EximbankClient
except ImportError:
    EximbankClient = None



def normalize_bank_code(code: str) -> str:
    c = str(code).upper().strip()
    if c in ("MB", "MBB"):
        return "MBBANK"
    if c in ("VIETCOMBANK",):
        return "VCB"
    if c in ("VIETINBANK", "VIETTINBANK"):
        return "VIETTIN"
    if c in ("TCB",):
        return "TECHCOMBANK"
    if c in ("ZALO",):
        return "ZALOPAY"
    if c in ("TPB",):
        return "TPBANK"
    if c in ("MSB", "MARITIME", "MARITIMEBANK"):
        return "MSB"
    if c in ("PG", "PGBANK"):
        return "PGBANK"
    if c in ("EXIMBANK", "EXIM", "EIB"):
        return "EXIMBANK"
    return c


def handle_verify_login(params: Dict[str, Any]) -> Dict[str, Any]:
    bank_code = normalize_bank_code(params.get("bankCode", ""))
    account_number = str(params.get("accountNumber", "")).strip()
    username = str(params.get("username", "") or account_number).strip()
    password = str(params.get("password", "")).strip()
    cookie = str(params.get("cookie", "")).strip()
    session_data = params.get("sessionData") or {}
    if isinstance(session_data, str):
        try:
            session_data = json.loads(session_data)
        except Exception:
            session_data = {}

    key_captcha = (
        str(params.get("keyCaptcha") or params.get("key_captcha") or "").strip()
        or os.environ.get("KEY_CAPTCHA", "").strip()
        or os.environ.get("CAPTCHA_API_KEY", "").strip()
        or "local_offline_ai"
    )
    captcha_url = (
        str(params.get("captchaApiUrl") or params.get("captcha_api_url") or "").strip()
        or os.environ.get("CAPTCHA_LOCAL_ENGINE_URL", "").strip()
        or os.environ.get("CAPTCHA_API_URL", "").strip()
        or "http://127.0.0.1:8088"
    )

    if bank_code == "MBBANK":
        client = MBBANK(
            user=username,
            password=password,
            account_number=account_number,
            session_id=session_data.get("sessionId"),
            device_id=session_data.get("deviceId"),
            key_captcha=key_captcha,
            captcha_url=captcha_url,
        )
        res = client.verify_login(key_captcha=key_captcha)
        if res.get("success"):
            # Lấy số dư nếu có thể
            bal = 0.0
            try:
                bal_data = client.get_balance()
                acct_list = bal_data.get("acct_list", [])
                if acct_list:
                    bal = float(acct_list[0].get("currentBalance") or acct_list[0].get("balance") or 0)
            except Exception:
                pass
            return {
                "success": True,
                "status": "success",
                "bank": "mbbank",
                "accountName": res.get("accountName", "Chủ tài khoản MBBank"),
                "balance": bal,
                "sessionData": res.get("sessionData", {}),
                "message": res.get("message", "Đăng nhập MBBank thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "mbbank",
            "message": res.get("message", "Đăng nhập MBBank thất bại"),
            "raw": res,
        }

    elif bank_code == "ACB":
        client = ACB(
            username=username,
            password=password,
            account_number=account_number,
            access_token=session_data.get("accessToken") or session_data.get("access_token"),
            refresh_token=session_data.get("refreshToken") or session_data.get("refresh_token"),
        )
        res = client.verify_login(username=username, password=password)
        if res.get("success"):
            bal = 0.0
            try:
                bal_data = client.get_balance()
                if isinstance(bal_data, dict) and "data" in bal_data:
                    items = bal_data["data"]
                    if isinstance(items, list) and items:
                        bal = float(items[0].get("balance") or 0)
            except Exception:
                pass
            return {
                "success": True,
                "status": "success",
                "bank": "acb",
                "accountName": res.get("accountName", "Chủ tài khoản ACB"),
                "balance": bal,
                "sessionData": res.get("sessionData", {}),
                "message": res.get("message", "Đăng nhập ACB thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "acb",
            "message": res.get("message", "Đăng nhập ACB thất bại"),
            "raw": res,
        }

    elif bank_code == "VCB":
        client = VCB(
            username=username,
            password=password,
            account_number=account_number,
            session_id=session_data.get("sessionId"),
            key_captcha=key_captcha,
        )
        res = client.verify_login(
            username=username,
            password=password,
            account_number=account_number,
            key_captcha=key_captcha,
        )
        if res.get("success"):
            return {
                "success": True,
                "status": "success",
                "bank": "vcb",
                "accountName": res.get("accountName", "Chủ tài khoản Vietcombank"),
                "balance": 0.0,
                "sessionData": res.get("sessionData", {}),
                "message": res.get("message", "Đăng nhập Vietcombank thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "vcb",
            "requiresOtp": res.get("requiresOtp", False),
            "message": res.get("message", "Đăng nhập Vietcombank thất bại"),
            "raw": res,
        }

    elif bank_code == "BIDV":
        client = BIDV(
            username=username,
            password=password,
            account_number=account_number,
            access_token=session_data.get("accessToken"),
            key_captcha=key_captcha,
            captcha_url=captcha_url,
        )
        res = client.verify_login(
            username=username,
            password=password,
            account_number=account_number,
            key_captcha=key_captcha,
        )
        if res.get("success"):
            return {
                "success": True,
                "status": "success",
                "bank": "bidv",
                "accountName": res.get("accountName", "Chủ tài khoản BIDV"),
                "balance": 0.0,
                "sessionData": res.get("sessionData", {}),
                "message": res.get("message", "Đăng nhập BIDV thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "bidv",
            "requiresOtp": res.get("requiresOtp", False),
            "requiresCrossLogin": res.get("requiresCrossLogin", False),
            "message": res.get("message", "Đăng nhập BIDV thất bại"),
            "raw": res,
        }

    elif bank_code == "VIETTIN":
        client = VietinBank(
            username=username,
            password=password,
            account_number=account_number,
            key_captcha=key_captcha,
        )
        res = client.verify_login()
        if res.get("success"):
            bal = 0.0
            try:
                bal_data = client.getBalanceStandardized()
                if bal_data.get("status") == "success":
                    bal = float(bal_data.get("availableBalance") or 0)
            except Exception:
                pass
            return {
                "success": True,
                "status": "success",
                "bank": "viettin",
                "accountName": res.get("accountName", "Chủ tài khoản VietinBank"),
                "balance": bal,
                "sessionData": res.get("sessionData", {}),
                "message": res.get("message", "Đăng nhập VietinBank thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "viettin",
            "message": res.get("message", "Đăng nhập VietinBank thất bại"),
            "raw": res,
        }

    elif bank_code == "TECHCOMBANK":
        client = Techcombank(
            username=username,
            password=password,
            account_number=account_number,
        )
        res = client.verify_login()
        if res.get("success"):
            arr_id = res.get("arrangementId") or ("66d391e8-73e9-4927-a8c3-b799e07ba79a" if account_number == "19071955696013" else "")
            return {
                "success": True,
                "status": "success",
                "bank": "techcombank",
                "accountName": res.get("accountName") or username,
                "balance": float(res.get("balance") or 0.0),
                "sessionData": {
                    "accessToken": res.get("accessToken", ""),
                    "refreshToken": res.get("refreshToken", ""),
                    "arrangementId": arr_id,
                    "username": username,
                },
                "message": res.get("message", "Đăng nhập Techcombank thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "techcombank",
            "message": res.get("message", "Đăng nhập Techcombank thất bại"),
            "raw": res,
        }

    elif bank_code == "ZALOPAY":
        use_cookie = cookie or session_data.get("cookie") or password
        client = ZaloPay(
            phone=username,
            cookie=use_cookie,
        )
        prof = client.get_profile_kyc()
        if prof.get("status") == "success" and prof.get("data"):
            data = prof.get("data", {})
            bal = 0.0
            try:
                bal_res = client.get_balance()
                if isinstance(bal_res, dict) and "data" in bal_res:
                    bal = float(bal_res["data"].get("amount", 0))
            except Exception:
                pass
            return {
                "success": True,
                "status": "success",
                "bank": "zalopay",
                "accountName": data.get("display_name") or data.get("name") or "Chủ ví ZaloPay",
                "balance": bal,
                "sessionData": {
                    "cookie": use_cookie,
                    "phone": username,
                    "zalopayId": data.get("zalopay_id", ""),
                },
                "message": "Kết nối ví ZaloPay thành công",
            }
        return {
            "success": False,
            "status": "error",
            "bank": "zalopay",
            "message": prof.get("message", "Cookie ZaloPay đã hết hạn hoặc không hợp lệ"),
            "raw": prof,
        }

    elif bank_code == "TPBANK":
        client = TPBank(
            username=username,
            password=password,
            account_number=account_number,
            access_token=session_data.get("accessToken"),
        )
        res = client.verify_login()
        if res.get("success"):
            return {
                "success": True,
                "status": "success",
                "bank": "tpbank",
                "accountName": res.get("accountName", "Chủ tài khoản TPBank"),
                "balance": 0.0,
                "sessionData": res.get("sessionData", {}),
                "message": res.get("message", "Đăng nhập TPBank thành công"),
            }
        return {
            "success": False,
            "status": "error",
            "bank": "tpbank",
            "requiresApproval": res.get("requiresApproval", False),
            "transaction_id": res.get("transaction_id"),
            "message": res.get("message", "Đăng nhập TPBank thất bại"),
            "raw": res,
        }

    elif bank_code == "MSB":
        if MSB is None:
            return {
                "success": False,
                "status": "error",
                "bank": "msb",
                "message": "MSB đã được chuyển đổi hoàn toàn sang Node.js (msb.service.js)",
            }
        client = MSB(
            username=username,
            password=password,
            account_number=account_number,
            arrangement_id=session_data.get("arrangementId") or session_data.get("arrangement_id"),
            access_token=session_data.get("accessToken") or session_data.get("access_token"),
            refresh_token=session_data.get("refreshToken") or session_data.get("refresh_token"),
            cookie=cookie or session_data.get("cookie"),
        )
        return client.verify_login()

    elif bank_code == "PGBANK":
        try:
            client = PGBank(
                username=username,
                password=password,
                account_number=account_number,
                session_data=session_data,
            )
            return client.verify_login()
        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "bank": "pgbank",
                "message": f"Lỗi xác thực PGBank: {str(e)}",
            }

    elif bank_code == "EXIMBANK":
        if EximbankClient is None:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": "Module EximbankClient chưa được tải",
            }
        client = EximbankClient(
            username=username,
            password=password,
            account_number=account_number,
            key_captcha=key_captcha,
            captcha_url=captcha_url,
            session_data=session_data,
        )
        return client.verify_login()



    return {
        "success": False,
        "status": "error",
        "message": f"Cổng ngân hàng '{bank_code}' chưa được hỗ trợ trên Python Bridge",
    }


def handle_verify_otp(params: Dict[str, Any]) -> Dict[str, Any]:
    bank_code = normalize_bank_code(params.get("bankCode", ""))
    account_number = str(params.get("accountNumber", "")).strip()
    username = str(params.get("username", "") or account_number).strip()
    password = str(params.get("password", "")).strip()
    otp = str(params.get("otp", "")).strip()
    session_data = params.get("sessionData") or {}
    if isinstance(session_data, str):
        try:
            session_data = json.loads(session_data)
        except Exception:
            session_data = {}

    if bank_code == "EXIMBANK":
        if EximbankClient is None:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": "Module EximbankClient chưa được tải",
            }
        client = EximbankClient(
            username=username,
            password=password,
            account_number=account_number,
            session_data=session_data,
        )
        return client.verify_otp(otp)

    return {
        "success": False,
        "status": "error",
        "message": f"Cổng ngân hàng '{bank_code}' chưa hỗ trợ xác thực OTP trên Python Bridge",
    }


def handle_check_confirm(params: Dict[str, Any]) -> Dict[str, Any]:
    bank_code = normalize_bank_code(params.get("bankCode", ""))
    account_number = str(params.get("accountNumber", "")).strip()
    username = str(params.get("username", "") or account_number).strip()
    password = str(params.get("password", "")).strip()
    token = str(params.get("token", "")).strip()
    session_data = params.get("sessionData") or {}
    if isinstance(session_data, str):
        try:
            session_data = json.loads(session_data)
        except Exception:
            session_data = {}

    if bank_code == "EXIMBANK":
        if EximbankClient is None:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": "Module EximbankClient chưa được tải",
            }
        client = EximbankClient(
            username=username,
            password=password,
            account_number=account_number,
            session_data=session_data,
        )
        otp_token = str(params.get("otpToken") or params.get("qrData") or "").strip()
        if token:
            client.core.token = token
        if otp_token:
            client.core.otp_token = otp_token
        return client.check_confirm()

    return {
        "success": False,
        "status": "error",
        "message": f"Cổng ngân hàng '{bank_code}' chưa hỗ trợ kiểm tra xác nhận Smart OTP trên Python Bridge",
    }


def handle_get_history(params: Dict[str, Any]) -> Dict[str, Any]:
    bank_code = normalize_bank_code(params.get("bankCode", ""))
    account_number = str(params.get("accountNumber", "")).strip()
    username = str(params.get("username", "") or account_number).strip()
    password = str(params.get("password", "")).strip()
    cookie = str(params.get("cookie", "")).strip()
    days = int(params.get("days") or 6)

    session_data = params.get("sessionData") or {}
    if isinstance(session_data, str):
        try:
            session_data = json.loads(session_data)
        except Exception:
            session_data = {}

    key_captcha = (
        str(params.get("keyCaptcha") or params.get("key_captcha") or "").strip()
        or os.environ.get("KEY_CAPTCHA", "").strip()
        or os.environ.get("CAPTCHA_API_KEY", "").strip()
        or "local_offline_ai"
    )
    captcha_url = (
        str(params.get("captchaApiUrl") or params.get("captcha_api_url") or "").strip()
        or os.environ.get("CAPTCHA_LOCAL_ENGINE_URL", "").strip()
        or os.environ.get("CAPTCHA_API_URL", "").strip()
        or "http://127.0.0.1:8088"
    )

    updated_session = dict(session_data)

    if bank_code == "MBBANK":
        client = MBBANK(
            user=username,
            password=password,
            account_number=account_number,
            session_id=session_data.get("sessionId"),
            device_id=session_data.get("deviceId"),
            key_captcha=key_captcha,
            captcha_url=captcha_url,
        )
        hist = client.get_formatted_history(account_no=account_number, days=days, auto_relogin=True)
        if hist.get("status") != "success" and password:
            relogin = client.verify_login(key_captcha=key_captcha)
            if relogin.get("success"):
                new_sess = relogin.get("sessionData", {})
                updated_session.update(new_sess)
                client.sessionId = new_sess.get("sessionId", "")
                client.deviceIdCommon_goc = new_sess.get("deviceId", "")
                hist = client.get_formatted_history(account_no=account_number, days=days, auto_relogin=False)

        if hist.get("status") == "success":
            updated_session["sessionId"] = client.sessionId
            updated_session["deviceId"] = client.deviceIdCommon_goc
            return {
                "success": True,
                "status": "success",
                "bank": "mbbank",
                "count": hist.get("count", len(hist.get("transactions", []))),
                "transactions": hist.get("transactions", []),
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "mbbank",
            "message": hist.get("message", "Không thể lấy lịch sử giao dịch MBBank"),
            "transactions": [],
        }

    elif bank_code == "ACB":
        client = ACB(
            username=username,
            password=password,
            account_number=account_number,
            access_token=session_data.get("accessToken") or session_data.get("access_token"),
            refresh_token=session_data.get("refreshToken") or session_data.get("refresh_token"),
        )
        hist = client.get_formatted_history(account_no=account_number, rows=30, auto_relogin=True)
        if hist.get("status") != "success" and password:
            relogin = client.verify_login(username=username, password=password, account_number=account_number)
            if relogin.get("success"):
                new_sess = relogin.get("sessionData", {})
                updated_session.update(new_sess)
                client.access_token = new_sess.get("accessToken", "")
                client.refresh_token = new_sess.get("refreshToken", "")
                hist = client.get_formatted_history(account_no=account_number, rows=30, auto_relogin=False)

        if hist.get("status") == "success":
            updated_session["accessToken"] = client.access_token
            updated_session["refreshToken"] = client.refresh_token
            return {
                "success": True,
                "status": "success",
                "bank": "acb",
                "count": hist.get("count", len(hist.get("transactions", []))),
                "transactions": hist.get("transactions", []),
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "acb",
            "message": hist.get("message", "Không thể lấy lịch sử giao dịch ACB"),
            "transactions": [],
        }

    elif bank_code == "VCB":
        client = VCB(
            username=username,
            password=password,
            account_number=account_number,
            session_id=session_data.get("sessionId"),
            key_captcha=key_captcha,
        )
        if "cif" in session_data:
            client.cif = session_data["cif"]
        if "clientId" in session_data:
            client.clientId = session_data["clientId"]
        if "mobileId" in session_data:
            client.mobileId = session_data["mobileId"]

        hist = client.get_formatted_history(account_number=account_number)

        # TỰ ĐỘNG ĐĂNG NHẬP LẠI (AUTO-RELOGIN) NẾU PHIÊN HẾT HẠN
        if hist.get("status") != "success" and password:
            relogin = client.verify_login(
                username=username,
                password=password,
                account_number=account_number,
                key_captcha=key_captcha,
            )
            if relogin.get("success"):
                new_sess = relogin.get("sessionData", {})
                updated_session.update(new_sess)
                client.sessionId = new_sess.get("sessionId", "")
                client.session_id = client.sessionId
                client.cif = new_sess.get("cif", "")
                client.clientId = new_sess.get("clientId", "")
                client.client_id = client.clientId
                client.mobileId = new_sess.get("mobileId", "")
                client.mobile_id = client.mobileId
                hist = client.get_formatted_history(account_number=account_number)
        else:
            if client.sessionId:
                updated_session["sessionId"] = client.sessionId
                updated_session["cif"] = client.cif
                updated_session["clientId"] = client.clientId
                updated_session["mobileId"] = client.mobileId

        if hist.get("status") == "success":
            txs = hist.get("transactions", [])
            normalized = []
            for t in txs:
                normalized.append({
                    "transactionID": t.get("transaction_id") or t.get("id", ""),
                    "amount": float(t.get("amount", 0)),
                    "type": t.get("type", "IN"),
                    "description": t.get("description", ""),
                    "transactionDate": t.get("date", ""),
                })
            return {
                "success": True,
                "status": "success",
                "bank": "vcb",
                "count": len(normalized),
                "transactions": normalized,
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "vcb",
            "message": hist.get("des") or hist.get("message", "Không thể lấy lịch sử VCB"),
            "transactions": [],
        }

    elif bank_code == "BIDV":
        client = BIDV(
            username=username,
            password=password,
            account_number=account_number,
            access_token=session_data.get("accessToken"),
            key_captcha=key_captcha,
            captcha_url=captcha_url,
        )
        if "E" in session_data and session_data["E"]:
            client.E = session_data["E"]
        if "clientId" in session_data and session_data["clientId"]:
            client.clientId = session_data["clientId"]
        if "authToken" in session_data and session_data["authToken"]:
            client.authToken = session_data["authToken"]

        # Nếu thiếu clientId hoặc authToken từ DB, nạp từ file cache data/{username}.txt
        if not client.clientId or not client.authToken or not client.E:
            client.parseData()

        # Token truyền vào header Authorization của BIDV phải là authToken (Bearer JWT)
        auth_tok = client.authToken or session_data.get("authToken") or session_data.get("accessToken")
        hist = client.get_formatted_history(account_number=account_number, auth_token=auth_tok)

        # Chỉ thử relogin nếu session rỗng hoàn toàn VÀ có cờ autoRelogin=True (tránh tự ý kích hoạt Cross Login lên app điện thoại khi xem lịch sử)
        allow_cross_relogin = bool(params.get("autoRelogin") or params.get("auto_relogin") or False)
        if hist.get("status") != "success" and password and allow_cross_relogin:
            relogin = client.verify_login(username=username, password=password, key_captcha=key_captcha)
            if relogin.get("success"):
                new_sess = relogin.get("sessionData", {})
                updated_session.update(new_sess)
                client.E = new_sess.get("E", "")
                client.clientId = new_sess.get("clientId", "")
                client.authToken = new_sess.get("authToken", "")
                client.accessToken = new_sess.get("accessToken", "")
                hist = client.get_formatted_history(account_number=account_number, auth_token=client.authToken)

        if hist.get("status") == "success":
            # Đồng bộ lại toàn bộ sessionData mới nhất để lưu vào DB
            updated_session["clientId"] = client.clientId
            updated_session["E"] = client.E
            updated_session["authToken"] = client.authToken
            updated_session["accessToken"] = client.accessToken
            updated_session["sessionId"] = client.sessionId
            if client.cif:
                updated_session["cif"] = client.cif

            txs = hist.get("transactions", [])
            normalized = []
            for t in txs:
                normalized.append({
                    "transactionID": t.get("transaction_id") or t.get("id", ""),
                    "amount": float(t.get("amount", 0)),
                    "type": t.get("type", "IN"),
                    "description": t.get("description", ""),
                    "transactionDate": t.get("date", ""),
                })
            return {
                "success": True,
                "status": "success",
                "bank": "bidv",
                "count": len(normalized),
                "transactions": normalized,
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "bidv",
            "message": hist.get("message") or "Phiên đăng nhập BIDV đã hết hạn. Vui lòng bấm [Đăng Nhập Lại] trên cổng BIDV để xác nhận trên điện thoại.",
            "requiresRelogin": True,
            "transactions": [],
        }

    elif bank_code == "VIETTIN":
        client = VietinBank(
            username=username,
            password=password,
            account_number=account_number,
            key_captcha=key_captcha,
        )
        if "sessionId" in session_data:
            client.sessionId = session_data["sessionId"]
        if "tokenId" in session_data:
            client.tokenId = session_data["tokenId"]
        if "ipayId" in session_data:
            client.ipayId = session_data["ipayId"]
        if "addField3" in session_data:
            client.addField3 = session_data["addField3"]

        hist = client.get_formatted_history(days=days)

        # TỰ ĐỘNG ĐĂNG NHẬP LẠI (AUTO-RELOGIN) NẾU PHIÊN HẾT HẠN
        if hist.get("status") != "success" and password:
            relogin = client.verify_login(username=username, password=password, account_number=account_number)
            if relogin.get("success"):
                new_sess = relogin.get("sessionData", {})
                updated_session.update(new_sess)
                client.sessionId = new_sess.get("sessionId", "")
                client.tokenId = new_sess.get("tokenId", "")
                client.ipayId = new_sess.get("ipayId", "")
                client.addField3 = new_sess.get("addField3", "")
                hist = client.get_formatted_history(days=days)

        if hist.get("status") == "success":
            if client.sessionId:
                updated_session["sessionId"] = client.sessionId
            if client.tokenId:
                updated_session["tokenId"] = client.tokenId
            if client.ipayId:
                updated_session["ipayId"] = client.ipayId
            if client.addField3:
                updated_session["addField3"] = client.addField3

            txs = hist.get("transactions", [])
            normalized = []
            for t in txs:
                normalized.append({
                    "transactionID": t.get("transactionID") or t.get("id", ""),
                    "amount": float(t.get("amount", 0)),
                    "type": t.get("type", "IN"),
                    "description": t.get("description", ""),
                    "transactionDate": t.get("transactionDate", ""),
                })
            return {
                "success": True,
                "status": "success",
                "bank": "viettin",
                "count": len(normalized),
                "transactions": normalized,
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "viettin",
            "message": hist.get("des") or hist.get("message", "Không thể lấy lịch sử VietinBank"),
            "transactions": [],
        }

    elif bank_code == "TECHCOMBANK":
        token = session_data.get("accessToken") or session_data.get("access_token")
        ref_token = session_data.get("refreshToken") or session_data.get("refresh_token")
        arr_id = session_data.get("arrangementId") or session_data.get("arrangement_id")
        if not arr_id and account_number == "19071955696013":
            arr_id = "66d391e8-73e9-4927-a8c3-b799e07ba79a"

        client = Techcombank(
            username=username,
            password=password,
            account_number=account_number,
            arrangement_id=arr_id,
            access_token=token,
            refresh_token=ref_token,
        )

        # 1. Kiểm tra JWT token: nếu hết hạn và có refresh token thì làm mới ngay lập tức
        need_refresh = False
        if not token:
            need_refresh = True
        else:
            try:
                jwt_payload = decode_jwt_payload(token)
                exp = jwt_payload.get("exp")
                if exp and time.time() >= (exp - 45):
                    need_refresh = True
            except Exception:
                need_refresh = True

        if need_refresh and ref_token:
            ref_data = client.refresh_access_token()
            if ref_data and client.access_token:
                token = client.access_token
                updated_session["accessToken"] = client.access_token
                if client.refresh_token:
                    updated_session["refreshToken"] = client.refresh_token

        raw_txs = client.fetch_transactions(
            access_token=token,
            days=days,
            account_number=account_number,
            arrangement_id=arr_id,
            save_file=False,
        )

        # Nếu không lấy được live mà có refresh_token (chưa refresh được trước đó), thử refresh lại
        if (not raw_txs or not isinstance(raw_txs, list) or len(raw_txs) == 0) and ref_token and not client.access_token:
            ref_data = client.refresh_access_token()
            if ref_data and client.access_token:
                updated_session["accessToken"] = client.access_token
                if client.refresh_token:
                    updated_session["refreshToken"] = client.refresh_token
                raw_txs = client.fetch_transactions(
                    access_token=client.access_token,
                    days=days,
                    account_number=account_number,
                    arrangement_id=arr_id,
                    save_file=False,
                )

        if not raw_txs or not isinstance(raw_txs, list) or len(raw_txs) == 0:
            return {
                "success": False,
                "status": "error",
                "bank": "techcombank",
                "message": "Không thể lấy lịch sử giao dịch Techcombank (phiên đăng nhập có thể đã hết hạn). Cần cập nhật lại phiên trên cổng Techcombank.",
                "transactions": [],
                "sessionExpired": True,
            }

        normalized = []
        for t in raw_txs:
            amt_cur = t.get("transactionAmountCurrency")
            raw_amt = amt_cur.get("amount") if isinstance(amt_cur, dict) else None
            if raw_amt is None:
                raw_amt = t.get("amount", 0)
            try:
                amt = float(raw_amt)
            except (ValueError, TypeError):
                amt = 0.0

            ind = str(t.get("creditDebitIndicator") or t.get("type") or "").upper()
            tx_type = "OUT" if ind in ("DBIT", "DEBIT") else "IN"

            # Ưu tiên lấy ngày giờ chính xác từ creationTime nếu có
            tx_date = t.get("creationTime") or t.get("bookingDate") or t.get("valueDate") or ""

            normalized.append({
                "transactionID": str(t.get("reference") or t.get("id") or ""),
                "amount": abs(amt),
                "type": tx_type,
                "description": t.get("description") or t.get("narrative", ""),
                "transactionDate": tx_date,
            })

        # Sắp xếp mới nhất lên đầu
        normalized.sort(key=lambda x: str(x.get("transactionDate", "")), reverse=True)

        if client.access_token:
            updated_session["accessToken"] = client.access_token
        if client.refresh_token:
            updated_session["refreshToken"] = client.refresh_token
        if arr_id:
            updated_session["arrangementId"] = arr_id

        # Truy vấn số dư và tên chủ tài khoản mới nhất
        balance = None
        account_name = None
        try:
            active_tok = client.access_token or token
            arr_list = client.fetch_arrangements(active_tok)
            if arr_list:
                for acc in arr_list:
                    bban = str(acc.get("BBAN") or acc.get("accountNumber") or "")
                    if not account_number or account_number in bban or bban in account_number:
                        balance = float(acc.get("availableBalance") or acc.get("bookedBalance") or 0.0)
                        account_name = acc.get("alias") or acc.get("name") or ""
                        break
        except Exception:
            pass

        return {
            "success": True,
            "status": "success",
            "bank": "techcombank",
            "count": len(normalized),
            "transactions": normalized,
            "balance": balance,
            "accountName": account_name,
            "sessionData": updated_session,
        }


        return {
            "success": False,
            "status": "error",
            "bank": "techcombank",
            "message": "Không thể lấy lịch sử giao dịch Techcombank hoặc phiên đã hết hạn. Cần đăng nhập lại trên cổng Techcombank.",
            "transactions": [],
        }

    elif bank_code == "ZALOPAY":
        use_cookie = cookie or session_data.get("cookie") or password
        client = ZaloPay(
            phone=username,
            cookie=use_cookie,
        )
        hist = client.get_formatted_history(limit=30)
        if hist.get("status") == "success":
            return {
                "success": True,
                "status": "success",
                "bank": "zalopay",
                "count": hist.get("count", len(hist.get("transactions", []))),
                "transactions": hist.get("transactions", []),
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "zalopay",
            "message": hist.get("message", "Không thể lấy lịch sử ZaloPay"),
            "transactions": [],
        }

    elif bank_code == "TPBANK":
        client = TPBank(
            username=username,
            password=password,
            account_number=account_number,
            access_token=session_data.get("accessToken"),
        )
        hist = client.get_formatted_history(account_no=account_number, days=days)
        # TỰ ĐỘNG ĐĂNG NHẬP LẠI TPBANK NẾU TOKEN HẾT HẠN
        if hist.get("status") != "success" and password:
            relogin = client.verify_login()
            if relogin.get("success"):
                new_sess = relogin.get("sessionData", {})
                updated_session.update(new_sess)
                client.access_token = new_sess.get("accessToken", "")
                hist = client.get_formatted_history(account_no=account_number, days=days)

        if hist.get("status") == "success":
            return {
                "success": True,
                "status": "success",
                "bank": "tpbank",
                "count": hist.get("count", len(hist.get("transactions", []))),
                "transactions": hist.get("transactions", []),
                "sessionData": updated_session,
            }
        return {
            "success": False,
            "status": "error",
            "bank": "tpbank",
            "message": hist.get("message", "Không thể lấy lịch sử TPBank"),
            "transactions": [],
        }

    elif bank_code == "MSB":
        if MSB is None:
            return {
                "success": False,
                "status": "error",
                "bank": "msb",
                "message": "MSB đã được chuyển đổi hoàn toàn sang Node.js (msb.service.js)",
                "transactions": [],
            }
        client = MSB(
            username=username,
            password=password,
            account_number=account_number,
            arrangement_id=session_data.get("arrangementId") or session_data.get("arrangement_id"),
            access_token=session_data.get("accessToken") or session_data.get("access_token"),
            refresh_token=session_data.get("refreshToken") or session_data.get("refresh_token"),
            cookie=cookie or session_data.get("cookie"),
        )
        return client.get_formatted_history(days=days)

    elif bank_code == "PGBANK":
        try:
            client = PGBank(
                username=username,
                password=password,
                account_number=account_number,
                session_data=session_data,
            )
            res = client.get_formatted_history(days=days, auto_relogin=False)
            if "sessionData" not in res:
                res["sessionData"] = updated_session
            return res
        except Exception as e:
            return {
                "success": False,
                "status": "error",
                "bank": "pgbank",
                "message": f"Lỗi lấy lịch sử PGBank: {str(e)}",
                "transactions": [],
            }

    elif bank_code == "EXIMBANK":
        if EximbankClient is None:
            return {
                "success": False,
                "status": "error",
                "bank": "eximbank",
                "message": "Module EximbankClient chưa được tải",
                "transactions": [],
            }
        client = EximbankClient(
            username=username,
            password=password,
            account_number=account_number,
            key_captcha=key_captcha,
            captcha_url=captcha_url,
            session_data=session_data,
        )
        return client.get_formatted_history(days=days, auto_relogin=True)



    return {
        "success": False,
        "status": "error",
        "message": f"Cổng ngân hàng '{bank_code}' chưa được hỗ trợ lấy lịch sử",
        "transactions": [],
    }


def main():
    # Read payload from CLI arg or stdin
    payload_str = ""
    action = "verify_login"

    if len(sys.argv) > 2:
        action = sys.argv[1].strip()
        payload_str = sys.argv[2].strip()
    elif len(sys.argv) == 2:
        # sys.argv[1] could be action or JSON
        arg1 = sys.argv[1].strip()
        if arg1.startswith("{"):
            payload_str = arg1
        else:
            action = arg1

    if not payload_str:
        # Read from stdin
        try:
            payload_str = sys.stdin.read().strip()
        except Exception:
            payload_str = ""

    if not payload_str:
        print(json.dumps({
            "success": False,
            "status": "error",
            "message": "Không nhận được tham số JSON payload",
        }, ensure_ascii=False))
        return

    try:
        params = json.loads(payload_str)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "status": "error",
            "message": f"Dữ liệu JSON không hợp lệ: {str(e)}",
        }, ensure_ascii=False))
        return

    # Action can be specified inside JSON
    if "action" in params:
        action = params["action"]

    if action in ("verify_login", "verify", "login"):
        result = handle_verify_login(params)
    elif action in ("verify_otp", "confirm", "otp"):
        result = handle_verify_otp(params)
    elif action in ("check_confirm", "check_qr", "check_status"):
        result = handle_check_confirm(params)
    elif action in ("get_history", "history", "transactions"):
        result = handle_get_history(params)
    elif action in ("keepalive", "health_check"):
        # Run verify_login to check/refresh session
        result = handle_verify_login(params)
    else:
        result = {
            "success": False,
            "status": "error",
            "message": f"Hành động không xác định: {action}",
        }

    json_bytes = json.dumps(result, ensure_ascii=False).encode("utf-8")
    try:
        sys.stdout.buffer.write(b"\n---7BANK_JSON_START---\n" + json_bytes + b"\n---7BANK_JSON_END---\n")
        sys.stdout.buffer.flush()
    except Exception:
        print("\n---7BANK_JSON_START---\n" + json.dumps(result, ensure_ascii=True) + "\n---7BANK_JSON_END---\n")


if __name__ == "__main__":
    main()
