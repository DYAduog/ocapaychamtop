#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Bot Manager - Bank Adapter
Lớp cầu nối thống nhất kết nối tới 8 ngân hàng và ví điện tử:
ACB, BIDV, MBBank, TPBank, Vietcombank (VCB), VietinBank, Techcombank, ZaloPay.
=============================================================================
"""

import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union

import requests

# Đảm bảo đường dẫn import các module ngân hàng trong d:\7bank
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

# Import các client ngân hàng
from acb import ACB
from bidv import BIDV
from mbbank import MBBANK
from vcb import VCB
from viettin import VietinBank
from techcombank import Techcombank
from zalopay import ZaloPay

class TPBank:
    """
    Client TPBank tích hợp cho Python Adapter (kết nối trực tiếp ebank.tpb.vn).
    """
    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        access_token: Optional[str] = None,
        app_version: str = "2024.10.0",
        device_id: str = "KpWCqmyUvmiul5EQ26Xm4JW6dNSVNQ0Y1z0dhTKLQw3Pa",
        timeout: int = 20,
    ):
        self.username = username or ""
        self.password = password or ""
        self.account_number = account_number or username or ""
        self.access_token = access_token or ""
        self.app_version = app_version
        self.device_id = device_id
        self.timeout = timeout
        self.session = requests.Session()
        self.base_url = "https://ebank.tpb.vn/gateway/api"

    def _headers(self, token: Optional[str] = None) -> Dict[str, str]:
        tok = token or self.access_token
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "app_version": "2026.05.22",
            "Authorization": f"Bearer {tok}" if tok else "Bearer",
            "Cache-Control": "no-cache",
            "Content-Type": "application/json",
            "device_id": self.device_id,
            "device_name": "Chrome",
            "platform_name": "WEB",
            "platform_version": "146",
            "Pragma": "no-cache",
            "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "Origin": "https://ebank.tpb.vn",
            "Referer": "https://ebank.tpb.vn/",
            "source_app": "HYDRO",
            "user_name": "HYD",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        }
        return headers

    def verify_login(self) -> Dict[str, Any]:
        if self.access_token:
            try:
                res = self.session.get(f"{self.base_url}/customers-presentation-service/v1/customers", headers=self._headers(), timeout=self.timeout)
                if res.status_code == 200:
                    cust = res.json()
                    name = cust.get("fullName") or cust.get("customerName") or "Chủ tài khoản TPBank"
                    return {
                        "success": True,
                        "accountName": name,
                        "message": "Phiên làm việc TPBank hợp lệ",
                        "sessionData": {"accessToken": self.access_token, "username": self.username},
                        "accounts": [{"availableBalance": 0}],
                    }
            except Exception:
                pass

        try:
            url = f"{self.base_url}/auth/login/v4/non-trust"
            payload = {
                "username": self.username,
                "password": self.password,
                "deviceId": self.device_id,
                "transactionId": "",
            }
            res = self.session.post(url, json=payload, headers=self._headers(), timeout=self.timeout)
            data = res.json()
            if res.status_code == 200 and data.get("access_token"):
                self.access_token = data["access_token"]
                return {
                    "success": True,
                    "accountName": data.get("fullName") or "Chủ tài khoản TPBank",
                    "sessionData": {"accessToken": self.access_token, "username": self.username},
                    "message": "Đăng nhập TPBank thành công",
                }
            elif data.get("error", {}).get("error_code") == "70101":
                return {
                    "success": False,
                    "requiresApproval": True,
                    "transaction_id": data.get("transaction_id"),
                    "message": "TPBank yêu cầu mở app TPBank trên điện thoại để bấm Xác nhận 2FA (1-touch)",
                }
            err_obj = data.get("error", {})
            err_code = str(err_obj.get("error_code", ""))
            err_msg = err_obj.get("message_vi") or err_obj.get("error_message") or err_obj.get("message") or ""
            if err_code == "50525":
                err_msg = "Sai tên đăng nhập hoặc mật khẩu Internet Banking TPBank (Mã 50525)"
            elif err_code == "50526":
                err_msg = "Tài khoản TPBank bị tạm khóa do nhập sai mật khẩu nhiều lần (Mã 50526)"
            elif not err_msg:
                err_msg = f"Lỗi đăng nhập TPBank: {res.text}"
            return {
                "success": False,
                "message": err_msg,
                "raw": data,
            }
        except Exception as e:
            return {"success": False, "message": f"Lỗi kết nối TPBank: {str(e)}"}

    def get_formatted_history(self, account_no: Optional[str] = None, days: int = 6) -> Dict[str, Any]:
        acc = account_no or self.account_number
        if not self.access_token:
            login_res = self.verify_login()
            if not login_res.get("success"):
                return {"status": "error", "message": login_res.get("message", "Chưa có phiên đăng nhập TPBank")}

        try:
            now = datetime.now()
            from_date = (now - timedelta(days=days)).strftime("%Y%m%d")
            to_date = now.strftime("%Y%m%d")
            url = f"{self.base_url}/smart-search-presentation-service-v2/v2/account-transactions/find"
            payload = {
                "pageNumber": 1,
                "pageSize": 100,
                "accountNo": acc,
                "currency": "VND",
                "maxAcentrysrno": "",
                "fromDate": from_date,
                "toDate": to_date,
                "keyword": "",
            }
            res = self.session.post(url, json=payload, headers=self._headers(), timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                raw_txs = data.get("transactionInfos", [])
                tx_list = []
                for tx in raw_txs:
                    cd = tx.get("cdIndicator", "").upper()
                    tx_list.append({
                        "transactionID": str(tx.get("id") or tx.get("reference") or ""),
                        "amount": float(tx.get("amount", 0)),
                        "type": "IN" if cd in ("CR", "C", "+") else "OUT",
                        "description": tx.get("description", ""),
                        "transactionDate": tx.get("bookingDate", ""),
                    })
                return {"status": "success", "count": len(tx_list), "transactions": tx_list}
            return {"status": "error", "message": f"TPBank trả về mã lỗi {res.status_code}: {res.text}"}
        except Exception as e:
            return {"status": "error", "message": f"Lỗi lấy lịch sử TPBank: {str(e)}"}

    def generateqrcodepre(self, amount: float = 0, text: str = "", save_png: bool = False) -> Dict[str, Any]:
        bin_code = "970423"
        content = urllib.parse.quote(text)
        qr_url = f"https://img.vietqr.io/image/{bin_code}-{self.account_number}-compact2.png?amount={int(amount)}&addInfo={content}"
        return {
            "qrContent": f"VIETQR://{bin_code}/{self.account_number}?amount={int(amount)}&content={text}",
            "qrTransID": f"TPB_QR_{int(time.time())}",
            "qrUrl": qr_url,
        }

import bot_manager_db as db

# Thông tin danh sách 8 ngân hàng được hỗ trợ
SUPPORTED_BANKS = {
    "MBBANK": {
        "name": "Ngân Hàng Quân Đội (MBBank)",
        "short_name": "MBBank",
        "bin": "970422",
        "color": "#1856C2",
        "has_qr": True,
    },
    "ACB": {
        "name": "Ngân Hàng Á Châu (ACB)",
        "short_name": "ACB",
        "bin": "970416",
        "color": "#0055A5",
        "has_qr": True,
    },
    "VCB": {
        "name": "Ngân Hàng Ngoại Thương (Vietcombank)",
        "short_name": "Vietcombank",
        "bin": "970436",
        "color": "#008542",
        "has_qr": True,
    },
    "BIDV": {
        "name": "Ngân Hàng Đầu Tư & Phát Triển (BIDV)",
        "short_name": "BIDV",
        "bin": "970418",
        "color": "#005695",
        "has_qr": True,
    },
    "VIETTIN": {
        "name": "Ngân Hàng Công Thương (VietinBank)",
        "short_name": "VietinBank",
        "bin": "970415",
        "color": "#0068B3",
        "has_qr": True,
    },
    "TPBANK": {
        "name": "Ngân Hàng Tiên Phong (TPBank)",
        "short_name": "TPBank",
        "bin": "970423",
        "color": "#762D75",
        "has_qr": True,
    },
    "TECHCOMBANK": {
        "name": "Ngân Hàng Kỹ Thương (Techcombank)",
        "short_name": "Techcombank",
        "bin": "970407",
        "color": "#E51B24",
        "has_qr": True,
    },
    "MSB": {
        "name": "Ngân Hàng Hàng Hải (MSB)",
        "short_name": "MSB",
        "bin": "970426",
        "color": "#EA580C",
        "has_qr": True,
    },
    "ZALOPAY": {
        "name": "Ví Điện Tử ZaloPay",
        "short_name": "ZaloPay",
        "bin": "971005",
        "color": "#0068FF",
        "has_qr": False,
    },
}


def get_bank_info(bank_code: str) -> Dict[str, Any]:
    """Lấy thông tin hiển thị của ngân hàng."""
    code = str(bank_code).upper()
    return SUPPORTED_BANKS.get(code, {
        "name": f"Ngân Hàng {code}",
        "short_name": code,
        "bin": "970400",
        "color": "#4A5568",
        "has_qr": True,
    })


def create_bank_instance(bank_row: Dict[str, Any]) -> Any:
    """Khởi tạo đối tượng Bank client tương ứng từ bản ghi database."""
    bank_code = str(bank_row["bank_code"]).upper()
    username = bank_row.get("username", "")
    password = bank_row.get("password", "")
    account_number = bank_row.get("account_number", "")

    extra_data = {}
    raw_extra = bank_row.get("extra_data")
    if isinstance(raw_extra, str) and raw_extra.strip():
        try:
            extra_data = json.loads(raw_extra)
        except Exception:
            extra_data = {}
    elif isinstance(raw_extra, dict):
        extra_data = raw_extra

    if bank_code == "MBBANK":
        return MBBANK(
            user=username,
            password=password,
            account_number=account_number,
            session_id=extra_data.get("sessionId"),
            device_id=extra_data.get("deviceId"),
        )

    elif bank_code == "ACB":
        return ACB(
            username=username,
            password=password,
            account_number=account_number,
            access_token=extra_data.get("access_token"),
            refresh_token=extra_data.get("refresh_token"),
        )

    elif bank_code == "VCB":
        return VCB(
            username=username,
            password=password,
            account_number=account_number,
            session_id=extra_data.get("sessionId"),
        )

    elif bank_code == "BIDV":
        return BIDV(
            user=username,
            password=password,
            account_number=account_number,
            access_token=extra_data.get("access_token"),
        )

    elif bank_code == "VIETTIN":
        return VietinBank(
            username=username,
            password=password,
            account_number=account_number,
        )

    elif bank_code == "TPBANK":
        return TPBank(
            username=username,
            password=password,
            account_number=account_number,
            access_token=extra_data.get("access_token"),
            app_version="10.12.62",
        )

    elif bank_code == "TECHCOMBANK":
        return Techcombank(
            username=username,
            password=password,
            account_number=account_number,
        )

    elif bank_code == "MSB":
        from msb import MSB
        return MSB(
            username=username,
            password=password,
            account_number=account_number,
            access_token=extra_data.get("access_token"),
            refresh_token=extra_data.get("refresh_token"),
            cookie=extra_data.get("cookie"),
        )

    elif bank_code == "ZALOPAY":
        cookie = extra_data.get("cookie") or password
        return ZaloPay(
            phone=username,
            cookie=cookie,
        )

    raise ValueError(f"Ngân hàng không được hỗ trợ: {bank_code}")


def check_health(bank_row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Kiểm tra trạng thái sống/chết (Health Check) của tài khoản ngân hàng.
    Thực hiện đăng nhập, kiểm tra số dư và cập nhật cơ sở dữ liệu.
    """
    bank_id = bank_row["id"]
    bank_code = str(bank_row["bank_code"]).upper()
    result = {
        "success": False,
        "status": "ERROR",
        "balance": float(bank_row.get("balance") or 0.0),
        "account_name": bank_row.get("account_name", ""),
        "message": "",
        "raw": None,
    }

    try:
        client = create_bank_instance(bank_row)

        if bank_code in ["MBBANK", "ACB", "BIDV", "VIETTIN", "VCB", "TPBANK"]:
            # Các ngân hàng có hàm verify_login chuẩn hóa
            verify_res = client.verify_login()
            result["raw"] = verify_res
            if verify_res.get("success"):
                result["success"] = True
                result["status"] = "ONLINE"
                result["message"] = verify_res.get("message", "Kết nối ổn định")

                acc_name = verify_res.get("accountName")
                if acc_name:
                    result["account_name"] = acc_name

                # Trích xuất số dư
                accounts = verify_res.get("accounts", [])
                if accounts:
                    for acc in accounts:
                        if isinstance(acc, dict):
                            bal = acc.get("availableBalance") or acc.get("currentBalance") or acc.get("balance")
                            if bal is not None:
                                try:
                                    result["balance"] = float(bal)
                                    break
                                except Exception:
                                    pass
            else:
                result["success"] = False
                result["status"] = "ERROR"
                result["message"] = verify_res.get("message", "Xác thực thất bại")

        elif bank_code == "TECHCOMBANK":
            # Techcombank OOB flow
            if hasattr(client, "login"):
                login_res = client.login()
                result["raw"] = login_res
                if isinstance(login_res, dict) and login_res.get("success"):
                    result["success"] = True
                    result["status"] = "ONLINE"
                    result["message"] = "Đăng nhập thành công"
                else:
                    result["status"] = "ERROR"
                    result["message"] = str(login_res)
            else:
                result["status"] = "ONLINE"
                result["message"] = "Client sẵn sàng"

        elif bank_code == "ZALOPAY":
            # ZaloPay KYC Profile
            prof = client.get_profile_kyc()
            result["raw"] = prof
            if prof.get("status") != "error" and prof.get("data"):
                data = prof.get("data", {})
                result["success"] = True
                result["status"] = "ONLINE"
                result["account_name"] = data.get("display_name", "")
                result["message"] = "Cookie ZaloPay hợp lệ"

                bal_res = client.get_balance()
                if isinstance(bal_res, dict) and "data" in bal_res:
                    result["balance"] = float(bal_res["data"].get("amount", 0))
            else:
                result["status"] = "EXPIRED"
                result["message"] = prof.get("message", "Cookie ZaloPay đã hết hạn")

    except Exception as e:
        result["success"] = False
        result["status"] = "ERROR"
        result["message"] = f"Lỗi ngoại lệ: {str(e)}"

    # Cập nhật trạng thái vào cơ sở dữ liệu
    db.update_bank_status(
        bank_id=bank_id,
        status=result["status"],
        balance=result["balance"],
        account_name=result["account_name"],
        message=result["message"],
    )

    return result


def get_transactions(bank_row: Dict[str, Any], days: int = 6) -> Dict[str, Any]:
    """
    Lấy danh sách lịch sử giao dịch từ tài khoản ngân hàng.
    Chuẩn hóa dữ liệu theo chuẩn {transactionID, amount, description, transactionDate, type}.
    """
    bank_code = str(bank_row["bank_code"]).upper()
    account_no = bank_row["account_number"]
    client = create_bank_instance(bank_row)

    try:
        if hasattr(client, "get_formatted_history"):
            hist = client.get_formatted_history(account_no=account_no, days=days)
            if isinstance(hist, dict) and hist.get("status") == "success":
                tx_list = hist.get("transactions", [])
                # Tự động nạp các giao dịch mới vào DB
                for tx in tx_list:
                    tx_id = tx.get("transactionID") or tx.get("id") or ""
                    amt = float(tx.get("amount") or 0.0)
                    tx_type = tx.get("type") or "IN"
                    desc = tx.get("description") or ""
                    tx_date = tx.get("transactionDate") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    if tx_id:
                        db.add_transaction(
                            bank_code=bank_code,
                            account_number=account_no,
                            transaction_id=str(tx_id),
                            amount=amt,
                            tx_type=tx_type,
                            description=desc,
                            transaction_date=str(tx_date),
                            raw_data=tx,
                        )

                return {
                    "success": True,
                    "count": len(tx_list),
                    "transactions": tx_list,
                }
            else:
                return {
                    "success": False,
                    "message": hist.get("message", "Lỗi truy vấn lịch sử"),
                    "transactions": [],
                }
        else:
            return {
                "success": False,
                "message": f"Ngân hàng {bank_code} chưa hỗ trợ hàm get_formatted_history",
                "transactions": [],
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Lỗi lấy lịch sử: {str(e)}",
            "transactions": [],
        }


def generate_qr_payment(
    bank_row: Dict[str, Any],
    amount: float,
    content: str,
) -> Dict[str, Any]:
    """
    Tạo mã QR thanh toán (VietQR chuẩn Napas247 hoặc mã QR nội bộ TPBank).
    """
    bank_code = str(bank_row["bank_code"]).upper()
    account_no = bank_row["account_number"]
    bank_info = get_bank_info(bank_code)

    # Ưu tiên API native nếu là TPBank
    if bank_code == "TPBANK":
        try:
            client = create_bank_instance(bank_row)
            qr_res = client.generateqrcodepre(amount=amount, text=content, save_png=False)
            if isinstance(qr_res, dict) and "qrContent" in qr_res:
                return {
                    "success": True,
                    "qr_content": qr_res["qrContent"],
                    "qr_trans_id": qr_res.get("qrTransID", ""),
                    "qr_url": f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={urllib.parse.quote(qr_res['qrContent'])}",
                }
        except Exception:
            pass

    # Mặc định sử dụng VietQR chuẩn nhanh
    bin_code = bank_info.get("bin", "970422")
    encoded_content = urllib.parse.quote(content)
    vietqr_url = f"https://img.vietqr.io/image/{bin_code}-{account_no}-compact2.png?amount={int(amount)}&addInfo={encoded_content}&accountName={urllib.parse.quote(bank_row.get('account_name', ''))}"

    return {
        "success": True,
        "qr_content": f"VIETQR://{bin_code}/{account_no}?amount={int(amount)}&content={content}",
        "qr_trans_id": f"VQR_{int(time.time())}",
        "qr_url": vietqr_url,
    }
