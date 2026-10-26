import requests
import json
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
from bidv import BIDV
import sys
import traceback
from api_response import APIResponse


app = FastAPI()
@app.get("/")
def read_root():
    return {"Hello": "World"}
class LoginDetails(BaseModel):
    username: str
    password: str
    account_number: str
    proxy_list: list
@app.post('/login', tags=["login"])
def login_api(input: LoginDetails):
    try:
        bidv = BIDV(input.username, input.password, input.account_number,input.proxy_list)
        response = bidv.do_login()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
class ConfirmDetails(BaseModel):
    username: str
    password: str
    account_number: str
    otp: str
    proxy_list: list
@app.post('/confirm', tags=["confirm"])
def confirm_api(input: ConfirmDetails):
    try:
        bidv = BIDV(input.username, input.password, input.account_number,input.proxy_list)
        verify_otp = bidv.verify_otp(input.otp)
        return APIResponse.json_format(verify_otp)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
@app.post('/get_balance', tags=["get_balance"])
def get_balance_api(input: LoginDetails):
    try:
        bidv = BIDV(input.username, input.password, input.account_number,input.proxy_list)
        balance = bidv.get_balance(input.account_number)
        return APIResponse.json_format(balance)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
    
class Transactions(BaseModel):
    username: str
    password: str
    account_number: str
    limit: int
    proxy_list: list
@app.post('/get_transactions', tags=["get_transactions"])
def get_transactions_api(input: Transactions):
    try:
        bidv = BIDV(input.username, input.password, input.account_number,input.proxy_list)
        transaction = bidv.get_transactions(input.account_number,input.limit)
        return APIResponse.json_format(transaction)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)


if __name__ == "__main__":
    uvicorn.run(app ,host='0.0.0.0', port=3000)