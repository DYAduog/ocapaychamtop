#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
UNOFFICIAL API TECHCOMBANK (Techcombank Online Banking API Client)
Chuyển đổi từ Node.js (MSTRVN.DEV) sang Python 3.
Tương thích hoàn toàn với hệ thống cổng thanh toán 7Bank Gateway.

Hỗ trợ:
  - Sinh mã PKCE Code Verifier & Challenge (S256)
  - Khởi tạo phiên OpenID Connect / OAuth 2.0 Keycloak Backbase
  - Tự động chuẩn hóa endpoint identity-tcb vượt Akamai WAF
  - Đăng nhập tài khoản & xử lý Out-Of-Band (OOB) Smart OTP polling
  - Đổi Authorization Code lấy Access Token & Refresh Token
  - Tra cứu danh sách tài khoản (Arrangements) & số dư
  - Lấy lịch sử giao dịch (Transactions) và lưu file JSON
=============================================================================
"""

import base64
import hashlib
import html
import json
import os
import re
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import parse_qs, unquote, urlencode, urlparse

import requests

# Hỗ trợ hiển thị UTF-8 trên Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BANNER = """
        *      ███╗   ███╗███████╗████████╗██████╗ ██╗   ██╗███╗   ██╗      *
        *      ████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██║   ██║████╗  ██║      *
        *      ██╔████╔██║███████╗   ██║   ██████╔╝██║   ██║██╔██╗ ██║      *
        *      ██║╚██╔╝██║╚════██║   ██║   ██╔══██╗╚██╗ ██╔╝██║╚██╗██║      *
        *      ██║ ╚═╝ ██║███████║   ██║   ██║  ██║ ╚████╔╝ ██║ ╚████║      *
        *      ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝  ╚═══╝  ╚═╝  ╚═══╝      *
        *                                                                   *
        *          UNOFFICIAL API TECHCOMBANK  - DEVELOPED BY MSTRVN        *
        *                                                                   *
        *                    Author: MSTRVN.DEV                             *
        *********************************************************************
"""

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
)

VN_TZ = timezone(timedelta(hours=7))


def get_current_date_in_hcm() -> datetime:
    """Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)."""
    return datetime.now(VN_TZ)


def format_date_in_hcm(dt: datetime, date_format: str = "%Y-%m-%d") -> str:
    """Format đối tượng datetime theo múi giờ Hồ Chí Minh."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=VN_TZ)
    else:
        dt = dt.astimezone(VN_TZ)
    return dt.strftime(date_format)


def sub_days(dt: datetime, days: int) -> datetime:
    """Trừ số ngày từ datetime hiện tại."""
    return dt - timedelta(days=days)


def add_days(dt: datetime, days: int) -> datetime:
    """Cộng số ngày từ datetime hiện tại."""
    return dt + timedelta(days=days)



def get_user_agent() -> str:
    """User-Agent tiêu chuẩn của trình duyệt."""
    return DEFAULT_USER_AGENT


def generate_code_verifier_and_challenge() -> Tuple[str, str]:
    """
    Sinh mã code_verifier và code_challenge chuẩn PKCE (RFC 7636).
    Độ dài verifier: 60 ký tự alphanumeric ngẫu nhiên.
    Challenge: Base64URL(SHA256(verifier)).
    """
    chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    verifier = "".join(secrets.choice(chars) for _ in range(60))
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def normalize_tcb_url(url: str) -> str:
    """
    Chuẩn hóa URL domain Techcombank:
    Chuyển identitym-tcb (domain mobile bị Akamai chặn khi gọi từ client web/desktop)
    thành identity-tcb (domain web chính thức).
    """
    if "identitym-tcb.techcombank.com.vn" in url:
        return url.replace("identitym-tcb.techcombank.com.vn", "identity-tcb.techcombank.com.vn")
    return url


def extract_form_action_url(html_content: str) -> Optional[str]:
    """
    Trích xuất action URL từ form đăng nhập HTML.
    Ưu tiên tìm form có id="kc-form-login", nếu không tìm form đầu tiên.
    """
    patterns = [
        r'<form[^>]+id=["\']kc-form-login["\'][^>]+action=["\']([^"\']+)["\']',
        r'<form[^>]+action=["\']([^"\']+)["\'][^>]+id=["\']kc-form-login["\']',
        r'<form[^>]+action=["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html_content, re.IGNORECASE)
        if match:
            url_str = match.group(1)
            raw_url = html.unescape(url_str)
            return normalize_tcb_url(raw_url)
    return None


def extract_decoded_url(html_content: str) -> Optional[str]:
    """
    Trích xuất action URL từ form phản hồi sau đăng nhập (chuyển sang bước OOB xác nhận).
    Tương đương extractDecodedUrl trong bản Node.js.
    """
    regex = r'<form[^>]*action="([^"]+)"'
    match = re.search(regex, html_content, re.IGNORECASE)
    if match and match.group(1):
        url_str = unquote(match.group(1))
        url_str = url_str.replace("&amp;", "&")
        return normalize_tcb_url(url_str)
    return None


def extract_login_error_message(html_content: str) -> Optional[str]:
    """
    Trích xuất thông báo lỗi hiển thị trên trang đăng nhập Keycloak (nếu có).
    Bỏ qua các element ẩn (display-none, tc-login-denied, invalidEmail, emptyEmail).
    """
    # Loại bỏ các template ẩn chứa id="tc-login-denied" hoặc display-none hoặc invalidEmail/emptyEmail
    clean_html = re.sub(
        r'<div[^>]*id=["\']tc-login-denied["\'][^>]*>.*?</div>\s*</div>',
        '',
        html_content,
        flags=re.IGNORECASE | re.DOTALL,
    )
    clean_html = re.sub(
        r'<[^>]+id=["\'](?:invalidEmail|emptyEmail)["\'][^>]*>.*?</[^>]+>',
        '',
        clean_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    clean_html = re.sub(
        r'<[^>]+style=["\'][^"\']*display\s*:\s*none[^"\']*["\'][^>]*>.*?</[^>]+>',
        '',
        clean_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    clean_html = re.sub(
        r'<div[^>]*display-none[^>]*>.*?</div>',
        '',
        clean_html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    title_match = re.search(
        r'<span[^>]+class=["\'][^"\']*message-title[^"\']*["\'][^>]*>(.*?)</span>',
        clean_html,
        re.IGNORECASE | re.DOTALL,
    )
    if title_match:
        clean = re.sub(r'<[^>]+>', '', title_match.group(1)).strip()
        if clean and clean != "Yêu cầu bị từ chối" and "email" not in clean.lower():
            return html.unescape(clean)

    patterns = [
        r'<label[^>]+class=["\'][^"\']*kc-feedback-text[^"\']*["\'][^>]*>(.*?)</label>',
        r'<span[^>]+class=["\'][^"\']*kc-feedback-text[^"\']*["\'][^>]*>(.*?)</span>',
        r'<div[^>]+class=["\'][^"\']*alert-error[^"\']*["\'][^>]*>(.*?)</div>',
        r'<div[^>]+class=["\'][^"\']*alert-warning[^"\']*["\'][^>]*>(.*?)</div>',
    ]
    for pattern in patterns:
        match = re.search(pattern, clean_html, re.IGNORECASE | re.DOTALL)
        if match:
            clean_text = re.sub(r"<[^>]+>", " ", match.group(1)).strip()
            clean_text = " ".join(clean_text.split())
            if (
                clean_text
                and not clean_text.lower().startswith("invalid email")
                and "địa chỉ email" not in clean_text.lower()
                and "từ chối" not in clean_text.lower()
            ):
                return html.unescape(clean_text)
    return None


class Techcombank:
    """
    Techcombank Online Banking API Client.
    Cung cấp giao diện hướng đối tượng và tương thích hoàn toàn hệ thống 7Bank Gateway.
    """

    AUTH_BASE_URL = "https://identity-tcb.techcombank.com.vn"
    ONLINE_BANKING_URL = "https://onlinebanking.techcombank.com.vn"
    CLIENT_ID = "tcb-web-client"
    REDIRECT_URI = "https://onlinebanking.techcombank.com.vn/redirect"

    def __init__(
        self,
        username: str = "",
        password: str = "",
        account_number: Optional[str] = None,
        arrangement_id: Optional[str] = None,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        poll_timeout: int = 120,
        poll_interval: int = 2,
    ):
        self.username = username
        self.password = password
        self.account_number = account_number
        self.arrangement_id = arrangement_id
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.poll_timeout = poll_timeout
        self.poll_interval = poll_interval

        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": get_user_agent(),
            "Accept-Language": "en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7,zh;q=0.6",
        })

    def short_url_breaker(self, url: str) -> str:
        """Theo dõi redirect để lấy URL đầy đủ cuối cùng."""
        print("Breaking shortened URL:", url)
        res = self.session.get(
            url,
            headers={"User-Agent": get_user_agent()},
            allow_redirects=True,
            timeout=25,
        )
        return res.url or url

    def resolve_url_and_get_cookies(self, url: str) -> Dict[str, Any]:
        """STEP 1: Giải quyết URL ban đầu và lấy cookie khởi tạo."""
        print("STEP 1: Resolving URL and collecting initial cookies...")
        res = self.session.head(
            url,
            headers={"User-Agent": get_user_agent()},
            allow_redirects=True,
            timeout=25,
        )
        final_url = res.url or url
        cookies = [f"{c.name}={c.value}" for c in self.session.cookies]
        print("Resolved URL:", final_url)
        print("Cookies:", cookies if cookies else "No cookies found")
        return {"url": final_url, "cookies": cookies}

    def get_login_form_details(self, url: str) -> Dict[str, Any]:
        """STEP 2: Tải trang đăng nhập và trích xuất các tham số form."""
        print("\nSTEP 2: Fetching login form details...")
        res = self.session.get(url, timeout=25)
        action_url = extract_form_action_url(res.text)
        if not action_url:
            raise ValueError("Could not find login form in HTML")

        action_url = normalize_tcb_url(action_url)
        parsed_url = urlparse(action_url)
        query_params = parse_qs(parsed_url.query)

        form_data = {
            "session_code": query_params.get("session_code", [""])[0],
            "execution": query_params.get("execution", [""])[0],
            "client_id": query_params.get("client_id", [""])[0],
            "tab_id": query_params.get("tab_id", [""])[0],
            "kc_locale": query_params.get("kc_locale", [""])[0],
            "username": self.username,
            "password": self.password,
            "threatMetrixBrowserType": "DESKTOP_BROWSER",
        }

        print("Action URL:", action_url)
        cookies = [f"{c.name}={c.value}" for c in self.session.cookies]
        print("New cookies:", cookies)

        return {
            "actionUrl": action_url,
            "formData": form_data,
            "cookies": cookies,
        }

    def submit_login_credentials(self, action_url: str, form_data: Dict[str, str]) -> str:
        """STEP 3: Gửi thông tin tài khoản & mật khẩu lên máy chủ xác thực."""
        print("\nSTEP 3: Submitting login credentials...")
        action_url = normalize_tcb_url(action_url)
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
            "User-Agent": get_user_agent(),
            "Origin": "https://identity-tcb.techcombank.com.vn",
        }

        res = self.session.post(
            action_url,
            data=form_data,
            headers=headers,
            allow_redirects=False,
            timeout=25,
        )

        print("Login submission status:", res.status_code)
        if res.status_code in (302, 303, 307):
            loc = res.headers.get("Location") or res.headers.get("location")
            if loc:
                loc_norm = normalize_tcb_url(loc)
                print("Login redirected to:", loc_norm)
                if "code=" in loc_norm:
                    return f'<div id="redirect-code" data-url="{loc_norm}"></div>'
                res = self.session.get(loc_norm, headers={"User-Agent": get_user_agent()}, timeout=25)
                print("Followed redirect, new status:", res.status_code)
        return res.text

    def poll_for_confirmation(self, url: str, verifier: str) -> Dict[str, Any]:
        """
        STEP 4-7: Chờ xác thực Out-Of-Band (Smart OTP / App Techcombank)
        và đổi mã lấy Access Token.
        """
        print("\nSTEP 4: Polling for confirmation...")
        current_url = normalize_tcb_url(url)
        start_time = time.time()
        confirmed_data = None

        print("Using provided code_verifier:", verifier)
        print("=" * 60)
        print(f"[*] THÔNG BÁO: Techcombank đã gửi yêu cầu xác thực về điện thoại!")
        print(f"[*] VUI LÒNG MỞ APP TECHCOMBANK TRÊN ĐIỆN THOẠI VÀ BẤM 'XÁC NHẬN'")
        print(f"[*] Đang chờ xác nhận (Timeout: {self.poll_timeout} giây)...")
        print("=" * 60)

        poll_count = 0
        while (time.time() - start_time) < self.poll_timeout:
            try:
                poll_count += 1
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                    "User-Agent": get_user_agent(),
                    "Origin": self.AUTH_BASE_URL,
                    "Referer": current_url,
                }
                res = self.session.post(
                    current_url,
                    data="oob-authn-action=confirmation-poll",
                    headers=headers,
                    allow_redirects=False,
                    timeout=20,
                )

                # Kiểm tra xem có redirect (đã xác thực thành công) hay không
                if res.status_code in (302, 303, 307):
                    loc = res.headers.get("Location") or res.headers.get("location")
                    if loc:
                        print(f"\n[+] TRẠNG THÁI: CONFIRMED qua Redirect Location: {loc}")
                        confirmed_data = {"status": "CONFIRMED", "redirectLocation": loc}
                        break

                data = None
                try:
                    data = res.json()
                except Exception:
                    clean_text = (res.text or "").strip()
                    if clean_text.startswith("{") and clean_text.endswith("}"):
                        try:
                            data = json.loads(clean_text)
                        except Exception:
                            data = None

                elapsed = int(time.time() - start_time)

                if isinstance(data, dict):
                    status = data.get("status")

                    if status == "CONFIRMED":
                        print(f"\n[+] TRẠNG THÁI: CONFIRMED! (Đã bấm xác nhận trên ứng dụng Techcombank)")
                        confirmed_data = data
                        break

                    if status == "PENDING":
                        if data.get("actionUrl"):
                            current_url = normalize_tcb_url(data["actionUrl"])
                        remaining = self.poll_timeout - elapsed
                        print(f"[{elapsed}s / {self.poll_timeout}s] PENDING - Đang chờ bạn mở app Techcombank bấm 'Xác nhận' trên điện thoại... (lần {poll_count})")
                        time.sleep(self.poll_interval)
                        continue

                    if status in ("CANCELLED", "REJECTED", "EXPIRED"):
                        raise RuntimeError(f"Yêu cầu xác nhận bị hủy hoặc hết hạn trên điện thoại: {status}")

                # Nếu phản hồi là HTML (Keycloak re-render hoặc đang chờ xác nhận)
                if res.text:
                    lower_text = res.text.lower()
                    if any(kw in lower_text for kw in ["xác nhận", "xác thực", "pending", "oob", "waiting", "confirmation", "thiết bị"]):
                        new_form_url = extract_form_action_url(res.text) or extract_decoded_url(res.text)
                        if new_form_url:
                            current_url = normalize_tcb_url(new_form_url)
                        print(f"[{elapsed}s / {self.poll_timeout}s] PENDING - Đang chờ bạn mở app Techcombank bấm 'Xác nhận' trên điện thoại... (lần {poll_count})")
                        time.sleep(self.poll_interval)
                        continue

                    if any(kw in lower_text for kw in ["hết hạn", "expired", "bị hủy", "cancelled", "rejected", "từ chối"]):
                        raise RuntimeError("Yêu cầu xác nhận trên điện thoại đã hết hạn hoặc bị từ chối.")

                time.sleep(self.poll_interval)
                continue

            except Exception as e:
                if "PENDING" in str(e) or "Timeout" in str(e):
                    time.sleep(self.poll_interval)
                    continue
                print("Polling error:", str(e))
                raise e

        if not confirmed_data:
            raise TimeoutError(f"Hết thời gian chờ ({self.poll_timeout}s). Bạn chưa mở app Techcombank bấm 'Xác nhận' kịp lúc.")

        print("\nSTEP 5: Processing confirmation response...")
        if confirmed_data.get("redirectLocation"):
            location = confirmed_data["redirectLocation"]
        elif confirmed_data.get("actionUrl"):
            final_url = normalize_tcb_url(confirmed_data["actionUrl"])
            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": get_user_agent(),
                "Origin": self.AUTH_BASE_URL,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }

            final_response = self.session.post(
                final_url,
                data="oob-authn-action=confirmation-continue",
                headers=headers,
                allow_redirects=False,
                timeout=20,
            )

            location = final_response.headers.get("Location") or final_response.headers.get("location")
            if not location:
                raise ValueError("Không tìm thấy đường dẫn chuyển hướng sau khi bấm xác nhận")
        else:
            raise ValueError("Không tìm thấy thông tin xác nhận từ ứng dụng Techcombank")

        print("Redirect location:", location)

        print("\nSTEP 6: Following redirect with GET request...")
        redirect_response = self.session.get(
            location,
            headers={
                "User-Agent": get_user_agent(),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
            },
            allow_redirects=False,
            timeout=20,
        )
        print("Redirect response status:", redirect_response.status_code)

        print("\nSTEP 7: Requesting access token...")
        token_url = f"{self.AUTH_BASE_URL}/auth/realms/backbase/protocol/openid-connect/token"
        parsed_loc = urlparse(location)
        url_params = parse_qs(parsed_loc.query)
        code = url_params.get("code", [""])[0]

        if not code:
            raise ValueError("Không tìm thấy authorization code trong redirect URL")

        token_payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.REDIRECT_URI,
            "code_verifier": verifier,
            "client_id": self.CLIENT_ID,
            "ui_locales": "en-US",
        }

        token_headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": get_user_agent(),
            "Accept": "application/json, text/plain, */*",
            "sec-ch-ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "Origin": self.ONLINE_BANKING_URL,
            "sec-fetch-site": "same-site",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            "Referer": f"{self.ONLINE_BANKING_URL}/",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7,zh;q=0.6",
            "Priority": "u=1, i",
        }

        token_res = self.session.post(
            token_url,
            data=urlencode(token_payload),
            headers=token_headers,
            timeout=25,
        )

        try:
            token_data = token_res.json()
        except Exception:
            try:
                token_data = json.loads(token_res.text.strip())
            except Exception:
                raise RuntimeError(f"Lỗi phản hồi token từ Techcombank (HTTP {token_res.status_code})")

        print("[+] Lấy Access Token thành công!")
        self.access_token = token_data.get("access_token")
        self.refresh_token = token_data.get("refresh_token")
        return token_data

    def refresh_access_token(self, refresh_token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Làm mới Access Token qua Refresh Token (Keycloak OpenID Connect).
        """
        ref = refresh_token or self.refresh_token
        if not ref:
            return None

        token_url = f"{self.AUTH_BASE_URL}/auth/realms/backbase/protocol/openid-connect/token"
        token_payload = {
            "grant_type": "refresh_token",
            "refresh_token": ref,
            "client_id": self.CLIENT_ID,
            "ui_locales": "en-US",
        }
        token_headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": get_user_agent(),
            "Accept": "application/json, text/plain, */*",
            "Origin": self.ONLINE_BANKING_URL,
            "Referer": f"{self.ONLINE_BANKING_URL}/",
        }
        try:
            res = self.session.post(
                token_url,
                data=urlencode(token_payload),
                headers=token_headers,
                timeout=20,
            )
            if res.status_code == 200:
                data = res.json()
                self.access_token = data.get("access_token")
                if data.get("refresh_token"):
                    self.refresh_token = data.get("refresh_token")
                print("[+] Làm mới Access Token Techcombank thành công!")
                return data
            else:
                print(f"[-] Token refresh failed ({res.status_code}): {res.text[:200]}")
        except Exception as e:
            print(f"[-] Token refresh error: {e}")
        return None

    def login(self) -> Dict[str, Any]:
        """Thực hiện quy trình đăng nhập đầy đủ từ đầu đến cuối."""
        verifier, challenge = generate_code_verifier_and_challenge()
        initial_url = (
            f"{self.AUTH_BASE_URL}/auth/realms/backbase/protocol/openid-connect/auth?"
            f"response_type=code&client_id={self.CLIENT_ID}&"
            f"state=RnIyRWxKVk1md1FnUm5uYUJSdFRrQmNQbjBnMzlxZEZ2allwZHV6OGQ0anhS&"
            f"redirect_uri={requests.utils.quote(self.REDIRECT_URI, safe='')}&"
            f"scope=openid&code_challenge={challenge}&code_challenge_method=S256&"
            f"nonce=RnIyRWxKVk1md1FnUm5uYUJSdFRrQmNQbjBnMzlxZEZ2allwZHV6OGQ0anhS&ui_locales=en-US"
        )

        resolved_url = self.short_url_breaker(initial_url)
        if not resolved_url:
            raise RuntimeError("Failed to break shortened URL")

        step1 = self.resolve_url_and_get_cookies(resolved_url)
        if not step1:
            raise RuntimeError("Failed to resolve URL")

        step2 = self.get_login_form_details(step1["url"])
        if not step2:
            raise RuntimeError("Failed to get login form details")

        login_response = self.submit_login_credentials(step2["actionUrl"], step2["formData"])
        if not login_response:
            raise RuntimeError("Failed to submit login credentials")

        # 0. Kiểm tra nếu đã được redirect trực tiếp về code
        if '<div id="redirect-code"' in login_response:
            code_match = re.search(r'data-url="([^"]+)"', login_response)
            if code_match:
                return self.exchange_code_for_token(code_match.group(1), verifier)

        # 1. Kiểm tra nếu vẫn ở trang đăng nhập (thất bại do sai mật khẩu hoặc tài khoản)
        if 'name="password"' in login_response or 'id="kc-form-login"' in login_response:
            error_msg = extract_login_error_message(login_response)
            if error_msg:
                raise RuntimeError(f"Đăng nhập Techcombank không thành công: {error_msg}")
            raise RuntimeError("Tên đăng nhập hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại tài khoản Techcombank!")

        # 2. Trích xuất URL màn hình OOB xác nhận (credentials hợp lệ, đã gửi thông báo về app)
        decoded_url = extract_decoded_url(login_response)
        if decoded_url:
            print("[+] Đăng nhập thông tin hợp lệ! Đã gửi thông báo xác nhận tới ứng dụng Techcombank trên điện thoại.")
            token_data = self.poll_for_confirmation(decoded_url, verifier)
            return token_data

        # 3. Fallback kiểm tra thông báo lỗi nếu không tìm thấy decoded_url
        error_msg = extract_login_error_message(login_response)
        if error_msg:
            raise RuntimeError(f"Đăng nhập Techcombank không thành công: {error_msg}")

        raise RuntimeError("Không tìm thấy màn hình xác nhận Out-Of-Band trên ứng dụng Techcombank. Vui lòng kiểm tra lại tài khoản!")

    def verify_login(self) -> Dict[str, Any]:
        """
        Kiểm tra trạng thái đăng nhập chuẩn 7Bank Gateway.
        Trả về dictionary gồm: status, success, message, token.
        """
        try:
            token_data = self.login()
            if self.access_token:
                payload = decode_jwt_payload(self.access_token)
                account_name = payload.get("name") or self.username
                target_arrangement = self.arrangement_id
                balance = 0.0

                # Truy vấn danh sách tài khoản ngay khi token còn mới
                try:
                    arr_list = self.fetch_arrangements(self.access_token)
                    if arr_list:
                        for acc in arr_list:
                            bban = str(acc.get("BBAN") or acc.get("accountNumber") or "")
                            if not self.account_number or self.account_number in bban or bban in self.account_number:
                                target_arrangement = acc.get("id")
                                balance = float(acc.get("availableBalance") or acc.get("bookedBalance") or 0.0)
                                account_name = acc.get("alias") or acc.get("name") or account_name
                                break
                        if not target_arrangement and len(arr_list) > 0:
                            target_arrangement = arr_list[0].get("id")
                            balance = float(arr_list[0].get("availableBalance") or arr_list[0].get("bookedBalance") or 0.0)
                except Exception as arr_err:
                    print("[-] Lỗi truy vấn arrangements:", arr_err)

                if not target_arrangement and self.account_number == "19071955696013":
                    target_arrangement = "66d391e8-73e9-4927-a8c3-b799e07ba79a"

                self.arrangement_id = target_arrangement

                # Thử lưu transactions đầu tiên vào file cache
                try:
                    self.fetch_transactions(
                        access_token=self.access_token,
                        account_number=self.account_number,
                        arrangement_id=target_arrangement,
                        save_file=True,
                    )
                except Exception:
                    pass

                return {
                    "status": "success",
                    "success": True,
                    "message": "Đăng nhập Techcombank thành công",
                    "accountName": account_name,
                    "balance": balance,
                    "accountNumber": self.account_number,
                    "arrangementId": target_arrangement,
                    "accessToken": self.access_token,
                    "refreshToken": self.refresh_token,
                    "tokenData": token_data,
                }
            return {
                "status": "error",
                "success": False,
                "message": "Không nhận được Access Token",
                "raw": token_data,
            }
        except Exception as e:
            return {
                "status": "error",
                "success": False,
                "message": str(e),
            }

    def fetch_arrangements(self, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Truy vấn danh sách các tài khoản (Arrangements) của khách hàng.
        Tự động lấy thông tin STK (BBAN), số dư và arrangementId nội bộ từ Backbase.
        """
        token = access_token or self.access_token
        if not token:
            print("[-] Chưa có Access Token để lấy danh sách tài khoản")
            return []

        headers = {
            "Accept": "application/json, text/plain, */*",
            "Authorization": f"Bearer {token.strip()}",
            "User-Agent": get_user_agent(),
            "Referer": f"{self.ONLINE_BANKING_URL}/",
            "Accept-Language": "vi,en;q=0.9",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
        }

        # Danh sách endpoint truy vấn danh sách tài khoản
        endpoints_to_try = [
            (
                f"{self.ONLINE_BANKING_URL}/api/arrangement-manager/client-api/v2/productsummary/context/arrangements",
                {
                    "businessFunction": "Product Summary",
                    "resourceName": "Product Summary",
                    "privilege": "view",
                    "from": 0,
                    "size": 100,
                },
            ),
            (
                f"{self.ONLINE_BANKING_URL}/api/arrangement-manager/client-api/v2/arrangements",
                {
                    "businessFunction": "Product Summary",
                    "resourceName": "Product Summary",
                    "privilege": "view",
                },
            ),
            (
                f"{self.ONLINE_BANKING_URL}/api/arrangement-manager/client-api/v2/arrangements",
                None,
            ),
        ]

        for url, params in endpoints_to_try:
            try:
                res = self.session.get(url, params=params, headers=headers, timeout=25)
                if res.status_code == 200:
                    data = res.json()
                    arr_list = []
                    if isinstance(data, list):
                        arr_list = data
                    elif isinstance(data, dict) and "arrangements" in data:
                        arr_list = data["arrangements"]

                    if arr_list:
                        print(f"[+] Tìm thấy {len(arr_list)} tài khoản Techcombank:")
                        for acc in arr_list:
                            acc_id = acc.get("id")
                            bban = acc.get("BBAN") or acc.get("accountNumber") or ""
                            alias = acc.get("alias") or acc.get("name") or "Tài khoản thanh toán"
                            bal = acc.get("availableBalance") if acc.get("availableBalance") is not None else acc.get("bookedBalance")
                            cur = acc.get("currency", "VND")
                            print(f"    - STK: {bban} | Tên: {alias} | Số dư: {bal} {cur} | Arrangement ID: {acc_id}")
                        return arr_list
            except Exception:
                pass

        return []

    def fetch_transactions(
        self,
        access_token: Optional[str] = None,
        days: int = 3,
        account_number: Optional[str] = None,
        arrangement_id: Optional[str] = None,
        save_file: bool = True,
        filename: str = "transactions.json",
    ) -> List[Dict[str, Any]]:
        """
        Lấy danh sách giao dịch gần nhất của tài khoản.
        Tự động ánh xạ từ STK (account_number) sang internal arrangement_id.
        """
        token = access_token or self.access_token
        if not token or not isinstance(token, str) or not token.strip():
            print("Invalid access token")
            return []

        target_stk = account_number or self.account_number
        target_arrangement = arrangement_id or self.arrangement_id

        # Nếu chưa có arrangement_id cụ thể, tự động truy vấn danh sách tài khoản
        if not target_arrangement:
            arrangements = self.fetch_arrangements(token)
            if arrangements:
                # 1. Tìm tài khoản khớp với STK người dùng cung cấp
                if target_stk:
                    for acc in arrangements:
                        bban = str(acc.get("BBAN") or acc.get("accountNumber") or "")
                        acc_id = str(acc.get("id") or "")
                        if target_stk == bban or target_stk in bban or target_stk == acc_id:
                            target_arrangement = acc.get("id")
                            print(f"[*] Đã khớp STK {bban} -> Arrangement ID: {target_arrangement}")
                            break

                # 2. Nếu không tìm thấy hoặc người dùng không nhập STK, chọn tài khoản đầu tiên
                if not target_arrangement and len(arrangements) > 0:
                    first_acc = arrangements[0]
                    target_arrangement = first_acc.get("id")
                    bban = first_acc.get("BBAN") or first_acc.get("accountNumber") or ""
                    print(f"[*] Tự động chọn tài khoản đầu tiên: STK {bban} -> Arrangement ID: {target_arrangement}")

        # Tự động gán Arrangement ID cho STK nếu đã biết
        if not target_arrangement and (self.account_number == "19071955696013" or target_stk == "19071955696013"):
            target_arrangement = "66d391e8-73e9-4927-a8c3-b799e07ba79a"

        if not target_arrangement:
            print("[-] CẢNH BÁO: Không xác định được Arrangement ID của tài khoản để lấy lịch sử giao dịch Techcombank.")
            return []

        now = get_current_date_in_hcm()
        # Backbase API dùng toán tử < nghiêm ngặt cho bookingDateLessThan,
        # nên để lấy toàn bộ giao dịch mới nhất trong ngày hôm nay cần cộng thêm 2 ngày
        end_date = format_date_in_hcm(add_days(now, 2), "%Y-%m-%d")
        start_date = format_date_in_hcm(sub_days(now, days), "%Y-%m-%d")

        query_params = {
            "bookingDateGreaterThan": start_date,
            "bookingDateLessThan": end_date,
            "arrangementId": target_arrangement,
            "from": 0,
            "size": 100,
        }

        headers = {
            "accept": "application/json",
            "authorization": f"Bearer {token.strip()}",
            "user-agent": get_user_agent(),
            "referer": f"{self.ONLINE_BANKING_URL}/",
            "accept-language": "en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7,zh;q=0.6",
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
        }

        # Thử v2 transactions, nếu lỗi thử v3
        for version in ["v2", "v3", "v1"]:
            url = (
                f"{self.ONLINE_BANKING_URL}/api/transaction-manager/client-api/{version}/transactions?"
                f"{urlencode(query_params)}"
            )
            try:
                res = self.session.get(url, headers=headers, timeout=25)
                if res.status_code == 200:
                    transactions = res.json()

                    if save_file:
                        try:
                            with open(filename, "w", encoding="utf-8") as f:
                                json.dump(transactions, f, ensure_ascii=False, indent=2)
                        except Exception:
                            pass

                    return transactions
                elif res.status_code == 404:
                    continue
                else:
                    print(f"Failed to fetch data ({version}). HTTP Code: {res.status_code}")
                    try:
                        print("Error response:", res.json())
                    except Exception:
                        print("Error text:", res.text[:300])
                    break
            except Exception as error:
                print(f"Error ({version}): ", str(error))
                break

        return []


# =============================================================================
# CÁC HÀM TƯƠNG THÍCH TRỰC TIẾP VỚI ĐOẠN CODE NODE.JS GỐC
# =============================================================================

USERNAME = ""
PASSWORD = ""
timeZone = "Asia/Ho_Chi_Minh"


def getCurrentDateInHCM() -> datetime:
    return get_current_date_in_hcm()


def formatDateInHCM(date: datetime, date_format: str) -> str:
    py_format = (
        date_format.replace("yyyy", "%Y")
        .replace("MM", "%m")
        .replace("dd", "%d")
        .replace("HH", "%H")
        .replace("mm", "%M")
        .replace("ss", "%S")
    )
    return format_date_in_hcm(date, py_format)


def getUserAgent() -> str:
    return get_user_agent()


def generateCodeVerifierAndChallenge() -> Tuple[str, str]:
    return generate_code_verifier_and_challenge()


def extractFormActionUrl(html_content: str) -> Optional[str]:
    return extract_form_action_url(html_content)


def extractDecodedUrl(html_content: str) -> Optional[str]:
    return extract_decoded_url(html_content)


def shortUrlBreaker(url: str, session: Optional[requests.Session] = None) -> str:
    s = session or requests.Session()
    print("Breaking shortened URL:", url)
    res = s.get(url, headers={"User-Agent": getUserAgent()}, allow_redirects=True, timeout=25)
    return res.url or url


def resolveUrlAndGetCookies(url: str, session: Optional[requests.Session] = None) -> Dict[str, Any]:
    s = session or requests.Session()
    print("STEP 1: Resolving URL and collecting initial cookies...")
    res = s.head(url, headers={"User-Agent": getUserAgent()}, allow_redirects=True, timeout=25)
    final_url = res.url or url
    cookies = [f"{c.name}={c.value}" for c in s.cookies]
    print("Resolved URL:", final_url)
    print("Cookies:", cookies if cookies else "No cookies found")
    return {"url": final_url, "cookies": cookies}


def getLoginFormDetails(
    url: str, cookies: List[str], session: Optional[requests.Session] = None, username: str = "", password: str = ""
) -> Dict[str, Any]:
    s = session or requests.Session()
    print("\nSTEP 2: Fetching login form details...")
    res = s.get(url, headers={"User-Agent": getUserAgent()}, timeout=25)
    action_url = extractFormActionUrl(res.text)
    if not action_url:
        raise ValueError("Could not find login form in HTML")

    action_url = normalize_tcb_url(action_url)
    parsed_url = urlparse(action_url)
    query_params = parse_qs(parsed_url.query)

    form_data = {
        "session_code": query_params.get("session_code", [""])[0],
        "execution": query_params.get("execution", [""])[0],
        "client_id": query_params.get("client_id", [""])[0],
        "tab_id": query_params.get("tab_id", [""])[0],
        "kc_locale": query_params.get("kc_locale", [""])[0],
        "username": username or USERNAME,
        "password": password or PASSWORD,
        "threatMetrixBrowserType": "DESKTOP_BROWSER",
    }

    new_cookies = [f"{c.name}={c.value}" for c in s.cookies]
    print("Action URL:", action_url)
    print("New cookies:", new_cookies)

    return {
        "actionUrl": action_url,
        "formData": form_data,
        "cookies": list(set(cookies + new_cookies)),
    }


def submitLoginCredentials(
    action_url: str, form_data: Dict[str, str], cookies: List[str], session: Optional[requests.Session] = None
) -> str:
    s = session or requests.Session()
    print("\nSTEP 3: Submitting login credentials...")
    action_url = normalize_tcb_url(action_url)
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
        "User-Agent": getUserAgent(),
        "Origin": "https://identity-tcb.techcombank.com.vn",
    }
    res = s.post(action_url, data=form_data, headers=headers, allow_redirects=False, timeout=25)
    print("Login submission status:", res.status_code)
    return res.text


def pollForConfirmation(
    url: str, cookies: List[str], verifier: str, session: Optional[requests.Session] = None
) -> Dict[str, Any]:
    client = Techcombank()
    if session:
        client.session = session
    return client.poll_for_confirmation(url, verifier)


def fetchTransactions(access_token: str, session: Optional[requests.Session] = None) -> None:
    client = Techcombank(access_token=access_token)
    if session:
        client.session = session
    client.fetch_transactions(access_token=access_token)


def decode_jwt_payload(token: str) -> Dict[str, Any]:
    """Giải mã payload của JWT token để lấy thông tin khách hàng."""
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            rem = len(payload_b64) % 4
            if rem > 0:
                payload_b64 += "=" * (4 - rem)
            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            return json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        pass
    return {}


def main(username: str = "", password: str = "", account_number: str = "") -> None:
    """Hàm chạy chính tương đương main() trong đoạn mã Node.js gốc."""
    usr = username or USERNAME
    pwd = password or PASSWORD

    print(BANNER)
    if not usr or not pwd:
        print("[-] CẢNH BÁO: Chưa cung cấp USERNAME hoặc PASSWORD.")
        print("    Cú pháp: python techcombank.py <tai_khoan> <mat_khau> [so_tai_khoan]")
        print("    Ví dụ:   python techcombank.py 0869482825 Anhduong1234@ 19071955696013")
        return

    # Xác định đối số thứ 3 là STK hay arrangement_id
    acc_num = None
    arr_id = None
    if account_number:
        if len(account_number) == 36 and "-" in account_number:
            arr_id = account_number
        else:
            acc_num = account_number

    try:
        client = Techcombank(
            username=usr,
            password=pwd,
            account_number=acc_num,
            arrangement_id=arr_id,
            poll_timeout=120,
        )
        token_data = client.login()
        access_token = token_data.get("access_token")

        if access_token:
            payload = decode_jwt_payload(access_token)
            print("\n" + "=" * 60)
            print("=== THÔNG TIN TÀI KHOẢN TECHCOMBANK XÁC THỰC THÀNH CÔNG ===")
            print(f"[+] Chủ tài khoản:  {payload.get('name')}")
            print(f"[+] Số điện thoại:  {payload.get('mobileNumber')}")
            print(f"[+] Mã khách hàng:  {payload.get('customerId')}")
            print(f"[+] Số CCCD:        {payload.get('citizenId')}")
            print(f"[+] Email:          {payload.get('email')}")
            print("=" * 60)

            print("\nAccess Token:")
            print(access_token)

            client.fetch_transactions(
                access_token=access_token,
                account_number=acc_num,
                arrangement_id=arr_id,
            )
        else:
            print("[-] Không nhận được access_token hợp lệ.")

    except Exception as error:
        print("Main process error:", str(error))
        raise error


if __name__ == "__main__":
    cli_user = sys.argv[1] if len(sys.argv) > 1 else ""
    cli_pass = sys.argv[2] if len(sys.argv) > 2 else ""
    cli_account = sys.argv[3] if len(sys.argv) > 3 else ""
    try:
        main(cli_user, cli_pass, cli_account)
    except Exception as fatal_error:
        print("Fatal error:", str(fatal_error))
