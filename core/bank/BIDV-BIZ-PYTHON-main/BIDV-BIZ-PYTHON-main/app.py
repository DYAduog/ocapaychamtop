from bidv import BIDV
import json
import requests
import json
from fastapi import FastAPI, Form
from pydantic import BaseModel
import uvicorn
import sys
import traceback
from api_response import APIResponse


app = FastAPI()
@app.get("/")
def read_root():
    return {"Hello": "World"}

# Sử dụng Form để nhận dữ liệu application/x-www-form-urlencoded
@app.post('/login', tags=["login"])
def login_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.doLogin()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
@app.post('/balance', tags=["balance"])
def confirm_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.get_balance()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
# @app.post('/get_balance', tags=["get_balance"])
# def get_balance_api(input: LoginDetails):
#         bidv = BIDV(input.username, input.password, input.account_number)
#         verify_otp = bidv.submitOtpLogin(input.otp)
#         return verify_otp
    

    
@app.post('/get_transactions', tags=["get_transactions"])
def get_transactions_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    limit: int = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.getHistories(account_number, limit)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

# Bổ sung các API BIDV khác, đều nhận dữ liệu qua Form
@app.post('/get_captcha', tags=["captcha"])
def get_captcha_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.getCaptcha()
        return {"captcha_base64": response}
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/info_account', tags=["info_account"])
def info_account_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.getinfoAccount()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/info_account_ca', tags=["info_account_ca"])
def info_account_ca_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.getinfoAccountCA()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/get_histories', tags=["getHistories"])
def get_histories_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    limit: int = Form(...)
):
    try:
        bidv = BIDV(username, password, account_number)
        response = bidv.getHistories(account_number, limit)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

if __name__ == "__main__":
    uvicorn.run(app ,host='0.0.0.0', port=3000)
    
    