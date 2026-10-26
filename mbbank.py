#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MBBank (Military Commercial Joint Stock Bank) API Client
Chuyển đổi từ core/class/mbbank.php sang Python 3.
Tương thích hoàn toàn với hệ thống 7Bank Gateway.

Hỗ trợ:
  - Vượt captcha qua OCR (bypass_captcha_stc / get_captcha)
  - Mã hóa WASM payload đăng nhập (wasmEnc)
  - Đăng nhập (login / verify_login)
  - Vấn tin số dư tài khoản (get_balance / getBalance)
  - Lịch sử giao dịch (get_lsgd / get_lsgd_1 / get_lsgd_2 / get_formatted_history)
  - Sinh mã IMEI, refNo chuẩn MBBank (generateImei, generateRefNo2)
  - Tự động làm mới phiên đăng nhập (auto relogin) khi Session Invalid
=============================================================================
"""

import hashlib
import json
import os
import random
import string
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union
import requests

# Hỗ trợ hiển thị tiếng Việt UTF-8 trên Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


class MBBANK:
    """
    MBBank Banking Client.
    Cung cấp các phương thức gọi API MBBank tương đương core/class/mbbank.php và mở rộng tiện ích.
    """

    BASE_URL = "https://online.mbbank.com.vn"
    AUTH_BASIC = "Basic RU1CUkVUQUlMV0VCOlNEMjM0ZGZnMzQlI0BGR0AzNHNmc2RmNDU4NDNm"
    DEFAULT_WASM_URL = "http://103.78.2.65:7222/mb/encrypt-data"
    DEFAULT_CAPTCHA_URL = "https://thueapibank.vn/api/captcha"

    def __init__(
        self,
        user: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        session_id: Optional[str] = None,
        device_id: Optional[str] = None,
        key_captcha: Optional[str] = None,
        wasm_url: Optional[str] = None,
        captcha_url: Optional[str] = None,
        timeout: int = 15,
    ):
        """
        Khởi tạo MBBank client.

        :param user: Tên đăng nhập / Số điện thoại MBBank
        :param password: Mật khẩu MBBank
        :param account_number: Số tài khoản MBBank
        :param session_id: Phiên đăng nhập sessionId nếu có sẵn
        :param device_id: Mã định danh thiết bị deviceIdCommon
        :param key_captcha: API key giải captcha (thueapibank.vn hoặc tương đương)
        :param wasm_url: Endpoint server mã hóa WASM payload
        :param captcha_url: Endpoint giải mã captcha
        :param timeout: Thời gian timeout kết nối HTTP (giây)
        """
        self.user = user or ""
        self.pass_ = password or ""
        self.password = password or ""
        setattr(self, "pass", password or "")
        self.account_number = account_number or ""
        self.sessionId = session_id or ""
        self.deviceIdCommon_goc = device_id or self.generateImei()
        self.key_captcha = (
            key_captcha
            or os.environ.get("KEY_CAPTCHA", "").strip()
            or os.environ.get("CAPTCHA_API_KEY", "").strip()
            or "local_offline_ai"
        )

        self.wasm_url = wasm_url or self.DEFAULT_WASM_URL
        self.captcha_url = (
            captcha_url
            or os.environ.get("CAPTCHA_LOCAL_ENGINE_URL", "").strip()
            or os.environ.get("CAPTCHA_API_URL", "").strip()
            or "http://127.0.0.1:8088"
        )
        self.timeout = timeout

        self.session = requests.Session()

        # URL tương thích mã cũ
        self.URL: Dict[str, str] = {
            "LOGIN": f"{self.BASE_URL}/api/retail_web/internetbanking/v2.0/doLogin",
            "CAPTCHA": f"{self.BASE_URL}/retail-web-internetbankingms/getCaptchaImage",
            "BALANCE": f"{self.BASE_URL}/retail-web-accountms/getBalance",
            "HISTORY": f"{self.BASE_URL}/api/retail-transactionms/transactionms/get-account-transaction-history",
        }

        # Lưu thông tin khách hàng sau đăng nhập
        self.cust_info: Dict[str, Any] = {}
        self.display_name: str = ""

    # =========================================================================
    # TIỆN ÍCH SINH MÃ (IMEI, REFNO, RANDOM, TIMESTAMP)
    # =========================================================================

    def generateRandomString(self, length: int = 20) -> str:
        """Sinh chuỗi ký tự ngẫu nhiên hexa (0-9a-f)"""
        characters = "0123456789abcdef"
        return "".join(random.choice(characters) for _ in range(length))

    def get_time_request(self) -> str:
        """Sinh chuỗi thời gian định dạng YmdHis"""
        return datetime.now().strftime("%Y%m%d%H%M%S")

    def generateImei(self) -> str:
        """
        Sinh mã IMEI / deviceIdCommon chuẩn cho ứng dụng MBBank.
        Format: 8char-4char-4char-4char-YmdHis
        """
        return (
            f"{self.generateRandomString(8)}-"
            f"{self.generateRandomString(4)}-"
            f"{self.generateRandomString(4)}-"
            f"{self.generateRandomString(4)}-"
            f"{self.get_time_request()}"
        )

    def generateRefNo2(self, phoneNumber: str) -> str:
        """
        Sinh refNo chuẩn 3 phần có millisecond và số ngẫu nhiên 5 chữ số.
        Format: {phone}-{YYYYMMDDHHMMSSms}-{random_5}
        """
        now = datetime.now()
        timestamp = now.strftime("%Y%m%d%H%M%S") + f"{now.microsecond // 10000:02d}"
        part3 = f"{random.randint(0, 99999):05d}"
        return f"{phoneNumber}-{timestamp}-{part3}"

    def get_time_now(self) -> str:
        """Lấy ngày giờ hiện tại dạng YmdHis"""
        return datetime.now().strftime("%Y%m%d%H%M%S")

    def getTimeNow(self) -> int:
        """Lấy timestamp thời gian tính bằng mili-giây (epoch ms)"""
        return int(round(time.time() * 1000))

    def get_TOKEN(self) -> str:
        """Sinh chuỗi token ngẫu nhiên 39 ký tự"""
        return self.generateRandomString(39)

    # =========================================================================
    # HTTP REQUEST HELPERS & CURL COMPATIBILITY
    # =========================================================================

    def _default_headers(
        self,
        ref_no: Optional[str] = None,
        device_id: Optional[str] = None,
    ) -> Dict[str, str]:
        """Tạo headers chuẩn gửi tới MBBank API"""
        dev_id = device_id or self.deviceIdCommon_goc
        ref = ref_no or f"{self.user}-{self.get_time_now()}"
        return {
            "accept": "application/json, text/plain, */*",
            "accept-language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "app": "MB_WEB",
            "authorization": self.AUTH_BASIC,
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            "deviceid": dev_id,
            "origin": self.BASE_URL,
            "pragma": "no-cache",
            "priority": "u=1, i",
            "referer": f"{self.BASE_URL}/information-account/source-account",
            "refno": ref,
            "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/135.0.0.0 Safari/537.36"
            ),
            "x-request-id": ref,
        }

    def CURL2(
        self,
        Action: str,
        header: Optional[Union[List[str], Dict[str, str]]] = None,
        data: Optional[Union[str, Dict[str, Any]]] = None,
    ) -> Any:
        """
        Mô phỏng phương thức CURL2 từ mbbank.php gốc.
        Gửi yêu cầu tới URL Action với custom headers & data.
        """
        headers: Dict[str, str] = {}
        if isinstance(header, dict):
            headers = header
        elif isinstance(header, list):
            for h in header:
                if ":" in h:
                    k, v = h.split(":", 1)
                    headers[k.strip()] = v.strip()

        try:
            if data:
                payload = json.dumps(data) if isinstance(data, dict) else str(data)
                resp = self.session.post(
                    Action, data=payload, headers=headers, timeout=self.timeout
                )
            else:
                resp = self.session.get(Action, headers=headers, timeout=self.timeout)

            try:
                return resp.json()
            except Exception:
                return resp.text
        except requests.exceptions.RequestException as e:
            return {"error": "RequestException", "message": str(e)}

    def CURL(
        self,
        Action: str,
        header: Optional[Union[List[str], Dict[str, str]]] = None,
        data: Optional[Union[str, Dict[str, Any]]] = None,
    ) -> Any:
        """Mô phỏng hàm CURL nội bộ trong mbbank.php"""
        url = self.URL.get(Action, Action)
        return self.CURL2(url, header, data)

    # =========================================================================
    # CAPTCHA & WASM ENCRYPTION
    # =========================================================================

    def get_captcha(self) -> Any:
        """
        Lấy ảnh Captcha từ MBBank dưới dạng base64 string.
        Tương thích với get_captcha() trong mbbank.php.
        """
        endpoints = [
            f"{self.BASE_URL}/api/retail-internetbankingms/getCaptchaImage",
            f"{self.BASE_URL}/retail-web-internetbankingms/getCaptchaImage",
        ]
        headers = self._default_headers(
            ref_no=self.get_time_request(),
            device_id=self.deviceIdCommon_goc
        )
        headers.update({
            "referer": f"{self.BASE_URL}/pl/login?logout=1",
        })
        data = {
            "refNo": self.get_time_request(),
            "deviceIdCommon": self.deviceIdCommon_goc,
            "sessionId": "",
        }

        for url in endpoints:
            try:
                resp = self.session.post(url, json=data, headers=headers, timeout=self.timeout)
                res_data = resp.json()
                if isinstance(res_data, dict) and "imageString" in res_data:
                    return res_data
            except Exception:
                continue

        return {"error": "GetCaptchaFailed", "message": "Không thể lấy captcha từ MBBank"}

    # Alias
    getCaptchaImage = get_captcha

    def bypass_captcha_stc(
        self,
        key_captcha: Optional[str] = None,
        captcha_service_url: Optional[str] = None,
    ) -> Optional[str]:
        """
        Giải captcha MBBank tự động qua dịch vụ OCR (mặc định thueapibank.vn).
        Tương thích với bypass_captcha_stc($key_captcha) trong mbbank.php.

        :param key_captcha: Access token của dịch vụ captcha
        :param captcha_service_url: URL API captcha (nếu muốn đổi service)
        :return: Chuỗi ký tự captcha sau khi giải
        """
        # 1. Lấy ảnh Captcha từ MBBank
        captcha_res = self.get_captcha()
        if isinstance(captcha_res, str):
            try:
                captcha_res = json.loads(captcha_res)
            except Exception:
                pass

        if not isinstance(captcha_res, dict) or "imageString" not in captcha_res:
            return None

        img_base64 = captcha_res["imageString"]

        # 2. Ưu tiên giải tự động 100% OFFLINE bằng model ONNX chuyên biệt giữ chuẩn hoa/thường
        try:
            import captcha_solver
            local_solved = captcha_solver.solve_captcha(img_base64, bank_type="mbbank")
            if local_solved and len(str(local_solved).strip()) >= 3:
                return str(local_solved).strip()
        except Exception:
            pass

        key = (
            key_captcha
            or self.key_captcha
            or os.environ.get("KEY_CAPTCHA", "").strip()
            or os.environ.get("CAPTCHA_API_KEY", "").strip()
        )
        url = (
            captcha_service_url
            or self.captcha_url
            or os.environ.get("CAPTCHA_API_URL", "").strip()
        )

        if not key or not url:
            return None

        # 3. Fallback dịch vụ ngoài nếu có cấu hình
        payload = {
            "api_key": key,
            "access_token": key,
            "key": key,
            "type": "mbbank",
            "base64": img_base64,
            "img_base64": img_base64,
        }

        try:
            # Thử gửi form data trước (chuẩn thueapibank.vn như VCB/BIDV)
            resp = self.session.post(url, data=payload, timeout=self.timeout)
            data = resp.json()
            if isinstance(data, dict):
                captcha_val = data.get("captcha") or data.get("data", {}).get("captcha")
                if captcha_val:
                    return str(captcha_val).strip()
        except Exception:
            pass

        try:
            # Thử gửi json payload
            resp = self.session.post(url, json=payload, timeout=self.timeout)
            data = resp.json()
            if isinstance(data, dict):
                captcha_val = data.get("captcha") or data.get("data", {}).get("captcha")
                if captcha_val:
                    return str(captcha_val).strip()
        except Exception:
            pass

        return None

    solve_captcha = bypass_captcha_stc
    solveCaptcha = bypass_captcha_stc

    def wasmEnc(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Mã hóa dữ liệu payload đăng nhập qua dịch vụ WASM.
        Tương thích với wasmEnc($data) trong mbbank.php.

        :param data: Dict chứa thông tin đăng nhập cần mã hóa
        :return: Dict chứa {'dataEnc': '...'}
        """
        try:
            resp = self.session.post(
                self.wasm_url,
                json=data,
                headers={"Content-Type": "application/json"},
                timeout=self.timeout,
            )
            return resp.json()
        except Exception as e:
            return {"error": "WasmEncFailed", "message": str(e), "dataEnc": ""}

    # =========================================================================
    # CORE BANKING METHODS (LOGIN, BALANCE, TRANSACTION HISTORY)
    # =========================================================================

    def login(self, captcha: Optional[str] = None, max_retries: int = 3) -> Dict[str, Any]:
        """
        Đăng nhập vào MBBank Online để lấy sessionId.
        Tương thích với login($captcha) trong mbbank.php.

        :param captcha: Chuỗi ký tự captcha (nếu None sẽ tự giải bằng model ONNX)
        :param max_retries: Số lần thử lại tối đa nếu mã captcha chưa khớp (mặc định 3 lần)
        :return: Dict kết quả đăng nhập từ MBBank (chứa sessionId, cust, result...)
        """
        auto_captcha = (captcha is None)
        attempts = 0
        last_res: Dict[str, Any] = {}

        while attempts < max_retries:
            attempts += 1
            text_captcha = captcha
            if auto_captcha or not text_captcha:
                ocr_key = (
                    self.key_captcha
                    or os.environ.get("KEY_CAPTCHA", "").strip()
                    or os.environ.get("CAPTCHA_API_KEY", "").strip()
                    or "d978a2a5b9566e49bf672fb876d5568c"
                )
                text_captcha = self.bypass_captcha_stc(key_captcha=ocr_key)

            if not text_captcha:
                text_captcha = ""

            password_md5 = hashlib.md5(str(self.pass_).encode("utf-8")).hexdigest()

            request_data = {
                "userId": self.user,
                "password": password_md5,
                "captcha": text_captcha,
                "ibAuthen2faString": "",
                "sessionId": None,
                "refNo": self.getTimeNow(),
                "deviceIdCommon": self.deviceIdCommon_goc,
            }

            # Thử mã hóa payload qua wasmEnc
            enc_res = self.wasmEnc(request_data)
            data_enc = enc_res.get("dataEnc", "")

            url = f"{self.BASE_URL}/api/retail_web/internetbanking/v2.0/doLogin"
            ref_no = f"5465-{self.get_time_now()}-{random.randint(10000, 99999)}"

            headers = self._default_headers(ref_no=ref_no, device_id=self.deviceIdCommon_goc)
            headers.update({
                "referer": f"{self.BASE_URL}/pl/login?logout=1",
            })

            # Nếu có dataEnc thì gửi payload mã hóa, nếu không gửi payload JSON thuần
            if data_enc:
                post_payload: Union[str, Dict[str, Any]] = json.dumps({"dataEnc": data_enc})
            else:
                post_payload = json.dumps(request_data)

            try:
                resp = self.session.post(
                    url, data=post_payload, headers=headers, timeout=self.timeout
                )
                data = resp.json()
                if isinstance(data, dict):
                    if "sessionId" in data and data["sessionId"]:
                        self.sessionId = data["sessionId"]
                        self.cust_info = data.get("cust", {})
                        self.display_name = self.cust_info.get("nm", "")
                        return data

                    # Nếu lỗi là GW283 (Capcha code is invalid) và đang chế độ tự giải -> thử lại
                    err_code = str(data.get("result", {}).get("responseCode") or "")
                    err_msg = str(data.get("result", {}).get("message") or "")
                    if auto_captcha and (err_code == "GW283" or "capcha" in err_msg.lower()):
                        last_res = data
                        time.sleep(0.5)
                        continue

                    return data
                last_res = {"status": "error", "message": "Phản hồi không hợp lệ từ MBBank", "raw": resp.text}
            except Exception as e:
                last_res = {"error": "LoginFailed", "message": str(e)}

            if not auto_captcha:
                break

        return last_res

    # Alias
    doLogin = login

    def get_lsgd(
        self,
        user: Optional[str] = None,
        session_id: Optional[str] = None,
        deviceId: Optional[str] = None,
        account: Optional[str] = None,
        day: int = 6,
    ) -> Any:
        """
        Lấy lịch sử giao dịch MBBank theo số ngày lùi lại.
        Tương thích 100% với function get_lsgd() trong mbbank.php.

        :param user: Tên đăng nhập MBBank
        :param session_id: Session ID hiện tại
        :param deviceId: Device ID Common
        :param account: Số tài khoản cần tra cứu
        :param day: Số ngày lịch sử cần lấy (mặc định 6 ngày)
        """
        usr = user or self.user
        sess = session_id or self.sessionId
        dev = deviceId or self.deviceIdCommon_goc
        acc = account or self.account_number

        to_date = datetime.now().strftime("%d/%m/%Y")
        from_date = (datetime.now() - timedelta(days=day)).strftime("%d/%m/%Y")
        ref_no = f"{usr}-{self.get_time_now()}"

        url = f"{self.BASE_URL}/api/retail-transactionms/transactionms/get-account-transaction-history"
        payload = {
            "toDate": to_date,
            "accountNo": acc,
            "sessionId": sess,
            "fromDate": from_date,
            "refNo": ref_no,
            "deviceIdCommon": dev,
        }

        headers = self._default_headers(ref_no=ref_no, device_id=dev)
        try:
            resp = self.session.post(url, json=payload, headers=headers, timeout=self.timeout)
            try:
                return resp.json()
            except Exception:
                return resp.text
        except Exception as e:
            return {"error": "GetHistoryFailed", "message": str(e)}

    def get_lsgd_1(
        self,
        user: Optional[str] = None,
        session_id: Optional[str] = None,
        deviceId: Optional[str] = None,
        account: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Any:
        """
        Lấy lịch sử giao dịch MBBank theo khoảng ngày cụ thể (YYYY-MM-DD hoặc DD/MM/YYYY).
        Tương thích với function get_lsgd_1() trong mbbank.php.
        """
        usr = user or self.user
        sess = session_id or self.sessionId
        dev = deviceId or self.deviceIdCommon_goc
        acc = account or self.account_number

        def _fmt(d_str: Optional[str]) -> str:
            if not d_str:
                return datetime.now().strftime("%d/%m/%Y")
            try:
                if "-" in d_str:
                    return datetime.strptime(d_str, "%Y-%m-%d").strftime("%d/%m/%Y")
                return d_str
            except Exception:
                return d_str

        from_date = _fmt(start_date)
        to_date = _fmt(end_date)
        ref_no = f"{usr}-{self.get_time_now()}"

        url = f"{self.BASE_URL}/api/retail-transactionms/transactionms/get-account-transaction-history"
        payload = {
            "toDate": to_date,
            "accountNo": acc,
            "sessionId": sess,
            "fromDate": from_date,
            "refNo": ref_no,
            "deviceIdCommon": dev,
        }

        headers = self._default_headers(ref_no=self.generateRefNo2(usr), device_id=dev)
        try:
            resp = self.session.post(url, json=payload, headers=headers, timeout=self.timeout)
            try:
                return resp.json()
            except Exception:
                return resp.text
        except Exception as e:
            return {"error": "GetHistoryFailed", "message": str(e)}

    def get_lsgd_2(
        self,
        user: Optional[str] = None,
        session_id: Optional[str] = None,
        deviceId: Optional[str] = None,
        account: Optional[str] = None,
        day: int = 6,
    ) -> Any:
        """
        Lấy lịch sử giao dịch MBBank (phiên bản 2 dùng trong api/historymbbankv2.php).
        Tương thích 100% với function get_lsgd_2() trong mbbank.php.
        """
        return self.get_lsgd(
            user=user,
            session_id=session_id,
            deviceId=deviceId,
            account=account,
            day=day,
        )

    def get_balance(
        self,
        account: Optional[str] = None,
        session_id: Optional[str] = None,
        deviceId: Optional[str] = None,
    ) -> Any:
        """
        Vấn tin số dư tài khoản MBBank.
        Tương thích với function get_balance($account, $session_id, $deviceId) trong mbbank.php.
        """
        acc = account or self.account_number
        sess = session_id or self.sessionId
        dev = deviceId or self.deviceIdCommon_goc
        ref_no = f"{acc}-{self.get_time_now()}"

        endpoints = [
            f"{self.BASE_URL}/api/retail-accountms/accountms/getBalance",
            f"{self.BASE_URL}/retail-web-accountms/getBalance",
        ]

        data = {
            "refNo": ref_no,
            "sessionId": sess,
            "deviceIdCommon": dev,
        }

        headers = self._default_headers(ref_no=ref_no, device_id=dev)

        for url in endpoints:
            try:
                resp = self.session.post(url, json=data, headers=headers, timeout=self.timeout)
                res_data = resp.json()
                if isinstance(res_data, dict) and (res_data.get("acct_list") or res_data.get("result")):
                    return res_data
            except Exception:
                continue

        return {"error": "GetBalanceFailed", "message": "Không thể lấy số dư từ MBBank"}

    # Alias
    getBalance = get_balance

    # =========================================================================
    # ENHANCED / 7BANK COMPATIBLE METHODS
    # =========================================================================

    def verify_login(
        self,
        phone: Optional[str] = None,
        password: Optional[str] = None,
        captcha: Optional[str] = None,
        key_captcha: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Xác minh đăng nhập và trả về cấu trúc chuẩn hóa cho 7Bank.

        :return: Dict chứa success, accountName, sessionData, raw
        """
        if phone:
            self.user = phone
        if password:
            self.pass_ = password
            self.password = password
            setattr(self, "pass", password)
        if key_captcha:
            self.key_captcha = key_captcha
        elif not self.key_captcha:
            self.key_captcha = (
                os.environ.get("KEY_CAPTCHA", "").strip()
                or os.environ.get("CAPTCHA_API_KEY", "").strip()
                or "d978a2a5b9566e49bf672fb876d5568c"
            )

        res = self.login(captcha=captcha)

        if isinstance(res, dict) and res.get("sessionId"):
            account_name = res.get("cust", {}).get("nm") or "Chủ tài khoản MBBank"
            return {
                "success": True,
                "status": "success",
                "accountName": account_name,
                "sessionData": {
                    "sessionId": res["sessionId"],
                    "deviceId": self.deviceIdCommon_goc,
                    "cust": res.get("cust", {}),
                },
                "raw": res,
            }

        msg = (
            res.get("result", {}).get("message")
            or res.get("message")
            or "Thông tin đăng nhập MBBank không chính xác hoặc cần mã hóa WASM/Captcha"
        )
        return {
            "success": False,
            "status": "error",
            "message": msg,
            "raw": res,
        }

    def get_formatted_history(
        self,
        account_no: Optional[str] = None,
        days: int = 6,
        auto_relogin: bool = True,
    ) -> Dict[str, Any]:
        """
        Lấy lịch sử giao dịch và chuẩn hóa danh sách theo format 7Bank Gateway
        (tương thích historymbbankv2.php và historymbbankv3.php).

        Trả về:
            {
                "status": "success",
                "message": "Thành công",
                "count": 5,
                "transactions": [
                    {
                        "transactionID": "...",
                        "amount": 50000,
                        "description": "...",
                        "transactionDate": "05/10/2026 12:00:00",
                        "type": "IN"
                    }
                ]
            }
        """
        acc = account_no or self.account_number

        raw_history = self.get_lsgd(
            user=self.user,
            session_id=self.sessionId,
            deviceId=self.deviceIdCommon_goc,
            account=acc,
            day=days,
        )

        if isinstance(raw_history, str):
            try:
                raw_history = json.loads(raw_history)
            except Exception:
                pass

        if not isinstance(raw_history, dict):
            return {
                "status": "error",
                "message": "Không nhận được phản hồi hợp lệ từ MBBank",
                "raw": raw_history,
            }

        # Kiểm tra nếu Session Invalid và có thể tự động login lại
        result_info = raw_history.get("result", {})
        err_msg = str(result_info.get("message", ""))
        is_session_invalid = (
            err_msg == "Session Invalid"
            or "invalid" in err_msg.lower()
            or result_info.get("responseCode") != "00"
        )

        if is_session_invalid and auto_relogin and self.user and self.pass_:
            # Đổi mới deviceId và login lại
            self.deviceIdCommon_goc = self.generateImei()
            login_res = self.login()
            if isinstance(login_res, dict) and login_res.get("sessionId"):
                # Gọi lại lịch sử bằng sessionId mới
                retry_res = self.get_lsgd(
                    user=self.user,
                    session_id=self.sessionId,
                    deviceId=self.deviceIdCommon_goc,
                    account=acc,
                    day=days,
                )
                if isinstance(retry_res, dict):
                    raw_history = retry_res

        # Bóc tách danh sách giao dịch
        tx_list = raw_history.get("transactionHistoryList")
        if not isinstance(tx_list, list):
            return {
                "status": "error",
                "message": raw_history.get("result", {}).get("message")
                or raw_history.get("message")
                or "Không thể lấy lịch sử giao dịch",
                "raw": raw_history,
            }

        tran_list: List[Dict[str, Any]] = []
        for tx in tx_list:
            if not isinstance(tx, dict):
                continue

            credit = float(tx.get("creditAmount", 0) or 0)
            debit = float(tx.get("debitAmount", 0) or 0)

            if credit == 0:
                tx_type = "OUT"
                amount = debit
            else:
                tx_type = "IN"
                amount = credit

            tran_list.append({
                "transactionID": str(tx.get("refNo", "")),
                "amount": int(amount),
                "description": str(tx.get("description", "")),
                "transactionDate": str(tx.get("transactionDate", "")),
                "type": tx_type,
                "accountNo": tx.get("accountNo", acc),
                "currency": tx.get("currency", "VND"),
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
    print("      MBBANK ONLINE BANKING API CLIENT (Python 3)")
    print("       Hệ thống tương thích 7Bank Gateway")
    print("=" * 65)

    if len(sys.argv) >= 3:
        cli_user = sys.argv[1]
        cli_pwd = sys.argv[2]
        cli_stk = sys.argv[3] if len(sys.argv) > 3 else cli_user
        cli_key_captcha = sys.argv[4] if len(sys.argv) > 4 else ""

        print(f"[*] Đang khởi tạo MBBank client cho tài khoản: {cli_user}...")
        client = MBBANK(
            user=cli_user,
            password=cli_pwd,
            account_number=cli_stk,
            key_captcha=cli_key_captcha,
        )

        print("[*] Đang thực hiện đăng nhập...")
        verify = client.verify_login()

        if verify.get("success"):
            print(f"[+] Đăng nhập thành công! Chủ tài khoản: {verify.get('accountName')}")
            print(f"[+] Session ID: {client.sessionId[:25]}...")

            # Vấn tin số dư
            print("\n[*] Đang kiểm tra số dư...")
            bal = client.get_balance()
            if isinstance(bal, dict) and bal.get("acct_list"):
                for a in bal["acct_list"]:
                    curr = a.get("currcyCd", "VND")
                    avail = float(a.get("currentBalance", 0) or 0)
                    print(f"  + STK: {a.get('acctNo')} ({a.get('acctNm')}) | Số dư khả dụng: {avail:,.0f} {curr}")
            else:
                print("Kết quả số dư raw:", json.dumps(bal, ensure_ascii=False, indent=2))

            print(f"\n[*] Đang lấy lịch sử giao dịch {cli_stk} (6 ngày gần nhất)...")
            history = client.get_formatted_history(account_no=cli_stk, days=6)
            print(f"Số lượng giao dịch: {history.get('count', 0)}")
            for i, tx in enumerate(history.get("transactions", []), 1):
                sign = "+" if tx["type"] == "IN" else "-"
                print(
                    f"  {i}. [{tx['type']}] {sign}{tx['amount']:,}đ | "
                    f"{tx['description']} | Ngày: {tx['transactionDate']} | "
                    f"Mã GD: {tx['transactionID']}"
                )
        else:
            print(f"[!] Đăng nhập thất bại: {verify.get('message')}")
            print("Chi tiết raw:", verify.get("raw"))
    else:
        print("Cách sử dụng qua dòng lệnh:")
        print("  python mbbank.py <username/phone> <password> [account_number] [key_captcha]")
        print("\nHoặc import module trong code Python:")
        print("  from mbbank import MBBANK")
        print("  bank = MBBANK(user='...', password='...', account_number='...')")
        print("  login_res = bank.login()")
        print("  history = bank.get_formatted_history(days=6)")
        print("=" * 65)
