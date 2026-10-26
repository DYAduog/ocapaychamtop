import requests
import json
# import time
import os
import datetime
import logging
import lark_oapi as lark
from lark_oapi.api.bitable.v1 import *
from pathlib import Path
# import socket
# from requests.adapters import HTTPAdapter
# from urllib3.util.retry import Retry

from cleaner import find_data_directory

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def push_to_Lark_Base(
    app_id: str,
    app_secret: str,
    json_path: str = None,
    json_data: json = None,
    app_token: str = None,
    table_id: str = None
):
    # Create client
    client = lark.Client.builder()\
        .app_id(app_id)\
        .app_secret(app_secret)\
        .log_level(lark.LogLevel.DEBUG)\
        .build()
    
    # Load JSON data either from file or from provided data
    data = None
    if json_data:
        data = json_data
    elif json_path:
        # Use the Path object to handle the file path in a cross-platform way
        json_file_path = Path(json_path)
        
        if json_file_path.exists():
            logger.info(f"Loading JSON from file: {json_file_path}")
            with open(json_file_path, 'r', encoding='utf-8') as file:
                data = json.load(file)
        else:
            # Try to find the file in the data directory as fallback
            logger.warning(f"JSON file not found at: {json_file_path}")
            data_dir = find_data_directory()
            potential_file = data_dir / os.path.basename(json_path)
            
            if potential_file.exists():
                logger.info(f"Found JSON file in data directory: {potential_file}")
                with open(potential_file, 'r', encoding='utf-8') as file:
                    data = json.load(file)
            else:
                raise ValueError(f"Could not find JSON file: {json_path}")
    else:
        raise ValueError("Either json_data or a valid json_path must be provided")
    
    # Define field mapping to match the Lark Base headers
    field_mapping = {
        "timestamp": "Timestamp",
        "status": "Status",
        "message": "Description",
        "opening_balance": "Opening",
        "closing_balance": "Closing",
        "total_credit": "Credit",
        "total_debit": "Debit",
        "last_updated": "Updated"
    }
    
    # Fields that require numeric conversion
    numeric_fields = ["Opening", "Closing", "Credit", "Debit"]
    
    # Map fields according to the Lark Base headers
    mapped_fields = {}
    
    # Format timestamp consistently - handle both formats:
    # 1. DD-MM-YYYY HH:MM:SS (from the fixed router)
    # 2. ISO format (in case it's present in some data)
    def format_timestamp(timestamp_str):
        try:
            # If it's already in DD-MM-YYYY HH:MM:SS format, return it
            if len(timestamp_str) == 19 and timestamp_str[2] == '-' and timestamp_str[5] == '-':
                return timestamp_str
                
            # If it's in ISO format with 'T' separator
            elif 'T' in timestamp_str:
                dt = datetime.datetime.fromisoformat(timestamp_str.split('.')[0])
                return dt.strftime('%d-%m-%Y %H:%M:%S')
                
            # Any other format, try parsing and convert
            else:
                dt = datetime.datetime.fromisoformat(timestamp_str) if '.' in timestamp_str else datetime.datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                return dt.strftime('%d-%m-%Y %H:%M:%S')
        except Exception:
            # If parsing fails, return original
            return timestamp_str
    
    # Map basic fields with timestamp formatting
    for key in ["timestamp", "status", "message"]:
        if key in data and key in field_mapping:
            if key == "timestamp":
                mapped_fields[field_mapping[key]] = format_timestamp(data[key])
            else:
                mapped_fields[field_mapping[key]] = data[key]
    
    # Map account_info fields with numeric preprocessing
    if "account_info" in data:
        for key, value in data["account_info"].items():
            if key in field_mapping:
                field_name = field_mapping[key]
                # Handle timestamp formatting for last_updated
                if key == "last_updated" and isinstance(value, str):
                    mapped_fields[field_name] = format_timestamp(value)
                # Check if this is a numeric field that needs conversion
                elif field_name in numeric_fields:
                    # Skip "N/A" values for numeric fields to avoid conversion errors
                    if value == "N/A":
                        # Exclude this field from the mapped fields to prevent NumberFieldConvFail error
                        continue
                    
                    # Handle string numeric values
                    if isinstance(value, str):
                        try:
                            # Remove non-numeric characters except decimal point
                            cleaned_value = ''.join(c for c in value if c.isdigit() or c == '.')
                            # Convert to float
                            mapped_fields[field_name] = float(cleaned_value)
                        except (ValueError, TypeError):
                            # If conversion fails, skip this field
                            continue
                    else:
                        # If it's already a number, use it directly
                        mapped_fields[field_name] = value
                else:
                    mapped_fields[field_name] = value
    
    # Construct request object with mapped fields
    request = BatchCreateAppTableRecordRequest.builder() \
        .app_token(app_token) \
        .table_id(table_id) \
        .request_body(BatchCreateAppTableRecordRequestBody.builder()
            .records([AppTableRecord.builder()
                .fields(mapped_fields)
                .build()
            ])
            .build()) \
        .build()
    # Send request to Lark Base
    response = client.bitable.v1.app_table_record.batch_create(request)
    
    # Handle response
    if not response.success():
        error_msg = f"Failed to push data to Lark Base, code: {response.code}, msg: {response.msg}, log_id: {response.get_log_id()}"
        print(error_msg)
        return {
            "status": "false", 
            "message": error_msg
        }
    
    return {"status": "success", "message": "Successfully pushed data to Lark Base", "data": response.data}

def list_all_chats(app_id, app_secret):
    # Get tenant access token
    token_url = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/"
    token_payload = {
        "app_id": app_id,
        "app_secret": app_secret
    }
    
    token_response = requests.post(token_url, json=token_payload)
    token_data = token_response.json()
    
    if "tenant_access_token" not in token_data:
        print(f"Failed to get tenant access token: {token_data}")
        return []
    
    tenant_token = token_data["tenant_access_token"]
    
    # List all chats with pagination
    chat_url = "https://open.larksuite.com/open-apis/im/v1/chats"
    headers = {
        "Authorization": f"Bearer {tenant_token}"
    }
    
    all_chats = []
    next_page_token = None
    
    while True:
        params = {"page_token": next_page_token} if next_page_token else {}
        chat_response = requests.get(chat_url, headers=headers, params=params)

        if chat_response.status_code == 200:
            data = chat_response.json()
            for chat in data.get("data", {}).get("items", []):
                chat_name = chat.get('name', 'No Name Available')
                chat_id = chat.get('chat_id', 'No Chat ID Available')
                all_chats.append({
                    'name': chat_name,
                    'chat_id': chat_id
                })
            
            next_page_token = data.get("data", {}).get("page_token", None)
            
            if not next_page_token:
                break
        else:
            print(f"Error {chat_response.status_code}: {chat_response.text}")
            break
    
    return all_chats

def find_chat_id_by_name(app_id, app_secret, chat_name):
    all_chats = list_all_chats(app_id, app_secret)
    
    # Prepare result structure
    result = {
        "status": "not_found",
        "message": f"No chat found with name '{chat_name}'",
        "exact_match": None,
        "partial_matches": []
    }
    
    # Perform case-insensitive search for exact match
    for chat in all_chats:
        if chat["name"].lower() == chat_name.lower():
            result["status"] = "success"
            result["message"] = f"Found exact match for '{chat_name}'"
            result["exact_match"] = {
                "name": chat["name"],
                "chat_id": chat["chat_id"]
            }
            break
    
    # Look for partial matches
    for chat in all_chats:
        if chat_name.lower() in chat["name"].lower():
            # Don't add the exact match again
            if result["exact_match"] and chat["chat_id"] == result["exact_match"]["chat_id"]:
                continue
                
            result["partial_matches"].append({
                "name": chat["name"],
                "chat_id": chat["chat_id"]
            })
    
    # Update status if we found partial matches but no exact match
    if not result["exact_match"] and result["partial_matches"]:
        result["status"] = "partial_match"
        result["message"] = f"Found {len(result['partial_matches'])} partial matches for '{chat_name}'"
    
    return result

def push_to_Lark_Channel(
    app_id: str,
    app_secret: str,
    chat_id: str,  # receive id
    content: str
):
    import requests
    import json

    # Get tenant access token
    token_url = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/"
    token_payload = {
        "app_id": app_id,
        "app_secret": app_secret
    }
    token_response = requests.post(token_url, json=token_payload)
    tenant_access_token = token_response.json().get("tenant_access_token")
    if not tenant_access_token:
        logger.error("Failed to get tenant access token")
        return {"status": "false", "message": "Failed to get tenant access token"}
    
    # Prepare the message payload
    message_url = "https://open.larksuite.com/open-apis/im/v1/messages"
    headers = {
        "Authorization": f"Bearer {tenant_access_token}",
        "Content-Type": "application/json"
    }
    
    # Ensure content is properly formatted as a JSON string
    formatted_content = json.dumps({"text": content})
    
    payload = {
        "receive_id": chat_id,
        "content": formatted_content,  # Properly formatted JSON string
        "msg_type": "text"
    }
    
    params = {
        "receive_id_type": "chat_id"
    }
    
    # Send the message
    response = requests.post(
        message_url,
        headers=headers,
        params=params,
        json=payload
    )
    
    return response.json()

'''
--- functions to make API interaction with Woo-commerce ---
'''

