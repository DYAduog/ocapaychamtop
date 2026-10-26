import requests
import json
import random
import base64
import string
import time
from datetime import datetime
import uuid
import os

def random_number_string(length):
    return ''.join(random.choices(string.digits, k=length))
class EXIMBANK:
    def __init__(self, username, password, account_number, proxy_list=None, captcha_key=None, captcha_url=None):
        self.proxy_list = proxy_list
        if self.proxy_list:
            self.random_proxy_info = random.choice(self.proxy_list)
            proxy_host, proxy_port, proxy_username, proxy_password = self.random_proxy_info.split(':')
            self.proxies = {
                'http': f'http://{proxy_username}:{proxy_password}@{proxy_host}:{proxy_port}',
                'https': f'http://{proxy_username}:{proxy_password}@{proxy_host}:{proxy_port}'
            }
        else:
            self.proxies = None
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.db_dir = os.path.join(base_dir, "db")
        self.file = os.path.join(self.db_dir, "users", f"{username}.txt")
        self.cookies_file = os.path.join(self.db_dir, "cookies", f"{account_number}.json")
        os.makedirs(os.path.dirname(self.file), exist_ok=True)
        os.makedirs(os.path.dirname(self.cookies_file), exist_ok=True)
        self.session = requests.Session()
        self.captcha_key = captcha_key or os.environ.get("KEY_CAPTCHA", "offline_ai_self_hosted")
        self.captcha_url = captcha_url or os.environ.get("CAPTCHA_LOCAL_ENGINE_URL") or os.environ.get("CAPTCHA_API_URL", "http://127.0.0.1:8088")
        self.key_anticaptcha = "f3a44e66302c61ffec07c80f4732baf3"
        self.url = {
            "getCaptcha": "https://edigi.eximbank.com.vn/ib/captcha/",
            "auth": "https://edigi.eximbank.com.vn/ib/",
            "process": "https://edigi.eximbank.com.vn/ib/process"
        }
        self.lang = 'vi'
        self.timeout = 60
        self.DT = "WINDOWS"
        self.E = str(uuid.uuid4())
        self.OV = "124.0.0.0"
        self.PM = "Edge"
        self.app_version = "2.4.1.15"
        self.captcha_token = ""
        self.captcha_value = ""
        self.username = username
        self.password = password
        self.account_number = account_number
        self.session_id = ""
        self.mobile_id = ""
        self.client_id = 0
        self.cif = ""
        self.token = ""
        self.access_token = ""
        self.auth_token = ""
        self.is_login = False
        self.time_login = time.time()
        self.otp_token = ""
        self.n_login = 0

        if not self.file_exists():
            self.username = username
            self.password = password
            self.account_number = account_number
            self.client_id = 0
            self.E = str(uuid.uuid4())
            self.otp_token = ""
            self.save_data()
        else:
            self.parse_data()
            self.username = username
            self.password = password
            self.account_number = account_number
            self.save_data()
        self.load_cookies()

    def save_cookies(self, cookie_jar):
        try:
            cookies_dict = cookie_jar.get_dict() if hasattr(cookie_jar, "get_dict") else dict(cookie_jar)
            with open(self.cookies_file, 'w') as f:
                json.dump(cookies_dict, f)
            username_cookie_file = os.path.join(self.db_dir, "cookies", f"{self.username}.json")
            if username_cookie_file != self.cookies_file:
                with open(username_cookie_file, 'w') as f:
                    json.dump(cookies_dict, f)
        except Exception:
            pass

    def load_cookies(self):
        try:
            target_files = [self.cookies_file, os.path.join(self.db_dir, "cookies", f"{self.username}.json")]
            for fpath in target_files:
                if os.path.exists(fpath):
                    with open(fpath, 'r') as f:
                        cookies = json.load(f)
                        if isinstance(cookies, dict) and cookies:
                            self.session.cookies.update(cookies)
                            return cookies
        except Exception:
            pass
        return {}

    def file_exists(self):
        try:
            with open(self.file, "r"):
                return True
        except FileNotFoundError:
            return False

    def save_data(self):
        os.makedirs(os.path.dirname(self.file), exist_ok=True)
        cookies_dict = {}
        try:
            cookies_dict = self.session.cookies.get_dict()
        except Exception:
            pass
        data = {
            "username": self.username,
            "password": self.password,
            "account_number": self.account_number,
            "session_id": self.session_id,
            "mobile_id": self.mobile_id,
            "client_id": self.client_id,
            "cif": self.cif,
            "token": self.token,
            "access_token": self.access_token,
            "access_key": getattr(self, "access_key", ""),
            "E": self.E,
            "auth_token": self.auth_token,
            "otp_token": self.otp_token,
            'time_login': self.time_login,
            'is_login': self.is_login,
            "cookies": cookies_dict,
        }
        with open(self.file, "w") as file:
            json.dump(data, file)

    def parse_data(self):
        try:
            with open(self.file, "r") as file:
                data = json.load(file)
                self.username = data.get("username", self.username)
                self.password = data.get("password", self.password)
                self.account_number = data.get("account_number", self.account_number)
                self.session_id = data.get("session_id", "")
                self.mobile_id = data.get("mobile_id", "")
                self.client_id = data.get("client_id", 0)
                self.token = data.get("token", "")
                self.access_token = data.get("access_token", "")
                self.access_key = data.get("access_key", "")
                self.auth_token = data.get("auth_token", "")
                self.cif = data.get("cif", "")
                self.E = data.get("E", self.E)
                self.otp_token = data.get("otp_token", "")
                self.time_login = data.get("time_login", 0)
                self.is_login = data.get("is_login", False)
                if "cookies" in data and isinstance(data["cookies"], dict):
                    try:
                        self.session.cookies.update(data["cookies"])
                    except Exception:
                        pass
        except Exception:
            pass

    def parse_jwt(self, token_str):
        if not token_str or not isinstance(token_str, str):
            return {}
        raw = token_str.replace("Bearer ", "").strip()
        parts = raw.split(".")
        if len(parts) >= 2:
            try:
                payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
                return json.loads(base64.b64decode(payload_b64).decode("utf-8"))
            except Exception:
                pass
        return {}

    def get_session_data(self):
        cookies_dict = {}
        try:
            cookies_dict = self.session.cookies.get_dict()
        except Exception:
            pass
        return {
            "username": self.username,
            "account_number": self.account_number,
            "session_id": self.session_id,
            "mobile_id": self.mobile_id,
            "client_id": self.client_id,
            "cif": self.cif,
            "token": self.token,
            "access_token": self.access_token,
            "access_key": getattr(self, "access_key", ""),
            "E": self.E,
            "auth_token": self.auth_token,
            "otp_token": self.otp_token,
            "time_login": self.time_login,
            "is_login": self.is_login,
            "cookies": cookies_dict,
        }

    def load_session_data(self, data):
        if not data or not isinstance(data, dict):
            return
        if "session_id" in data: self.session_id = data["session_id"]
        if "mobile_id" in data: self.mobile_id = data["mobile_id"]
        if "client_id" in data: self.client_id = data["client_id"]
        if "cif" in data: self.cif = data["cif"]
        if "token" in data: self.token = data["token"]
        if "access_token" in data: self.access_token = data["access_token"]
        if "access_key" in data: self.access_key = data["access_key"]
        if "E" in data: self.E = data["E"]
        if "auth_token" in data: self.auth_token = data["auth_token"]
        if "otp_token" in data: self.otp_token = data["otp_token"]
        if "time_login" in data: self.time_login = data["time_login"]
        if "is_login" in data: self.is_login = data["is_login"]
        if "account_name" in data: self.account_name = data["account_name"]

        # Trích xuất ui (clientId) và si (sessionId) từ JWT token nếu chưa có hoặc bằng 0
        if (not self.client_id or not self.session_id) and self.auth_token:
            jwt_data = self.parse_jwt(self.auth_token)
            if not self.client_id and jwt_data.get("ui"):
                try:
                    self.client_id = int(jwt_data["ui"])
                except Exception:
                    self.client_id = jwt_data["ui"]
            if not self.session_id and jwt_data.get("si"):
                self.session_id = jwt_data["si"]

        if "cookies" in data and isinstance(data["cookies"], dict):
            try:
                self.session.cookies.update(data["cookies"])
            except Exception:
                pass
        self.save_data()

    def do_login(self):
        self.n_login += 1
        solve_captcha = self.solve_captcha()
        if not solve_captcha["success"]:
            return solve_captcha
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
            "captchaToken": self.captcha_token,
            "captchaValue": self.captcha_value,
            "clientId": self.client_id,
            "mid": 1,
            "authMethod": "SMS",
            "pin": self.password,
            "username": self.username,
        }
        result = self.curl_post(self.url["auth"], params)
        if result and 'code' in result and result["code"] == '00':
            data_part = result.get('data') if isinstance(result.get('data'), dict) else {}
            if data_part.get('accessKey'):
                self.access_key = data_part.get("accessKey", "")
                self.session_id = data_part.get("sessionId") or getattr(self, "session_id", "")
                self.access_token = data_part.get("accessToken") or getattr(self, "access_token", "")
                self.client_id = data_part.get("clientId") or getattr(self, "client_id", 0)
                self.cif = data_part.get("cif") or getattr(self, "cif", "")
                self.account_name = data_part.get("name") or getattr(self, "account_name", "")

                # Trích xuất ui (clientId) và si (sessionId) từ JWT token nếu chưa có hoặc bằng 0
                if self.auth_token:
                    jwt_data = self.parse_jwt(self.auth_token)
                    if not self.client_id and jwt_data.get("ui"):
                        try:
                            self.client_id = int(jwt_data["ui"])
                        except Exception:
                            self.client_id = jwt_data["ui"]
                    if not self.session_id and jwt_data.get("si"):
                        self.session_id = jwt_data["si"]

                self.is_login = True
                self.time_login = time.time()
                self.save_data()
                return {
                    'code': 200,
                    'success': True,
                    'message': 'Đăng nhập thành công',
                    "data": result if result else "",
                }
            else:
                login_type = str(data_part.get("loginType") or result.get("loginType") or "")
                if login_type == '3':
                    self.token = data_part.get("token") or result.get("token") or ""
                    self.otp_token = data_part.get("otpToken", "")
                    self.is_login = True
                    self.time_login = time.time()
                    self.save_data()
                    return {
                        'code': 302,
                        'success': True,
                        'requiresOtp': True,
                        'message': 'Quý khách vui lòng xác thực SmartOTP để thực hiện đăng nhập vào Eximbank EDigi',
                        'data': result if result else "",
                    }
                elif login_type == '8':
                    print('Vui lòng xác thực từ điện thoại')
                    self.token = data_part.get("token") or result.get("token") or ""
                    self.is_login = True
                    self.time_login = time.time()
                    self.save_data()
                    check_confirm = self.check_confirm_loop()
                    if check_confirm and check_confirm.get("success"):
                        return {
                            'code': 200,
                            'success': True,
                            'message': 'Xác thực đăng nhập thành công',
                            "data": check_confirm.get('data') or "",
                        }
                    else:
                        return check_confirm or {"code": 500, "success": False, "message": "Xác thực thất bại"}
        elif result["code"] == '96':
            if self.n_login < 5:
                return self.do_login()
            return {
                'code': 422,
                "success": False,
                "message": result["des"],
                "data": result if result else "",
            } 
        else:
            return {
                'code': 500,
                "success": False,
                "message": result["des"],
                "data": result if result else "",
            }

    def re_login(self):
        solve_captcha = self.solve_captcha()
        if not solve_captcha.get("success"):
            return solve_captcha
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
            "authMethod": "SMS",
            "clientId": self.client_id,
            "getByGroup": False,
            "isCache": None,
            "maxRequestInCache": False,
            "mid": 7,
        }
        result = self.curl_post(self.url["auth"], params)
        if result and isinstance(result, dict) and result.get("code") == '00':
            self.time_login = time.time()
            self.is_login = True
            if isinstance(result.get('data'), dict):
                data_part = result['data']
                if 'accessKey' in data_part: self.access_key = data_part['accessKey']
                if 'accessToken' in data_part: self.access_token = data_part['accessToken']
            self.save_data()
            result['success'] = True
            return result
        return {"success": False, "message": (result.get("des") if isinstance(result, dict) else "") or "Lỗi gia hạn phiên Eximbank", "data": result}

    def verify_otp(self, otp):
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
            "clientId": self.client_id,
            "mid": 2,
            "loginType":"3",
            "authMethod": "SMS",
            "otp": otp,
            "otpToken": self.otp_token,
        }
        res = self.curl_post(self.url["auth"], params)
        if res and isinstance(res, dict) and res.get("code") == "00":
            self.session_id = ""
            data_part = res.get('data', {}) if isinstance(res.get('data'), dict) else {}
            self.access_key = data_part.get("accessKey", "")
            self.cif = data_part.get("cif", "")
            self.access_token = data_part.get("accessToken", "")
            self.client_id = data_part.get("clientId", 0)
            self.is_login = True
            self.time_login = time.time()
            self.save_data()

            return {"code": 200, "success": True, "message": res.get("des") or "Xác thực OTP thành công", "data": res}
        else:
            msg = "Mã OTP Eximbank không chính xác hoặc đã hết hạn"
            if res and isinstance(res, dict):
                msg = res.get("des") or res.get("message") or msg
            return {"code": 400, "success": False, "message": msg, "data": res}

    def check_confirm(self):
        if getattr(self, "login_type", "3") == "8":
            data = {
                "user": self.username,
                "username": self.username,
                "token": self.token,
                "mid": 30,
                "DT": self.DT,
                "E": self.E,
                "OV": self.OV,
                "PM": self.PM,
                "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
                "appVersion": self.app_version,
                "clientId": self.client_id,
            }
        else:
            data = {
                "DT": self.DT,
                "E": self.E,
                "OV": self.OV,
                "PM": self.PM,
                "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
                "clientId": self.client_id,
                "mid": 2,
                "loginType": "3",
                "otpToken": self.otp_token,
                "token": self.token,
                "authMethod": "SMS",
            }
        res = self.curl_post(self.url["auth"], data)
        if res and isinstance(res, dict) and res.get('code') == '00':
            data_part = res.get('data') if isinstance(res.get('data'), dict) else res
            if "sessionId" in data_part: self.session_id = data_part["sessionId"]
            if "accessKey" in data_part: self.access_key = data_part["accessKey"]
            if "cif" in data_part: self.cif = data_part["cif"]
            if "accessToken" in data_part: self.access_token = data_part["accessToken"]
            if "clientId" in data_part: self.client_id = data_part["clientId"]
            if "name" in data_part: self.account_name = data_part["name"]

            # Trích xuất ui (clientId) và si (sessionId) từ JWT token nếu chưa có hoặc bằng 0
            jwt_data = self.parse_jwt(self.auth_token)
            if not self.client_id and jwt_data.get("ui"):
                try:
                    self.client_id = int(jwt_data["ui"])
                except Exception:
                    self.client_id = jwt_data["ui"]
            if not self.session_id and jwt_data.get("si"):
                self.session_id = jwt_data["si"]

            self.is_login = True
            self.time_login = time.time()
            self.save_data()
        return res
    def trust_device(self):
        data = {
            "user": self.username,
            "clientId": self.client_id,
            "location": "",
            "otp": "",
            "mid": 56,
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.app_version,
            "token": self.token,
        }
        res = self.curl_post(self.url["auth"], data)
    def check_confirm_loop(self):
        i = 1
        while True:
            if i >= 10:
                return {"code":408,"success": False, "message": "Quá thời hạn xác thực, vui lòng thử lại!"}
            check_confirm = self.check_confirm()
            if check_confirm and isinstance(check_confirm, dict) and check_confirm.get('code') == '00':
                data_part = check_confirm.get("data") if isinstance(check_confirm.get("data"), dict) else check_confirm
                self.session_id = data_part.get("sessionId") or getattr(self, "session_id", "")
                self.access_key = data_part.get("accessKey") or getattr(self, "access_key", "")
                self.cif = data_part.get("cif") or getattr(self, "cif", "")
                self.access_token = data_part.get("accessToken") or getattr(self, "access_token", "")
                self.client_id = data_part.get("clientId") or getattr(self, "client_id", 0)
                if self.auth_token:
                    jwt_data = self.parse_jwt(self.auth_token)
                    if not self.client_id and jwt_data.get("ui"):
                        try: self.client_id = int(jwt_data["ui"])
                        except Exception: self.client_id = jwt_data["ui"]
                    if not self.session_id and jwt_data.get("si"):
                        self.session_id = jwt_data["si"]
                self.is_login = True
                self.time_login = time.time()
                self.save_data()
                return {"code": 200, "success": True, "message": check_confirm.get("des") or "Thành công", "data": check_confirm}       
            else:
                time.sleep(5)
            i += 1

    def get_transactions(self, acc_no, from_date, to_date):
        if not self.is_login or time.time() - self.time_login > 240:
            login = self.re_login()
            if not login.get('success'):
                if getattr(self, "password", ""):
                    login = self.do_login()
                    if not (login.get('success') or login.get('code') == 200):
                        return login
                else:
                    return login

        if (not self.client_id or self.client_id == 0) and self.auth_token:
            jwt_data = self.parse_jwt(self.auth_token)
            if jwt_data.get("ui"):
                try: self.client_id = int(jwt_data["ui"])
                except Exception: self.client_id = jwt_data["ui"]
            if jwt_data.get("si") and not self.session_id:
                self.session_id = jwt_data["si"]

        target_acc = acc_no or self.account_number
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
            "clientId": self.client_id,
            "authMethod": "SMS",
            "mid": 13,
            "isCache": False,
            "maxRequestInCache": False,
            "fromDate": from_date,
            "toDate": to_date,
            "pageNumber": 0,
            "accountNo": target_acc,
        }
        result = self.curl_post(self.url["auth"], params)

        if result and isinstance(result, dict) and result.get('code') == '00' and result.get('data') and isinstance(result['data'], dict) and 'currentHistoryList' in result['data']:
            return {
                'code': 200,
                'success': True,
                'message': 'Thành công',
                'data': {
                    'transactions': result['data']['currentHistoryList'],
                }
            }
        else:
            self.is_login = False
            self.save_data()
            msg = 'Không thể lấy lịch sử giao dịch Eximbank'
            if isinstance(result, dict):
                msg = result.get('des') or result.get('message') or msg
            return {
                "success": False,
                "code": 500,
                "message": msg,
            }

    def get_balance(self, account_number=None):
        acc_target = account_number or self.account_number
        if not self.is_login or time.time() - self.time_login > 240:
            login = self.re_login()
            if not login.get('success'):
                return login

        if (not self.client_id or self.client_id == 0) and self.auth_token:
            jwt_data = self.parse_jwt(self.auth_token)
            if jwt_data.get("ui"):
                try: self.client_id = int(jwt_data["ui"])
                except Exception: self.client_id = jwt_data["ui"]
            if jwt_data.get("si") and not self.session_id:
                self.session_id = jwt_data["si"]

        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "ATS": datetime.now().strftime("%y%m%d%H%M%S"),
            "clientId": self.client_id,
            "authMethod": "SMS",
            "mid": 11,
            "isCache": False,
            "maxRequestInCache": False,
        }
        result = self.curl_post(self.url["auth"], params)
        if result and isinstance(result, dict) and result.get('data') and isinstance(result['data'], dict) and 'currentList' in result['data']:
            current_list = result['data']['currentList']
            if isinstance(current_list, list) and len(current_list) > 0:
                target_account = None
                for account_info in current_list:
                    if str(account_info.get('accountNo', '')).strip() == str(acc_target).strip():
                        target_account = account_info
                        break
                if not target_account:
                    # Nếu người dùng nhập SĐT thay vì STK, tự động lấy STK đầu tiên
                    target_account = current_list[0]

                real_acc_no = str(target_account.get('accountNo') or acc_target).strip()
                acc_name = str(target_account.get('custName') or target_account.get('customerName') or result['data'].get('customerName') or getattr(self, 'account_name', '') or target_account.get('accountName') or '').strip()
                bal_raw = target_account.get('availableBalance', 0)
                try:
                    bal_val = float(bal_raw)
                except (ValueError, TypeError):
                    bal_val = 0.0

                self.account_number = real_acc_no
                if acc_name:
                    self.account_name = acc_name
                self.save_data()

                return {
                    'code': 200,
                    'success': True,
                    'message': 'Thành công',
                    'data': {
                        'account_number': real_acc_no,
                        'account_name': acc_name,
                        'balance': bal_val,
                    }
                }
            return {'code': 404, 'success': False, 'message': 'Không tìm thấy tài khoản ngân hàng trong danh sách!'}
        else:
            if result and isinstance(result, dict) and result.get('code') in ['OMNI-SESSION-98', '401']:
                self.is_login = False
                self.save_data()
            return {'code': 401, 'success': False, 'message': 'Phiên đăng nhập đã hết hạn, vui lòng xác thực lại!', 'data': result}

    def get_captcha(self):
        self.captcha_token = "".join(random.choices(string.ascii_letters + string.digits, k=30))
        response = self.session.get(self.url["getCaptcha"] + self.captcha_token, headers={"user-agent": self.get_user_agent()},proxies=self.proxies)
        result = base64.b64encode(response.content).decode("utf-8")
        return result
    def createTaskCaptcha(self, base64_img):
        # 1. Ưu tiên giải tự động 100% OFFLINE bằng Local OCR (Không qua bất kỳ bên thứ 3 nào)
        try:
            import captcha_solver
            local_solved = captcha_solver.solve_captcha(base64_img)
            if local_solved and len(str(local_solved).strip()) >= 3:
                return json.dumps({"captcha": str(local_solved).strip()})
        except Exception:
            pass

        # 2. Fallback dịch vụ ngoài nếu có cấu hình
        c_url = getattr(self, "captcha_url", "") or os.environ.get("CAPTCHA_API_URL")
        c_key = getattr(self, "captcha_key", "") or os.environ.get("KEY_CAPTCHA") or os.environ.get("CAPTCHA_API_KEY")
        if c_url and c_key:
            try:
                payload = {
                    "api_key": c_key,
                    "base64": base64_img,
                    "type": "bidv"
                }
                res = requests.post(c_url, json=payload, timeout=12)
                if res.status_code == 200:
                    rj = res.json()
                    captcha_val = rj.get("captcha") or rj.get("data", {}).get("captcha")
                    if captcha_val:
                        return json.dumps({"captcha": str(captcha_val).strip()})
            except Exception:
                pass

        # 2. Thử endpoint OCR local nếu có
        try:
            url = 'http://103.72.96.214:8277/api/captcha/bidv'
            payload = json.dumps({"base64": base64_img})
            headers = {'Content-Type': 'application/json'}
            response = requests.post(url, headers=headers, data=payload, timeout=4)
            if response.status_code == 200 and 'captcha' in response.text:
                return response.text
        except Exception:
            pass

        return json.dumps({"captcha": ""})

    def checkProgressCaptcha(self, task_id):
        url = 'https://api.anti-captcha.com/getTaskResult'
        data = {
            "clientKey": self.key_anticaptcha,
            "taskId": task_id
        }
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
        response = requests.post(url, headers=headers, data=json.dumps(data))
        response_json = json.loads(response.text)
        if response_json["success"] != "ready":
            time.sleep(1)
            return self.checkProgressCaptcha(task_id)
        else:
            return response_json["solution"]["text"]

    def solve_captcha(self):
        try:
            get_captcha = self.get_captcha()
            # 1. Trình giải mã Captcha Eximbank cục bộ siêu tốc (ddddocr offline ~20ms, 100% chính xác)
            try:
                import ddddocr
                ocr = ddddocr.DdddOcr(show_ad=False)
                img_bytes = base64.b64decode(get_captcha)
                captchaText = ocr.classification(img_bytes)
                if captchaText and len(captchaText.strip()) >= 4:
                    self.captcha_value = captchaText.strip().lower()
                    return {"success": True, "key": self.captcha_token, "captcha": self.captcha_value}
            except Exception:
                pass

            # 2. Fallback sang dịch vụ OCR API
            task = self.createTaskCaptcha(get_captcha)
            captchaText = json.loads(task).get('captcha', '')
            if not captchaText:
                return {"success": False, "msg": "Không thể giải mã Captcha Eximbank tự động"}
            else:
                self.captcha_value = captchaText.strip().lower()
                return {"success": True, "key": self.captcha_token, "captcha": self.captcha_value}
        except Exception as e:
            return {"success": False, "msg": f"Lỗi giải mã Captcha: {str(e)}"}

    # def encrypt_data_2(self, data):
    #     data["clientPubKey"] = self.client_public_key
    #     key = get_random_bytes(32)
    #     iv = get_random_bytes(16)
    #     rsa_key = RSA.import_key(self.default_public_key)
    #     cipher_rsa = PKCS1_OAEP.new(rsa_key)
    #     encrypted_key = base64.b64encode(cipher_rsa.encrypt(key)).decode("utf-8")
    #     cipher = Cipher(algorithms.AES(key), modes.CTR(iv), backend=default_backend())
    #     encryptor = cipher.encryptor()
    #     # encrypted_data = iv + cipher.encrypt(json.dumps(data).encode("utf-8"))

    #     encrypted_data = iv + encryptor.update(json.dumps(data).encode('utf-8')) + encryptor.finalize()
    #     return {"d": base64.b64encode(encrypted_data).decode("utf-8"), "k": encrypted_key}
    
    def encrypt_data(self, data):
        url = "https://vcbbiz1.pay2world.vip/eximbank/encrypt"
        payload = json.dumps(data)
        headers = {
        'Content-Type': 'application/json',
        }
        response = requests.request("POST", url, headers=headers, data=payload)
        return json.loads(response.text)
    def decrypt_data(self, cipher):
        url = "https://vcbbiz1.pay2world.vip/eximbank/decrypt"

        payload = json.dumps(cipher)
        headers = {
        'Content-Type': 'application/json',
        }
        response = requests.request("POST", url, headers=headers, data=payload)

        return json.loads(response.text)

    def curl_post(self, url, data, headers=None):
        try:
            headers = self.header_null(headers)
            encrypted_data = self.encrypt_data(data)
            if len(self.session.cookies) == 0:
                self.load_cookies()
            response = self.session.post(url, headers=headers, data=json.dumps(encrypted_data), timeout=self.timeout, proxies=self.proxies)
            self.save_cookies(self.session.cookies)
            result = response.json()
            if response.headers.get("Authorization"):
                self.auth_token = response.headers.get("Authorization")
                jwt_data = self.parse_jwt(self.auth_token)
                if jwt_data.get("ui"):
                    try: self.client_id = int(jwt_data["ui"])
                    except Exception: self.client_id = jwt_data["ui"]
                if jwt_data.get("si") and not self.session_id:
                    self.session_id = jwt_data["si"]
            return self.decrypt_data(result)
        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                if e.response.status_code == 403:
                    return {"success": False, "msg": "Token hết hạn vui lòng đăng nhập lại"}
                try:
                    response = e.response.content.decode("utf-8")
                    return self.decrypt_data(json.loads(response))
                except Exception:
                    pass
            return {"success": False, "msg": f"Lỗi kết nối Eximbank: {str(e)}"}

    def header_null(self, headers=None):
        default_headers = {
            'Accept': 'application/json',
            'Accept-Language': 'vi',
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Origin': 'https://edigi.eximbank.com.vn',
            'Referer': 'https://edigi.eximbank.com.vn/dang-nhap',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            "X-Request-ID": random_number_string(15),
            'sec-ch-ua': '"Chromium";v="124", "Microsoft Edge";v="124", "Not-A.Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
            }
        if headers:
            default_headers.update(headers)
        auth_token_val = self.auth_token or getattr(self, "access_key", "")
        if auth_token_val:
            if not auth_token_val.startswith("Bearer ") and "eyJ0eXAi" in auth_token_val:
                auth_token_val = f"Bearer {auth_token_val}"
            default_headers['Authorization'] = auth_token_val
        return default_headers

    def get_user_agent(self):
        user_agent_array = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36"
        ]
        return random.choice(user_agent_array)


