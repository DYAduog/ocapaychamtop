
import hashlib
import json
import base64
import random
import string
import base64
import json
import os
import hashlib
import time
import uuid
import base64
from datetime import datetime
import re
from bs4 import BeautifulSoup
from lxml import html
import urllib.parse
from bypass_ssl_v3 import get_legacy_session
from urllib.parse import quote

requests = get_legacy_session()
class BIDV:
    def __init__(self, username, password, account_number):
        self.session = get_legacy_session()
        self.is_login = False
        self.file = f"data/{username}.txt"
        self._IBDeviceId = ""
        self.dse_sessionId = ""
        self.balance = None
        self.referer_url = ""
        self.load_account_url = ""
        self.dse_processorId = ""
        self.account_cif = None
        self.dse_pageId = 0
        self.available_balance = 0
        self.token = ""
        self.transactions = []
        self.url = {
    "solve_captcha": "https://captcha.pay2world.vip/bidv",
    "get_balance": "https://www.bidv.vn/iBank/MainEB.html?transaction=PaymentAccount&method=getMain&_ACTION_MODE=search",
    "getCaptcha": "https://www.bidv.vn/iBank/getCaptcha.html",
    "login": "https://www.bidv.vn/iBank/MainEB.html",
    "getHistories": "https://www.bidv.vn/iBank/MainEB.html?transaction=eBankBackend",
}
        self.lang =  "vi"
        self.request_id = None
        self._timeout = 60
        self.init_guid()
        if not os.path.exists(self.file):
            self.username = username
            self.password = password
            self.account_number = account_number
            self.sessionId = ""
            self.browserId = hashlib.md5(self.username.encode()).hexdigest()
            self.save_data()
            
        else:
            self.parse_data()
            self.username = username
            self.password = password
            self.account_number = account_number
    def save_data(self):
        data = {
            'username': self.username,
            'password': self.password,
            'account_number': self.account_number,
            'sessionId': getattr(self, 'sessionId', ''),
            'token': getattr(self, 'token', '')
        }
        with open(self.file, 'w') as f:
            json.dump(data, f)

    def parse_data(self):
        with open(self.file, 'r') as f:
            data = json.load(f)
        self.username = data.get('username', '')
        self.password = data.get('password', '')
        self.account_number = data.get('account_number', '')
        self.sessionId = data.get('sessionId', '')
        self.token = data.get('token', '')
        
    def init_guid(self):
        self._IBDeviceId = self.generate_device_id()
        
    def generate_device_id(self):
        # Generate a random UUID
        random_uuid = uuid.uuid4()
        
        # Convert the UUID to a string
        uuid_str = str(random_uuid)
        
        # Create a hash object
        hash_object = hashlib.sha256()
        
        # Update the hash object with the UUID string
        hash_object.update(uuid_str.encode('utf-8'))
        
        # Get the hexadecimal digest of the hash
        hex_digest = hash_object.hexdigest()
        
        # Return the first 32 characters of the hex digest
        return hex_digest[:32]
    
    def curlGet(self, url):
        # print('curlGet')
        headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.bidv.vn/iBank/MainEB.html',
        "Referer": self.referer_url if self.referer_url else "",
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
        'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Microsoft Edge";v="126"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
        }
        if self.token:
            headers['token'] = self.token
        response = self.session.get(url, headers=headers,allow_redirects=True)
        self.referer_url = url
        try:
            return response.json()
        except:
            response = response.text
            dse_pageId = self.extract_dse_pageId(response)
            if dse_pageId:
                self.dse_pageId = dse_pageId
            # else:
            #     print('error_page',url)
            return response
        return result
    
    def curlPost(self, url, data ,headers = None):
        # print('curlPost')
        if not headers:
            headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
            'Accept': '*/*',
            'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'RESULT_TYPE': 'JSON',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://www.bidv.vn',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Priority': 'u=0'
            }
            if self.token:
                headers['token'] = self.token

        response = self.session.post(url, headers=headers, data=data)
        self.referer_url = url
        try:
            return response.json()
        except:
            response = response.text
            dse_pageId = self.extract_dse_pageId(response)
            if dse_pageId:
                self.dse_pageId = dse_pageId
            # else:
            #     print('error_page',url)
            return response
        return result

    def generate_request_id(self):
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=12)) + '|' + str(int(datetime.now().timestamp()))
    def check_error_message(self,html_content):
        pattern = r'<span><font class=\'text-err_login\'>(.*?)</font></span>'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def check_error_message_details(self,html_content):
        pattern = r'<span><font class=\'text-err_login__desc\'>(.*?)</font></span>'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def check_exit_login(self,html_content):
        return True if 'để tài khoản đã đăng nhập thoát khỏi hệ thống' in html_content else None
    def check_error_captcha(self,html_content):
        return True if 'Mã xác thực không chính xác' in html_content else None
    def extract_tokenNo(self,html_content):
        pattern = r'src="/IBSRetail/servlet/CmsImageServlet\?attachmentId=1&&tokenNo=([a-f0-9-]+)"'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_account_cif(self,html_content):
        pattern = r'<option value="(.+)" >'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_dse_processorId(self,html_content):
        pattern = r'<input type="hidden" name="dse_processorId" value="(.*)"'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_dse_pageId(self,html_content):
        pattern = r'dse_pageId=(\d+)&'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_account_number(self,html_content):
        pattern = r'<span class="desc">(\d+) <em class="icon-coppy"></em></span>'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_load_account(self,html_content):
        pattern = r'/Request?&dse_sessionId=(.)*&dse_applicationId=-1&dse_pageId=(.)*&dse_operationName=corpUserLoginProc&dse_processorState=initial&dse_nextEventName=loadAccounts'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_balance(self,html_content):
        pattern = r'<span class="desc">([^\s]+)</span>'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_by_pattern(self,html_content,pattern):
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def get_total_transaction(self,html_content):
        soup = BeautifulSoup(html_content, 'html.parser')
        h4_element = soup.find('h4')
        if h4_element:
            h4_text = h4_element.get_text(strip=True)
        return int(h4_text.replace('Tổng số bản ghi','').strip()) if h4_element else 0
    def extract_captcha(self,html_content):
        html_content = self.session.get('https://home.pgbank.com.vn/V2018/api/ApiEbank/GetImgVerify?imgcheck=1').json()
        url = html_content['url']
        return "https://home.pgbank.com.vn/V2018/"+str(url) if 'url' in html_content else None
    def extract_page_url(self,html_content,page):
        soup = BeautifulSoup(html_content, 'html.parser')
        div = soup.find('div', class_='so-trang')
        href = None
        if div:
            a_tag = div.find('a', string=str(page)+' ')
            if a_tag:
                href = a_tag['href']
        return 'https://www.bidv.vn/iBank/MainEB.html'+href if href else None
    def extract_transaction_history(self,html_string):
        # Parse the HTML content
        soup = BeautifulSoup(html_string, 'html.parser')

        # Find the tbody with the specific id
        tbody = soup.find('tbody', id='allResultTableBody')
        if tbody:
            # Find all rows with the class 'bg1'
            rows = tbody.find_all('tr', class_='bg1')
        else:
            rows = []

        # Initialize an empty list to store the records
        history_records = []

        # Process each row
        for row in rows:
            columns = row.find_all('td')
            
            # Ensure there are enough columns
            if len(columns) >= 6:
                # Get debit and credit values, default to '0' if not present
                debit = columns[2].text.strip() if columns[2].text.strip() != '0' else '0'
                credit = columns[3].text.strip() if columns[3].text.strip() != '0' else '0'

                # Convert debit and credit to integers and calculate amount
                amount = int(credit.replace(',', '')) - int(debit.replace(',', ''))
                
                # Create a record dictionary
                record = {
                    "transaction_number": columns[0].text.strip(),
                    "transaction_id": columns[1].text.strip(),
                    "time": columns[4].text.strip(),
                    "amount": amount,
                    "description": columns[5].text.strip()
                }
                # Append the record to the list
                history_records.append(record)

        return history_records
    def createTaskCaptcha(self, base64_img):
        url_1 = 'https://captcha.pay2world.vip//bidvBIZ'
        url_2 = 'https://captcha1.pay2world.vip//bidvBIZ'
        url_3 = 'https://captcha2.pay2world.vip//bidvBIZ'
        
        payload = json.dumps({
        "image_base64": base64_img
        })
        headers = {
        'Content-Type': 'application/json'
        }
        
        for _url in [url_1, url_2, url_3]:
            try:
                response = requests.request("POST", _url, headers=headers, data=payload, timeout=10)
                if response.status_code in [404, 502]:
                    continue
                return json.loads(response.text)
            except:
                continue
        return {}
    def solveCaptcha(self):
        url = self.url['getCaptcha']
        response = self.session.post(url)
        base64_captcha_img = response.text
        result = self.createTaskCaptcha(base64_captcha_img)
        # captchaText = self.checkProgressCaptcha(json.loads(task)['taskId'])
        if 'prediction' in result and result['prediction']:
            captcha_value = result['prediction']
            return {"status": True, "captcha": captcha_value}
        else:
            return {"status": False, "msg": "Error solve captcha", "data": result}
    def process_redirect(self,response):
        
        pattern = r'dse_sessionId=(.*?)&dse_applicationId=(.*?)&dse_pageId=(.*?)&dse_operationName=(.*?)&dse_errorPage=(.*?)&dse_processorState=(.*?)&dse_nextEventName=(.*?)\';'
        pattern_url = r'window.location.href = \'(.*?)\';'
        match = re.search(pattern, response)
        match_url = re.search(pattern_url, response)
        self.dse_sessionId = str(match.group(1))
        if match_url:
            return 'https://www.bidv.vn/iBank/MainEB.html'+match_url.group(1)
        else:
            return None
    def process_change_session(self,response):
        pattern = r'dse_sessionId=(.*?)&dse_applicationId=(.*?)&dse_pageId=(.*?)&dse_operationName=(.*?)&dse_processorState=(.*?)&dse_nextEventName=(.*?)\';'
        pattern_url = re.compile(r'/Request\?&dse_sessionId=[^&]+&dse_applicationId=-1&dse_pageId=[^&]+&dse_operationName=corpUserLoginProc&dse_processorState=initial&dse_nextEventName=loadAccounts')
        match = re.search(pattern, response)
        match_url = re.search(pattern_url, response)
        self.dse_sessionId = str(match.group(1))
        if match_url:
            return 'https://www.bidv.vn/iBank/MainEB.html'+match_url.group(0)
        else:
            return None
    def doLogin(self):
        self.session = get_legacy_session()
        response = self.curlGet(self.url['login'])
        # with open("111.html", "w", encoding="utf-8") as file:
        #     file.write(response)
        _token_login = self.extract_by_pattern(response,r'<input type="hidden" name="_token_login" value="(.*)" />')
        # print(_token_login)
        solveCaptcha = self.solveCaptcha()
        if not solveCaptcha["status"]:
                    return solveCaptcha
        captcha_text = solveCaptcha["captcha"]
        payload = 'username='+quote(self.username)+'&password='+quote(self.password)+'&captcha='+quote(captcha_text)+'&transaction=User&method=Login&_token_login='+_token_login
        # print(payload)
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'null',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Priority': 'u=0, i'
        }
        response = self.curlPost(self.url['login'],payload,headers)
        # with open("222.html", "w", encoding="utf-8") as file:
        #     file.write(response)
        if 'url += arrayPathName[1] +\'/MainEB.html\';' in response:
            response = self.curlGet(self.url['login'])
            if 'Số cif doanh nghiệp:' in response:
                self.is_login = True
                self.token = self.extract_by_pattern(response,r'var tokenVar = tokenVar \|\| \'(.*)\';')
                return {
                    'code': 200,
                    'success': True,
                    'message': 'Đăng nhập thành công',
                    'data':{
                        'token':self.token
                    }
                }
            else:
                return {
                    'code': 520,
                    'success': False,
                    'message': "Unknown Error!"
                }
        elif 'Đăng nhập không thành công.' in response:
                return {
                            'code': 404,
                            'success': False,
                            'message': 'Tài khoản không tồn tại hoặc không hợp lệ.',
                            }
        elif 'Tên đăng nhập hoặc mật khẩu không chính xác.' in response:
                return {
                            'code': 444,
                            'success': False,
                            'message': 'Tài khoản hoặc mật khẩu không đúng',
                            }
        elif 'Captcha không chính xác' in response:
                return {
                    'code': 422,
                    'success': False,
                    'message': 'Mã Tiếp tục không hợp lệ',
                    }
        elif 'Tài khoản của quý khách đã bị khóa' in response:
                return {
                    'code': 449,
                    'success': False,
                    'message': 'Blocked account!'                    
                    }
        else:
            return {
                    'code': 520,
                    'success': False,
                    'message': "Unknown Error!"
            }


    def saveData(self):
        data = {
            'username': self.username,
            'password': self.password,
            'account_number': self.account_number,
            'sessionId': self.sessionId,
            'mobileId': self.mobileId,
            'clientId': self.clientId,
            'cif': self.cif,
            'E': self.E,
            'res': self.res,
            'tranId': self.tranId,
            'browserToken': self.browserToken,
            'browserId': self.browserId,
        }
        with open(f"data/{self.username}.txt", "w") as file:
            json.dump(data, file)

    def parseData(self):
        with open(f"data/{self.username}.txt", "r") as file:
            data = json.load(file)
            self.username = data["username"]
            self.password = data["password"]
            self.account_number = data.get("account_number", "")
            self.sessionId = data.get("sessionId", "")
            self.mobileId = data.get("mobileId", "")
            self.clientId = data.get("clientId", "")
            self.token = data.get("token", "")
            self.accessToken = data.get("accessToken", "")
            self.authToken = data.get("authToken", "")
            self.cif = data.get("cif", "")
            self.res = data.get("res", "")
            self.tranId = data.get("tranId", "")
            self.browserToken = data.get("browserToken", "")
            self.browserId = data.get("browserId", "")
            self.E = data.get("E", "")

    def getE(self):
        ahash = hashlib.md5(self.username.encode()).hexdigest()
        imei = '-'.join([ahash[i:i+4] for i in range(0, len(ahash), 4)])
        return imei.upper()

    def getCaptcha(self):
        captchaToken = ''.join(random.choices(string.ascii_uppercase + string.digits, k=30))
        url = self.url['getCaptcha'] + captchaToken
        response = requests.get(url)
        result = base64.b64encode(response.content).decode('utf-8')
        return result

    def get_balance(self):
        if not self.is_login:
            login = self.doLogin()
            if not login['success']:
                return login
        payload = "keyWord=&currencyDefault=VND&hostUnit=Y&memberUnits=0&take=100&skip=0&page=1&pageSize=100"
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'token': self.token,
        'RESULT_TYPE': 'JSON_GRID',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.bidv.vn',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
        }
        response = self.curlPost(self.url['get_balance'],payload,headers)
        # print(response)
        if 'errorCode' in response and  response['errorCode'] == 0 and 'responseData' in response:
            for account in response['responseData']['rows']:
                if self.account_number == account['accountNo']:
                    amount = float(account['availableBalance'].replace(',',''))
                    if amount < 0:
                        return {'code':448,'success': False, 'message': 'Blocked account with negative balances!',
                                'data': {
                                    'balance':amount
                                }
                                }
                    else:
                        return {'code':200,'success': True, 'message': 'Thành công',
                                'data':{
                                    'account_number':self.account_number,
                                    'balance':amount
                        }}
            return {'code':404,'success': False, 'message': 'account_number not found!'} 
        else: 
            return {'code':520 ,'success': False, 'message': 'Unknown Error!'} 
        
        
        
    def getinfoAccount(self):
        param = "_selectedAccType="
        url = "https://www.bidv.vn/iBank/MainEB.html/Request?&dse_sessionId="+self.dse_sessionId+"&dse_applicationId=-1&dse_pageId="+str(self.dse_pageId)+"&dse_operationName=corpQueryTransactionInfomationProc&dse_processorState=firstAndResultPage&dse_processorId="+self.dse_processorId+"&dse_nextEventName=getAccountList"
        
        headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Accept': '*/*',
  'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'https://www.bidv.vn/iBank/MainEB.html',
  'Connection': 'keep-alive',
  'Referer': 'https://www.bidv.vn/iBank/MainEB.html/Request',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin'
}
        response = self.curlPost(url,param,headers)
        return (response)

    def getinfoAccountCA(self):
        if not self.is_login:
            login = self.doLogin()
            if not login['success']:
                return login
        param = "_selectedAccType=CA"
        url = "https://www.bidv.vn/iBank/MainEB.html/Request?&dse_sessionId="+self.dse_sessionId+"&dse_applicationId=-1&dse_pageId="+str(self.dse_pageId)+"&dse_operationName=corpQueryTransactionInfomationProc&dse_processorState=firstAndResultPage&dse_processorId="+self.dse_processorId+"&dse_nextEventName=getAccountList"
        
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': '*/*',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.bidv.vn/iBank/MainEB.html',
        'Connection': 'keep-alive',
        'Referer': 'https://www.bidv.vn/iBank/MainEB.html/Request',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Priority': 'u=0'
        }
        response = self.curlPost(url,param,headers)
        return (response)
    
    def get_transactions_by_page(self,page,limit,postingOrder,postingDate,nextRunBal,account_number):
        
        payload = "SERVICESID=ONLACCINQ&subsvc=getTransactionHistoryOnline&accountNo="+account_number+"&nextRunBal="+quote(nextRunBal)+"&postingOrder="+quote(postingOrder)+"&postingDate="+quote(postingDate)+"&currency=VND&fileIndicator="
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': '*/*',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'token': self.token,
        'RESULT_TYPE': 'JSON',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.bidv.vn',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Priority': 'u=0'
        }
        response = self.curlPost(self.url['getHistories'],payload,headers)
        if 'status' in response and  response['status'] == "0" and 'data' in response and "items" in response['data']:
            transaction_history = response['data']['items']



        if len(transaction_history) < 100:
            if transaction_history:
                self.transactions += transaction_history
        elif page*100 < limit:
            if transaction_history:
                self.transactions += transaction_history
            page=page+1
            nextRunBal = transaction_history[-1]['nextRunBal']
            postingOrder = transaction_history[-1]['postingOrder']
            postingDate = transaction_history[-1]['postingDate']
            return self.get_transactions_by_page(page,limit,postingOrder,postingDate,nextRunBal,account_number)
        else:
            if transaction_history:
                self.transactions += transaction_history[:limit - (page-1)*100]
        return True

    def getHistories(self, account_number='',limit = 100):
        self.transactions = []
        if not self.is_login:
            login = self.doLogin()
            if not login['success']:
                return login
            
        payload = "SERVICESID=ONLACCINQ&subsvc=getTransactionHistoryOnline&accountNo="+account_number+"&currency=VND"    

        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'vi-VN,vi;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'token': self.token,
        'RESULT_TYPE': 'JSON_GRID',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.bidv.vn',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
        }
        response = self.curlPost(self.url['getHistories'], payload,headers)
        
        if 'status' in response and  response['status'] == "0" and 'data' in response and "items" in response['data']:
            self.transactions = response['data']['items']
            nextRunBal = response['data']['items'][-1]['nextRunBal']
            postingOrder = response['data']['items'][-1]['postingOrder']
            postingDate = response['data']['items'][-1]['postingDate']
            
            if limit > 100:
                self.get_transactions_by_page(2,limit,postingOrder,postingDate,nextRunBal,account_number)
                
            return {'code':200,'success': True, 'message': 'Thành công',
                    'data':{
                        'transactions':self.transactions,
            }}
        else:
            return  {
                    "success": False,
                    "code": 503,
                    "message": "Service Unavailable!"
                }
            
            
        return response
        
