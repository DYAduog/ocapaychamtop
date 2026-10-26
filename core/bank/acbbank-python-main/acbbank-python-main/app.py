from fastapi import FastAPI, Form
from fastapi.openapi.docs import get_redoc_html
from pydantic import BaseModel
import uvicorn
from acb import ACB
import sys
import traceback
from api_response import APIResponse

app = FastAPI()

@app.get("/", tags=["root"])
def read_root():
    return {"Hello": "World"}

@app.get("/redoc", include_in_schema=False)
def redoc_html():
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=app.title + " - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"
    )

class LoginDetails(BaseModel):
    username: str
    password: str
    account_number: str
@app.post('/login', tags=["login"], summary="Đăng nhập tài khoản", description="Đăng nhập vào hệ thống ngân hàng ACB. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def login_api(
    username: str = Form(..., description="Tên đăng nhập"),
    password: str = Form(..., description="Mật khẩu"),
    account_number: str = Form(..., description="Số tài khoản")
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.login()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/get_balance', tags=["get_balance"], summary="Lấy số dư tài khoản", description="Trả về số dư hiện tại của tài khoản. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def get_balance_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.get_balance()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
@app.post('/get_transactions', tags=["get_transactions"], summary="Lấy lịch sử giao dịch", description="Trả về lịch sử giao dịch của tài khoản. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def get_transactions_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    rows: int = Form(..., description="Số lượng giao dịch lấy ra")
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.get_transactions(account_number, rows)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

# --- Các API bổ sung ---

@app.post('/get_bank_name', tags=["bank"], summary="Lấy tên ngân hàng thụ hưởng", description="Trả về thông tin tên ngân hàng thụ hưởng. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def get_bank_name_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    ben_account_number: str = Form(...),
    bank_code: str = Form(...)
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.get_bank_name(ben_account_number, bank_code)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/get_detail', tags=["account"], summary="Lấy chi tiết tài khoản", description="Trả về chi tiết tài khoản. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def get_detail_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.get_detail()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/confirm_transfer', tags=["transfer"], summary="Xác nhận chuyển khoản", description="Xác nhận giao dịch chuyển khoản với OTP. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def confirm_transfer_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    uuid: str = Form(..., description="UUID giao dịch"),
    otp: str = Form(..., description="Mã OTP")
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.confirm_transfer(uuid, otp)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/transfer', tags=["transfer"], summary="Thực hiện chuyển khoản", description="Thực hiện giao dịch chuyển khoản. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def transfer_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    local: str = Form(..., description="Menu chuyển khoản"),
    amount: int = Form(..., description="Số tiền chuyển"),
    partnerName: str = Form(..., description="Tên người nhận"),
    name_bank: str = Form(..., description="Tên ngân hàng"),
    comment: str = Form(..., description="Nội dung chuyển khoản"),
    ben_account_number: str = Form(..., description="Số tài khoản nhận"),
    bbank_code: str = Form(..., description="Mã ngân hàng nhận"),
    bank_code: str = Form(..., description="Mã Napas ngân hàng nhận")
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.transfer(local, amount, partnerName, name_bank, comment, ben_account_number, bbank_code, bank_code)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/transfer_limit', tags=["transfer"], summary="Giới hạn chuyển khoản", description="Kiểm tra giới hạn chuyển khoản. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def transfer_limit_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    bankName: str = Form(..., description="Tên ngân hàng nhận"),
    bank_code: str = Form(..., description="Mã Napas ngân hàng nhận"),
    ben_account_number: str = Form(..., description="Số tài khoản nhận")
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.transfer_limit(bankName, bank_code, ben_account_number)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/get_list_bank', tags=["bank"], summary="Danh sách ngân hàng Napas", description="Trả về danh sách ngân hàng Napas. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def get_list_bank_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...)
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.get_list_bank()
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)

@app.post('/get_bank_info', tags=["bank"], summary="Thông tin ngân hàng thụ hưởng", description="Trả về thông tin ngân hàng thụ hưởng. Dữ liệu gửi dạng application/x-www-form-urlencoded.")
def get_bank_info_api(
    username: str = Form(...),
    password: str = Form(...),
    account_number: str = Form(...),
    bank_code: str = Form(...),
    ben_account_number: str = Form(...)
):
    try:
        acb = ACB(username, password, account_number)
        response = acb.get_bank_info(bank_code, ben_account_number)
        return APIResponse.json_format(response)
    except Exception as e:
        response = str(e)
        print(traceback.format_exc())
        print(sys.exc_info()[2])
        return APIResponse.json_format(response)
if __name__ == "__main__":
    uvicorn.run(app ,host='0.0.0.0', port=3000)