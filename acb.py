#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
ACB (Asia Commercial Bank) Online Banking API Client
Chuyển đổi từ core/class/acb.php sang Python 3.
Tương thích hoàn toàn với hệ thống 7Bank Gateway.

Hỗ trợ:
  - Đăng nhập (login_acb / login / verify_login)
  - Vấn tin số dư tài khoản thanh toán (get_balance / getBalance)
  - Lịch sử giao dịch biến động số dư (LSGD / get_transaction_history / get_formatted_history)
  - Tra cứu tên tài khoản người nhận liên ngân hàng (getBankName / get_bank_name)
  - Tự động làm mới phiên đăng nhập (auto relogin) khi token hết hạn
=============================================================================
"""

import json
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
import requests

# Hỗ trợ hiển thị tiếng Việt UTF-8 trên Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


class ACB:
    """
    ACB Banking Client.
    Cung cấp các phương thức gọi API ACB tương đương core/class/acb.php và mở rộng tiện ích.
    """

    DEFAULT_CLIENT_ID = "iuSuHYVufIUuNIREV0FB9EoLn9kHsDbm"
    BASE_URL = "https://apiapp.acb.com.vn"

    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        client_id: Optional[str] = None,
        timeout: int = 20,
    ):
        """
        Khởi tạo ACB client.

        :param username: Tên đăng nhập ACB Online
        :param password: Mật khẩu đăng nhập ACB Online
        :param account_number: Số tài khoản ACB mặc định
        :param access_token: Token đã có sẵn (nếu có)
        :param refresh_token: Refresh token (nếu có)
        :param client_id: Mã client id của ACB app
        :param timeout: Thời gian timeout kết nối HTTP (giây)
        """
        self.username = username or ""
        self.password = password or ""
        self.account_number = account_number or ""
        self.access_token = access_token or ""
        self.refresh_token = refresh_token or ""
        self.clientId = client_id or self.DEFAULT_CLIENT_ID
        self.timeout = timeout

        self.session = requests.Session()

        # URL mapping tương thích với acb.php cũ
        self.URL: Dict[str, str] = {
            "LOGIN": f"{self.BASE_URL}/mb/v2/auth/tokens",
            "getBalance": f"{self.BASE_URL}/mb/legacy/ss/cs/bankservice/transfers/list/account-payment",
            "INFO": "https://mobile.mbbank.com.vn/retail_lite/loan/getUserInfo",
            "GET_TOKEN": "https://mobile.mbbank.com.vn/retail_lite/loyal/getToken",
            "GET_NOTI": "https://mobile.mbbank.com.vn/retail_lite/notification/getNotificationDataList",
            "GET_TRANS": f"{self.BASE_URL}/mb/legacy/ss/cs/bankservice/saving/tx-history?maxRows=20&account=4650511",
        }

        # Lưu thông tin người dùng sau đăng nhập
        self.identity: Dict[str, Any] = {}
        self.display_name: str = ""

    # =========================================================================
    # HEADERS & HTTP HELPERS
    # =========================================================================

    def _default_headers(self, token: Optional[str] = None) -> Dict[str, str]:
        """Tạo headers chuẩn gửi tới apiapp.acb.com.vn"""
        headers = {
            "Host": "apiapp.acb.com.vn",
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13"
            ),
        }
        auth_token = token or self.access_token
        if auth_token:
            headers["Authorization"] = f"bearer {auth_token}"
        return headers

    def CURL(
        self,
        Action: str,
        header: Optional[Union[List[str], Dict[str, str]]] = None,
        data: Optional[Union[str, Dict[str, Any]]] = None,
    ) -> Any:
        """
        Mô phỏng phương thức CURL từ acb.php gốc.
        Gửi yêu cầu tới URL định nghĩa trong self.URL[Action].
        """
        url = self.URL.get(Action, Action)
        return self._do_request(url, header=header, data=data)

    def CURL2(
        self,
        Action: str,
        header: Optional[Union[List[str], Dict[str, str]]] = None,
        data: Optional[Union[str, Dict[str, Any]]] = None,
    ) -> Any:
        """
        Mô phỏng phương thức CURL2 từ acb.php gốc.
        Gửi yêu cầu trực tiếp tới URL truyền vào (Action = full URL).
        """
        return self._do_request(Action, header=header, data=data)

    def _parse_headers(
        self, header: Optional[Union[List[str], Dict[str, str]]]
    ) -> Dict[str, str]:
        """Chuẩn hóa header từ dạng list ['Header: Value'] hoặc dict sang dict"""
        parsed: Dict[str, str] = self._default_headers()
        if not header:
            return parsed

        if isinstance(header, dict):
            parsed.update(header)
        elif isinstance(header, list):
            for h in header:
                if ":" in h:
                    k, v = h.split(":", 1)
                    parsed[k.strip()] = v.strip()
        return parsed

    def _do_request(
        self,
        url: str,
        header: Optional[Union[List[str], Dict[str, str]]] = None,
        data: Optional[Union[str, Dict[str, Any]]] = None,
    ) -> Any:
        """Thực hiện HTTP request GET hoặc POST tùy thuộc vào data"""
        headers = self._parse_headers(header)
        is_post = bool(data)

        try:
            if is_post:
                payload = json.dumps(data) if isinstance(data, dict) else (data or "")
                resp = self.session.post(
                    url,
                    data=payload,
                    headers=headers,
                    timeout=self.timeout,
                )
            else:
                resp = self.session.get(
                    url,
                    headers=headers,
                    timeout=self.timeout,
                )

            # Thử parse JSON trả về
            try:
                return resp.json()
            except Exception:
                return resp.text
        except requests.exceptions.RequestException as e:
            return {"error": "RequestException", "message": str(e)}

    # =========================================================================
    # CORE BANKING METHODS (Tương thích chính xác với acb.php)
    # =========================================================================

    def login_acb(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Đăng nhập vào ACB Mobile App API để lấy accessToken và refreshToken.
        Tương thích 100% với function login_acb($username, $password) trong acb.php.

        :param username: Tên đăng nhập ACB
        :param password: Mật khẩu ACB
        :return: Dict chứa accessToken, refreshToken, identity, ...
        """
        user = username or self.username
        pwd = password or self.password

        if not user or not pwd:
            return {
                "errorCode": "MISSING_CREDENTIALS",
                "message": "Vui lòng nhập tên đăng nhập và mật khẩu ACB",
            }

        url = f"{self.BASE_URL}/mb/v2/auth/tokens"
        payload = {
            "clientId": self.clientId,
            "username": user,
            "password": pwd,
        }
        headers = {
            "Host": "apiapp.acb.com.vn",
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13"
            ),
        }

        try:
            resp = self.session.post(url, json=payload, headers=headers, timeout=self.timeout)
            data = resp.json()
            if isinstance(data, dict):
                if "accessToken" in data:
                    self.access_token = data["accessToken"]
                    self.refresh_token = data.get("refreshToken", "")
                    self.username = user
                    self.password = pwd
                    self.identity = data.get("identity", {})
                    self.display_name = self.identity.get("displayName", "")
                return data
            return {"status": "error", "message": "Phản hồi không hợp lệ từ ACB", "raw": resp.text}
        except Exception as e:
            return {"errorCode": "REQUEST_FAILED", "message": str(e)}

    # Alias tiện dụng cho login_acb
    login = login_acb

    def get_balance(self, token: Optional[str] = None) -> Union[Dict[str, Any], List[Any], str]:
        """
        Vấn tin danh sách tài khoản thanh toán và số dư.
        Tương thích với function get_balance($token) trong acb.php.

        :param token: Access token ACB (nếu để trống sẽ dùng self.access_token)
        :return: Dữ liệu tài khoản thanh toán và số dư
        """
        auth_token = token or self.access_token
        if not auth_token:
            return {"status": "error", "message": "Thiếu access token ACB"}

        url = f"{self.BASE_URL}/mb/legacy/ss/cs/bankservice/transfers/list/account-payment"
        headers = self._default_headers(token=auth_token)

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            try:
                return resp.json()
            except Exception:
                return resp.text
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # Alias
    getBalance = get_balance

    def LSGD(
        self,
        accountNo: Optional[str] = None,
        rows: int = 20,
        token: Optional[str] = None,
        auto_relogin: bool = True,
    ) -> Any:
        """
        Lấy lịch sử giao dịch tiết kiệm / thanh toán ACB.
        Tương thích với function LSGD($accountNo, $rows, $token) trong acb.php.

        :param accountNo: Số tài khoản ACB cần xem lịch sử
        :param rows: Số lượng dòng giao dịch cần lấy (mặc định 20)
        :param token: Access token ACB
        :param auto_relogin: Tự động đăng nhập lại nếu token hết hạn
        :return: Dict chứa thông tin lịch sử giao dịch từ ACB
        """
        stk = accountNo or self.account_number
        auth_token = token or self.access_token

        if not stk:
            return {"status": "error", "message": "Thiếu số tài khoản ACB"}

        url = (
            f"{self.BASE_URL}/mb/legacy/ss/cs/bankservice/saving/tx-history"
            f"?maxRows={rows}&account={stk}"
        )
        headers = self._default_headers(token=auth_token)

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            data = resp.json()

            # Kiểm tra nếu token hết hạn và có thể tự động login lại
            is_expired = False
            if isinstance(data, dict):
                code_status = str(data.get("codeStatus", ""))
                # Mã khác 200 hoặc có thông báo expired
                if code_status and code_status != "200":
                    is_expired = True
                elif "exp" in data and "expired" in str(data.get("exp", "")).lower():
                    is_expired = True
                elif data.get("error") or data.get("errorCode"):
                    is_expired = True

            if is_expired and auto_relogin and self.username and self.password:
                # Thực hiện login lại
                relogin_res = self.login_acb(self.username, self.password)
                if isinstance(relogin_res, dict) and "accessToken" in relogin_res:
                    # Gọi lại với token mới
                    headers = self._default_headers(token=relogin_res["accessToken"])
                    retry_resp = self.session.get(url, headers=headers, timeout=self.timeout)
                    return retry_resp.json()

            return data
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # Alias
    get_transaction_history = LSGD

    def getBankName(
        self,
        tranferTo: str,
        bankCode: str,
        stk: str,
        token: Optional[str] = None,
    ) -> Any:
        """
        Tra cứu tên chủ tài khoản nhận tiền qua liên ngân hàng (Napas / Internal).
        Tương thích với function getBankName($tranferTo, $bankCode, $stk, $token) trong acb.php.

        :param tranferTo: Loại chuyển (VD: napas, external, internal...)
        :param bankCode: Mã ngân hàng hưởng thụ (VD: 970422, 970436...)
        :param stk: Số tài khoản người nhận
        :param token: Access token ACB
        :return: Thông tin tài khoản thụ hưởng
        """
        auth_token = token or self.access_token
        url = (
            f"{self.BASE_URL}/mb/legacy/ss/cs/bankservice/transfers/accounts/{tranferTo}"
            f"?bankCode={bankCode}&accountNumber={stk}"
        )
        headers = self._default_headers(token=auth_token)

        try:
            resp = self.session.get(url, headers=headers, timeout=self.timeout)
            try:
                return resp.json()
            except Exception:
                return resp.text
        except Exception as e:
            return {"status": "error", "message": str(e)}

    # Alias
    get_bank_name = getBankName

    # =========================================================================
    # ENHANCED / 7BANK COMPATIBLE METHODS
    # =========================================================================

    def verify_login(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Xác minh thông tin đăng nhập ACB và trả về kết quả chuẩn hóa (tương thích acb.service.js).

        :return: Dict chứa success, accountName, sessionData, raw
        """
        res = self.login_acb(username=username, password=password)

        if isinstance(res, dict) and "accessToken" in res:
            display_name = (
                res.get("identity", {}).get("displayName")
                or "Chủ tài khoản ACB"
            )
            return {
                "success": True,
                "status": "success",
                "accountName": display_name,
                "sessionData": {
                    "accessToken": res["accessToken"],
                    "refreshToken": res.get("refreshToken", ""),
                    "identity": res.get("identity", {}),
                },
                "raw": res,
            }

        # Xử lý lỗi nếu có
        err_msg = res.get("errorMessage") or res.get("message")
        err_data = res.get("error", "")
        if "UsernameOrPasswordIncorrectException" in str(err_data):
            err_msg = "Tên đăng nhập hoặc mật khẩu ACB không chính xác"
        elif err_data:
            err_msg = f"ACB phản hồi lỗi: {err_data}"
        elif not err_msg:
            err_msg = "Thông tin đăng nhập ACB không chính xác hoặc tài khoản bị khóa"

        return {
            "success": False,
            "status": "error",
            "message": err_msg,
            "raw": res,
        }

    def get_formatted_history(
        self,
        account_no: Optional[str] = None,
        rows: int = 20,
        token: Optional[str] = None,
        auto_relogin: bool = True,
    ) -> Dict[str, Any]:
        """
        Lấy lịch sử giao dịch và chuẩn hóa định dạng theo chuẩn 7Bank Gateway
        (tương thích historyacbv2.php & historyacbv3.php).

        Trả về:
            {
                "status": "success",
                "message": "Thành công",
                "count": 10,
                "transactions": [
                    {
                        "transactionID": "...",
                        "amount": 50000,
                        "description": "...",
                        "transactionDate": "05/10/2026",
                        "type": "IN"
                    },
                    ...
                ]
            }
        """
        raw_history = self.LSGD(
            accountNo=account_no,
            rows=rows,
            token=token,
            auto_relogin=auto_relogin,
        )

        if not isinstance(raw_history, dict):
            return {
                "status": "error",
                "message": "Không nhận được dữ liệu hợp lệ từ ACB",
                "raw": raw_history,
            }

        code_status = str(raw_history.get("codeStatus", ""))
        if code_status and code_status != "200":
            return {
                "status": "error",
                "message": raw_history.get("message", "Lỗi lấy lịch sử giao dịch ACB"),
                "raw": raw_history,
            }

        data_list = raw_history.get("data")
        if not isinstance(data_list, list):
            data_list = []

        tran_list: List[Dict[str, Any]] = []
        for tx in data_list:
            if not isinstance(tx, dict):
                continue

            posting_date = ""
            raw_date = tx.get("postingDate")
            if raw_date:
                try:
                    # Posting date thường là timestamp mili-giây
                    ts = float(raw_date) / 1000.0 if float(raw_date) > 1e11 else float(raw_date)
                    posting_date = datetime.fromtimestamp(ts).strftime("%d/%m/%Y")
                except Exception:
                    posting_date = str(raw_date)

            tran_list.append({
                "transactionID": str(tx.get("transactionNumber", "")),
                "amount": tx.get("amount", 0),
                "description": tx.get("description", ""),
                "transactionDate": posting_date,
                "type": tx.get("type", ""),
                "raw": tx,
            })

        return {
            "status": "success",
            "message": "Thành công",
            "count": len(tran_list),
            "transactions": tran_list,
        }


# =============================================================================
# CLI / TESTING ENTRYPOINT
# =============================================================================
if __name__ == "__main__":
    print("=" * 65)
    print("       ACB ONLINE BANKING API CLIENT (Python 3)")
    print("       Hệ thống tương thích 7Bank Gateway")
    print("=" * 65)

    if len(sys.argv) >= 3:
        cli_user = sys.argv[1]
        cli_pwd = sys.argv[2]
        cli_stk = sys.argv[3] if len(sys.argv) > 3 else ""

        print(f"[*] Đang thử đăng nhập tài khoản: {cli_user}...")
        client = ACB(username=cli_user, password=cli_pwd, account_number=cli_stk)
        verify = client.verify_login()

        if verify.get("success"):
            print(f"[+] Đăng nhập thành công! Chủ tài khoản: {verify.get('accountName')}")
            print(f"[+] Access Token: {client.access_token[:20]}...")

            # Vấn tin số dư
            print("\n[*] Đang kiểm tra số dư...")
            bal = client.get_balance()
            print("Kết quả số dư:", json.dumps(bal, ensure_ascii=False, indent=2))

            # Lấy lịch sử giao dịch nếu có số tài khoản
            if cli_stk:
                print(f"\n[*] Đang lấy lịch sử giao dịch cho STK: {cli_stk}...")
                hist = client.get_formatted_history(account_no=cli_stk, rows=5)
                print(f"Số lượng giao dịch: {hist.get('count', 0)}")
                for i, tx in enumerate(hist.get("transactions", []), 1):
                    print(
                        f"  {i}. [{tx['type']}] {tx['amount']:,} VND | "
                        f"{tx['description']} | Ngày: {tx['transactionDate']} | "
                        f"Mã GD: {tx['transactionID']}"
                    )
        else:
            print(f"[!] Đăng nhập thất bại: {verify.get('message')}")
    else:
        print("Cách sử dụng qua dòng lệnh:")
        print("  python acb.py <username> <password> [account_number]")
        print("\nHoặc import module trong code Python:")
        print("  from acb import ACB")
        print("  bank = ACB(username='...', password='...')")
        print("  res = bank.login()")
        print("  balance = bank.get_balance()")
        print("  history = bank.LSGD(accountNo='...', rows=20)")
        print("=" * 65)
