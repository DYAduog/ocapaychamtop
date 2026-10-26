from fastapi import FastAPI, File, Form
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
from namabank import Namabank
import sys
import traceback
from api_response import APIResponse

app = FastAPI()


@app.get("/")
def read_root():
    return {"Hello": "World"}
def as_list(value):
    if value is None:
        return None
    if isinstance(value, list):
        return value
    return [value]

def get_proxy_list(proxy_list: Optional[str] = Form(None)):
    if proxy_list:
        return proxy_list.split(',')
    return None

@app.post('/get_balance', tags=["get_balance"])
async def get_balance_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    proxy_list: Optional[str] = Form(None)
):
    try:
        proxies = get_proxy_list(proxy_list)
        nab = Namabank(proxies)
        balance = nab.get_balance(username, password, account_number)
        return APIResponse.json_format(balance)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
    
    # ...existing code...
    
@app.post('/get_transactions', tags=["get_transactions"])
async def get_transactions_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    limit: int = Form(...),
    proxy_list: Optional[str] = Form(None)
):
    try:
        proxies = get_proxy_list(proxy_list)
        nab = Namabank(proxies)
        transactions = nab.get_transaction(username, password, account_number, from_date, to_date, limit)
        return APIResponse.json_format(transactions)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
    

# Đăng nhập lấy token và deviceID
@app.post('/login', tags=["login"])
async def login_api(
    username: str = Form(...),
    password: str = Form(...),
    proxy_list: Optional[str] = Form(None)
):
    try:
        proxies = get_proxy_list(proxy_list)
        nab = Namabank(proxies)
        # Tạo session_token tạm
        import time, hashlib
        a = int(time.time() * 1000)
        session_token = f"WEB-USER({hashlib.md5(f'{a}login{a}'.encode()).hexdigest()})WEB-USER"
        login_info = nab.login(username, password, session_token)
        return APIResponse.json_format(login_info)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

# Lấy thông tin khách hàng từ token
@app.post('/get_info', tags=["get_info"])
async def get_info_api(
    session_token: str = Form(...),
    proxy_list: Optional[str] = Form(None)
):
    try:
        proxies = get_proxy_list(proxy_list)
        nab = Namabank(proxies)
        info = nab.get_info(session_token)
        return APIResponse.json_format(info)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

# Lấy lịch sử giao dịch (không websocket)
@app.post('/check_history', tags=["check_history"])
async def check_history_api(
    account_number: str = Form(...),
    from_date: str = Form(...),
    to_date: str = Form(...),
    limit: int = Form(...),
    session_token: str = Form(...),
    proxy_list: Optional[str] = Form(None)
):
    try:
        proxies = get_proxy_list(proxy_list)
        nab = Namabank(proxies)
        history = nab.check_history(account_number, from_date, to_date, limit)
        return APIResponse.json_format(history)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

if __name__ == "__main__":
    uvicorn.run(app ,host='0.0.0.0', port=3000)