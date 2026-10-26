#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
BIDV (Bank for Investment and Development of Vietnam - SmartBanking) API Client
Chuyển đổi từ core/class/bidv.php sang Python 3.
Tương thích hoàn toàn với hệ thống 7Bank Gateway.

Hỗ trợ đầy đủ:
  - Mã hóa Hybrid RSA (PKCS1 v1.5) + AES-256-CTR bảo mật chuẩn BIDV SmartBanking
  - Tải ảnh captcha trực tiếp từ BIDV (w2/captcha/{captchaToken})
  - Giải mã captcha tự động qua OCR (thueapibank.vn)
  - Đăng nhập (doLogin / verify_login)
  - Xác thực OTP kích hoạt đăng nhập (verifyOTP)
  - Vấn tin số dư tài khoản (getBalance)
  - Lịch sử giao dịch chi tiết (getTransactions / get_formatted_history)
  - CLI runner tiện lợi cho kiểm thử trực tiếp
=============================================================================
"""

import base64
import json
import os
import random
import string
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Union

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

# Hỗ trợ hiển thị tiếng Việt UTF-8 trên Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


class BIDV:
    """
    BIDV SmartBanking API Client.
    Cung cấp các phương thức gọi API BIDV tương đương core/class/bidv.php và mở rộng cho 7Bank.
    """

    # Server RSA Public Key (2048-bit PEM từ SmartBanking)
    DEFAULT_PUBLIC_KEY = (
        "-----BEGIN PUBLIC KEY-----\r\n"
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy6bC9ub46VDwZL5rwtbW\r\n"
        "2vBlHsqGzn6kr8OX7dKn+jHZxJxHSOGwTlqi+/QsSZ8wbUDkyK66atYB4Y06j1HS\r\n"
        "RimLG2zKK6BwqtMwM1VBwepy6nB+JsbobmvDInU/8cArdQRVNwWMHWwV0ZB0a3wp\r\n"
        "FCvVSwF61zFh5aG1Gbfvkbwdh4bpRa860MTyK19+rRXboROQmQYXfLWbrsI7vc3Q\r\n"
        "FRfgHIdh3baVd0mjmgMhE9yXwzroOxd418aWUQ9eSY1xmEmX9QynG9dYBMl/zzuS\r\n"
        "mM6CfJwKdsswKF0vmhRSLOBv+j/jABADcnrcIhcBS3EnTtSXDQPn/O/osqvRu5q\r\n"
        "xvQIDAQAB\r\n"
        "-----END PUBLIC KEY-----"
    )

    # Client RSA Public Key (SubjectPublicKeyInfo DER dạng base64)
    CLIENT_PUBLIC_KEY = (
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCLDAD6Wr+W7SXLJMECvt3/W9zMmVcbzwUniO7vYLBJD"
        "OEcWJoci5TrfAXlA+z3vxLmEKif41f6wlDBiY+Njj0fNkVH9w+dBbIz2CBaB8RsoDSFYA5zzUbdXfVMV"
        "+fs3o3nK/dDAZNX1MU96cISsgQTe+dIIkpMs3jSFvrxjtGg+wIDAQAB"
    )

    # Client RSA Private Key (1024-bit PEM)
    CLIENT_PRIVATE_KEY = (
        "-----BEGIN RSA PRIVATE KEY-----\r\n"
        "MIICXAIBAAKBgQCLDAD6Wr+W7SXLJMECvt3/W9zMmVcbzwUniO7vYLBJDOEcWJoc\r\n"
        "i5TrfAXlA+z3vxLmEKif41f6wlDBiY+Njj0fNkVH9w+dBbIz2CBaB8RsoDSFYA5z\r\n"
        "zUbdXfVMV+fs3o3nK/dDAZNX1MU96cISsgQTe+dIIkpMs3jSFvrxjtGg+wIDAQAB\r\n"
        "AoGAWyToMzNvKPCUeH/EIReaD3xY1KijJ/Bg0ZR6AuGfTJMrsFgH1TRNzrqCZqdX\r\n"
        "GuLd8X7z+bKdhhr/so2IUuLs/uF8/dQHtT9TxFoM2SPsgAqWZlxPOUZ+cBdNEv94\r\n"
        "JA9JywJQBuPTrnojrgcsODW3zOCMmiSWEr8lRtKZY/cvgWkCQQDbVqoKUl4T7yt2\r\n"
        "Dz8DxcZvgHMqyzvZyuYXLWyCg+cc6pd9iJ0uJdVe7YEE7bVoyHEBCF/6ufF53UuE\r\n"
        "dHPAnknPAkEAokm4A42/6BWFgL5R0UdDCoIp03ODn1GRo3Bcte/4b2Jm9pXsZrYS\r\n"
        "lwKyT66UuwXzcG1qkeLY33H0Zo6tC9z9FQJAf42GlToRO8Z6n81999Or8mvgjaJi\r\n"
        "y+USqafg0oWigU5rirVHsu6NhwbXYOZb+POXw+H67vPzWcs3f2+5YOqsQQJAbEDI\r\n"
        "YnZ3gJR6jTpm0Ta73ZKd29K+BdQfVepprWL5UTNOg0XWf10MYXcHAmfuBiMeE+yo\r\n"
        "nc+34rTc1lxtyfALUQJBANCy9hPELiv+c36RT7XISDfEX2ZwOo12yexNb545dL8n\r\n"
        "5whUm8qm5P9OAGgPgHBIVbOVp8qdHmRr1FT/qJt/LFw=\r\n"
        "-----END RSA PRIVATE KEY-----\r\n"
    )

    BASE_URL = "https://smartbanking.bidv.com.vn/w2"
    DEFAULT_CAPTCHA_URL = "https://thueapibank.vn/api/captcha"

    def __init__(
        self,
        E: Optional[str] = None,
        clientId: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        key_captcha: Optional[str] = None,
        timeout: int = 60,
        access_token: Optional[str] = None,
        session_id: Optional[str] = None,
        captcha_url: Optional[str] = None,
        **kwargs,
    ):
        """
        Khởi tạo BIDV Client.
        Tương thích tham số constructor BIDV($E, $clientId, $username, $password, $account_number) trong PHP.

        :param E: Thiết bị định danh / Session token E (nếu có sẵn)
        :param clientId: Client ID của tài khoản BIDV
        :param username: Tên đăng nhập BIDV SmartBanking (SĐT)
        :param password: Mật khẩu BIDV SmartBanking (PIN)
        :param account_number: Số tài khoản BIDV
        :param key_captcha: API key giải captcha OCR (thueapibank.vn)
        :param timeout: Thời gian timeout (giây)
        """
        self.key_captcha = (
            key_captcha
            or kwargs.get("keyCaptcha")
            or os.environ.get("KEY_CAPTCHA", "").strip()
            or os.environ.get("CAPTCHA_API_KEY", "").strip()
            or "d978a2a5b9566e49bf672fb876d5568c"
        )
        self.captchaKey = self.key_captcha
        self.captcha_url = (
            captcha_url
            or kwargs.get("captchaApiUrl")
            or kwargs.get("captcha_api_url")
            or os.environ.get("CAPTCHA_API_URL", "").strip()
            or self.DEFAULT_CAPTCHA_URL
        )

        self.defaultPublicKey = self.DEFAULT_PUBLIC_KEY
        self.clientPublicKey = self.CLIENT_PUBLIC_KEY
        self.clientPrivateKey = self.CLIENT_PRIVATE_KEY

        self.url = {
            "getCaptcha": f"{self.BASE_URL}/captcha/",
            "auth": f"{self.BASE_URL}/auth",
            "process": f"{self.BASE_URL}/process",
        }

        self.lang = "vi"
        self._timeout = timeout
        self.timeout = timeout
        self.DT = "WINDOWS"
        self.E = E or kwargs.get("e") or ""
        self.OV = "111.0.0.0"
        self.PM = "Chrome"
        self.appVersion = "2.4.1.15"
        self.captchaToken = ""
        self.captchaValue = ""

        # Account properties
        self.username = username or kwargs.get("user") or ""
        self.password = password or kwargs.get("pass") or kwargs.get("pass_") or ""
        self.account_number = account_number or ""

        # Session properties
        self.sessionId = session_id or kwargs.get("sessionId") or ""
        self.mobileId = kwargs.get("mobileId") or ""
        self.clientId = clientId or kwargs.get("client_id") or ""
        self.cif = kwargs.get("cif") or ""
        self.token = kwargs.get("token") or ""
        self.accessToken = access_token or kwargs.get("accessToken") or ""
        self.authToken = kwargs.get("authToken") or kwargs.get("auth_token") or self.accessToken or ""

        self.file = f"data/{self.username}.txt" if self.username else ""
        self.session = requests.Session()
        self.display_name = ""

        # Tự động nạp dữ liệu phiên đã lưu nếu chưa truyền E hoặc clientId
        if self.username and (not self.E or not self.clientId):
            self.parseData()


    # =========================================================================
    # TIỆN ÍCH LƯU / ĐỌC DỮ LIỆU & BỘ KÝ TỰ (Tương thích bidv.php)
    # =========================================================================

    def _rand_str(self, length: int = 32) -> str:
        """Sinh chuỗi ngẫu nhiên chữ và số (tương đương Str::random($length))."""
        chars = string.ascii_letters + string.digits
        return "".join(random.choice(chars) for _ in range(length))

    def saveData(self) -> None:
        """Lưu thông tin tài khoản và phiên đăng nhập vào tệp dữ liệu."""
        if not self.file:
            return
        os.makedirs(os.path.dirname(self.file), exist_ok=True)
        data = {
            "username": self.username,
            "password": self.password,
            "account_number": self.account_number,
            "sessionId": self.sessionId,
            "mobileId": self.mobileId,
            "clientId": self.clientId,
            "cif": self.cif,
            "token": self.token,
            "accessToken": self.accessToken,
            "E": self.E,
            "authToken": self.authToken,
        }
        with open(self.file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def parseData(self) -> bool:
        """Đọc thông tin tài khoản và phiên đăng nhập từ tệp dữ liệu."""
        if not self.file or not os.path.exists(self.file):
            return False
        try:
            with open(self.file, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.username = data.get("username", self.username)
            self.password = data.get("password", self.password)
            self.account_number = data.get("account_number", self.account_number)
            self.sessionId = data.get("sessionId", "")
            self.mobileId = data.get("mobileId", "")
            self.clientId = data.get("clientId", self.clientId)
            self.token = data.get("token", "")
            self.accessToken = data.get("accessToken", "")
            self.authToken = data.get("authToken", "")
            self.cif = data.get("cif", "")
            self.E = data.get("E", self.E)
            return True
        except Exception:
            return False

    def getUserAgent(self) -> str:
        """Lấy User-Agent hợp lệ cho BIDV SmartBanking."""
        return (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/95.0.4638.54 Safari/537.36"
        )

    def headerNull(self, header: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """Tạo bộ HTTP headers chuẩn cho BIDV SmartBanking API."""
        headers = {
            "Accept-Language": "vi",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": self.getUserAgent(),
            "Host": "smartbanking.bidv.com.vn",
            "Origin": "https://smartbanking.bidv.com.vn",
            "Referer": "https://smartbanking.bidv.com.vn/",
        }
        if header:
            headers.update(header)
        return headers

    def isJson(self, string_data: Any) -> bool:
        """Kiểm tra một chuỗi có phải là JSON hợp lệ hay không."""
        if not isinstance(string_data, str):
            return False
        try:
            json.loads(string_data)
            return True
        except Exception:
            return False

    # =========================================================================
    # MÃ HÓA & GIẢI MÃ BẢO MẬT (RSA PKCS1 v1.5 + AES-256-CTR)
    # =========================================================================

    def encryptData(self, str_data: Dict[str, Any]) -> Dict[str, str]:
        """
        Mã hóa dữ liệu gửi lên BIDV SmartBanking:
          1. Thêm clientPubKey vào payload.
          2. Sinh ngẫu nhiên AES key (32 ký tự) và IV (16 ký tự).
          3. Mã hóa payload JSON bằng AES-256-CTR với key và IV.
          4. Mã hóa RSA base64(key) bằng defaultPublicKey của BIDV.
          5. Trả về dict: {"d": body_b64, "k": header_b64}.
        Tương đương encryptData($str) trong bidv.php.
        """
        data = dict(str_data)
        data["clientPubKey"] = self.clientPublicKey

        key = self._rand_str(32)
        iv = self._rand_str(16)

        # AES-256-CTR mã hóa dữ liệu JSON
        json_bytes = json.dumps(data, separators=(',', ':')).encode('utf-8')
        cipher = Cipher(algorithms.AES(key.encode('utf-8')), modes.CTR(iv.encode('utf-8')), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(json_bytes) + encryptor.finalize()
        body = base64.b64encode(iv.encode('utf-8') + ciphertext).decode('utf-8')

        # RSA PKCS1 v1.5 mã hóa base64(key) bằng defaultPublicKey
        rsa_key = serialization.load_pem_public_key(self.defaultPublicKey.encode('utf-8'), backend=default_backend())
        enc_key = rsa_key.encrypt(base64.b64encode(key.encode('utf-8')), padding.PKCS1v15())
        header = base64.b64encode(enc_key).decode('utf-8')

        return {
            "d": body,
            "k": header,
        }

    def decryptData(self, cipher_data: Union[Dict[str, Any], Any]) -> Dict[str, Any]:
        """
        Giải mã gói tin phản hồi từ BIDV SmartBanking:
          1. Giải mã RSA trường `k` bằng clientPrivateKey để lấy AES key dạng base64.
          2. Giải mã AES-256-CTR trường `d` (16 bytes đầu là IV, còn lại là ciphertext).
          3. Parse kết quả ra JSON dict.
        Tương đương decryptData($cipher) trong bidv.php.
        """
        if isinstance(cipher_data, str):
            try:
                cipher_data = json.loads(cipher_data)
            except Exception:
                return {"status": False, "msg": cipher_data}

        # Nếu là object có thuộc tính k, d hoặc dict
        header = getattr(cipher_data, "k", None) or (cipher_data.get("k") if isinstance(cipher_data, dict) else "")
        body_b64 = getattr(cipher_data, "d", None) or (cipher_data.get("d") if isinstance(cipher_data, dict) else "")

        if not header or not body_b64:
            if isinstance(cipher_data, dict):
                return cipher_data
            return {"status": False, "msg": "Không có dữ liệu mã hóa k/d", "raw": cipher_data}

        try:
            body_raw = base64.b64decode(body_b64)

            # Giải mã RSA bằng clientPrivateKey
            rsa_key = serialization.load_pem_private_key(
                self.clientPrivateKey.encode('utf-8'), password=None, backend=default_backend()
            )
            dec_key_b64 = rsa_key.decrypt(base64.b64decode(header), padding.PKCS1v15())
            key_raw = base64.b64decode(dec_key_b64)

            # Giải mã AES-256-CTR
            iv = body_raw[:16]
            ciphertext = body_raw[16:]
            cipher = Cipher(algorithms.AES(key_raw), modes.CTR(iv), backend=default_backend())
            decryptor = cipher.decryptor()
            plaintext = decryptor.update(ciphertext) + decryptor.finalize()

            return json.loads(plaintext.decode('utf-8', errors='ignore'))
        except Exception as e:
            return {"status": False, "msg": f"Lỗi giải mã BIDV: {str(e)}", "raw": cipher_data}

    # =========================================================================
    # HTTP CURL POST HANDLER
    # =========================================================================

    def curlPost(
        self,
        url: str = "",
        data: Optional[Dict[str, Any]] = None,
        header: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Thực hiện HTTP POST mã hóa đến BIDV SmartBanking và giải mã phản hồi.
        Tương đương private function curlPost(...) trong bidv.php.
        """
        headers = self.headerNull(header)
        payload = data or {}
        encrypted_payload = self.encryptData(payload)

        try:
            res = self.session.post(
                url,
                json=encrypted_payload,
                headers=headers,
                timeout=self._timeout,
            )

            # Lưu lại Authorization header từ response nếu có
            auth_header = res.headers.get("Authorization")
            if auth_header:
                self.authToken = auth_header

            # Kiểm tra HTTP 403 (Token hết hạn)
            if res.status_code == 403:
                return {"status": False, "msg": "Token hết hạn vui lòng đăng nhập lại"}

            try:
                res_json = res.json()
                if isinstance(res_json, dict) and "k" in res_json and "d" in res_json:
                    return self.decryptData(res_json)
                return res_json
            except Exception:
                return {"status": False, "msg": res.text}
        except Exception as e:
            return {"status": False, "msg": f"Lỗi kết nối BIDV: {str(e)}"}

    # =========================================================================
    # CAPTCHA MANAGEMENT (Tương thích bidv.php & mở rộng OCR)
    # =========================================================================

    def getCaptcha(self) -> str:
        """
        Tải ảnh captcha từ BIDV (w2/captcha/{captchaToken}) và trả về chuỗi base64.
        Tương đương getCaptcha() trong bidv.php.
        """
        self.captchaToken = self._rand_str(30)
        url = f"{self.url['getCaptcha']}{self.captchaToken}"
        headers = {
            "user-agent": self.getUserAgent(),
            "Referer": "https://smartbanking.bidv.com.vn/",
        }

        res = self.session.get(url, headers=headers, timeout=self._timeout)
        return base64.b64encode(res.content).decode("utf-8")

    def solveCaptcha(self) -> Dict[str, Any]:
        """
        Lấy captcha và giải tự động qua dịch vụ OCR (thueapibank.vn).
        Trả về dictionary:
          {"status": True, "key": self.captchaToken, "captcha": self.captchaValue}
        Tương đương solveCaptcha() trong bidv.php.
        """
        get_captcha_b64 = self.getCaptcha()

        # 1. Ưu tiên giải tự động 100% OFFLINE (Không qua bất kỳ bên thứ 3 nào)
        try:
            import captcha_solver
            local_solved = captcha_solver.solve_captcha(get_captcha_b64)
            if local_solved and len(str(local_solved).strip()) >= 3:
                self.captchaValue = str(local_solved).strip()
                return {
                    "status": True,
                    "key": self.captchaToken,
                    "captcha": self.captchaValue,
                }
        except Exception:
            pass

        # 2. Fallback dịch vụ ngoài nếu có cấu hình
        try:
            url = os.environ.get("CAPTCHA_API_URL", "").strip() or self.DEFAULT_CAPTCHA_URL
            if not self.key_captcha or not url:
                return {"status": False, "msg": "Không thể nhận diện captcha BIDV (Local OCR thất bại)"}
            ocr_res = requests.post(
                url,
                data={
                    "api_key": self.key_captcha,
                    "access_token": self.key_captcha,
                    "type": "bidv",
                    "base64": get_captcha_b64,
                },
                timeout=15,
            )
            data = ocr_res.json()
            captcha_text = (
                data.get("captcha")
                or data.get("data", {}).get("captcha")
                or ""
            )

            if captcha_text:
                self.captchaValue = str(captcha_text).strip()
                return {
                    "status": True,
                    "key": self.captchaToken,
                    "captcha": self.captchaValue,
                }
            else:
                return {
                    "status": False,
                    "msg": data.get("msg") or "Không nhận dạng được captcha",
                }
        except Exception as e:
            return {"status": False, "msg": f"Lỗi gọi API giải captcha: {str(e)}"}

    # =========================================================================
    # CORE BANKING METHODS (Tương thích 100% bidv.php)
    # =========================================================================

    def doLogin(self) -> Dict[str, Any]:
        """
        Đăng nhập vào BIDV SmartBanking (mid: 1).
        Tự động giải captcha qua solveCaptcha() trước khi gửi request.
        Tương đương doLogin() trong bidv.php.
        """
        solve_captcha = self.solveCaptcha()
        if not solve_captcha.get("status"):
            return solve_captcha

        # Bắt đầu session mới cho đăng nhập
        self.session = requests.Session()

        param = {
            "DT": self.DT,
            "E": "",
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.appVersion,
            "captchaToken": self.captchaToken,
            "captchaValue": self.captchaValue,
            "clientId": "",
            "mid": 1,
            "pin": self.password,
            "user": self.username,
        }

        result = self.curlPost(self.url["auth"], param)
        result["E"] = self.E
        result["authToken"] = self.authToken

        # Cập nhật thông tin phiên đăng nhập nếu thành công
        code = str(result.get("code", ""))
        if code in ("00", "0"):
            self.display_name = result.get("name", "")
            if "data" in result and isinstance(result["data"], dict):
                d = result["data"]
                self.sessionId = d.get("sessionId", "")
                self.accessToken = d.get("accessToken", "")
                self.cif = d.get("cif", "")
                self.clientId = str(d.get("clientId", self.clientId))
            if result.get("token"):
                self.token = result.get("token")

        return result

    def wait_cross_login(
        self,
        token: Optional[str] = None,
        timeout: int = 120,
        interval: int = 2,
        show_progress: bool = True,
    ) -> Dict[str, Any]:
        """
        Chờ người dùng mở ứng dụng BIDV SmartBanking trên điện thoại và bấm Xác nhận đăng nhập.
        Liên tục gửi request mid: 30 (CROSS_LOGIN) tới w2/auth đến khi người dùng phê duyệt hoặc hết hạn.
        """
        cross_token = token or self.token
        if not cross_token:
            return {
                "success": False,
                "message": "Không tìm thấy token xác thực phiên Cross Login",
                "raw": None,
            }

        start_time = time.time()
        attempt = 0

        while (time.time() - start_time) < timeout:
            attempt += 1
            remaining = max(0, int(timeout - (time.time() - start_time)))
            if show_progress:
                print(f"[*] [{attempt}] Đang chờ bạn bấm 'Xác nhận' trên app BIDV SmartBanking... (còn {remaining}s)", flush=True)

            param = {
                "DT": self.DT,
                "E": self.E or "",
                "OV": self.OV,
                "PM": self.PM,
                "appVersion": self.appVersion,
                "clientId": self.clientId or "",
                "mid": 30,
                "token": cross_token,
                "user": self.username,
            }

            poll_res = self.curlPost(self.url["auth"], param)
            code = str(poll_res.get("code", ""))

            # Phê duyệt thành công (code 00 hoặc 0)
            if code in ("00", "0"):
                if show_progress:
                    print("\n[+] XÁC THỰC TRÊN APP BIDV THÀNH CÔNG!", flush=True)

                raw_cid = poll_res.get("clientId") or ""
                if raw_cid:
                    self.clientId = str(raw_cid)
                elif not self.clientId:
                    self.clientId = ""

                if poll_res.get("E"):
                    self.E = poll_res["E"]
                elif not self.E:
                    self.E = self._rand_str(10) + self.username

                if poll_res.get("name"):
                    self.display_name = poll_res["name"]
                if poll_res.get("cif"):
                    self.cif = poll_res["cif"]
                if poll_res.get("sessionId"):
                    self.sessionId = poll_res["sessionId"]
                if poll_res.get("accessToken"):
                    self.accessToken = poll_res["accessToken"]

                d_data = poll_res.get("data")
                if isinstance(d_data, dict):
                    self.sessionId = d_data.get("sessionId", self.sessionId)
                    self.accessToken = d_data.get("accessToken", self.accessToken)
                    self.cif = d_data.get("cif", self.cif)
                    if d_data.get("clientId"):
                        self.clientId = str(d_data["clientId"])

                self.saveData()
                return {
                    "success": True,
                    "accountName": self.display_name or self.username,
                    "message": "Xác nhận đăng nhập trên ứng dụng SmartBanking thành công",
                    "sessionData": {
                        "username": self.username,
                        "account": self.account_number,
                        "authToken": self.authToken,
                        "E": self.E,
                        "clientId": self.clientId,
                        "sessionId": self.sessionId,
                        "accessToken": self.accessToken,
                    },
                    "raw": poll_res,
                }

            # Đang chờ người dùng bấm xác nhận (code 88)
            if code == "88" or "chờ xác thực" in str(poll_res.get("des", "")).lower():
                time.sleep(interval)
                continue

            # Người dùng từ chối hoặc lỗi khác
            msg = poll_res.get("des") or poll_res.get("msg") or f"Lỗi xác thực [{code}]"
            return {
                "success": False,
                "message": msg,
                "raw": poll_res,
            }

        return {
            "success": False,
            "message": f"Quá thời gian chờ xác nhận trên ứng dụng BIDV SmartBanking ({timeout} giây)",
            "raw": None,
        }

    def verifyOTP(self, otp: str, token: str) -> Dict[str, Any]:
        """
        Xác thực mã OTP để kích hoạt phiên đăng nhập (mid: 56).
        Tương đương verifyOTP($otp, $token) trong bidv.php.
        """
        self.E = self._rand_str(10) + self.username

        data = {
            "user": self.username,
            "clientId": self.clientId,
            "location": "",
            "otp": str(otp),
            "mid": 56,
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.appVersion,
            "token": str(token),
        }

        res = self.curlPost(self.url["auth"], data)
        res["E"] = self.E
        res["authToken"] = self.authToken

        code = str(res.get("code", ""))
        if code in ("00", "0"):
            self.sessionId = res.get("sessionId", "")
            self.accessToken = res.get("accessToken", "")
            self.cif = res.get("cif", "")
            self.clientId = res.get("clientId", self.clientId)
            self.display_name = res.get("name", "")
            self.saveData()

        return res

    def getTransactions(
        self,
        E: Optional[str] = None,
        clientId: Optional[str] = None,
        access: Optional[str] = None,
        accNo: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Lấy danh sách lịch sử giao dịch BIDV (mid: 12).
        Tương đương getTransactions($E, $clientId, $access, $accNo) trong bidv.php.
        """
        use_e = E or self.E
        if not use_e:
            use_e = self._rand_str(10) + self.username
            self.E = use_e

        use_client_id = str(clientId or self.clientId or "")

        param = {
            "DT": self.DT,
            "E": use_e,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.appVersion,
            "clientId": use_client_id,
            "accType": "D",
            "accNo": accNo or self.account_number,
            "mid": 12,
            "moreRecord": "N",
            "nextRunbal": "",
            "postingDate": "",
            "postingOrder": "",
        }

        auth_header = {"Authorization": access or self.authToken}
        result = self.curlPost(self.url["process"], param, auth_header)
        return result

    def getBalance(
        self,
        E: Optional[str] = None,
        clientId: Optional[str] = None,
        access: Optional[str] = None,
        accNo: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Vấn tin số dư tài khoản BIDV (mid: 10).
        Tương đương getBalance($E, $clientId, $access, $accNo) trong bidv.php.
        """
        use_e = E or self.E
        if not use_e:
            use_e = self._rand_str(10) + self.username
            self.E = use_e

        use_client_id = str(clientId or self.clientId or "")

        param = {
            "DT": self.DT,
            "E": use_e,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.appVersion,
            "clientId": use_client_id,
            "accType": "D",
            "mid": 10,
            "isCache": False,
            "maxRequestInCache": False,
        }

        auth_header = {"Authorization": access or self.authToken}
        result = self.curlPost(self.url["process"], param, auth_header)
        return result

    # =========================================================================
    # HÀM MỞ RỘNG CHUẨN HÓA 7BANK GATEWAY
    # =========================================================================

    def verify_login(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        key_captcha: Optional[str] = None,
        auto_wait_cross_login: bool = True,
        force_login: bool = False,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Xác thực đăng nhập tài khoản BIDV SmartBanking (chuẩn hóa cho 7Bank Gateway).
        Hỗ trợ:
          1. Đăng nhập trực tiếp (loginType: 1)
          2. Xác nhận qua app điện thoại BIDV SmartBanking (Cross Login - loginType: 15)
          3. Xác thực OTP qua SMS/Soft OTP (loginType: 3)
          4. Tự động tái sử dụng phiên đăng nhập hợp lệ còn hạn trong data/{username}.txt

        :return: Dict kết quả chuẩn hóa:
            {
                "success": bool,
                "accountName": str,
                "sessionData": dict,
                "message": str,
                "raw": dict
            }
        """
        user = username or self.username
        pwd = password or self.password
        stk = account_number or self.account_number

        if user:
            self.username = user
            self.file = f"data/{self.username}.txt"
        if pwd:
            self.password = pwd
        if stk:
            self.account_number = stk
        if key_captcha:
            self.key_captcha = key_captcha
            self.captchaKey = key_captcha

        if not self.username or not self.password:
            return {
                "success": False,
                "message": "Thiếu tên đăng nhập hoặc mật khẩu BIDV",
                "raw": None,
            }

        # Kiểm tra phiên đăng nhập đã lưu trong file nếu có và không ép buộc đăng nhập lại
        if not force_login and self.authToken:
            bal_check = self.getBalance(accNo=self.account_number)
            code_bal = str(bal_check.get("code", ""))
            if code_bal in ("00", "0") or "availableBalance" in str(bal_check) or "currentBalance" in str(bal_check):
                return {
                    "success": True,
                    "accountName": self.display_name or self.username,
                    "sessionData": {
                        "username": self.username,
                        "account": self.account_number,
                        "authToken": self.authToken,
                        "E": self.E,
                        "clientId": self.clientId,
                        "sessionId": self.sessionId,
                        "accessToken": self.accessToken,
                    },
                    "message": "Phiên đăng nhập BIDV hợp lệ (sử dụng phiên lưu trữ)",
                    "raw": bal_check,
                }

        # Gọi đăng nhập
        login_res = self.doLogin()
        code = str(login_res.get("code", ""))

        # Trường hợp máy chủ BIDV trả về thành công bước 1 (code 00)
        if code in ("00", "0"):
            login_type = str(login_res.get("loginType", ""))
            name = login_res.get("name") or self.display_name or "Chủ tài khoản BIDV"
            token = login_res.get("token", "")
            cross_expire = int(login_res.get("crossLoginExpire") or 120)

            # TRƯỜNG HỢP 1: YÊU CẦU XÁC NHẬN TRÊN APP SMARTBANKING (CROSS LOGIN - loginType 15)
            if login_type == "15" or "crossLoginExpire" in login_res:
                self.token = token
                if auto_wait_cross_login:
                    print("\n" + "=" * 70)
                    print("  [!] YÊU CẦU XÁC NHẬN TRÊN APP BIDV SMARTBANKING TRÊN ĐIỆN THOẠI")
                    print("=" * 70)
                    print(f"[+] BIDV đã gửi yêu cầu xác thực đến điện thoại của bạn!")
                    print(f"[*] KHÔNG CẦN OTP - Chỉ cần MỞ APP BIDV TRÊN ĐIỆN THOẠI và bấm 'XÁC NHẬN'.")
                    print(f"[*] Thời hạn xác nhận: {cross_expire} giây.")
                    print("=" * 70 + "\n")
                    return self.wait_cross_login(token=token, timeout=cross_expire, interval=2, show_progress=True)
                else:
                    return {
                        "success": False,
                        "requiresCrossLogin": True,
                        "token": self.token,
                        "expire": cross_expire,
                        "message": "Vui lòng mở ứng dụng BIDV SmartBanking trên điện thoại để bấm Xác nhận đăng nhập.",
                        "raw": login_res,
                    }

            # TRƯỜNG HỢP 2: YÊU CẦU SMS OTP HOẶC SOFT OTP (loginType 3)
            if token and login_type == "3":
                self.token = token
                return {
                    "success": False,
                    "requiresOtp": True,
                    "token": self.token,
                    "message": "Mã OTP đã được gửi đến số điện thoại của bạn. Vui lòng xác thực OTP để hoàn tất đăng nhập.",
                    "raw": login_res,
                }

            # TRƯỜNG HỢP 3: ĐĂNG NHẬP TRỰC TIẾP THÀNH CÔNG (loginType 1)
            self.display_name = name
            if not self.E:
                self.E = self._rand_str(10) + self.username
            if not self.clientId:
                self.clientId = "bi8e00095e76cdv"
            self.saveData()
            return {
                "success": True,
                "accountName": name,
                "sessionData": {
                    "username": self.username,
                    "account": self.account_number,
                    "authToken": self.authToken,
                    "E": self.E,
                    "clientId": self.clientId,
                    "sessionId": self.sessionId,
                    "accessToken": self.accessToken,
                },
                "message": "Đăng nhập BIDV thành công",
                "raw": login_res,
            }

        des = login_res.get("des") or login_res.get("msg") or "Đăng nhập BIDV thất bại"
        return {
            "success": False,
            "message": f"[{code}] {des}",
            "raw": login_res,
        }

    def get_formatted_history(
        self,
        account_number: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Lấy và chuẩn hóa danh sách lịch sử giao dịch cho 7Bank Gateway.

        :return: Dict chuẩn hóa:
            {
                "status": "success" | "error",
                "bank": "bidv",
                "transactions": [
                    {
                        "transaction_id": str,
                        "amount": float,
                        "type": "IN" | "OUT",
                        "date": str,
                        "description": str,
                        "balance_after": float
                    }, ...
                ]
            }
        """
        target_acc = str(account_number or self.account_number).strip()
        res = self.getTransactions(
            E=self.E,
            clientId=self.clientId,
            access=auth_token or self.authToken,
            accNo=target_acc,
        )

        code = str(res.get("code", ""))
        des = str(res.get("des", ""))

        # Khi tài khoản không có giao dịch phát sinh nào trong kỳ tra cứu:
        # BIDV CoreBanking trả về code "502_1073779200" hoặc des "Object not found"
        if code == "502_1073779200" or "object not found" in des.lower():
            return {
                "status": "success",
                "bank": "bidv",
                "total": 0,
                "transactions": [],
                "message": "Không có giao dịch phát sinh nào",
            }

        if code not in ("00", "0") and not res.get("txnList") and not res.get("transactions"):
            return {
                "status": "error",
                "bank": "bidv",
                "message": res.get("des") or res.get("msg") or "Không thể lấy lịch sử giao dịch",
                "raw": res,
            }

        raw_txs = (
            res.get("txnList")
            or res.get("transactions")
            or res.get("transHistory")
            or res.get("data", {}).get("txnList")
            or []
        )
        formatted_list: List[Dict[str, Any]] = []

        for tx in raw_txs:
            cd_type = str(tx.get("txnType", "") or tx.get("dorc", "") or tx.get("cd", "") or tx.get("type", "")).upper()
            is_credit = cd_type in ("+", "CR", "C", "CREDIT", "IN")

            try:
                raw_amt = str(tx.get("amount", "0")).replace(",", "").strip()
                amount_clean = float(raw_amt)
            except Exception:
                amount_clean = 0.0

            try:
                raw_bal = str(tx.get("runBal", "0") or tx.get("balance", "0") or tx.get("runbal", "0")).replace(",", "").strip()
                balance_after = float(raw_bal)
            except Exception:
                balance_after = 0.0

            tx_id = str(tx.get("refNo", "") or tx.get("tranId", "") or tx.get("txnId", ""))
            
            d = str(tx.get("txnDate", "") or tx.get("tranDate", "") or tx.get("postingDate", "") or tx.get("date", ""))
            t = str(tx.get("txnTime", "") or "")
            tx_date = f"{d} {t}".strip() if t else d

            tx_desc = str(tx.get("txnRemark", "") or tx.get("remark", "") or tx.get("description", "") or tx.get("content", ""))

            formatted_list.append({
                "transaction_id": tx_id,
                "amount": amount_clean,
                "type": "IN" if is_credit else "OUT",
                "date": tx_date,
                "description": tx_desc,
                "balance_after": balance_after,
                "raw": tx,
            })

        return {
            "status": "success",
            "bank": "bidv",
            "total": len(formatted_list),
            "transactions": formatted_list,
        }

    def getBalanceStandardized(self, account_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Vấn tin số dư tài khoản trả về dictionary chuẩn hóa cho 7Bank.
        """
        target_acc = str(account_number or self.account_number).strip()
        res = self.getBalance(accNo=target_acc)
        code = str(res.get("code", ""))

        if code in ("00", "0") or "accList" in res or "lstTotal" in res:
            # 1. Tìm trong accList
            acc_list = res.get("accList") or res.get("data", {}).get("accList") or []
            for acc in acc_list:
                if str(acc.get("accNo", "")).strip() == target_acc:
                    bal = acc.get("balanceAval") if acc.get("balanceAval") is not None else acc.get("balance", 0)
                    name = acc.get("accName") or self.display_name or "Chủ tài khoản BIDV"
                    if name:
                        self.display_name = name
                    try:
                        clean_bal = float(str(bal).replace(",", "").strip())
                    except Exception:
                        clean_bal = 0.0

                    return {
                        "status": "success",
                        "bank": "bidv",
                        "account": target_acc,
                        "accountName": name,
                        "balance": clean_bal,
                        "raw": acc,
                    }

            # 2. Nếu có lstTotal và chỉ có 1 tài khoản
            lst_total = res.get("lstTotal", [])
            if lst_total and isinstance(lst_total, list) and len(lst_total) > 0:
                tot = lst_total[0]
                try:
                    clean_bal = float(str(tot.get("amount", 0)).replace(",", "").strip())
                except Exception:
                    clean_bal = 0.0
                return {
                    "status": "success",
                    "bank": "bidv",
                    "account": target_acc,
                    "accountName": self.display_name or target_acc,
                    "balance": clean_bal,
                    "raw": tot,
                }

            # 3. Fallback trường hợp trả trực tiếp
            bal = res.get("availableBalance") or res.get("currentBalance") or res.get("balance") or 0
            try:
                clean_bal = float(str(bal).replace(",", "").strip())
            except Exception:
                clean_bal = 0.0

            return {
                "status": "success",
                "bank": "bidv",
                "account": target_acc,
                "accountName": self.display_name or target_acc,
                "balance": clean_bal,
                "raw": res,
            }

        return {
            "status": "error",
            "bank": "bidv",
            "message": res.get("des") or res.get("msg") or "Không thể lấy số dư BIDV",
            "raw": res,
        }


# =============================================================================
# CLI TEST RUNNER
# =============================================================================

def main():
    """Hàm chạy dòng lệnh để kiểm thử API BIDV SmartBanking."""
    print("=" * 70)
    print("  7BANK GATEWAY - BIDV SMARTBANKING API CLIENT")
    print("=" * 70)

    if len(sys.argv) < 3:
        print("\nSử dụng:")
        print("  python bidv.py <username> <password> [account_number] [key_captcha]")
        print("\nVí dụ:")
        print("  python bidv.py 0987654321 MyPinPass123@ 1234567890 d978a2a5b9566e49bf672fb876d5568c\n")
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    account_number = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith("d978") else username
    key_captcha = sys.argv[4] if len(sys.argv) > 4 else ("d978a2a5b9566e49bf672fb876d5568c" if sys.argv[-1].startswith("d978") else "")

    print(f"\n[+] Tên đăng nhập: {username}")
    print(f"[+] Số tài khoản:  {account_number}")
    if key_captcha:
        print(f"[+] Key Captcha:   {key_captcha}")

    client = BIDV(
        username=username,
        password=password,
        account_number=account_number,
        key_captcha=key_captcha,
    )

    print("\n[*] Đang xác thực thông tin đăng nhập và giải captcha...")
    res = client.verify_login(auto_wait_cross_login=True)

    if res.get("success"):
        print(f"\n[+] ĐĂNG NHẬP THÀNH CÔNG!")
        print(f"[+] Chủ tài khoản: {res.get('accountName')}")
        session_data = res.get("sessionData", {})
        if session_data.get("authToken"):
            print(f"[+] Auth Token:    {session_data.get('authToken')[:25]}...")

        print("\n[*] Đang lấy số dư tài khoản...")
        bal_res = client.getBalanceStandardized()
        if bal_res.get("status") == "success":
            print(f"[+] Số dư khả dụng: {bal_res.get('balance'):,.0f} VNĐ")
        else:
            print(f"[-] Không lấy được số dư: {bal_res.get('message')}")

        print("\n[*] Đang lấy lịch sử giao dịch gần nhất...")
        his_res = client.get_formatted_history()
        if his_res.get("status") == "success":
            txs = his_res.get("transactions", [])
            print(f"[+] Tìm thấy {len(txs)} giao dịch:")
            for idx, tx in enumerate(txs[:10], 1):
                sym = "+" if tx["type"] == "IN" else "-"
                print(f"    {idx}. [{tx['date']}] {sym}{tx['amount']:,.0f} VNĐ | {tx['description'][:50]}")
        else:
            print(f"[-] Không lấy được lịch sử: {his_res.get('message')}")

    elif res.get("requiresCrossLogin"):
        print("\n" + "=" * 70)
        print("  [!] YÊU CẦU XÁC NHẬN TRÊN APP BIDV SMARTBANKING (CROSS LOGIN)")
        print("=" * 70)
        print(f"[!] Thông báo: {res.get('message')}")
        print(f"[!] Token phiên: {res.get('token')}")
        cross_res = client.wait_cross_login(token=res.get("token"), timeout=res.get("expire", 120), show_progress=True)
        if cross_res.get("success"):
            print(f"\n[+] ĐĂNG NHẬP THÀNH CÔNG!")
            print(f"[+] Chủ tài khoản: {cross_res.get('accountName')}")

            print("\n[*] Đang lấy số dư tài khoản...")
            bal_res = client.getBalanceStandardized()
            if bal_res.get("status") == "success":
                print(f"[+] Số dư khả dụng: {bal_res.get('balance'):,.0f} VNĐ")
            else:
                print(f"[-] Không lấy được số dư: {bal_res.get('message')}")

            print("\n[*] Đang lấy lịch sử giao dịch gần nhất...")
            his_res = client.get_formatted_history()
            if his_res.get("status") == "success":
                txs = his_res.get("transactions", [])
                print(f"[+] Tìm thấy {len(txs)} giao dịch:")
                for idx, tx in enumerate(txs[:10], 1):
                    sym = "+" if tx["type"] == "IN" else "-"
                    print(f"    {idx}. [{tx['date']}] {sym}{tx['amount']:,.0f} VNĐ | {tx['description'][:50]}")
            else:
                print(f"[-] Không lấy được lịch sử: {his_res.get('message')}")
        else:
            print(f"\n[-] XÁC THỰC THẤT BẠI: {cross_res.get('message')}")

    elif res.get("requiresOtp"):
        print("\n[!] YÊU CẦU XÁC THỰC OTP KÍCH HOẠT THIẾT BỊ!")
        print(f"[!] Thông báo: {res.get('message')}")
        print(f"[!] Token phiên: {res.get('token')}")
        otp = input("\n[?] Nhập mã OTP nhận được trên điện thoại: ").strip()
        if otp:
            print("\n[*] Đang xác thực OTP...")
            otp_res = client.verifyOTP(otp, res.get("token", ""))
            code = str(otp_res.get("code", ""))
            if code in ("00", "0"):
                print(f"[+] XÁC THỰC OTP THÀNH CÔNG: {otp_res.get('des', 'Thành công')}")
                client.saveData()

                print("\n[*] Đang lấy số dư tài khoản...")
                bal_res = client.getBalanceStandardized()
                if bal_res.get("status") == "success":
                    print(f"[+] Số dư khả dụng: {bal_res.get('balance'):,.0f} VNĐ")
                else:
                    print(f"[-] Không lấy được số dư: {bal_res.get('message')}")

                print("\n[*] Đang lấy lịch sử giao dịch gần nhất...")
                his_res = client.get_formatted_history()
                if his_res.get("status") == "success":
                    txs = his_res.get("transactions", [])
                    print(f"[+] Tìm thấy {len(txs)} giao dịch:")
                    for idx, tx in enumerate(txs[:10], 1):
                        sym = "+" if tx["type"] == "IN" else "-"
                        print(f"    {idx}. [{tx['date']}] {sym}{tx['amount']:,.0f} VNĐ | {tx['description'][:50]}")
                else:
                    print(f"[-] Không lấy được lịch sử: {his_res.get('message')}")
            else:
                print(f"[-] XÁC THỰC OTP THẤT BẠI: [{code}] {otp_res.get('des') or otp_res.get('msg')}")
                print(f"[-] Chi tiết: {json.dumps(otp_res, ensure_ascii=False, indent=2)}")
    else:
        print(f"\n[-] ĐĂNG NHẬP THẤT BẠI: {res.get('message')}")
        print(f"[-] Chi tiết: {json.dumps(res.get('raw'), ensure_ascii=False, indent=2)}")


if __name__ == "__main__":
    main()


