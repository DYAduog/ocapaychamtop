import requests
import json
import random
import base64
import string
import time
from urllib.parse import quote
import urllib.parse
import urllib3
from requests.cookies import RequestsCookieJar
import os
import pickle

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class OCB:
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
        self.url = {
            "base_api": "https://omnicorp.ocb.com.vn/frontend-web/app/j_spring_security_check",
            "account_list": "https://omnicorp.ocb.com.vn/frontend-web/api/account_cb",
            "transactions": "https://omnicorp.ocb.com.vn/frontend-web/api/transaction/get/search_historys.json"
        }
        self.username = username
        self.password = password
        self.account_number = account_number
        self.account_id = None
        self.current_balance = None
        self.is_login = False
        self.time_login = time.time()
        self.session = requests.Session()
        self.cookies = RequestsCookieJar()
        self.file = f"data/users/{username}.json"
        self.cookies_file = f"data/cookies/{username}.pkl"

        self.timeout = 30
        

        if not os.path.exists(self.file):
            self.username = username
            self.account_number = account_number
            self.account_number = account_number
            self.account_id = None
            self.is_login = False
            self.time_login = time.time()
            self.save_data()
        else:
            self.parse_data()
            self.username = username
            self.password = password
            self.account_number = account_number
            self.load_cookies()

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
            "account_id": self.account_id,
            "current_balance": self.current_balance,
            'time_login': self.time_login,
            'is_login': self.is_login,
        }
        with open(self.file, "w") as file:
            json.dump(data, file)

    def parse_data(self):
        with open(self.file, "r") as file:
            data = json.load(file)
            self.username = data.get("username", "")
            self.password = data.get("password", "")
            self.account_number = data.get("account_number", None)
            self.account_id = data.get("account_id", None)
            self.current_balance = data.get("current_balance", None)
            self.time_login = data.get("time_login", "")
            self.is_login = data.get("is_login", "")
    def reset_cookies(self):
        """Clear session cookies and delete the cookie file."""
        # Clear cookies from the current session
        self.session.cookies.clear()
        
        # Delete the cookie file if it exists
        if os.path.exists(self.cookies_file):
            try:
                os.remove(self.cookies_file)
            except Exception as e:
                # Handle exception if needed, or just pass
                pass
    def save_cookies(self):
        """Save the current session to a file."""
        with open(self.cookies_file, 'wb') as file:
            pickle.dump(self.session.cookies, file)
    def load_cookies(self):
        """Load a session from a file."""
        try:
            with open(self.cookies_file, 'rb') as file:
                loaded_cookies = pickle.load(file)
            self.session.cookies.update(loaded_cookies)
        except Exception as e:
            return False

    def curl_get(self, url, headers=None):
            try:
                headers = self.header_null(headers)
                print('proxy: ',self.proxies)
                self.load_cookies()
                response = self.session.get(url, headers=headers, timeout=self.timeout,proxies=self.proxies)
                self.save_cookies()
                try:
                    result = response.json()
                except json.JSONDecodeError:
                    result = response.text
                return result
            except requests.exceptions.RequestException as e:
                return {"code":401,"success": False,"data":str(e)}

    def curl_post(self, url, data, headers=None):
        try:
            headers = self.header_null(headers)
            print('proxy: ',self.proxies)
            data = urllib.parse.urlencode(data)
            self.load_cookies()
            response = self.session.post(url, headers=headers, data=data, timeout=self.timeout,proxies=self.proxies)
            self.save_cookies()
            try:
                result = response.json()
            except json.JSONDecodeError:
                result = response.text
            return result
        except requests.exceptions.RequestException as e:
            return {"code":401,"success": False,"data":str(e)}

    def header_null(self, headers=None):
        default_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Referer': 'https://omnicorp.ocb.com.vn/frontend-web/app/auth.html',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://omnicorp.ocb.com.vn',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Priority': 'u=0',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        }
        if headers:
            default_headers.update(headers)
        return default_headers
    
    def check_user_name(self):
        params = {
            "step": "1to2",
            "j_username": "esomarrnhap"        
            }
        
        result = self.curl_post(self.url["base_api"], params)
        return result
    def do_login(self):
        if not self.session.cookies:
            check_user_name = self.check_user_name()
            if not ('method' in check_user_name and check_user_name['method'] == 'MASKED_PASSWORD'):
                return {
                    'code': 400,
                    'success': False,
                    'message': 'Tài khoản không hợp lệ hoặc không hỗ trợ đăng nhập bằng mật khẩu',
                    'data': check_user_name
                }

        params = {
            "step": 2,
            "j_username": self.username,
            "j_password": self.password
        }
        
        result = self.curl_post(self.url["base_api"], params)
        # print(result)
        if (
            result.get("redirectURL") == "/frontend-web/app/index.html"
            and result.get("status") == "CREDENTIALS_CORRECT"
        ):
            self.is_login = True
            self.time_login = time.time()
            self.save_data()
            return {
                'code': 200,
                'success': True,
                'message': 'Login successfully!',
                "data": result if result else "",
            }
        elif (
            result.get("redirectURL") == ""
            or result.get("status") == "CREDENTIALS_INCORRECT"
        ):
            return {
                'code': 444,
                "success": False,
                "message": 'Username or password is incorrect',
                "data": result if result else "",
            }
        else:
            return {
                'code': 500,
                "success": False,
                "data": result if result else "",
            }

    def get_balance(self,account_number,retry=False):
            if not self.is_login:
                login = self.do_login()
                if 'success' not in login or not login['success']:
                    return login
            
            result = self.curl_get(self.url["account_list"])
            if result.get('status') == 'EXECUTED' and 'data' in result:
                for account_info in result['data']:
                    if account_info['accountNo'] == account_number:
                        self.current_balance = account_info['currentBalance']
                        self.account_id = account_info['accountId']
                        self.save_data()
                        if int(self.current_balance) < 0:
                            return {'code':448,'success': False, 'message': 'Blocked account with negative balances!',
                                    'data': {
                                        'balance':int(self.current_balance)
                                    }
                                    } 
                        else:
                            return {'code':200,'success': True, 'message': 'Thành công',
                                    'data':{
                                        'account_number':self.account_number,
                                        'balance':int(self.current_balance)
                            }}
                return {'code':404,'success': False, 'message': 'account_number not found!'} 
            else:
                self.is_login = False
                self.save_data()
                if not retry:
                    return self.get_balance(account_number, retry=True)
                return {'code':401 ,'success': False, 'message': 'Please relogin!','data': result if result else ""}

    def get_transactions(self, account_number,from_date,to_date,limit = 100,retry = False):
        balance_result = self.get_balance(account_number)
        if not balance_result['success']:
            return balance_result
        params = {
            "accountId": self.account_id,
            "currentBalance": self.current_balance,
            "dateFrom": from_date,
            "dateTo": to_date,
            "filterDateByTransDate": "false",
            "operationAmountFrom": 0,
            "operationAmountTo": 3000000000000,
            "pageNumber": int(1),
            "pageSize": int(limit),
            "sortType": "latest"
        }

        full_url = f"{self.url['transactions']}?{urllib.parse.urlencode(params)}"
        result = self.curl_get(full_url)
        if 'list' in result and result['list'] and 'content' in result['list'] and result['list']['content']:
            return {'code':200,'success': True, 'message': 'Thành công',
                            'data':{
                                'transactions':result['list']['content'],
                    }}
        else:
            self.is_login = False
            self.save_data()
            if not retry:
                return self.get_transactions(account_number, from_date, to_date, limit, retry=True)
            return  {
                    "success": False,
                    "code": 503,
                    "message": "Service Unavailable!",
                    "data": result
                }

    



