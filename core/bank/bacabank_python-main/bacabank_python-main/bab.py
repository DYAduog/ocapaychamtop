import requests
import json
import time
import datetime
from requests.cookies import RequestsCookieJar
import base64
import re
import urllib.parse
from bs4 import BeautifulSoup
import os
class BacABank:
    def __init__(self,username, password, account_number):
        self.is_login = False
        self.time_login = time.time()
        self.file = f"data/{username}.txt"
        self.username = username
        self.password = password
        self.account_number = account_number
        self.cookies = RequestsCookieJar()
        self.session = requests.Session()
        self.account_number = ''
        self.account_url = None
        self.last_url = ''
        self.dse_sessionId = ''
        self.dse_processorId=''
        self.check_balance = False
        self.transactions = []
        if not os.path.exists(self.file) or os.path.getsize(self.file) == 0:
            self.username = username
            self.password = password
            self.account_number = account_number
            self.save_data()
            
        else:
            self.parse_data()
            self.username = username
            self.password = password
            self.account_number = account_number
    def check_error_message(self,html_content):
        pattern = r'<span style="color: black"><strong>(.*?)</strong></span>'
        match = re.search(pattern, html_content)
        if match:
            return match.group(1)
        else:
            pattern = r'<span><font style="color: red">(.*?)</font></span>'
            match = re.search(pattern, html_content)
            return match.group(1) if match else None
    def extract_account_number(self,html_content):
        pattern = r'acctNo=([0-9]{8,16})'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_account_url(self,html_content):
        pattern = r'"(/IBSRetail/Request\?&dse_sessionId=.*&dse_applicationId=-1&dse_pageId=[4-5]&dse_operationName=retailQueryAccountInformationProc&dse_processorState=initial&dse_nextEventName=detail&option=account&acctNo=[0-9]{8,16}&acctType=CA)"'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_balance(self,html_content):
        pattern = r'<div class="col-sm-5">\s+Số dư khả dụng\s+</div>\s+<div class="col-sm-7 text-right">\s+(.*)\r\s'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_dse_processorId(self,html_content):
        pattern = r'<input type="hidden" name="dse_processorId" value="(.*)"'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_page_url(self,html_content,page):
        pattern = r'<a style="color:#100719;" href="([^>]*)">'+str(page)+'</a>'
        match = re.search(pattern, html_content)
        return match.group(1) if match else None
    def extract_transaction_history(self,html_string):
            soup = BeautifulSoup(html_string, "html.parser")
            tbody = soup.find('tbody', id='allResultTableBody')
            if tbody:
                rows = tbody.find_all('tr', class_='bg1')
            else:
                return []

            history_records = []

            for row in rows:
                columns = row.find_all('td')
                record = {
                    "transaction_iD": columns[0].text.strip(),
                    "time": columns[1].text.strip(),
                    "amount": columns[2].text.strip(),
                    "status": columns[3].text.strip(),
                    "method": columns[4].text.strip(),
                    "description": columns[5].get('title', '').strip()
                }
                history_records.append(record)

            return history_records
    def save_data(self):
        data = {
            'username': self.username,
            'password': self.password,
            'account_number': self.account_number,
            'time_login': self.time_login,
            'is_login': self.is_login,
        }
        with open(self.file, 'w') as f:
            json.dump(data, f)

    def parse_data(self):
        with open(self.file, 'r') as f:
            data = json.load(f)
        self.username = data.get('username', '')
        self.password = data.get('password', '')
        self.account_number = data.get('account_number', '')
        self.time_login = data.get("time_login", "")
        self.is_login = data.get("is_login", "")
    def login(self):
        self.session = requests.Session()
        url = "https://ebanking.baca-bank.vn/IBSRetail/Request?&dse_sessionId=s2xe-FimkVx4j9lPeztr8eF&dse_applicationId=-1&dse_pageId=1&dse_operationName=retailIndexProc&dse_errorPage=error_page.jsp&dse_processorState=initial&dse_nextEventName=start"

        payload = {}
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        }

        response = self.session.get(url, headers=headers, data=payload,allow_redirects=True)
        pattern = r'dse_sessionId=(.*?)&dse_applicationId=(.*?)&dse_pageId=(.*?)&dse_operationName=(.*?)&dse_errorPage=(.*?)&dse_processorState=(.*?)&dse_nextEventName=(.*?)\';'
        pattern_url = r'window.location.href = \'(.*?)\';'
        match = re.search(pattern, response.text)
        match_url = re.search(pattern_url, response.text)
        self.dse_sessionId = str(match.group(1))
        if match_url:
            url1 = 'https://ebanking.baca-bank.vn'+match_url.group(1)
            payload = {}
            headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://ebanking.baca-bank.vn/IBSRetail/EstablishSession?&fromOpName=retailIndexProc&fromStateName=initial&fromEventName=start',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
            }
            response = self.session.get(url1, headers=headers, data=payload)
            base64_captcha_img = self.getCaptcha()
            result = self.createTaskCaptcha(base64_captcha_img)
            if 'prediction' in result and result['prediction']:
                captchaText = result['prediction']
                # return {"status": True, "key": self.guid, "captcha": captcha_value}
            else:
                return {"status": False, "msg": "Error solve captcha", "data": result}
            payload = 'dse_sessionId='+str(match.group(1))+'&dse_applicationId=-1&dse_pageId=2&dse_operationName=retailUserLoginProc&dse_errorPage=index.jsp&dse_processorState=initial&dse_nextEventName=start&_userName='+self.username+'&_password='+urllib.parse.quote(self.password)+'&_password1=&_verifyCode='+captchaText
            headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://ebanking.baca-bank.vn',
            'Connection': 'keep-alive',
            'Referer': url1,
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
            }

            response = self.session.post("https://ebanking.baca-bank.vn/IBSRetail/Request", headers=headers, data=payload)
            dse_processorId = self.extract_dse_processorId(response.text)
            if dse_processorId:
                payload = 'dse_sessionId='+str(match.group(1))+'&dse_applicationId=-1&dse_pageId=3&dse_operationName=retailUserLoginProc&dse_errorPage=error_page.jsp&dse_processorState=loginConductJSP&dse_nextEventName=ok&dse_processorId='+dse_processorId+'&_loginedConduct=forceLastLogin'
                
                headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://ebanking.baca-bank.vn',
                'Connection': 'keep-alive',
                'Referer': url1,
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
                }

                response = self.session.post("https://ebanking.baca-bank.vn/IBSRetail/Request", headers=headers, data=payload)
        
            pattern2 = r'dse_sessionId=(.*?)&dse_applicationId=(.*?)&dse_pageId=(.*?)&dse_operationName=(.*?)&dse_errorPage=(.*?)&dse_processorState=(.*?)&dse_nextEventName=(.*?)&toOpName=(.*?)\';'
            pattern_url2 = r'window.location.href = \'(.*?)\';'
            match2 = re.search(pattern2, response.text)
            match_url2 = re.search(pattern_url2, response.text)
            url2 = 'https://ebanking.baca-bank.vn'+match_url2.group(1)
            self.last_url = url2
            payload = {}
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'https://ebanking.baca-bank.vn/IBSRetail/Request',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
                }
            response = self.session.get(url2, headers=headers, data=payload)
            # with open("a.html", "w", encoding="utf-8") as file:
            #     file.write(response.text)
            check_error_message = self.check_error_message(response.text)
            if check_error_message:
                if 'Tài khoản truy cập của Quý khách bị khóa' in check_error_message:
                    return {
                        'success': False,
                        'code': 449,
                        'message': check_error_message
                    }
                if 'Tên truy cập hoặc mật khẩu của bạn không chính xác!' in check_error_message:
                    return {
                        'success': False,
                        'code': 444,
                        'message': check_error_message
                    }
                return {
                    'success': False,
                    'code': 400,
                    'message': check_error_message
                }
            else:
                self.account_number = self.extract_account_number(response.text)
                account_url = self.extract_account_url(response.text)
                if account_url:
                    self.account_url = 'https://ebanking.baca-bank.vn' + self.extract_account_url(response.text)
                else:
                    return {
                    'code': 520,
                    'success': False,
                    'message': 'Unknow error!',
                    }
                self.is_login = True
                self.time_login = time.time()
                self.save_data()
                return {
                    'success': True,
                    'code': 200,
                    'message': 'Đăng nhập thành công',
                    'account_number': self.account_number
                }

    def get_balance(self):
        if not self.is_login or time.time() - self.time_login > 20:
            login = self.login()
            if not login['success']:
                return login
        if not self.account_url:
            login = self.login()
            if 'success' not in login or not login['success']:
                return login
        payload = {}
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': self.last_url,
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache'
            }
        response = self.session.get(self.account_url, headers=headers, data=payload)
        # with open("balance.html", "w", encoding="utf-8") as file:
        #     file.write(response.text)
        self.dse_processorId = self.extract_dse_processorId(response.text)
        balance =  self.extract_balance(response.text)
        balance = balance.replace(',','') if balance else None
        self.check_balance = True
        if balance:
            return {'code':200,'success': True, 'message': 'Thành công',
                                'data':{
                                    'account_number':self.account_number,
                                    'balance':int(balance)
                        }}
        self.is_login = False
        self.save_data()
        return {'code':520 ,'success': False, 'message': 'Unknown Error!'} 

    def createTaskCaptcha(self, base64_img):
        url_1 = 'https://captcha.pay2world.vip//babbiz'
        url_2 = 'https://captcha1.pay2world.vip//babbiz'
        url_3 = 'https://captcha2.pay2world.vip//babbiz'
        
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

    def getCaptcha(self):
        url = 'https://ebanking.baca-bank.vn/IBSRetail/servlet/ImageServlet'
        headers = {}
        response = self.session.get(url, headers=headers)
        return base64.b64encode(response.content).decode('utf-8')
    def get_transactions_by_page(self,url,page,limit):
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ebanking.baca-bank.vn',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
        }

        response = self.session.get("https://ebanking.baca-bank.vn"+url, headers=headers)
        transaction_history = self.extract_transaction_history(response.text)

        if page*10 < limit:
            if transaction_history:
                self.transactions += transaction_history
            page=page+1
            
            page_url = self.extract_page_url(response.text,page)
            if page_url:
                return self.get_transactions_by_page(page_url,page,limit)
        else:
            if transaction_history:
                self.transactions += transaction_history[:limit - (page-1)*10]
        return True
            
        
        
        
    def get_transactions(self,fromDate,toDate,limit=100):
        self.transactions = []
        if not self.check_balance:
            self.get_balance()
        payload = 'dse_sessionId='+self.dse_sessionId+'&dse_applicationId=-1&dse_operationName=retailQueryAccountInformationProc&dse_pageId=9&dse_processorState=showAccDetailsState&dse_processorId='+self.dse_processorId+'&dse_errorPage=error_page.jsp&dse_nextEventName=query&vErrorPage=%2Faccountmanagement%2Fquery_transaction_information.jsp&research=yes&beginDate='+urllib.parse.quote(fromDate)+'&endDate='+urllib.parse.quote(toDate)+'&_period=&is_detail_search=&transaction_channel=&transaction_type='
        headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.100.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://ebanking.baca-bank.vn',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
        }

        response = self.session.post("https://ebanking.baca-bank.vn/IBSRetail/Request", headers=headers, data=payload)
        # with open("transactions.html", "w", encoding="utf-8") as file:
        #     file.write(response.text)
        self.transactions = self.extract_transaction_history(response.text)
        
        page_url = self.extract_page_url(response.text,2)
        if page_url:
            self.get_transactions_by_page(page_url,2,limit)
        
        if self.transactions:
            return {'code':200,'success': True, 'message': 'Thành công',
                            'data':{
                                'transactions':self.transactions,
                    }}
        else:
            self.is_login = False
            self.save_data()
            return  {
                    "success": False,
                    "code": 503,
                    "message": "Service Unavailable!"
                }