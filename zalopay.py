#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
ZaloPay Web/Cookie API Client (Chuyển đổi từ PHP sang Python 3)
Phiên bản tương thích với hệ thống 7Bank Gateway.
Không cần xqsig_url - hoạt động 100% dựa trên Cookie Web & SAPI ZaloPay.
=============================================================================
"""

import hashlib
import json
import sys
import time
import uuid
from typing import Any, Dict, List, Optional
from urllib.parse import unquote
import requests

# Hỗ trợ hiển thị tiếng Việt UTF-8 trên Windows terminal
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


class ZaloPay:
    """
    Client tương tác với ZaloPay API qua Cookie phiên Web/SPA.
    Hỗ trợ:
      - Tra cứu thông tin hồ sơ KYC (tên, ID ZaloPay)
      - Kiểm tra số dư ví
      - Lấy danh sách lịch sử biến động số dư / giao dịch
      - Tra cứu chi tiết giao dịch
      - Tạo mã QR nhận tiền tự động (Flex QR Code)
      - Tra cứu thông tin người dùng qua số điện thoại
    """

    def __init__(
        self,
        phone: Optional[str] = None,
        cookie: Optional[str] = None,
        password: Optional[str] = None,
        timeout: int = 15,
    ):
        self.phone = phone or ""
        self.cookie = cookie or ""
        self.password = password or ""
        self.timeout = timeout
        self.session = requests.Session()

        # Thông tin tài khoản sau khi xác thực
        self.user_info: Dict[str, Any] = {}
        self.zalo_id: str = ""
        self.zalopay_id: str = ""
        self.display_name: str = ""

    def set_cookie(self, cookie: str) -> None:
        """Cập nhật Cookie phiên làm việc mới"""
        self.cookie = cookie.strip()

    def _default_headers(self, host: str = "sapi.zalopay.vn", referer: Optional[str] = None) -> Dict[str, str]:
        """Tạo Headers chuẩn cho các API ZaloPay Web"""
        headers = {
            "Host": host,
            "Cookie": self.cookie,
            "Accept": "*/*",
            "Origin": "https://social.zalopay.vn",
            "X-Platform": "ZPA",
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0_2 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
                "ZaloPayClient/8.6.0 OS/16.0.2 Platform/ios Secured/true ZaloPayWebClient/8.6.0"
            ),
            "Accept-Language": "vi-VN,vi;q=0.9",
        }
        if referer:
            headers["Referer"] = referer
        return headers

    def get_profile_kyc(self) -> Dict[str, Any]:
        """
        Lấy thông tin hồ sơ tài khoản ZaloPay (Tương đương hàm ZaloLogin_Cookie trong PHP).
        Kiểm tra xem Cookie có hợp lệ hay không.
        
        Trả về:
            dict chứa 'display_name', 'zalo_id', 'zalopay_id', 'phone_number',...
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        url = "https://sapi.zalopay.vn/v2/user/profile/kyc"
        referer = f"https://social.zalopay.vn/spa/v2?c=1&c_time={int(time.time())}"
        headers = self._default_headers(host="sapi.zalopay.vn", referer=referer)

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            data = resp.json()
            if "data" in data and ("error" not in data or data.get("error") == 0):
                profile = data["data"]
                self.user_info = profile
                self.display_name = profile.get("display_name", "")
                self.zalo_id = profile.get("zalo_id", "")
                self.zalopay_id = profile.get("zalopay_id", "")
                if not self.phone and profile.get("phone_number"):
                    self.phone = profile["phone_number"]

                return {
                    "status": "success",
                    "message": "Xác thực Cookie thành công",
                    "data": profile,
                }
            else:
                msg = data.get("error_description") or data.get("message") or "Cookie không hợp lệ hoặc đã hết hạn"
                return {"status": "error", "message": msg, "raw": data}
        except Exception as e:
            return {"status": "error", "message": f"Lỗi kết nối tới ZaloPay KYC: {str(e)}"}

    def get_balance(self) -> Dict[str, Any]:
        """
        Lấy số dư hiện tại của ví ZaloPay (Tương đương getBalance_web trong PHP).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        url = "https://api.zalopay.vn/v2/user/balance"
        headers = self._default_headers(host="api.zalopay.vn")

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            data = resp.json()
            if "data" in data and ("error" not in data or data.get("error") == 0):
                raw_bal = data["data"].get("balance", 0)
                try:
                    num_bal = int(raw_bal)
                except (ValueError, TypeError):
                    num_bal = 0
                return {
                    "status": "success",
                    "balance": num_bal,
                    "data": data["data"],
                }
            return {
                "status": "error",
                "message": data.get("message") or "Không thể lấy số dư (Cookie hết hạn)",
                "raw": data,
            }
        except Exception as e:
            return {"status": "error", "message": f"Lỗi tra cứu số dư: {str(e)}"}

    def get_transaction_history(self, limit: int = 20, page_token: str = "") -> Dict[str, Any]:
        """
        Lấy danh sách lịch sử giao dịch gốc từ API SAPI (Tương đương getHistoryV2 trong PHP).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay. Vui lòng thêm Cookie ZaloPay trong cấu hình ví."}

        url = f"https://sapi.zalopay.vn/v2/history/transactions?page_size={limit}&page_token={page_token}"
        headers = self._default_headers(host="sapi.zalopay.vn", referer="https://social.zalopay.vn/spa/v2/history")

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            if resp.status_code != 200:
                return {
                    "status": "error",
                    "message": f"Cookie ZaloPay đã hết hạn hoặc không hợp lệ (Mã HTTP {resp.status_code}). Vui lòng cập nhật Cookie mới.",
                    "http_code": resp.status_code,
                }
            try:
                return resp.json()
            except Exception:
                return {
                    "status": "error",
                    "message": "Phản hồi từ ZaloPay không đúng định dạng JSON. Cookie có thể đã hết hạn.",
                }
        except Exception as e:
            return {"status": "error", "message": f"Lỗi lấy lịch sử giao dịch: {str(e)}"}

    def get_transaction_detail(self, trans_id: str) -> Dict[str, Any]:
        """
        Lấy chi tiết 1 giao dịch cụ thể theo mã GD (Tương đương GET_TRANS_BY_TID_WEB trong PHP).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        url = f"https://sapi.zalopay.vn/v2/history/transactions/{trans_id}?type=1"
        headers = self._default_headers(host="sapi.zalopay.vn")

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            if resp.status_code != 200:
                return {
                    "status": "error",
                    "message": f"Cookie ZaloPay không hợp lệ (HTTP {resp.status_code})",
                }
            try:
                return resp.json()
            except Exception:
                return {"status": "error", "message": "Phản hồi chi tiết GD không phải JSON"}
        except Exception as e:
            return {"status": "error", "message": f"Lỗi tra chi tiết GD: {str(e)}"}

    def get_formatted_history(self, limit: int = 10) -> Dict[str, Any]:
        """
        Lấy lịch sử giao dịch đã được chuẩn hóa và lọc thông tin quan trọng.
        (Tương đương History_full_dev trong zalopay.php & api/historyzalopayv2.php)
        
        Trả về danh sách gồm:
            - transactionID: Mã giao dịch ZaloPay
            - amount: Số tiền (VND)
            - description: Lời nhắn chuyển khoản / nội dung
            - transactionDate: Thời gian giao dịch
            - type: 'IN' (nhận tiền) hoặc 'OUT' (chuyển tiền/thanh toán)
            - balance_snapshot: Số dư sau giao dịch
        """
        raw_res = self.get_transaction_history(limit=limit)
        if not raw_res or "data" not in raw_res or "transactions" not in raw_res["data"]:
            return {
                "status": "error",
                "message": raw_res.get("message") or "Cookie đã hết hạn hoặc không có giao dịch",
                "transactions": [],
            }

        transactions_raw = raw_res["data"]["transactions"]
        parsed_list: List[Dict[str, Any]] = []

        for item in transactions_raw:
            # Bỏ qua nếu giao dịch không thành công (status != 1)
            status_info = item.get("status_info", {})
            if status_info.get("status") != 1:
                continue

            trans_id = item.get("trans_id")
            detail = self.get_transaction_detail(trans_id) if trans_id else {}
            tx = detail.get("data", {}).get("transaction", item)

            sign = tx.get("sign", item.get("sign", 1))
            tx_type = "OUT" if sign == -1 else "IN"

            parsed_list.append({
                "transactionID": str(tx.get("trans_id") or trans_id or ""),
                "orderCode": tx.get("app_trans_id", ""),
                "amount": abs(int(tx.get("trans_amount") or item.get("trans_amount") or 0)),
                "type": tx_type,
                "description": tx.get("description", "") or item.get("description", ""),
                "transactionDate": tx.get("trans_time", "") or item.get("trans_time", ""),
                "balance_snapshot": item.get("balance_snapshot", 0),
            })

        return {
            "status": "success",
            "message": "Thành công",
            "count": len(parsed_list),
            "transactions": parsed_list,
        }

    def create_qr(self, amount: int = 0, message: str = "") -> Dict[str, Any]:
        """
        Tạo mã QR nhận tiền Flex QR Code (Tương đương Create_QR_web trong PHP).
        
        Args:
            amount: Số tiền cần nhận (VNĐ, nếu = 0 người quét tự nhập)
            message: Lời nhắn chuyển tiền (thường là mã đơn hàng / nạp tiền)
            
        Trả về:
            dict chứa link ảnh QR, mã qrcode text, v.v.
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        url = "https://sapi.zalopay.vn/v1/mt/flex-qrcode/generate"
        payload = json.dumps({
            "amount": int(amount),
            "message": message,
            "size": 250,
        })

        headers = {
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
            "Content-Type": "text/plain;charset=UTF-8",
            "Content-Length": str(len(payload)),
            "Cookie": self.cookie,
            "Host": "sapi.zalopay.vn",
            "Origin": "https://social.zalopay.vn",
            "Referer": "https://social.zalopay.vn/spa/v2/qr-code",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        }

        try:
            resp = self.session.post(url, headers=headers, data=payload, timeout=self.timeout)
            data = resp.json()
            if "qrcode" in data or "emvco_qrcode" in data:
                return {
                    "status": "success",
                    "qrcode_base64": data.get("qrcode"),
                    "emvco_qrcode": data.get("emvco_qrcode"),
                    "vietqr_id": data.get("vietqr_id"),
                    "bank_name": data.get("bank_name"),
                    "bank_number": data.get("bank_number"),
                    "bank_holder_name": data.get("bank_holder_name"),
                    "phone": data.get("phone"),
                    "display_name": data.get("display_name"),
                    "data": data,
                }
            if data.get("error") == 0 and "data" in data:
                return {
                    "status": "success",
                    "qr_code": data["data"].get("qr_code"),
                    "qr_image_url": data["data"].get("qr_image_url"),
                    "data": data["data"],
                }
            return {
                "status": "error",
                "message": data.get("message") or "Không thể tạo mã QR",
                "raw": data,
            }
        except Exception as e:
            return {"status": "error", "message": f"Lỗi tạo mã QR: {str(e)}"}

    def get_order_info(self, order_code: str) -> Dict[str, Any]:
        """
        Xem chi tiết đơn hàng / đơn thanh toán (Tương đương getOrderInfo_web trong PHP).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        url = f"https://sapi.zalopay.vn/mt/v5/order/{order_code}"
        headers = self._default_headers(host="sapi.zalopay.vn")

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            return resp.json()
        except Exception as e:
            return {"status": "error", "message": f"Lỗi tra cứu đơn hàng: {str(e)}"}

    def get_income_outcome(self, month: int, year: int) -> Dict[str, Any]:
        """
        Tra cứu thống kê thu chi theo tháng và năm (Tương đương getIncome_outcome trong PHP).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        url = f"https://sapi.zalopay.vn/v2/history/income-outcome?months={month}&year={year}"
        headers = self._default_headers(host="sapi.zalopay.vn", referer="https://social.zalopay.vn/spa/v2/history")

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            return resp.json()
        except Exception as e:
            return {"status": "error", "message": f"Lỗi lấy thống kê thu chi: {str(e)}"}

    def lookup_recipient(self, phone: str) -> Dict[str, Any]:
        """
        Tra cứu thông tin người nhận tiền ZaloPay qua số điện thoại (Tương đương get_info_web trong PHP).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        clean_phone = phone.strip()
        if clean_phone.startswith("+84"):
            clean_phone = "84" + clean_phone[3:]
        elif clean_phone.startswith("0"):
            clean_phone = "84" + clean_phone[1:]
        elif not clean_phone.startswith("84"):
            clean_phone = "84" + clean_phone

        url = f"https://sapi.zalopay.vn/v3/ibft/web/get-user-info?phone={clean_phone}"
        headers = self._default_headers(
            host="sapi.zalopay.vn",
            referer="https://social.zalopay.vn/spa/v2/home-transfer?from_source=home_zalopay"
        )

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            data = resp.json()
            if "data" in data and data["data"]:
                return {
                    "status": "success",
                    "name": data["data"].get("name"),
                    "zalopay_id": data["data"].get("zalopay_id"),
                    "avatar": data["data"].get("avatar"),
                    "zpp": data["data"].get("zpp"),
                    "data": data["data"],
                }
            msg = (
                data.get("error", {})
                .get("details", {})
                .get("localized_message", {})
                .get("message")
                or "Không tìm thấy người nhận"
            )
            return {"status": "error", "message": msg, "raw": data}
        except Exception as e:
            return {"status": "error", "message": f"Lỗi tra cứu người nhận: {str(e)}"}

    def send_money(
        self,
        phone: str,
        amount: int,
        message: str = "",
        pin: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Chuyển tiền tới số điện thoại ví ZaloPay (Tương đương SendMoney_web trong PHP).
        
        Args:
            phone: Số điện thoại người nhận (VD: '0987654321')
            amount: Số tiền chuyển (VNĐ, tối thiểu 1.000 VNĐ)
            message: Lời nhắn chuyển tiền
            pin: Mật khẩu thanh toán ZaloPay (6 chữ số). Nếu không truyền sẽ lấy self.password.
        """
        use_pin = pin or self.password
        if not use_pin:
            return {
                "status": "error",
                "type": "missing_pin",
                "message": "Cần cung cấp mã PIN / Mật khẩu thanh toán ZaloPay (6 chữ số) để thực hiện chuyển tiền",
            }

        # 1. Tra cứu người nhận
        recipient = self.lookup_recipient(phone)
        if recipient.get("status") != "success":
            return recipient

        rec_data = recipient["data"]
        zpp = unquote(rec_data.get("zpp", ""))

        # 2. Tạo đơn chuyển tiền (Order Money)
        url_order = "https://sapi.zalopay.vn/mt/v5/create-order-v2"
        headers_order = self._default_headers(host="sapi.zalopay.vn")
        headers_order["X-Idempotency-Key"] = str(uuid.uuid4())
        order_payload = {
            "receiver_zalopay_id": "",
            "receiver_zalo_id": "",
            "receiver_name": rec_data.get("name", ""),
            "receiver_avatar": rec_data.get("avatar", ""),
            "amount": int(amount),
            "note": message,
            "zalo_token": "",
            "media": {
                "greeting_card": {
                    "theme_id": "142"
                }
            },
            "utoken": "",
            "zpp": zpp,
        }

        try:
            resp_order = self.session.post(url_order, headers=headers_order, json=order_payload, timeout=self.timeout)
            res_order = resp_order.json()
            order_token = (
                res_order.get("ac_order", {}).get("order_token")
                or res_order.get("data", {}).get("order_token")
            )
            order_no = (
                res_order.get("ac_order", {}).get("order_no")
                or res_order.get("data", {}).get("order_no", "")
            )

            if not res_order or not order_token:
                err_msg = (
                    res_order.get("error", {})
                    .get("details", {})
                    .get("localized_message", {})
                    .get("message")
                    or "Không thể tạo đơn chuyển tiền"
                )
                return {"status": "error", "message": err_msg, "raw": res_order}

            # 3. Lấy nguồn tiền (Get Assets / Source of Fund)
            url_assets = "https://sapi.zalopay.vn/v2/cashier/assets"
            assets_payload = json.dumps({
                "display_mode": 1,
                "token_data": {
                    "order_token": order_token
                },
                "full_assets": True,
                "order_data": {},
                "order_type": 1,
            })
            headers_assets = {
                "Accept": "*/*",
                "Cookie": self.cookie,
                "Content-Length": str(len(assets_payload)),
                "Content-Type": "text/plain;charset=UTF-8",
                "Host": "sapi.zalopay.vn",
                "Origin": "https://social.zalopay.vn",
                "Referer": "https://social.zalopay.vn/spa/v2/home-transfer?from_source=home_zalopay",
                "User-Agent": headers_order["User-Agent"],
            }
            resp_assets = self.session.post(url_assets, headers=headers_assets, data=assets_payload, timeout=self.timeout)
            res_assets = resp_assets.json()

            if not res_assets or "data" not in res_assets:
                return {"status": "error", "message": "Không thể lấy thông tin nguồn tiền thanh toán", "raw": res_assets}

            sof = res_assets["data"].get("source_of_fund", {})
            if sof.get("status") != 1 or sof.get("allow_transaction") is False:
                # Nếu ZaloPay yêu cầu liên kết ngân hàng hoặc mở app
                if res_assets["data"].get("suggest_link_bank") or sof.get("name") == "Thêm ngân hàng liên kết":
                    return {
                        "status": "error",
                        "type": "require_app_or_bank",
                        "message": (
                            "ZaloPay yêu cầu liên kết tài khoản ngân hàng hoặc mở ứng dụng ZaloPay di động để xác thực chuyển tiền P2P.\n"
                            "Theo quy định Ngân hàng Nhà nước & ZaloPay, tính năng chuyển tiền qua Web API bị hạn chế số dư ví nếu chưa liên kết ngân hàng hoặc thiếu xác thực sinh trắc học trên App."
                        ),
                        "order_token": order_token,
                        "raw": res_assets,
                    }
                return {
                    "status": "error",
                    "message": sof.get("message") or "Nguồn tiền không khả dụng",
                    "raw": res_assets,
                }

            sof_token = sof.get("sof_token", "")
            balance = sof.get("balance", 0)
            if balance < amount:
                return {
                    "status": "error",
                    "type": "insufficient_balance",
                    "message": f"Số dư ví không đủ! Cần {amount:,} VND, số dư khả dụng hiện tại là {balance:,} VND.",
                    "balance": balance,
                    "amount": amount,
                }

            # 4. Xác nhận thanh toán với mã PIN (Pay Money)
            url_pay = "https://sapi.zalopay.vn/v2/cashier/pay"
            hashed_pin = hashlib.sha256(str(use_pin).encode("utf-8")).hexdigest()
            pay_payload = json.dumps({
                "authenticator": {
                    "authen_type": 1,
                    "auth_info": "eyJhdXRoX3R5cGUiOjF9",
                    "pin": hashed_pin,
                },
                "order_fee": [0],
                "order_token": order_token,
                "promotion_token": "",
                "service_id": 19,
                "sof_token": sof_token,
                "user_fee": [0],
                "zalo_token": "",
                "callback_url": f"zalo://qr/jp/nibvlsoj2j?cb_t=dotp&k={int(time.time())}&otp=",
                "card": None,
                "is_zmp": False,
            })
            headers_pay = {
                "Accept": "*/*",
                "Cookie": self.cookie,
                "Content-Length": str(len(pay_payload)),
                "Content-Type": "text/plain;charset=UTF-8",
                "Host": "sapi.zalopay.vn",
                "Origin": "https://social.zalopay.vn",
                "Referer": "https://social.zalopay.vn/spa/v2/home-transfer?from_source=home_zalopay",
                "User-Agent": headers_order["User-Agent"],
            }
            resp_pay = self.session.post(url_pay, headers=headers_pay, data=pay_payload, timeout=self.timeout)
            res_pay = resp_pay.json()

            if res_pay.get("data") and res_pay["data"].get("is_processing") == 1:
                return {
                    "status": "success",
                    "message": "Chuyển tiền thành công!",
                    "receiver_name": rec_data.get("name"),
                    "receiver_phone": phone,
                    "amount": amount,
                    "order_no": order_no,
                    "data": res_pay["data"],
                }
            else:
                err_msg = (
                    res_pay.get("error", {})
                    .get("details", {})
                    .get("localized_message", {})
                    .get("message")
                    or "Chuyển tiền thất bại"
                )
                return {
                    "status": "error",
                    "message": err_msg,
                    "raw": res_pay,
                }
        except Exception as e:
            return {"status": "error", "message": f"Lỗi thực hiện chuyển tiền: {str(e)}"}

    def get_incoming_transactions(self, limit: int = 20) -> Dict[str, Any]:
        """
        Lấy danh sách các giao dịch nhận tiền đến (Incoming Transactions).
        Trích xuất thông tin người gửi, số tiền, nội dung và link 'Chuyển lại' (Resend Deeplink).
        """
        if not self.cookie:
            return {"status": "error", "message": "Chưa cung cấp Cookie ZaloPay"}

        raw_res = self.get_transaction_history(limit=limit)
        if not raw_res or "data" not in raw_res or "transactions" not in raw_res["data"]:
            return {
                "status": "error",
                "message": raw_res.get("message") or "Không lấy được lịch sử giao dịch",
                "incoming_transactions": [],
            }

        incoming_list: List[Dict[str, Any]] = []
        for tx in raw_res["data"]["transactions"]:
            # Chỉ lấy giao dịch tiền vào (sign == 1) và thành công (status == 1)
            sign = tx.get("sign", 1)
            status_info = tx.get("status_info", {})
            if sign != 1 or status_info.get("status") != 1:
                continue

            trans_id = tx.get("trans_id")
            detail = self.get_transaction_detail(trans_id) if trans_id else {}
            tx_detail = detail.get("data", {}).get("transaction", tx)

            # Trích xuất người gửi và mã đơn hàng từ custom_fields
            sender_name = ""
            sender_phone = ""
            order_no = tx_detail.get("app_trans_id", "")
            resend_link = ""

            template_info = tx_detail.get("template_info", {})
            custom_fields = template_info.get("custom_fields", [])
            for field in custom_fields:
                name = field.get("name", "")
                val = field.get("value", "")
                if "Người gửi" in name:
                    sender_name = val
                elif "Số điện thoại" in name:
                    sender_phone = val
                elif "Mã đơn hàng" in name and not order_no:
                    order_no = val

            # Trích xuất nút Chuyển lại nếu có trong custom_buttons
            for btn in template_info.get("custom_buttons", []):
                if "Chuyển lại" in btn.get("label", "") or "resend" in btn.get("link", ""):
                    resend_link = btn.get("link", "")
                    break

            if not resend_link and order_no:
                resend_link = f"zalopay://launch/f/transfer?app_id=450&from_source=ctgd_p2p_resend&order_no={order_no}"

            incoming_list.append({
                "trans_id": trans_id,
                "order_no": order_no,
                "sender_name": sender_name or tx_detail.get("title", "").replace("Nhận tiền từ ", ""),
                "sender_phone_masked": sender_phone,
                "amount": int(tx_detail.get("trans_amount") or tx.get("trans_amount") or 0),
                "message": tx_detail.get("description", "") or tx.get("description", ""),
                "trans_time": tx_detail.get("trans_time", "") or tx.get("trans_time", ""),
                "resend_link": resend_link,
            })

        return {
            "status": "success",
            "count": len(incoming_list),
            "incoming_transactions": incoming_list,
        }

    def resend_money_web(
        self,
        app_trans_id: str,
        amount: int,
        message: str = "",
        pin: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Thực hiện 'Chuyển lại tiền' cho một giao dịch nhận tiền cụ thể (Tương đương ResendMoney_web trong PHP).
        
        Args:
            app_trans_id: Mã đơn hàng của giao dịch nhận tiền (order_no / app_trans_id, VD: '2609289000019873')
            amount: Số tiền chuyển lại (VND)
            message: Lời nhắn chuyển lại tiền
            pin: Mã PIN ZaloPay 6 chữ số
        """
        resend_deeplink = f"zalopay://launch/f/transfer?app_id=450&from_source=ctgd_p2p_resend&order_no={app_trans_id}"
        
        # 1. Tra cứu thông tin đơn hàng gốc
        order_info = self.get_order_info(app_trans_id)
        sender_data = order_info.get("data", {}).get("sender", {})
        
        return {
            "status": "info",
            "order_no": app_trans_id,
            "resend_deeplink": resend_deeplink,
            "sender_info": sender_data,
            "note": (
                "Do ZaloPay đã khóa chiều chuyển tiền ra (Payout) trên Web Cashier, "
                "bạn có thể bấm vào đường link resend_deeplink trên điện thoại để ứng dụng ZaloPay "
                "tự động điền đúng người nhận và chuyển lại tiền ngay lập tức."
            ),
        }



# =============================================================================
# VÍ DỤ SỬ DỤNG NHANH
# =============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("   ZaloPay Python SDK - Chuyển đổi từ core/class/zalopay.php")
    print("=" * 60)

    # Dán Cookie của bạn vào đây để kiểm tra:
    TEST_COOKIE = "zlp_token=...; zalo_id=...; X-DRSITE=off"

    # Khởi tạo client
    zalo = ZaloPay(cookie=TEST_COOKIE)

    print("\n1. Đang kiểm tra hồ sơ tài khoản (KYC)...")
    profile = zalo.get_profile_kyc()
    print("Kết quả:", json.dumps(profile, ensure_ascii=False, indent=2))

    if profile.get("status") == "success":
        print("\n2. Đang kiểm tra số dư ví...")
        bal = zalo.get_balance()
        print("Số dư:", bal)

        print("\n3. Đang lấy 5 giao dịch gần nhất...")
        history = zalo.get_formatted_history(limit=5)
        print("Lịch sử GD:", json.dumps(history, ensure_ascii=False, indent=2))

        print("\n4. Đang tạo mã QR nạp 50,000 VND...")
        qr = zalo.create_qr(amount=50000, message="NAPTIEN 12345")
        print("QR Code:", qr)
    else:
        print("\n[!] Vui lòng thay thế TEST_COOKIE bằng Cookie ZaloPay hợp lệ để chạy thử.")
