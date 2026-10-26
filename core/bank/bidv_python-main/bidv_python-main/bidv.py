import requests
import json
import random
from Cryptodome.PublicKey import RSA
from Cryptodome.Cipher import AES,PKCS1_v1_5,PKCS1_OAEP
from Cryptodome.Random import get_random_bytes
import base64
import string
from Cryptodome.Util import Counter
import time
from bypass_ssl_v3 import get_legacy_session
from urllib.parse import quote
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

session_requests = get_legacy_session()

class BIDV:
    def __init__(self, username, password, account_number,proxy_list=None):
        self.proxy_list = proxy_list
        if self.proxy_list:
            try:
                self.proxy_info = random.choice(self.proxy_list)
                proxy_host, proxy_port, username_proxy, password_proxy = self.proxy_info.split(':')
                self.proxies = {
                    'http': f'http://{quote(username_proxy)}:{quote(password_proxy)}@{proxy_host}:{proxy_port}',
                    'https': f'http://{quote(username_proxy)}:{quote(password_proxy)}@{proxy_host}:{proxy_port}'
                }
            except ValueError:
                self.proxies = None 
            except Exception as e:
                self.proxies = None
        else:
            self.proxies = None
        self.file = f"data/{username}.txt"
        self.default_public_key = "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy6bC9ub46VDwZL5rwtbW\r\n2vBlHsqGzn6kr8OX7dKn+jHZxJxHSOGwTlqi+/QsSZ8wbUDkyK66atYB4Y06j1HS\r\nRimLG2zKK6BwqtMwM1VBwepy6nB+JsbobmvDInU/8cArdQRVNwWMHWwV0ZB0a3wp\r\nFCvVSwF61zFh5aG1Gbfvkbwdh4bpRa860MTyK19+rRXboROQmQYXfLWbrsI7vc3Q\r\nFRfgHIdh3baVd0mjmgMhE9yXwzroOxd418aWUQ9eSY1xmEmX9QynG9dYBMl/zzuS\r\nmM6CfJwKdsswKF0vmhRSLOBv+j/jABADcnrcIhcBS3EnTtSXDQPn/O/osqvRu5q\r\nxvQIDAQAB\r\n-----END PUBLIC KEY-----"
        self.key_anticaptcha = "f3a44e66302c61ffec07c80f4732baf3"
        self.client_public_key = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCLDAD6Wr+W7SXLJMECvt3/W9zMmVcbzwUniO7vYLBJDOEcWJoci5TrfAXlA+z3vxLmEKif41f6wlDBiY+Njj0fNkVH9w+dBbIz2CBaB8RsoDSFYA5zzUbdXfVMV+fs3o3nK/dDAZNX1MU96cISsgQTe+dIIkpMs3jSFvrxjtGg+wIDAQAB"
        self.client_private_key = """-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQCLDAD6Wr+W7SXLJMECvt3/W9zMmVcbzwUniO7vYLBJDOEcWJoc
i5TrfAXlA+z3vxLmEKif41f6wlDBiY+Njj0fNkVH9w+dBbIz2CBaB8RsoDSFYA5z
zUbdXfVMV+fs3o3nK/dDAZNX1MU96cISsgQTe+dIIkpMs3jSFvrxjtGg+wIDAQAB
AoGAWyToMzNvKPCUeH/EIReaD3xY1KijJ/Bg0ZR6AuGfTJMrsFgH1TRNzrqCZqdX
GuLd8X7z+bKdhhr/so2IUuLs/uF8/dQHtT9TxFoM2SPsgAqWZlxPOUZ+cBdNEv94
JA9JywJQBuPTrnojrgcsODW3zOCMmiSWEr8lRtKZY/cvgWkCQQDbVqoKUl4T7yt2
Dz8DxcZvgHMqyzvZyuYXLWyCg+cc6pd9iJ0uJdVe7YEE7bVoyHEBCF/6ufF53UuE
dHPAnknPAkEAokm4A42/6BWFgL5R0UdDCoIp03ODn1GRo3Bcte/4b2Jm9pXsZrYS
lwKyT66UuwXzcG1qkeLY33H0Zo6tC9z9FQJAf42GlToRO8Z6n81999Or8mvgjaJi
y+USqafg0oWigU5rirVHsu6NhwbXYOZb+POXw+H67vPzWcs3f2+5YOqsQQJAbEDI
YnZ3gJR6jTpm0Ta73ZKd29K+BdQfVepprWL5UTNOg0XWf10MYXcHAmfuBiMeE+yo
nc+34rTc1lxtyfALUQJBANCy9hPELiv+c36RT7XISDfEX2ZwOo12yexNb545dL8n
5whUm8qm5P9OAGgPgHBIVbOVp8qdHmRr1FT/qJt/LFw=
-----END RSA PRIVATE KEY-----
"""
        self.url = {
            "getCaptcha": "https://smartbanking.bidv.com.vn/w2/captcha/",
            "auth": "https://smartbanking.bidv.com.vn/w2/auth",
            "process": "https://smartbanking.bidv.com.vn/w2/process"
        }
        self.lang = 'vi'
        self.timeout = 60
        self.DT = "WINDOWS"
        self.E = ""
        self.OV = "111.0.0.0"
        self.PM = "Chrome"
        self.app_version = "2.4.1.15"
        self.captcha_token = ""
        self.captcha_value = ""
        self.username = username
        self.password = password
        self.account_number = account_number
        self.session_id = ""
        self.mobile_id = ""
        self.client_id = ""
        self.cif = ""
        self.token = ""
        self.access_token = ""
        self.auth_token = ""
        self.is_login = False
        self.time_login = time.time()
        

        if not self.file_exists():
            self.username = username
            self.account_number = account_number
            self.client_id = ""
            self.E = ""
            self.save_data()
        else:
            self.parse_data()
            self.username = username
            self.password = password
            self.account_number = account_number

    def file_exists(self):
        try:
            with open(self.file, "r"):
                return True
        except FileNotFoundError:
            return False

    def save_data(self):
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
            "E": self.E,
            "auth_token": self.auth_token,
            'time_login': self.time_login,
            'is_login': self.is_login,
        }
        with open(self.file, "w") as file:
            json.dump(data, file)

    def parse_data(self):
        with open(self.file, "r") as file:
            data = json.load(file)
            self.username = data["username"]
            self.password = data["password"]
            self.account_number = data["account_number"]
            self.session_id = data["session_id"]
            self.mobile_id = data["mobile_id"]
            self.client_id = data["client_id"]
            self.token = data["token"]
            self.access_token = data["access_token"]
            self.auth_token = data["auth_token"]
            self.cif = data["cif"]
            self.E = data["E"]
            self.time_login = data.get("time_login", "")
            self.is_login = data.get("is_login", "")
    def do_login(self):
        solve_captcha = self.solve_captcha()
        if 'success' not in solve_captcha or not solve_captcha["success"]:
            return solve_captcha
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.app_version,
            "captchaToken": self.captcha_token,
            "captchaValue": self.captcha_value,
            "clientId": self.client_id,
            "mid": 1,
            "pin": self.password,
            "user": self.username,
        }
        result = self.curl_post(self.url["auth"], params)
        print(result)
        if result["code"] == '00':
            if "accessToken" in result:
                data = result
                self.session_id = data["sessionId"]
                self.access_token = data["accessToken"]
                self.is_login = True
                self.time_login = time.time()
                self.save_data()
                if "loginType" in result and result["loginType"] == '1':
                    self.save_data()
                    return {
                    'code': 200,
                    'success': True,
                    'message': 'Đăng nhập thành công',
                    "data": result if result else "",
                }
            else:
                if "loginType" in result and result["loginType"] == '3':
                    print('Vui lòng nhập OTP')
                    self.token = result["token"]
                    self.is_login = True
                    self.time_login = time.time()
                    self.save_data()
                    return {
                        'code': 302,
                        'success': True,
                        'message': 'Vui lòng nhập OTP',
                        'data': result if result else "",

                    }
                elif "loginType" in result and result["loginType"] == '8':
                    print('Vui lòng xác thực từ điện thoại')
                    self.token = result["token"]
                    self.is_login = True
                    self.time_login = time.time()
                    self.save_data()
                    check_confirm = self.check_confirm_loop()
                    if check_confirm["success"]:
                        self.is_login = True
                        return {
                            'code': 200,
                            'success': True,
                            'message': 'Xác thực đăng nhập thành công',
                            "data": check_confirm['data'] if check_confirm and 'data' in check_confirm else "",
                        }

                    else:
                        return check_confirm
        else:
            return {
                'code': 500,
                "success": False,
                "message": result["des"] if 'des' in result else '',
                "data": result if result else "",
            }

    def verify_otp(self, otp):
        self.E = "".join(
            random.choices(string.ascii_letters + string.digits, k=10)
        ) + self.username

        data = {
            "user": self.username,
            "clientId": self.client_id,
            "location": "",
            "otp": otp,
            "mid": 56,
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.app_version,
            "token": self.token,
        }
        res = self.curl_post(self.url["auth"], data)

        if res["code"] == "00":
            self.session_id = res["sessionId"]
            self.access_key = res["accessKey"]
            self.cif = res["cif"]
            self.access_token = res["accessToken"]
            self.client_id = res["clientId"]
            self.is_login = True
            self.time_login = time.time()
            self.save_data()

            return {"code":200,"success": True, "message": res["des"], "data": res}
        else:
            return {"code":400,"success": False, "message": res["des"], "data": res}

    def check_confirm(self):
        self.E = "".join(
            random.choices(string.ascii_letters + string.digits, k=10)
        ) + self.username
        data = {
        "user": self.username,
        "token": self.token,
        "mid": 30,
        "DT": self.DT,
        "E": self.E,
        "OV": self.OV,
        "PM": self.PM,
        "appVersion": self.app_version,
        "clientId": self.username
        }
        res = self.curl_post(self.url["auth"], data)
        
        return res
    def trust_device(self):
        self.E = "".join(
            random.choices(string.ascii_letters + string.digits, k=10)
        ) + self.username

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
            if check_confirm['code'] == '00':
                self.session_id = check_confirm["sessionId"]
                self.access_key = check_confirm["accessKey"]
                self.cif = check_confirm["cif"]
                self.access_token = check_confirm["accessToken"]
                self.client_id = check_confirm["clientId"]
                self.is_login = True
                self.time_login = time.time()
                self.save_data()
                return {"code":200,"success": True, "message": check_confirm["des"], "data": check_confirm}       
            else:
                time.sleep(5)
            i += 1
    def get_transactions_by_page(self, page,limit,postingOrder,postingDate,nextRunBal,account_number):
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.app_version,
            "clientId": self.client_id,
            "accType": "D",
            "accNo": account_number,
            "mid": 12,
            "serviceTypeCode": "",
            "transId": 0,
            "fileIndicator": "",
            "isCache": False,
            "maxRequestInCache": False,
            "moreRecord": "Y",
            "nextRunbal": nextRunBal,
            "postingDate": postingDate,
            "postingOrder": postingOrder
        }
        response = self.curl_post(self.url["process"], params, headers={"Authorization": self.auth_token})
        print(response)

        if response['code'] == '00' and 'txnList' in response:
            transaction_history = response['txnList']

        if len(transaction_history) < 10:
            if transaction_history:
                self.transactions += transaction_history
        elif page*10 < limit:
            if transaction_history:
                self.transactions += transaction_history
            page=page+1
            nextRunBal = transaction_history[-1]['runbal']
            postingOrder = transaction_history[-1]['postingOrder']
            postingDate = transaction_history[-1]['postingDate']
            return self.get_transactions_by_page(page,limit,postingOrder,postingDate,nextRunBal,account_number)
        else:
            if transaction_history:
                self.transactions += transaction_history[:limit - (page-1)*10]
        return True
    def get_transactions(self, account_number, limit = 10):
        if not self.is_login:
            login = self.do_login()
            if not login['success']:
                return login
            
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.app_version,
            "clientId": self.client_id,
            "accType": "D",
            "accNo": account_number,
            "mid": 12,
            "serviceTypeCode": "",
            "transId": 0,
        }
        result = self.curl_post(self.url["process"], params, headers={"Authorization": self.auth_token})

        if result['code'] == '00' and 'txnList' in result:
            self.transactions = result['txnList']
            nextRunBal = result['txnList'][-1]['runbal']
            postingOrder = result['txnList'][-1]['postingOrder']
            postingDate = result['txnList'][-1]['postingDate']
            
            if limit > 10:
                self.get_transactions_by_page(2,limit,postingOrder,postingDate,nextRunBal,account_number)
            return {'code':200,'success': True, 'message': 'Thành công',
                            'data':{
                                'transactions':result['txnList'],
                    }}
        else:
            self.is_login = False
            self.save_data()
            return  {
                    "success": False,
                    "code": 503,
                    "message": "Service Unavailable!",
                    "data": result
                }

    def get_balance(self,account_number):
        if not self.is_login:
            login = self.do_login()
            if 'success' not in login or not login['success']:
                return login
        params = {
            "DT": self.DT,
            "E": self.E,
            "OV": self.OV,
            "PM": self.PM,
            "appVersion": self.app_version,
            "clientId": self.client_id,
            "accType": "D",
            "mid": 10,
            "isCache": False,
            "maxRequestInCache": False,
        }
        result = self.curl_post(self.url["process"], params, headers={"Authorization": self.auth_token})
        if 'accList' in result:
            for account_info in result['accList']:
                if account_info['accNo'] == account_number:
                    account_balance = account_info['balance']
                    if int(account_balance) < 0:
                        return {'code':448,'success': False, 'message': 'Blocked account with negative balances!',
                                'data': {
                                    'balance':int(account_balance)
                                }
                                } 
                    else:
                        return {'code':200,'success': True, 'message': 'Thành công',
                                'data':{
                                    'account_number':self.account_number,
                                    'balance':int(account_balance)
                        }}
            return {'code':404,'success': False, 'message': 'account_number not found!'} 
        else:
            self.is_login = False
            self.save_data()
            return {'code':401 ,'success': False, 'message': 'Please relogin!'}

    def get_captcha(self):
        self.captcha_token = "".join(random.choices(string.ascii_letters + string.digits, k=30))
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = session_requests.get(
                    self.url["getCaptcha"] + self.captcha_token, 
                    headers={"user-agent": self.get_user_agent()},
                    proxies=self.proxies,
                    verify=False,
                    timeout=30
                )
                response.raise_for_status()
                result = base64.b64encode(response.content).decode("utf-8")
                return result
            except requests.exceptions.RequestException as e:
                print(f"Error in get_captcha (attempt {attempt + 1}/{max_retries}): {e}")
                if isinstance(e, requests.exceptions.SSLError):
                    print("SSL Error details:", str(e))
                if attempt == max_retries - 1:
                    return None
                time.sleep(2)  # Wait for 2 seconds before retrying

    def createTaskCaptcha(self, base64_img):
        url_0 = 'http://103.72.96.214:8277/api/captcha/bidv'
        url_1 = 'https://captcha.pay2world.vip/bidv'
        url_2 = 'https://captcha1.pay2world.vip/bidv'
        url_3 = 'https://captcha2.pay2world.vip/bidv'
        
        payload = json.dumps({
        "image_base64": base64_img
        })
        headers = {
        'Content-Type': 'application/json'
        }
        
        for _url in [url_0 ,url_1, url_2, url_3]:
            try:
                response = requests.request("POST", _url, headers=headers, data=payload, timeout=10)
                if response.status_code in [404, 502]:
                    continue
                return json.loads(response.text)
            except:
                continue
        return {}

    def solve_captcha(self):
        get_captcha = self.get_captcha()
        if get_captcha is None:
            return { "code": 421,"success": False, "msg": "Failed to get captcha after multiple attempts", "data": None}
        result = self.createTaskCaptcha(get_captcha)
        if 'prediction' in result and result['prediction']:
            self.captcha_value = result['prediction']
            return {"success": True, "key": self.captcha_token, "captcha": self.captcha_value}
        else:
            return { "code": 421,"success": False, "msg": "Error solve captcha", "data": result}

    def encrypt_data(self, data):
        url = "https://encrypt1.pay2world.vip/api.php?act=encrypt"

        payload = json.dumps(data)
        headers = {
        'Content-Type': 'application/json',
        }
        response = requests.request("POST", url, headers=headers, data=payload)

        return json.loads(response.text)

    def decrypt_data(self, cipher):
        url = "https://encrypt1.pay2world.vip/api.php?act=decrypt"

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
            print(self.proxies)
            response = session_requests.post(url, headers=headers, data=json.dumps(encrypted_data), timeout=self.timeout,proxies=self.proxies)
            result = response.json()
            self.auth_token = response.headers.get("Authorization")
            return self.decrypt_data(result)
        except requests.exceptions.RequestException as e:
            return {"code":401,"success": False, "msg": "Token hết hạn vui lòng đăng nhập lại","data":str(e)}

    def header_null(self, headers=None):
        default_headers = {
            "Accept-Language": "vi",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": self.get_user_agent(),
            "Host": "smartbanking.bidv.com.vn",
            "Origin": "https://smartbanking.bidv.com.vn",
            "Referer": "https://smartbanking.bidv.com.vn/",
        }
        if headers:
            default_headers.update(headers)
        return default_headers

    def get_user_agent(self):
        user_agent_array = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/604.3.5 (KHTML, like Gecko) Version/11.0.1 Safari/604.3.5",
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.89 Safari/537.36 OPR/49.0.2725.47",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/604.4.7 (KHTML, like Gecko) Version/11.0.2 Safari/604.4.7",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Safari/537.36 Edge/15.15063",
        "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:56.0) Gecko/20100101 Firefox/56.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:52.0) Gecko/20100101 Firefox/52.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36 OPR/49.0.2725.64",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.106 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/604.4.7 (KHTML, like Gecko) Version/11.0.2 Safari/604.4.7",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.11; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/62.0.3202.94 Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; WOW64; rv:56.0) Gecko/20100101 Firefox/56.0",
        "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/58.0",
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
        "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:52.0) Gecko/20100101 Firefox/52.0",
        "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0;  Trident/5.0)",
        "Mozilla/5.0 (Windows NT 6.1; rv:52.0) Gecko/20100101 Firefox/52.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/63.0.3239.84 Chrome/63.0.3239.84 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36",
        "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:56.0) Gecko/20100101 Firefox/56.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.89 Safari/537.36",
        "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.0; Trident/5.0;  Trident/5.0)",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_5) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8",
        "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/604.3.5 (KHTML, like Gecko) Version/11.0.1 Safari/604.3.5",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.1.2 Safari/603.3.8",
        "Mozilla/5.0 (Windows NT 10.0; WOW64; rv:57.0) Gecko/20100101 Firefox/57.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.79 Safari/537.36 Edge/14.14393",
        "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:56.0) Gecko/20100101 Firefox/56.0",
        "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; Touch; rv:11.0) like Gecko",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.13; rv:58.0) Gecko/20100101 Firefox/58.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Safari/604.1.38",
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36",
        "Mozilla/5.0 (X11; CrOS x86_64 9901.77.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.97 Safari/537.36"
                        ]
        return random.choice(user_agent_array)

