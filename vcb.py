#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
Vietcombank (VCB Digibank) API Client
Chuyển đổi từ core/class/vcb.php và core/class/decode.php sang Python 3.
Tương thích hoàn toàn với hệ thống 7Bank Gateway.

Hỗ trợ đầy đủ:
  - Mã hóa Hybrid RSA (PKCS1 v1.5) + AES-256-CTR bảo mật chuẩn VCB Digibank
  - Tải ảnh captcha trực tiếp từ VCB CDN (utility-service/v1/captcha)
  - Giải mã captcha tự động qua OCR (thueapibank.vn)
  - Đăng nhập (login / verify_login)
  - Xác thực trình duyệt mới qua OTP (initLoginNewBrowser, veryOtpLoginNewBrowser, get_otp, saveLoginNewBrowser)
  - Tra cứu số dư tài khoản (get_balance / getBalance)
  - Lịch sử giao dịch chi tiết (get_lsgd / get_formatted_history)
  - CLI runner tiện lợi cho kiểm thử trực tiếp
=============================================================================
"""

import base64
import hashlib
import json
import os
import random
import string
import sys
import time
import uuid
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


# =============================================================================
# HẰNG SỐ MÃ HÓA VCB DIGIBANK (Từ core/class/decode.php)
# =============================================================================

# Server RSA Public Key (base64 PEM từ main-es2015...js)
DEFAULT_PUBLIC_KEY_B64 = (
    "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFP"
    "Q0FROEFNSUlCQ2dLQ0FRRUFpa3FRckl6WkprVXZIaXNqZnU1WkNOK1RMeS8vNDNDSWM1aEpF"
    "NzA5VElLM0hiY0M5dnVjMitQUEV0STZwZVNVR3FPbkZvWU93bDNpOHJSZFNhSzE3RzJSWk4w"
    "MU1JcVJJSi82YWM5SDRMMTFkdGZRdFI3S0hxRjdLRDBmajZ2VTRrYjUrMGN3UjNSdW1CdkRl"
    "TWxCT2FZRXBLd3VFWTlFR3F5OWJjYjVFaE5HYnh4TmZiVWFvZ3V0VndHNUMxZUtZSXR6YVlk"
    "NnRhbzNncTdzd05IN3A2VWRsdHJDcHhTd0ZFdmM3ZG91RTJzS3JQRHA4MDdaRzJkRnNsS3h4"
    "bVI0V0hESFdmSDBPcHpyQjVLS1dRTnl6WHhUQlhlbHFyV1pFQ0xSeXBOcTdQKzFDeWZnVFNk"
    "UTM1ZmRPN00xTW5pU0JUMVYzM0xkaFhvNzMvOXFENWU1VlFJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0t"
)
DEFAULT_PUBLIC_KEY_PEM = base64.b64decode(DEFAULT_PUBLIC_KEY_B64)

# Client RSA Public Key (SubjectPublicKeyInfo DER dạng base64)
CLIENT_PUBLIC_KEY = (
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCnuY5jaHVt0cENefO8vqCIAENk2cFVB6uSDsQa32w26dZ"
    "7BI7zEhspBb5EnaSQ7aaj0tY/iOBJZ65eVkOhv7zkqqhAs6WUuEI8SYDZOd+imD6FviXcpMR52mKQ0+6xd3"
    "JzorjW7wT6ScEm+mOjKr0RgvvOjiNXRmp0xP3JazEJXwIDAQAB"
)

# Client RSA Private Key (1024-bit PEM)
CLIENT_PRIVATE_KEY_PEM = (
    "-----BEGIN RSA PRIVATE KEY-----\r\n"
    "MIICXQIBAAKBgQCnuY5jaHVt0cENefO8vqCIAENk2cFVB6uSDsQa32w26dZ7BI7z\r\n"
    "EhspBb5EnaSQ7aaj0tY/iOBJZ65eVkOhv7zkqqhAs6WUuEI8SYDZOd+imD6FviXc\r\n"
    "pMR52mKQ0+6xd3JzorjW7wT6ScEm+mOjKr0RgvvOjiNXRmp0xP3JazEJXwIDAQAB\r\n"
    "AoGAC0YAmRPrWK9Rj4tT46rYdWu3G+86/HEgihet/LRpvKMpBGnBBfuAkdhN+qSx\r\n"
    "6//dRIOmXOzhTm3GnZakwxl1I7kuaQ/ibjOGzekjs6xoI9KyAaTzM6Tq2gtOs1MN\r\n"
    "Z0OVezvT6tkFU24H5eQusBb3p5iXhusJYdxU/X37bg8F8ZkCQQD6Pbngr1wWBP7W\r\n"
    "ySZtWX4LmPBrUtDzP9boieysut7qB7CVDqut1w6Q6/r391Q4hiAT8umZqKkbzaym\r\n"
    "ZYNfRz+bAkEAq5WxSiDubCITFcE9g9T+Fhm8q6JeRN7zXiF7T+Y4MpjM22LDdqLD\r\n"
    "8zhSa1i1IjutBGKYcR6/ROOxdLoYOZeTjQJBANZfMLBhqYKXjvTTZx8ALnGi+DsI\r\n"
    "vEXWZ7XYCi/C+poEMmrPIZWQCUNvVRU+BSFTDYHpc+MV0KEn5gK6LfveXocCQAgh\r\n"
    "Gno5nzIuVxsjwadaUwN3CrJTCgZXTc565Z2+eZEkHiiSwFIBmikO1RDS7hoGG8dm\r\n"
    "aHSLkWJRK1otavJnlQ0CQQDA1mBdwYlNESnti6ZTruuurO13fujIiZrysBPW3V2x\r\n"
    "RIhMvW9JmUiD4JnduB2g0wEorWkdNPXD6bJ5ZDla3ivd\r\n"
    "-----END RSA PRIVATE KEY-----\r\n"
)


# =============================================================================
# HÀM MÃ HÓA / GIẢI MÃ ĐỘC LẬP (Tương thích decode.php)
# =============================================================================

def encodeRSA(content: Union[str, bytes], key_pem: Union[str, bytes]) -> str:
    """
    Mã hóa dữ liệu bằng RSA Public Key (PKCS1 v1.5 padding), trả về chuỗi base64.
    Tương đương encodeRSA($content, $key) trong decode.php.
    """
    if isinstance(content, str):
        content = content.encode('utf-8')
    if isinstance(key_pem, str):
        key_pem = key_pem.encode('utf-8')
    rsa_key = serialization.load_pem_public_key(key_pem, backend=default_backend())
    encrypted = rsa_key.encrypt(content, padding.PKCS1v15())
    return base64.b64encode(encrypted).decode('utf-8')


def decodeRSA(content_b64: str, key_pem: Union[str, bytes]) -> bytes:
    """
    Giải mã chuỗi base64 bằng RSA Private Key (PKCS1 v1.5 padding).
    Tương đương decodeRSA($content, $key) trong decode.php.
    """
    if isinstance(key_pem, str):
        key_pem = key_pem.encode('utf-8')
    cipher_bytes = base64.b64decode(content_b64)
    rsa_key = serialization.load_pem_private_key(key_pem, password=None, backend=default_backend())
    return rsa_key.decrypt(cipher_bytes, padding.PKCS1v15())


def encryptAES(key_str: str, data: Union[dict, list, str, bytes]) -> str:
    """
    Mã hóa dữ liệu bằng AES-256-CTR.
    Key là 32 bytes đầu của chuỗi key, IV là 16 bytes đầu của key.
    Nếu data là dict, tự động thêm trường clientPubKey trước khi mã hóa JSON.
    Trả về chuỗi base64(IV + Ciphertext).
    Tương đương encryptAES($key, $data) trong decode.php.
    """
    key_bytes = key_str[:32].encode('utf-8')
    iv = key_bytes[:16]

    if isinstance(data, dict):
        data_copy = dict(data)
        data_copy['clientPubKey'] = CLIENT_PUBLIC_KEY
        data_bytes = json.dumps(data_copy, separators=(',', ':')).encode('utf-8')
    elif isinstance(data, (list, tuple)):
        data_bytes = json.dumps(data, separators=(',', ':')).encode('utf-8')
    elif isinstance(data, str):
        data_bytes = data.encode('utf-8')
    else:
        data_bytes = data

    cipher = Cipher(algorithms.AES(key_bytes), modes.CTR(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(data_bytes) + encryptor.finalize()
    return base64.b64encode(iv + ciphertext).decode('utf-8')


def decryptAES(key_b64: Union[str, bytes], data_b64: str) -> str:
    """
    Giải mã chuỗi base64 bằng AES-256-CTR.
    Key được base64 decode để lấy 32 bytes raw.
    16 bytes đầu của data là IV, phần còn lại là ciphertext.
    Tương đương decryptAES($key, $data) trong decode.php.
    """
    if isinstance(key_b64, str):
        key_bytes = base64.b64decode(key_b64)
    else:
        key_bytes = base64.b64decode(key_b64)

    raw_data = base64.b64decode(data_b64)
    iv = raw_data[:16]
    ciphertext = raw_data[16:]

    cipher = Cipher(algorithms.AES(key_bytes), modes.CTR(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    return plaintext.decode('utf-8', errors='ignore')


def decryptResponse(key_b64: str, data_b64: str) -> str:
    """
    Giải mã gói tin phản hồi từ Vietcombank server:
      1. Dùng clientPrivateKey giải mã RSA chuỗi key `k` để lấy AES key dạng base64.
      2. Dùng AES key đó giải mã AES-256-CTR chuỗi data `d`.
    Tương đương decryptResponse($key, $data) trong decode.php.
    """
    decrypted_key = decodeRSA(key_b64, CLIENT_PRIVATE_KEY_PEM)
    return decryptAES(decrypted_key, data_b64)


def encryptKey(key_str: str) -> str:
    """
    Mã hóa AES session key bằng defaultPublicKey (Server RSA Public Key).
    Tương đương encryptKey($key) trong decode.php.
    """
    key_32 = key_str[:32].encode('utf-8')
    key_b64 = base64.b64encode(key_32)
    return encodeRSA(key_b64, DEFAULT_PUBLIC_KEY_PEM)


def encryptRequest(key_str: str, data: Union[dict, list, str]) -> Dict[str, str]:
    """
    Đóng gói dữ liệu gửi lên VCB Digibank:
      {"k": encryptKey(key), "d": encryptAES(key, data)}
    Tương đương encryptRequest($key, $data) trong decode.php.
    """
    return {
        "k": encryptKey(key_str),
        "d": encryptAES(key_str, data),
    }


# =============================================================================
# LỚP VCB CLIENT CHÍNH
# =============================================================================

class VCB:
    """
    Vietcombank (VCB Digibank) API Client.
    Cung cấp các phương thức gọi API VCB tương đương core/class/vcb.php và mở rộng cho 7Bank.
    """

    BASE_URL = "https://digiapp.vietcombank.com.vn"
    WEB_ORIGIN = "https://vcbdigibank.vietcombank.com.vn"
    DEFAULT_CAPTCHA_URL = "https://thueapibank.vn/api/captcha"

    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        session_id: Optional[str] = None,
        cif: Optional[str] = None,
        client_id: Optional[str] = None,
        mobile_id: Optional[str] = None,
        access_key: Optional[str] = None,
        key_captcha: Optional[str] = None,
        timeout: int = 15,
    ):
        """
        Khởi tạo VCB Client.

        :param username: Tên đăng nhập VCB Digibank (SĐT / user)
        :param password: Mật khẩu VCB Digibank
        :param account_number: Số tài khoản ngân hàng VCB
        :param session_id: Phiên đăng nhập sessionId nếu có sẵn
        :param cif: Mã khách hàng CIF
        :param client_id: Client ID định danh từ VCB
        :param mobile_id: Mobile ID định danh từ VCB
        :param access_key: Access Key từ phiên đăng nhập
        :param key_captcha: API key giải captcha qua OCR (mặc định thueapibank.vn)
        :param timeout: Thời gian timeout cho mỗi request (giây)
        """
        # Thuộc tính tương thích hoàn toàn PHP vcb.php
        self.accountNo = account_number or username or ""
        self.browserToken = ""
        self.tranId = ""
        self.otp = ""

        # Thuộc tính tiện ích mở rộng
        self.username = username or ""
        self.password = password or ""
        self.sessionId = session_id or ""
        self.session_id = session_id or ""
        self.cif = cif or ""
        self.clientId = client_id or ""
        self.client_id = client_id or ""
        self.mobileId = mobile_id or ""
        self.mobile_id = mobile_id or ""
        self.accessKey = access_key or ""
        self.access_key = access_key or ""
        self.key_captcha = (
            key_captcha
            or os.environ.get("KEY_CAPTCHA", "").strip()
            or os.environ.get("CAPTCHA_API_KEY", "").strip()
            or "d978a2a5b9566e49bf672fb876d5568c"
        )
        self.captcha_url = (
            os.environ.get("CAPTCHA_API_URL", "").strip()
            or self.DEFAULT_CAPTCHA_URL
        )
        self.timeout = timeout

        self.session = requests.Session()
        self.user_info: Dict[str, Any] = {}
        self.display_name: str = ""

    # =========================================================================
    # TIỆN ÍCH SINH MÃ & THỜI GIAN (Tương thích vcb.php)
    # =========================================================================

    def random(self, string_chars: str, length: int) -> str:
        """Sinh chuỗi ngẫu nhiên từ bộ ký tự truyền vào (tương đương str_shuffle)."""
        return "".join(random.choice(string_chars) for _ in range(length))

    def generateRandom(self, length: int = 20) -> str:
        """Sinh chuỗi ngẫu nhiên gồm chữ và số."""
        chars = string.ascii_letters + string.digits
        return "".join(random.choice(chars) for _ in range(length))

    def generateImei(self) -> str:
        """Sinh chuỗi IMEI định dạng 8-4-4-4-12 ngẫu nhiên."""
        return (
            f"{self.generateRandom(8)}-"
            f"{self.generateRandom(4)}-"
            f"{self.generateRandom(4)}-"
            f"{self.generateRandom(4)}-"
            f"{self.generateRandom(12)}"
        )

    def gen_uuid(self) -> str:
        """Sinh mã UUID ngẫu nhiên."""
        return str(uuid.uuid4())

    def get_time_request(self) -> str:
        """Sinh chuỗi thời gian định dạng YmdHis."""
        return datetime.now().strftime("%Y%m%d%H%M%S")

    def get_microtime(self) -> int:
        """Lấy timestamp tính bằng mili-giây."""
        return int(round(time.time() * 1000))

    def Decrypt_data(self, data: str, keys: str) -> str:
        """
        Giải mã AES-256-CBC với IV rỗng (16 bytes số 0).
        Tương đương openssl_decrypt(..., 'AES-256-CBC', ...) trong vcb.php.
        """
        raw_cipher = base64.b64decode(data)
        iv = b"\x00" * 16
        key_bytes = keys.encode('utf-8')[:32].ljust(32, b'\0')
        cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        plain = decryptor.update(raw_cipher) + decryptor.finalize()
        return plain.decode('utf-8', errors='ignore')

    # =========================================================================
    # HTTP REQUEST HANDLER (CURL)
    # =========================================================================

    def _get_headers(self, request_id: Optional[str] = None) -> Dict[str, str]:
        """Tạo bộ HTTP headers chuẩn của trình duyệt gửi tới VCB Digibank API."""
        req_id = request_id or str(self.get_microtime()) + "22"
        return {
            "Host": "digiapp.vietcombank.com.vn",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi",
            "Content-Type": "application/json;charset=utf-8",
            "Referer": f"{self.WEB_ORIGIN}/",
            "Origin": self.WEB_ORIGIN,
            "X-Channel": "Web",
            "X-Request-ID": req_id,
            "Connection": "keep-alive",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 Edg/85.0.564.13"
            ),
            "sec-ch-ua": '"Chromium";v="104", " Not A;Brand";v="99", "Google Chrome";v="104"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "Authorization": "Bearer null",
        }

    def CURL(self, action: str, header: Optional[Dict[str, str]], data: Union[str, dict]) -> str:
        """
        Thực hiện HTTP POST/GET đến VCB Digibank và tự động giải mã phản hồi.
        Tương đương hàm CURL($Action, $header, $data) trong vcb.php.
        """
        headers = header or self._get_headers()

        # Chuẩn bị payload dạng chuỗi JSON
        if isinstance(data, dict):
            body_json = json.dumps(data)
        else:
            body_json = str(data) if data else ""

        try:
            if body_json:
                res = self.session.post(action, headers=headers, data=body_json, timeout=self.timeout)
            else:
                res = self.session.get(action, headers=headers, timeout=self.timeout)

            # Nếu máy chủ trả về JSON dạng {"k": "...", "d": "..."}
            try:
                res_json = res.json()
                if isinstance(res_json, dict) and "d" in res_json:
                    k_b64 = res_json.get("k", "")
                    d_b64 = res_json["d"]
                    decrypted_text = decryptResponse(k_b64, d_b64)
                    return decrypted_text
                # Nếu trả về JSON thuần (không mã hóa hoặc báo lỗi)
                return json.dumps(res_json, ensure_ascii=False)
            except ValueError:
                # Không phải JSON
                return res.text
        except Exception as e:
            return json.dumps({"code": "9999", "des": f"Lỗi kết nối máy chủ VCB: {str(e)}"}, ensure_ascii=False)

    # =========================================================================
    # CAPTCHA MANAGEMENT (Tương thích vcb.php & mở rộng OCR)
    # =========================================================================

    def get_captcha(self, captcha_id: Optional[str] = None) -> bytes:
        """
        Tải ảnh captcha từ VCB CDN (utility-service/v1/captcha/{captcha_id}).
        Nếu không truyền captcha_id, tự động sinh mã UUID ngẫu nhiên.
        Tương đương get_captcha($captcha_id) trong vcb.php.
        """
        cid = captcha_id or self.gen_uuid()
        url = f"{self.BASE_URL}/utility-service/v1/captcha/{cid}"
        headers = {
            "Connection": "keep-alive",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/85.0.4183.26 Safari/537.36 Edg/85.0.564.13"
            ),
            "Accept": "image/webp,image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Dest": "image",
            "Referer": f"{self.WEB_ORIGIN}/",
            "Accept-Language": "en-US,en;q=0.9",
        }
        res = self.session.get(url, headers=headers, timeout=self.timeout)
        return res.content

    def save_captcha(self, value: bytes) -> str:
        """
        Lưu ảnh captcha vào thư mục captcha/.
        Tương đương save_captcha($value) trong vcb.php.
        """
        import os
        os.makedirs("captcha", exist_ok=True)
        rand = self.random("QWERTYUIOPASDFGHJKLZXCVBNM0123456789", 6)
        filepath = f"captcha/{rand}.jpeg"
        with open(filepath, "wb") as f:
            f.write(value)
        return filepath

    def getCaptcha(self, key_captcha: Optional[str] = None) -> str:
        """
        Lấy captcha và giải tự động qua dịch vụ OCR (thueapibank.vn).
        Trả về JSON dạng:
          {"status": "success", "data": {"captcha_id": "<token>", "captcha": "<text>"}}
        Tương thích hoàn toàn cách gọi trong vcb.php và ajaxs/client/vcb.php!
        """
        api_key = key_captcha or self.key_captcha
        captcha_token = self.gen_uuid()

        # 1. Tải ảnh captcha trực tiếp từ VCB
        try:
            img_bytes = self.get_captcha(captcha_token)
            if not img_bytes:
                return json.dumps({
                    "status": "error",
                    "msg": "Không tải được ảnh captcha từ Vietcombank",
                }, ensure_ascii=False)
            img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        except Exception as e:
            return json.dumps({
                "status": "error",
                "msg": f"Lỗi tải captcha VCB: {str(e)}",
            }, ensure_ascii=False)

        # 2. Ưu tiên giải tự động 100% OFFLINE (Không qua bất kỳ bên thứ 3 nào)
        try:
            import captcha_solver
            local_solved = captcha_solver.solve_captcha(img_bytes)
            if local_solved and len(str(local_solved).strip()) >= 3:
                return json.dumps({
                    "status": "success",
                    "data": {
                        "captcha_id": captcha_token,
                        "captcha": str(local_solved).strip(),
                    },
                }, ensure_ascii=False)
        except Exception:
            pass

        # 3. Fallback dịch vụ ngoài nếu có cấu hình
        try:
            url = getattr(self, "captcha_url", None) or os.environ.get("CAPTCHA_API_URL", "").strip() or self.DEFAULT_CAPTCHA_URL
            if not api_key or not url:
                return json.dumps({
                    "status": "error",
                    "msg": "Không thể giải mã captcha VCB (Local OCR không nhận diện được)",
                }, ensure_ascii=False)
            ocr_res = requests.post(
                url,
                data={
                    "api_key": api_key,
                    "access_token": api_key,
                    "type": "vcb",
                    "base64": img_b64,
                },
                timeout=12,
            )
            data = ocr_res.json()
            captcha_text = (
                data.get("captcha")
                or data.get("data", {}).get("captcha")
                or ""
            )

            if captcha_text:
                return json.dumps({
                    "status": "success",
                    "data": {
                        "captcha_id": captcha_token,
                        "captcha": str(captcha_text).strip(),
                    },
                }, ensure_ascii=False)
            else:
                return json.dumps({
                    "status": "error",
                    "msg": data.get("msg") or "Không nhận dạng được captcha",
                }, ensure_ascii=False)
        except Exception as e:
            return json.dumps({
                "status": "error",
                "msg": f"Lỗi gọi API giải captcha: {str(e)}",
            }, ensure_ascii=False)

    # =========================================================================
    # CORE BANKING METHODS (Tương thích 100% vcb.php)
    # =========================================================================

    def login(self, username: str, password: str, captcha_token: str, captcha_value: str) -> str:
        """
        Đăng nhập vào tài khoản VCB Digibank (mid: 6).
        Tương đương login($username, $password, $captcha_token, $captcha_value) trong vcb.php.
        """
        url = f"{self.BASE_URL}/authen-service/v1/login"
        headers = self._get_headers()

        browser_id = hashlib.md5(username.encode("utf-8")).hexdigest()
        data = {
            "DT": "Windows",
            "OV": "10",
            "PM": "Chrome 104.0.0.0",
            "captchaToken": str(captcha_token),
            "captchaValue": str(captcha_value),
            "browserId": browser_id,
            "checkAcctPkg": "1",
            "lang": "vi",
            "mid": 6,
            "password": str(password),
            "user": str(username),
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        response_str = self.CURL(url, headers, json.dumps(encrypt_payload))

        # Cập nhật thông tin phiên nếu đăng nhập thành công
        try:
            res_obj = json.loads(response_str)
            if res_obj.get("code") == "00":
                self.sessionId = res_obj.get("sessionId", "")
                self.session_id = self.sessionId
                self.accessKey = res_obj.get("accessKey", "")
                self.access_key = self.accessKey
                user_info = res_obj.get("userInfo", {})
                self.user_info = user_info
                self.cif = user_info.get("cif", "")
                self.clientId = user_info.get("clientId", "")
                self.client_id = self.clientId
                self.mobileId = user_info.get("mobileId", "")
                self.mobile_id = self.mobileId
                self.display_name = user_info.get("cusName", "")
            elif "browserToken" in res_obj:
                self.browserToken = res_obj.get("browserToken", "")
                self.accountNo = username
        except Exception:
            pass

        return response_str

    def initLoginNewBrowser(self) -> str:
        """
        Khởi tạo bước đăng nhập trên trình duyệt/thiết bị mới (mid: 3008).
        Tương đương initLoginNewBrowser() trong vcb.php.
        """
        url = f"{self.BASE_URL}/authen-service/v1/api-3008"
        headers = self._get_headers()

        data = {
            "user": self.accountNo or self.username,
            "browserToken": self.browserToken,
            "mid": 3008,
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        response_str = self.CURL(url, headers, json.dumps(encrypt_payload))

        try:
            res_obj = json.loads(response_str)
            if res_obj.get("code") == "00":
                tran_id = res_obj.get("transaction", {}).get("tranId", "")
                if tran_id:
                    self.tranId = tran_id
        except Exception:
            pass

        return response_str

    def get_otp(self) -> str:
        """
        Yêu cầu gửi mã OTP về số điện thoại đăng ký (mid: 3010).
        Tương đương get_otp() trong vcb.php.
        """
        url = f"{self.BASE_URL}/authen-service/v1/api-3010"
        headers = self._get_headers()

        data = {
            "DT": "Windows",
            "OV": "10",
            "PM": "Chrome 104.0.0.0",
            "user": self.accountNo or self.username,
            "tranId": self.tranId,
            "type": "1",
            "browserToken": self.browserToken,
            "mid": 3010,
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        return self.CURL(url, headers, json.dumps(encrypt_payload))

    def veryOtpLoginNewBrowser(
        self, otp: str, user: str, tranId: str, browserToken: str
    ) -> str:
        """
        Xác thực mã OTP để kích hoạt đăng nhập trình duyệt mới (mid: 3011).
        Tương đương veryOtpLoginNewBrowser($otp, $user, $tranId, $browserToken) trong vcb.php.
        """
        url = f"{self.BASE_URL}/authen-service/v1/api-3011"
        headers = self._get_headers()

        data = {
            "DT": "Windows",
            "OV": "10",
            "PM": "Chrome 104.0.0.0",
            "user": user,
            "tranId": tranId,
            "browserToken": browserToken,
            "otp": otp,
            "mid": 3011,
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        response_str = self.CURL(url, headers, json.dumps(encrypt_payload))

        try:
            res_obj = json.loads(response_str)
            if res_obj.get("code") == "00":
                self.sessionId = res_obj.get("sessionId", "")
                self.session_id = self.sessionId
                self.accessKey = res_obj.get("accessKey", "")
                self.access_key = self.accessKey
                user_info = res_obj.get("userInfo", {})
                self.user_info = user_info
                self.cif = user_info.get("cif", "")
                self.clientId = user_info.get("clientId", "")
                self.client_id = self.clientId
                self.mobileId = user_info.get("mobileId", "")
                self.mobile_id = self.mobileId
                self.display_name = user_info.get("cusName", "")

                # Tự động lưu trình duyệt mới
                self.saveLoginNewBrowser(
                    user, self.cif, self.clientId, self.mobileId, self.sessionId
                )
        except Exception:
            pass

        return response_str

    def saveLoginNewBrowser(
        self, user: str, cif: str, clientId: str, mobileId: str, sessionId: str
    ) -> str:
        """
        Lưu thông tin trình duyệt tin cậy (mid: 3009).
        Tương đương saveLoginNewBrowser(...) trong vcb.php.
        """
        url = f"{self.BASE_URL}/authen-service/v1/api-3009"
        headers = self._get_headers()

        browser_id = hashlib.md5(user.encode("utf-8")).hexdigest()
        data = {
            "DT": "Windows",
            "OV": "10",
            "PM": "Chrome 104.0.0.0",
            "user": user,
            "browserId": browser_id,
            "browserName": f"Chrome {user}",
            "mid": 3009,
            "cif": cif,
            "clientId": clientId,
            "mobileId": mobileId,
            "sessionId": sessionId,
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        return self.CURL(url, headers, json.dumps(encrypt_payload))

    def get_balance(
        self,
        username: Optional[str] = None,
        account: Optional[str] = None,
        session_id: Optional[str] = None,
        cif: Optional[str] = None,
        client_id: Optional[str] = None,
        mobile_id: Optional[str] = None,
    ) -> str:
        """
        Vấn tin số dư chi tiết của tài khoản VCB (mid: 13).
        Tương đương get_balance($username, $account, $session_id, $cif, $client_id, $mobile_id).
        Hỗ trợ gọi không tham số nếu instance đã có phiên đăng nhập.
        """
        url = f"{self.BASE_URL}/bank-service/v1/get-account-detail"
        headers = self._get_headers()

        acc = account or self.accountNo or self.username
        user = username or self.username or acc
        sess = session_id or self.sessionId or self.session_id
        cif_val = cif or self.cif
        cid = client_id or self.clientId or self.client_id
        mid_val = mobile_id or self.mobileId or self.mobile_id

        data = {
            "DT": "Windows",
            "PM": "Chrome 104.0.0.0",
            "OV": "10",
            "lang": "vi",
            "accountNo": str(acc),
            "accountType": "D",
            "mid": 13,
            "cif": str(cif_val),
            "user": str(user),
            "mobileId": str(mid_val),
            "clientId": str(cid),
            "sessionId": str(sess),
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        return self.CURL(url, headers, json.dumps(encrypt_payload))

    def get_lsgd(
        self,
        username: Optional[str] = None,
        account: Optional[str] = None,
        session_id: Optional[str] = None,
        cif: Optional[str] = None,
        client_id: Optional[str] = None,
        mobile_id: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> str:
        """
        Lấy lịch sử giao dịch chi tiết (mid: 14).
        Tương đương get_lsgd($username, $account, $session_id, $cif, $client_id, $mobile_id).
        Thời gian mặc định: 30 ngày gần nhất (định dạng dd/mm/YYYY).
        """
        url = f"{self.BASE_URL}/bank-service/v1/transaction-history"
        headers = self._get_headers()

        acc = account or self.accountNo or self.username
        user = username or self.username or acc
        sess = session_id or self.sessionId or self.session_id
        cif_val = cif or self.cif
        cid = client_id or self.clientId or self.client_id
        mid_val = mobile_id or self.mobileId or self.mobile_id

        now = datetime.now()
        f_date = from_date or (now - timedelta(days=29)).strftime("%d/%m/%Y")
        t_date = to_date or now.strftime("%d/%m/%Y")

        data = {
            "DT": "Windows",
            "PM": "Chrome 104.0.0.0",
            "OV": "10",
            "lang": "vi",
            "accountNo": str(acc),
            "accountType": "D",
            "fromDate": f_date,
            "toDate": t_date,
            "pageIndex": 0,
            "lengthInPage": 999999,
            "stmtDate": "",
            "stmtType": "",
            "mid": 14,
            "cif": str(cif_val),
            "user": str(user),
            "mobileId": str(mid_val),
            "clientId": str(cid),
            "sessionId": str(sess),
        }

        encrypt_payload = encryptRequest(self.gen_uuid(), data)
        return self.CURL(url, headers, json.dumps(encrypt_payload))

    # =========================================================================
    # HÀM MỞ RỘNG CHUẨN HÓA 7BANK GATEWAY
    # =========================================================================

    def verify_login(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        account_number: Optional[str] = None,
        captcha_token: Optional[str] = None,
        captcha_value: Optional[str] = None,
        key_captcha: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Xác thực đăng nhập tài khoản Vietcombank (chuẩn hóa cho 7Bank Gateway).
        Tự động giải captcha qua OCR nếu chưa truyền captcha_value.
        Tự động nhận diện trường hợp yêu cầu xác thực OTP trên trình duyệt mới.

        :return: Dict kết quả chuẩn hóa:
            {
                "success": bool,
                "accountName": str,
                "sessionData": dict,
                "message": str,
                "raw": dict
            }
        """
        user = username or self.username or self.accountNo
        pwd = password or self.password
        stk = account_number or self.accountNo or user
        c_token = captcha_token
        c_val = captcha_value
        ocr_key = key_captcha or self.key_captcha

        if not user or not pwd:
            return {
                "success": False,
                "message": "Thiếu tên đăng nhập hoặc mật khẩu Vietcombank",
                "raw": None,
            }

        # Nếu chưa có captcha, tự động giải captcha qua OCR
        if not c_val or not c_token:
            captcha_res_str = self.getCaptcha(ocr_key)
            try:
                captcha_json = json.loads(captcha_res_str)
                if captcha_json.get("status") == "success":
                    c_token = captcha_json["data"]["captcha_id"]
                    c_val = captcha_json["data"]["captcha"]
                else:
                    return {
                        "success": False,
                        "message": f"Không thể giải mã captcha: {captcha_json.get('msg', 'Lỗi không xác định')}",
                        "raw": captcha_json,
                    }
            except Exception as e:
                return {
                    "success": False,
                    "message": f"Lỗi giải mã captcha: {str(e)}",
                    "raw": captcha_res_str,
                }

        # Thực hiện gọi login
        login_res_str = self.login(user, pwd, c_token, c_val)
        try:
            login_data = json.loads(login_res_str)
        except Exception:
            return {
                "success": False,
                "message": f"Máy chủ trả về phản hồi không hợp lệ: {login_res_str}",
                "raw": login_res_str,
            }

        code = str(login_data.get("code", ""))

        # Trường hợp 1: Đăng nhập thành công ngay
        if code == "00":
            user_info = login_data.get("userInfo", {})
            cus_name = user_info.get("cusName", "Chủ tài khoản Vietcombank")
            self.display_name = cus_name
            self.accountNo = stk

            return {
                "success": True,
                "accountName": cus_name,
                "sessionData": {
                    "sessionId": login_data.get("sessionId", ""),
                    "accessKey": login_data.get("accessKey", ""),
                    "cif": user_info.get("cif", ""),
                    "clientId": user_info.get("clientId", ""),
                    "mobileId": user_info.get("mobileId", ""),
                    "username": user,
                    "account": stk,
                },
                "message": "Đăng nhập Vietcombank thành công",
                "raw": login_data,
            }

        # Trường hợp 2: Trình duyệt mới cần kích hoạt OTP (browserToken)
        if "browserToken" in login_data:
            self.accountNo = user
            self.browserToken = login_data["browserToken"]
            init_res = self.initLoginNewBrowser()
            try:
                init_data = json.loads(init_res)
                if init_data.get("code") == "00":
                    self.tranId = init_data.get("transaction", {}).get("tranId", "")
                    otp_req = self.get_otp()
                    try:
                        otp_data = json.loads(otp_req)
                        if otp_data.get("code") == "00":
                            return {
                                "success": False,
                                "requiresOtp": True,
                                "message": "Đã gửi mã OTP về số điện thoại đăng ký. Vui lòng xác thực OTP để lưu trình duyệt.",
                                "browserToken": self.browserToken,
                                "tranId": self.tranId,
                                "raw": otp_data,
                            }
                    except Exception:
                        pass
            except Exception:
                pass

        # Trường hợp 3: Báo lỗi từ VCB
        des = login_data.get("des") or login_data.get("message") or "Đăng nhập thất bại"
        if code == "0111":
            des = "Mã captcha không chính xác, vui lòng thử lại."
        elif code == "3005" or code == "105":
            des = "Tên đăng nhập hoặc mật khẩu Vietcombank không chính xác."

        return {
            "success": False,
            "message": f"[{code}] {des}",
            "raw": login_data,
        }

    def get_formatted_history(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        account_number: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Lấy và chuẩn hóa danh sách lịch sử giao dịch cho 7Bank Gateway.

        :return: Dict chuẩn hóa:
            {
                "status": "success" | "error",
                "bank": "vcb",
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
        raw_res = self.get_lsgd(
            username=self.username,
            account=account_number or self.accountNo,
            session_id=self.sessionId,
            cif=self.cif,
            client_id=self.clientId,
            mobile_id=self.mobileId,
            from_date=from_date,
            to_date=to_date,
        )

        try:
            data = json.loads(raw_res)
        except Exception:
            return {
                "status": "error",
                "bank": "vcb",
                "message": f"Không thể giải mã phản hồi lịch sử: {raw_res}",
            }

        if data.get("code") != "00":
            # Tự động đăng nhập lại nếu phiên hết hạn
            if self.username and self.password:
                relogin = self.verify_login(
                    username=self.username,
                    password=self.password,
                    account_number=self.accountNo or account_number,
                    key_captcha=self.key_captcha
                )
                if relogin.get("success"):
                    raw_res = self.get_lsgd(
                        username=self.username,
                        account=account_number or self.accountNo,
                        session_id=self.sessionId,
                        cif=self.cif,
                        client_id=self.clientId,
                        mobile_id=self.mobileId,
                        from_date=from_date,
                        to_date=to_date,
                    )
                    try:
                        data = json.loads(raw_res)
                    except Exception:
                        pass

        if data.get("code") != "00":
            return {
                "status": "error",
                "bank": "vcb",
                "code": data.get("code"),
                "message": data.get("des") or "Không thể lấy lịch sử giao dịch",
                "raw": data,
            }

        raw_txs = data.get("transactions") or []
        formatted_list: List[Dict[str, Any]] = []

        for tx in raw_txs:
            # Nhận dạng tiền vào hay ra: CD = Credit (+) / Debit (-)
            cd_type = tx.get("CD", "").upper()
            is_credit = cd_type == "+" or cd_type == "CR" or cd_type == "C"

            # Parse số tiền
            raw_amount = str(tx.get("Amount", "0")).replace(",", "").replace(".", "").strip()
            try:
                # VCB thường trả về số tiền định dạng thập phân hoặc chuỗi số
                amount_clean = float(str(tx.get("Amount", "0")).replace(",", ""))
            except Exception:
                amount_clean = 0.0

            # Parse số dư sau giao dịch
            try:
                balance_after = float(str(tx.get("Balance", "0")).replace(",", ""))
            except Exception:
                balance_after = 0.0

            formatted_list.append({
                "transaction_id": tx.get("Reference", "") or tx.get("TranId", ""),
                "amount": amount_clean,
                "type": "IN" if is_credit else "OUT",
                "date": tx.get("TransactionDate", "") or tx.get("PostingDate", ""),
                "description": tx.get("Description", "") or tx.get("Remark", ""),
                "balance_after": balance_after,
                "raw": tx,
            })

        return {
            "status": "success",
            "bank": "vcb",
            "total": len(formatted_list),
            "transactions": formatted_list,
        }

    def getBalance(self, account_number: Optional[str] = None) -> Dict[str, Any]:
        """
        Vấn tin số dư tài khoản trả về dictionary chuẩn hóa.
        """
        raw_res = self.get_balance(account=account_number or self.accountNo)
        try:
            data = json.loads(raw_res)
            if data.get("code") == "00":
                # Tìm số dư trong detail
                bal = (
                    data.get("accountDetail", {}).get("availableBalance")
                    or data.get("accountDetail", {}).get("currentBalance")
                    or data.get("availableBalance")
                    or data.get("balance")
                    or 0
                )
                return {
                    "status": "success",
                    "bank": "vcb",
                    "account": account_number or self.accountNo,
                    "balance": float(str(bal).replace(",", "")),
                    "raw": data,
                }
            return {
                "status": "error",
                "bank": "vcb",
                "message": data.get("des") or "Không thể lấy số dư",
                "raw": data,
            }
        except Exception as e:
            return {
                "status": "error",
                "bank": "vcb",
                "message": f"Lỗi đọc số dư: {str(e)}",
                "raw": raw_res,
            }


# =============================================================================
# CLI TEST RUNNER
# =============================================================================

def main():
    """Hàm chạy dòng lệnh để kiểm thử API Vietcombank."""
    print("=" * 70)
    print("  7BANK GATEWAY - VIETCOMBANK (VCB DIGIBANK) API CLIENT")
    print("=" * 70)

    if len(sys.argv) < 3:
        print("\nSử dụng:")
        print("  python vcb.py <username> <password> [account_number] [key_captcha]")
        print("\nVí dụ:")
        print("  python vcb.py 0987654321 MyPassword123@ 1012345678 d978a2a5b9566e49bf672fb876d5568c\n")
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    account_number = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith("d978") else username
    key_captcha = sys.argv[4] if len(sys.argv) > 4 else ("d978a2a5b9566e49bf672fb876d5568c" if sys.argv[-1].startswith("d978") else "")

    print(f"\n[+] Tên đăng nhập: {username}")
    print(f"[+] Số tài khoản:  {account_number}")
    if key_captcha:
        print(f"[+] Key Captcha:   {key_captcha}")

    client = VCB(
        username=username,
        password=password,
        account_number=account_number,
        key_captcha=key_captcha,
    )

    print("\n[*] Đang xác thực thông tin đăng nhập và giải captcha...")
    res = client.verify_login()

    if res.get("success"):
        print(f"[+] ĐĂNG NHẬP THÀNH CÔNG!")
        print(f"[+] Chủ tài khoản: {res.get('accountName')}")
        session_data = res.get("sessionData", {})
        print(f"[+] Session ID:    {session_data.get('sessionId')[:25]}...")
        print(f"[+] CIF:           {session_data.get('cif')}")

        print("\n[*] Đang lấy số dư tài khoản...")
        bal_res = client.getBalance()
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

    elif res.get("requiresOtp"):
        print("\n[!] YÊU CẦU XÁC THỰC TRÌNH DUYỆT MỚI BẰNG OTP!")
        print(f"[!] Thông báo: {res.get('message')}")
        otp = input("\n[?] Nhập mã OTP nhận được trên điện thoại: ").strip()
        if otp:
            print("[*] Đang xác thực OTP...")
            otp_res = client.veryOtpLoginNewBrowser(
                otp=otp,
                user=username,
                tranId=res.get("tranId", ""),
                browserToken=res.get("browserToken", ""),
            )
            print(f"[*] Kết quả xác thực OTP: {otp_res}")
    else:
        print(f"\n[-] ĐĂNG NHẬP THẤT BẠI: {res.get('message')}")
        print(f"[-] Chi tiết: {json.dumps(res.get('raw'), ensure_ascii=False, indent=2)}")


if __name__ == "__main__":
    main()
