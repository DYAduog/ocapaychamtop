'''
--- functions to make API interaction with Woo-commerce ---
'''

import requests
import logging
from requests.auth import HTTPBasicAuth
import re
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger("API_service_woo")

def detect_woo_order(description: str):
    if not description:
        return None
    
    # Pattern: GH followed by exactly 6 digits, where GH is at the start or preceded by ., ,, -, or space
    pattern = r'(?:^|[\s.,\-])(GH\d{6})'
    match = re.search(pattern, description)
    
    if match:
        return match.group(1)  # Return just the GH + 6 digits part
    else:
        return None

def create_woocommerce_order(
    url: str,
    consumer_key: str,
    consumer_secret: str,
    data: dict
) -> int:
    """
    Create a WooCommerce order with:
        - customer name from "ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN"
        - total from "PHÁT SINH CÓ"
    Returns: WooCommerce order ID
    """
    # Extract fields
    customer_name = data.get("ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN", "Unknown").strip()
    amount_str = data.get("PHÁT SINH CÓ", "0").replace(",", "").strip()

    try:
        total = float(amount_str)
    except ValueError:
        total = 0.0

    # Build WooCommerce order payload
    payload = {
        "payment_method": "bacs",
        "payment_method_title": "Bank Transfer",
        "set_paid": False,
        "billing": {
            "first_name": "[hb is testing] " + customer_name
        },
        "fee_lines": [
            {
                "name": "Bank Transaction",
                "total": f"{total:.2f}"
            }
        ]
    }

    # Send to WooCommerce
    endpoint = f"{url.rstrip('/')}/wp-json/wc/v3/orders"
    response = requests.post(
        endpoint,
        auth=HTTPBasicAuth(consumer_key, consumer_secret),
        json=payload
    )

    response.raise_for_status()
    return response.json().get("id")

# list all Woo-commerce orders
def list_orders(
    url:str,
    customer_key: str,
    customer_secret:str
):
    response = requests.get(
        f"{url}/wp-json/wc/v3/orders",
        auth=HTTPBasicAuth(customer_key, customer_secret)
    )
    return response.json()

def send_transaction_to_woo(
    url:str,
    secure_token: str,
    transaction_data: dict,
    order_id: str,
    subAccId: str = '839689988'
):
    # Parse amount
    amount_str = transaction_data.get("PHÁT SINH CÓ", "").strip().replace(',', '')
    try:
        amount = float(amount_str) if amount_str else 0.0
    except ValueError:
        # amount = 0.0
        return {"error": "Invalid amount format in transaction data."}

    # Parse date
    date_str = transaction_data.get("NGÀY GIAO DỊCH", "")
    try:
        date_obj = datetime.strptime(date_str, "%d/%m/%Y %H:%M:%S")
        formatted_date = date_obj.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return {"error": "Invalid date format in transaction data."}
    
    # build payload
    payload = {
        "error": 0,
        "data": [
            {
                "description": order_id,
                "amount": amount,
                "when": formatted_date,
                "subAccId": subAccId
            }
        ]
    }

    # Send request
    response = requests.post(
        url=url,
        headers={
            "Secure-Token": secure_token,
            "Content-Type": "application/json"
        },
        json=payload
    )
    
    return response.json()

# retrieve Woo-commerce orders
# def retrieve_order(
#     customer_key: str,
#     customer_secret: str,
#     order_id: int
# ):
#     return


# create an order
def create_order(
    url: str,
    customer_key: str,
    customer_secret: str,
    order_data: dict
):
    payload = {
        "payment_method": order_data.get("payment_method", "cod"),
        "payment_method_title": order_data.get("payment_method_title", "Cash on Delivery"),
        "set_paid": order_data.get("set_paid", True),
        "billing": order_data.get("billing", {}),
        "line_items": order_data.get("line_items", [])
    }
    if not payload["line_items"]:
        return {"error": "No line items provided for the order."}
    
    endpoint = f'{url}/wp-json/wc/v3/orders'
    response = requests.post(
        endpoint,
        auth=HTTPBasicAuth(customer_key, customer_secret),
        headers={'Content-Type': 'application/json'},
        json=payload
    )
    
    return response.json()

# update an order
def update_order(
    url: str,
    customer_key: str,
    customer_secret: str,
    order_id: int,
    order_data: dict
):
    endpoint = f'{url}/wp-json/wc/v3/orders/{order_id}'
    response = requests.put(
        endpoint,
        auth=HTTPBasicAuth(customer_key, customer_secret),
        headers={'Content-Type': 'application/json'},
        json=order_data
    )
    return response.json()

# confirm an order
def confirm_order(
    url: str,
    customer_key: str,
    customer_secret: str,
    order_id: str
):
    endpoint = f'{url}/wp-json/wc/v3/orders/{order_id}'
    response = requests.post(
        endpoint,
        auth=HTTPBasicAuth(customer_key, customer_secret),
        headers={'Content-Type': 'application/json'},
        json={"status": "completed"}
    )
    return response.json()

# delete an order
# def delete_order(
#     url: str,
#     customer_key: str,
#     customer_secret: str,
#     order_id: int
# ):
#     return

def process_woo_transaction(
    url: str,
    consumer_key: str,
    consumer_secret: str,
    transaction_data: dict,
    secure_token: str = None
) -> dict:
    """
    Complete WooCommerce transaction processing pipeline:
    1. Detect if transaction description contains WooCommerce order ID (GH######)
    2. Create new WooCommerce order if detected
    3. Confirm the order (for testing purposes)
    
    Args:
        url: WooCommerce site URL (e.g., "https://peachpuff-magpie-417022.hostingersite.com/esim")
        consumer_key: WooCommerce API consumer key
        consumer_secret: WooCommerce API consumer secret
        transaction_data: MB Bank transaction data dict
        secure_token: Optional secure token for webhook confirmation
    
    Returns:
        dict: Processing result with status and details
    """
    
    try:
        # Extract transaction description
        description = transaction_data.get("NỘI DUNG", "")
        customer_name = transaction_data.get("ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN", "Unknown")
        trans_ref = transaction_data.get("SỐ BÚT TOÁN", "N/A")
        trans_date = transaction_data.get("NGÀY GIAO DỊCH", "N/A")
        credit_amount = transaction_data.get("PHÁT SINH CÓ", "0")
        
        logger.info(f"🛒 Processing transaction: {trans_ref}")
        logger.info(f"🛒 Description: {description}")
        logger.info(f"🛒 Customer: {customer_name}")
        logger.info(f"🛒 Amount: {credit_amount} VND")
        
        # ✅ STEP 1: Detect WooCommerce order ID
        detected_order_id = detect_woo_order(description)
        
        if not detected_order_id:
            logger.info(f"🚫 No WooCommerce order detected in transaction {trans_ref}")
            return {
                "status": "not_woo_transaction",
                "message": "No WooCommerce order ID detected in transaction description",
                "transaction_ref": trans_ref,
                "description": description,
                "woo_order_detected": False
            }
        
        logger.info(f"✅ WooCommerce order detected: {detected_order_id}")
        
        # ✅ STEP 2: Create WooCommerce order
        try:
            woo_order_id = create_woocommerce_order(
                url=url,
                consumer_key=consumer_key,
                consumer_secret=consumer_secret,
                data=transaction_data
            )
            
            logger.info(f"✅ WooCommerce order created successfully: #{woo_order_id}")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to create WooCommerce order: {e}")
            return {
                "status": "create_order_failed",
                "message": f"Failed to create WooCommerce order: {str(e)}",
                "transaction_ref": trans_ref,
                "detected_order_id": detected_order_id,
                "woo_order_detected": True,
                "woo_order_created": False
            }
        except Exception as e:
            logger.error(f"❌ Unexpected error creating WooCommerce order: {e}")
            return {
                "status": "create_order_error",
                "message": f"Unexpected error: {str(e)}",
                "transaction_ref": trans_ref,
                "detected_order_id": detected_order_id,
                "woo_order_detected": True,
                "woo_order_created": False
            }
        
        # ✅ STEP 3: Confirm/Complete the order (testing purpose)
        try:
            confirm_result = confirm_order(
                url=url,
                customer_key=consumer_key,
                customer_secret=consumer_secret,
                order_id=str(woo_order_id)
            )
            
            # Check if confirmation was successful
            if isinstance(confirm_result, dict) and confirm_result.get("id") == woo_order_id:
                logger.info(f"✅ WooCommerce order #{woo_order_id} confirmed successfully")
                order_confirmed = True
                confirm_message = "Order confirmed successfully"
            else:
                logger.warning(f"⚠️ Order confirmation returned unexpected result: {confirm_result}")
                order_confirmed = False
                confirm_message = f"Unexpected confirmation result: {confirm_result}"
                
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Failed to confirm WooCommerce order #{woo_order_id}: {e}")
            order_confirmed = False
            confirm_message = f"Failed to confirm order: {str(e)}"
        except Exception as e:
            logger.error(f"❌ Unexpected error confirming order #{woo_order_id}: {e}")
            order_confirmed = False
            confirm_message = f"Unexpected confirmation error: {str(e)}"
        
        # ✅ OPTIONAL: Send transaction to webhook (if secure_token provided)
        webhook_result = None
        if secure_token and detected_order_id:
            try:
                webhook_result = send_transaction_to_woo(
                    url=url,  # Webhook URL (might be different from WooCommerce URL)
                    secure_token=secure_token,
                    transaction_data=transaction_data,
                    order_id=detected_order_id,
                    subAccId='839689988'
                )
                # logger.info(f"📡 Webhook notification sent for order {detected_order_id}")
            except Exception as e:
                # logger.error(f"❌ Failed to send webhook notification: {e}")
                webhook_result = {"error": f"Webhook failed: {str(e)}"}
        
        # ✅ RETURN COMPREHENSIVE RESULT
        return {
            "status": "success",
            "message": "WooCommerce transaction processed successfully",
            "transaction_ref": trans_ref,
            "transaction_date": trans_date,
            "customer_name": customer_name,
            "amount": credit_amount,
            "description": description,
            
            # Detection results
            "woo_order_detected": True,
            "detected_order_id": detected_order_id,
            
            # Creation results
            "woo_order_created": True,
            "woo_order_id": woo_order_id,
            
            # Confirmation results
            "woo_order_confirmed": order_confirmed,
            "confirm_message": confirm_message,
            
            # Webhook results (if applicable)
            "webhook_sent": webhook_result is not None,
            "webhook_result": webhook_result,
            
            # Summary
            "processing_summary": {
                "steps_completed": 3 if order_confirmed else 2,
                "total_steps": 3,
                "all_successful": order_confirmed
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Fatal error processing WooCommerce transaction: {e}")
        return {
            "status": "fatal_error",
            "message": f"Fatal processing error: {str(e)}",
            "transaction_ref": transaction_data.get("SỐ BÚT TOÁN", "N/A"),
            "woo_order_detected": False,
            "woo_order_created": False,
            "woo_order_confirmed": False
        }