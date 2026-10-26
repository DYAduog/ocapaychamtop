# import schedule # type: ignore
from typing import Dict, Any, List
import os
import sys
import time
import datetime
import pytz
import glob
import json
import logging
import signal
import subprocess
from dotenv import load_dotenv

import driver
import mb_actions
import API_service_lark
from cleaner import cleanup_data_directory

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# ✅ FORCE Vietnam timezone consistently
os.environ['TZ'] = 'Asia/Ho_Chi_Minh'
if hasattr(time, "tzset"):
    time.tzset()  # Apply timezone setting immediately on Unix-like systems

# Setup logging with Vietnam timezone
class VietnamFormatter(logging.Formatter):
    """Custom formatter that always uses Vietnam timezone"""
    def formatTime(self, record, datefmt=None):
        # Force Vietnam timezone for all log timestamps
        vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        dt = datetime.datetime.fromtimestamp(record.created, vietnam_tz)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime('%Y-%m-%d %H:%M:%S %Z')

# Setup logging with custom formatter
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        # logging.FileHandler("scheduler.log")
    ]
)

# Apply custom formatter to all handlers
vietnam_formatter = VietnamFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
for handler in logging.getLogger().handlers:
    handler.setFormatter(vietnam_formatter)

logger = logging.getLogger("Scheduler")

# Global WebDriver instance
webdriver_instance = None
last_transaction_fetch_time = None
processing_transactions = False
recovery_in_progress = False

# ✅ CONSISTENT timezone handling
VIETNAM_TZ = pytz.timezone('Asia/Ho_Chi_Minh')

def get_vietnam_time():
    """Return the current time in Vietnam timezone - GUARANTEED correct"""
    # Get system time and force to Vietnam timezone
    utc_now = datetime.datetime.utcnow().replace(tzinfo=pytz.UTC)
    vietnam_time = utc_now.astimezone(VIETNAM_TZ)
    
    return vietnam_time

def format_vietnam_time(format_str="%Y-%m-%d %H:%M:%S"):
    """Format current Vietnam time - GUARANTEED correct"""
    return get_vietnam_time().strftime(format_str)

# Test timezone immediately
logger.info("🌏 TIMEZONE TEST:")
test_time = get_vietnam_time()
logger.info(f"🌏 Current Vietnam time should be: {test_time}")
logger.info(f"🌏 Formatted: {test_time.strftime('%d/%m/%Y %H:%M:%S')}")

# Handle Docker stop (SIGTERM) or Ctrl+C (SIGINT)
def stop_gracefully(sig, frame):
    logger.info("Shutting down gracefully...")
    if webdriver_instance:
        driver.close_driver()
    sys.exit(0)

signal.signal(signal.SIGINT, stop_gracefully)
signal.signal(signal.SIGTERM, stop_gracefully)

def validate_environment():
    """✅ FIX 6: Validate required environment variables"""
    required_vars = ["MB_USERNAME", "MB_PASSWORD", "MB_CORP_ID"]
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.critical(f"❌ Missing required environment variables: {missing_vars}")
        logger.critical("❌ Please set these variables before starting the scheduler")
        sys.exit(1)
    logger.info("✅ All required environment variables are present")

def initialize_driver():
    """Initialize the global WebDriver instance."""
    global webdriver_instance
    logger.info("Initializing WebDriver...")
    webdriver_instance = driver.init_driver()
    if not webdriver_instance:
        logger.error("Failed to initialize WebDriver. Exiting...")
        sys.exit(1)

def get_last_fetch_time_from_json():
    """Get the most recent TRANSACTION timestamp from JSON files - FIXED timezone"""
    try:
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        transaction_files = glob.glob(os.path.join(data_dir, "mb_biz_transactions_*.json"))
        
        if not transaction_files:
            return None
            
        # Get the newest file by modification time
        newest_file = max(transaction_files, key=os.path.getmtime)
        logger.info(f"📁 Found newest file: {os.path.basename(newest_file)}")
        
        with open(newest_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            transactions = data.get("transactions", [])
            
            if not transactions:
                # No transactions - fallback to fetch timestamp
                timestamp_str = data.get("timestamp")
                if timestamp_str:
                    # ✅ FIXED: Handle both naive and timezone-aware timestamps
                    try:
                        # Try parsing with timezone info first
                        if '+' in timestamp_str or 'Z' in timestamp_str:
                            timestamp_dt = datetime.datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                            if timestamp_dt.tzinfo is None:
                                timestamp_dt = VIETNAM_TZ.localize(timestamp_dt)
                            else:
                                timestamp_dt = timestamp_dt.astimezone(VIETNAM_TZ)
                        else:
                            # Parse as naive and assume Vietnam timezone
                            timestamp_dt = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                            timestamp_dt = VIETNAM_TZ.localize(timestamp_dt)
                        return timestamp_dt
                    except Exception as e:
                        logger.warning(f"Could not parse timestamp '{timestamp_str}': {e}")
                        # Fallback to current time
                        return get_vietnam_time()
                return None
            
            # Find latest transaction timestamp
            latest_transaction_time = None
            for txn in transactions:
                trans_date_time = txn.get("NGÀY GIAO DỊCH", "").strip()
                if trans_date_time:
                    try:
                        # Parse transaction date/time and assume Vietnam timezone
                        if ":" in trans_date_time:
                            try:
                                transaction_dt = datetime.datetime.strptime(trans_date_time, "%d/%m/%Y %H:%M:%S")
                            except ValueError:
                                try:
                                    transaction_dt = datetime.datetime.strptime(trans_date_time, "%d/%m/%Y %H:%M")
                                except ValueError:
                                    # Fall back to date only
                                    transaction_dt = datetime.datetime.strptime(trans_date_time.split()[0], "%d/%m/%Y")
                                    transaction_dt = transaction_dt.replace(hour=23, minute=59, second=59)
                        else:
                            # Date only: "05/06/2025"
                            transaction_dt = datetime.datetime.strptime(trans_date_time, "%d/%m/%Y")
                            transaction_dt = transaction_dt.replace(hour=23, minute=59, second=59)
                        
                        # ✅ ALWAYS assume transaction time is in Vietnam timezone
                        transaction_dt = VIETNAM_TZ.localize(transaction_dt)
                        
                        if latest_transaction_time is None or transaction_dt > latest_transaction_time:
                            latest_transaction_time = transaction_dt
                    except Exception as e:
                        logger.warning(f"Could not parse transaction date '{trans_date_time}': {e}")
                        continue
            
            if latest_transaction_time:
                # Log with proper timezone info
                logger.info(f"📊 Found latest transaction time: {latest_transaction_time}")
                logger.info(f"📊 Current Vietnam time: {get_vietnam_time()}")
                return latest_transaction_time
            else:
                logger.info("📊 No valid transaction timestamps found - falling back to fetch time")
                # Fallback to fetch timestamp
                timestamp_str = data.get("timestamp")
                if timestamp_str:
                    try:
                        timestamp_dt = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                        return VIETNAM_TZ.localize(timestamp_dt)
                    except Exception as e:
                        logger.warning(f"Could not parse fallback timestamp: {e}")
                        return get_vietnam_time()
                return None
                
    except Exception as e:
        logger.warning(f"Could not get transaction time: {e}")
        return None

def get_from_date_for_fetch():
    """
    Enhanced logic: Use latest TRANSACTION timestamp with buffer to prevent gaps
    """
    current_time = get_vietnam_time()
    logger.info(f"🕐 Current Vietnam time: {current_time}")
    
    # Get latest transaction time (not fetch time)
    last_transaction_time = get_last_fetch_time_from_json()
    
    if last_transaction_time:
        # ✅ ADD BUFFER: Go back 2 minutes from last transaction to ensure overlap
        buffered_time = last_transaction_time - datetime.timedelta(minutes=2)
        from_date = buffered_time.strftime("%d/%m/%Y %H:%M")
        
        logger.info(f"📊 Latest transaction time: {last_transaction_time.strftime('%d/%m/%Y %H:%M:%S')}")
        logger.info(f"📊 Using buffered time (2min back): {from_date}")
        logger.info(f"📊 Time difference from now: {current_time - last_transaction_time}")
        logger.info(f"🛡️ Buffer ensures overlap coverage")
        
        return from_date
    else:
        start_of_day = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
        from_date = start_of_day.strftime("%d/%m/%Y %H:%M")
        logger.info(f"📅 No data found - starting from 00:00: {from_date}")
        return from_date

def fetch_transactions_with_active_session_v2():
    """Simplified - no recovery mode needed"""
    global webdriver_instance, processing_transactions, last_transaction_fetch_time
    
    if not webdriver_instance:
        logger.error("WebDriver not initialized")
        return None
    
    # Get from_date using JSON timestamp logic
    from_date = get_from_date_for_fetch()
    
    # Use fetch_transactions_v2
    transaction_data = mb_actions.fetch_transactions_v2(webdriver_instance, from_date, max_pages=5)
    
    # Update last_transaction_fetch_time for in-memory tracking
    last_transaction_fetch_time = get_vietnam_time()
    
    # Handle fetch failure
    if not transaction_data or (isinstance(transaction_data, dict) and not transaction_data.get("transactions")):
        logger.info("No transactions in time window")
        # Save empty result
        empty_data = {
            "timestamp": format_vietnam_time(),
            "status": "no_transactions",
            "account_info": {"last_updated": format_vietnam_time("%d-%m-%Y %H:%M:%S")},
            "count": 0,
            "transactions": []
        }
        
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        timestamp = format_vietnam_time("%Y%m%d_%H%M%S")
        filename = os.path.join(data_dir, f"mb_biz_transactions_{timestamp}.json")
        try:
            os.makedirs(data_dir, exist_ok=True)
            with open(filename + ".tmp", "w", encoding="utf-8") as f:
                json.dump(empty_data, f, ensure_ascii=False, indent=2)
            os.rename(filename + ".tmp", filename)
            logger.info(f"Saved empty result: {os.path.basename(filename)}")
        except Exception as e:
            logger.error(f"Failed to save empty file: {e}")
        return None
    
    # Save successful results
    if isinstance(transaction_data, dict):
        transactions_list = transaction_data.get("transactions", [])
        if save_transactions_to_file(transactions_list):
            logger.info(f"Saved {len(transactions_list)} transactions")
        else:
            logger.error("Failed to save transactions")
        
        if not transactions_list:
            logger.info("No transactions in time window")
    else:
        logger.error("Unexpected transaction data format")
        return None

def is_valid_transaction(transaction: Dict[str, Any]) -> bool:
    """
    Validate a transaction to ensure it contains meaningful data.
    Updated to be less strict and handle various transaction formats.
    """
    # Check if transaction is empty
    if not transaction:
        return False
    
    # Check if we have any meaningful transaction identifier
    so_but_toan = transaction.get("SỐ BÚT TOÁN", "").strip()
    so_but_toan_alt = transaction.get("Số BÚT TOÁN", "").strip()  # Alternative header format
    
    # Accept various transaction ID patterns (not just FT)
    transaction_id = so_but_toan or so_but_toan_alt
    if not transaction_id:
        return False
        
    # Accept any transaction ID that looks reasonable (more flexible pattern)
    if len(transaction_id) < 5:  # Too short to be a valid transaction ID
        return False
    
    # Check if transaction has some basic identifying information
    # Look for company/entity name in various possible header formats
    don_vi_fields = [
        "ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN",
        "ĐƠN VỊ THỤ HƯỞNG", 
        "ĐƠN VỊ CHUYỂN"
    ]
    
    has_entity_info = False
    for field in don_vi_fields:
        if transaction.get(field, "").strip():
            has_entity_info = True
            break
    
    # Also check for amount fields
    amount_fields = ["PHÁT SINH CÓ", "PHÁT SINH NỢ", "AMOUNT", "CREDIT", "DEBIT"]
    has_amount = any(transaction.get(field, "").strip() for field in amount_fields)
    
    # Transaction is valid if it has an ID and either entity info or amount
    return has_entity_info or has_amount

def save_transactions_to_file(transactions_list: List[Dict[str, Any]]) -> bool:
    """Enhanced save with FIXED timezone handling"""
    if not transactions_list:
        logger.warning("No transactions to save")
        return False
    
    try:
        # Create data directory if it doesn't exist
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        os.makedirs(data_dir, exist_ok=True)
        
        # Test write permissions
        try:
            test_file = os.path.join(data_dir, ".write_test")
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
        except Exception as e:
            logger.error(f"❌ No write permissions in data directory: {e}")
            return False
        
        # ✅ FIXED: Generate filename with CORRECT Vietnam timezone timestamp
        current_vietnam_time = get_vietnam_time()
        timestamp = current_vietnam_time.strftime("%Y%m%d_%H%M%S")
        filename = os.path.join(data_dir, f"mb_biz_transactions_{timestamp}.json")
        
        # ✅ FIXED: Prepare data with EXPLICIT timezone information
        data_to_save = {
            "timestamp": current_vietnam_time.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp_utc": current_vietnam_time.astimezone(pytz.UTC).strftime("%Y-%m-%d %H:%M:%S"),
            "timezone": "Asia/Ho_Chi_Minh",
            "timezone_offset": "+07:00",
            "status": "success",
            "account_info": {
                "last_updated": current_vietnam_time.strftime("%d-%m-%Y %H:%M:%S")
            },
            "count": len(transactions_list),
            "transactions": transactions_list
        }
        
        # Save to a temporary file first, then rename to avoid corruption
        temp_filename = filename + ".tmp"
        with open(temp_filename, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
        
        # Rename the temporary file to the final filename
        if os.path.exists(temp_filename):
            if os.path.exists(filename):
                os.remove(filename)
            os.rename(temp_filename, filename)
            logger.info(f"💾 Saved transactions at Vietnam time: {current_vietnam_time}")
            logger.info(f"💾 File created: {os.path.basename(filename)}")
            return True
        else:
            logger.error(f"Temporary file {temp_filename} was not created successfully")
            return False
            
    except Exception as e:
        logger.error(f"Error saving transactions to file: {e}")
        return False

def shutdown_environment(force_docker_shutdown=False):
    """✅ FIX 2: Enhanced Docker shutdown with proper error handling"""
    global webdriver_instance
    logger.info("Shutting down environment...")
    
    # Logout from MB
    if webdriver_instance:
        try:
            mb_actions.log_out(webdriver_instance)
            logger.info("Successfully logged out from MB")
        except Exception as e:
            logger.error(f"Error during logout: {e}")
        
        # Close WebDriver instance
        try:
            driver.close_driver()
            webdriver_instance = None
            logger.info("WebDriver instance closed")
        except Exception as e:
            logger.error(f"Error closing WebDriver: {e}")
    
    if force_docker_shutdown:
        logger.critical("🚨 FORCING DOCKER COMPOSE SHUTDOWN")
        try:
            logger.critical("Executing docker-compose down...")
            result = subprocess.run(
                ["docker-compose", "down"], 
                capture_output=True, 
                text=True, 
                timeout=30
            )
            if result.returncode == 0:
                logger.critical("✅ Docker Compose shut down successfully")
            else:
                logger.critical(f"❌ Docker shutdown failed: {result.stderr}")
                # Fallback
                logger.critical("Trying fallback method...")
                os.system("docker-compose down")
        except subprocess.TimeoutExpired:
            logger.critical("❌ Docker shutdown timed out - using fallback")
            os.system("docker-compose down")
        except FileNotFoundError:
            logger.critical("❌ docker-compose command not found - using fallback")
            os.system("docker-compose down")
        except Exception as e:
            logger.critical(f"❌ Docker shutdown error: {e}")
            # Last resort fallback
            try:
                os.system("docker-compose down")
            except Exception as fallback_error:
                logger.critical(f"❌ Even fallback failed: {fallback_error}")
    else:
        logger.info("Normal shutdown completed")

def restart_session(delay_minutes=0):
    """✅ SIMPLIFIED: Trust log_in_v2's decision completely + optional delay"""
    global webdriver_instance
    
    if delay_minutes > 0:
        logger.info(f"⏳ Waiting {delay_minutes} minutes before session restart...")
        for minute in range(delay_minutes):
            logger.info(f"⏳ Restart delay... {delay_minutes-minute} minutes remaining")
            time.sleep(60)
    
    logger.info("=== RESTARTING SESSION ===")

    # Cleanup existing session
    if webdriver_instance:
        try:
            mb_actions.log_out(webdriver_instance)
            driver.close_driver()
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
    
    webdriver_instance = None
    
    # Initialize new session
    initialize_driver()
    
    # ✅ SINGLE LOGIN ATTEMPT - Trust log_in_v2's decision
    login_success = mb_actions.log_in_v2(
        driver=webdriver_instance,
        username=os.getenv("MB_USERNAME"),
        password=os.getenv("MB_PASSWORD"),
        corp_id=os.getenv("MB_CORP_ID")
    )
    
    if login_success:
        session_id = mb_actions.check_session(webdriver_instance)
        if session_id:
            logger.info(f"✅ Session restart successful. ID: {session_id}")
            return True
        else:
            logger.error("❌ Login succeeded but session invalid")
            return False
    else:
        logger.error("❌ Session restart failed - log_in_v2 refused login")
        API_service_lark.push_to_Lark_Channel(
            app_id=os.getenv("APP_ID"),
            app_secret=os.getenv("APP_SECRET"),
            chat_id=os.getenv("TEST_14_CU"),
            content="❌ Session restart failed - log_in_v2 refused login"
        )
        return False

def find_unique_transactions_v2():
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    transaction_files = glob.glob(os.path.join(data_dir, "mb_biz_transactions_*.json"))
    
    if not transaction_files:
        logger.info("No files found - all transactions will be new")
        return False
    
    # Get newest vs old files
    newest_file = max(transaction_files, key=os.path.getmtime)
    old_files = [f for f in transaction_files if f != newest_file]
    
    # Collect old transaction IDs
    old_transaction_ids = []
    for file_path in old_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                file_data = json.load(f)
                if isinstance(file_data, dict):
                    transactions = file_data.get("transactions", [])
                    if isinstance(transactions, dict):
                        transactions = transactions.get("transactions", [])
                    
                    for txn in transactions:
                        if isinstance(txn, dict):
                            txn_id = txn.get("SỐ BÚT TOÁN", "").strip()
                            if txn_id:
                                old_transaction_ids.append(txn_id)
        except Exception as e:
            logger.error(f"Error reading {os.path.basename(file_path)}: {e}")
    
    logger.info(f"Found {len(old_transaction_ids)} existing transaction IDs")
    
    # Process newest file
    try:
        with open(newest_file, 'r', encoding='utf-8') as f:
            newest_data = json.load(f)
            if not isinstance(newest_data, dict):
                logger.error("Invalid newest file format")
                return False
            
            new_transactions = newest_data.get("transactions", [])
            if isinstance(new_transactions, dict):
                new_transactions = new_transactions.get("transactions", [])

            if not isinstance(new_transactions, list):
                logger.error("Invalid transactions format")
                return False
            
            # Find unique transactions
            unique_transactions = []
            for txn in new_transactions:
                if not isinstance(txn, dict):
                    continue
                    
                txn_id = txn.get("SỐ BÚT TOÁN", "").strip()
                if not txn_id or txn_id in old_transaction_ids:
                    continue
                
                unique_transactions.append(txn)
            
            logger.info(f"Found {len(unique_transactions)} NEW transactions")
            
            # ✅ ALWAYS process WooCommerce for testing (move outside conditional)
            # logger.info("🛒 Processing WooCommerce for ALL transactions (testing mode)...")
            # process_woocommerce_transactions(new_transactions)  # Process ALL transactions
            
            # Push to Lark if we have new transactions
            if unique_transactions:
                if push_transactions_to_lark_v2(unique_transactions):
                    logger.info(f"✅ Pushed {len(unique_transactions)} transactions to Lark")
                    process_woocommerce_transactions(unique_transactions)
                else:
                    logger.warning("Failed to push to Lark")
            else:
                logger.info("No new transactions to push to Lark")
            
            # Cleanup
            cleanup_data_directory(except_files=[newest_file])
                
    except Exception as e:
        logger.error(f"Error processing newest file: {e}")
        return False
    
    return True

def process_woocommerce_transactions(transactions):
    """Process WooCommerce for testing purposes - separate from Lark push"""
    if not transactions:
        logger.info("🛒 No transactions to process for WooCommerce")
        return
    
    # ✅ WooCommerce configuration
    woo_url = os.getenv("WOO_TEST_URL")
    woo_consumer_key = os.getenv("WOO_CONSUMER_KEY")
    woo_consumer_secret = os.getenv("WOO_CONSUMER_SECRET")
    woo_secure_token = os.getenv("WOO_SECURE_TOKEN")
    
    if not woo_consumer_key or not woo_consumer_secret:
        logger.info("🛒 WooCommerce credentials not configured - skipping")
        return
    
    logger.info(f"🛒 Processing {len(transactions)} transactions for WooCommerce...")
    
    processed_count = 0
    detected_count = 0
    
    for i, txn in enumerate(transactions, 1):
        trans_ref = txn.get("SỐ BÚT TOÁN", "N/A")
        credit_amount = txn.get("PHÁT SINH CÓ", "0")
        description = txn.get("NỘI DUNG", "N/A")
        
        # ✅ PROCESS ALL CREDIT TRANSACTIONS (not just unique ones)
        if credit_amount != "0":
            try:
                import API_service_woo
                logger.info(f"🛒 Processing transaction {i}/{len(transactions)}: {trans_ref}")
                
                woo_result = API_service_woo.process_woo_transaction(
                    url=woo_url,
                    consumer_key=woo_consumer_key,
                    consumer_secret=woo_consumer_secret,
                    transaction_data=txn,
                    secure_token=woo_secure_token
                )
                
                # Log detailed results
                if woo_result.get("status") == "success":
                    logger.info(f"🛒 ✅ SUCCESS: Order {woo_result.get('woo_order_id')} created & confirmed for {trans_ref}")
                    processed_count += 1
                    detected_count += 1
                elif woo_result.get("woo_order_detected"):
                    logger.info(f"🛒 ⚠️ PARTIAL: Order detected but processing incomplete for {trans_ref}")
                    logger.info(f"🛒 Details: {woo_result.get('message', 'No details')}")
                    detected_count += 1
                elif woo_result.get("status") == "not_woo_transaction":
                    logger.info(f"🛒 ℹ️ NO WOO: Regular transaction (no GH order ID) - {trans_ref}")
                else:
                    logger.warning(f"🛒 ❌ ERROR: {woo_result.get('message', 'Unknown error')} - {trans_ref}")
                    
            except Exception as woo_error:
                logger.error(f"🛒 ❌ EXCEPTION: WooCommerce processing failed for {trans_ref}: {woo_error}")
        else:
            logger.debug(f"🛒 SKIP: Debit transaction {trans_ref} (credit_amount = {credit_amount})")
    
    # Summary
    logger.info(f"🛒 WooCommerce processing complete:")
    logger.info(f"🛒 - Total transactions: {len(transactions)}")
    logger.info(f"🛒 - WooCommerce orders detected: {detected_count}")
    logger.info(f"🛒 - Successfully processed: {processed_count}")

def push_transactions_to_lark_v2(transactions):
    if not transactions:
        return True

    logger.info(f"📱 Pushing {len(transactions)} transactions to Lark")
    
    app_id = os.getenv("APP_ID")
    app_secret = os.getenv("APP_SECRET")
    chat_id = os.getenv("TEST_14_CU")
    
    success_count = 0
    transactions.reverse()  # Send oldest first
    
    for i, txn in enumerate(transactions, 1):
        trans_date = txn.get("NGÀY GIAO DỊCH", "N/A")
        credit_amount = txn.get("PHÁT SINH CÓ", "0")
        debit_amount = txn.get("PHÁT SINH NỢ", "0")
        trans_ref = txn.get("SỐ BÚT TOÁN", "N/A")
        description = txn.get("NỘI DUNG", "N/A")
        
        # Create message based on transaction type
        if credit_amount != "0":
            content = f'''Số dư tài khoản vừa tăng {credit_amount} VND vào {trans_date}
Mô tả: {description}
Mã tham chiếu: {trans_ref}
Số tài khoản: 839689988
Ngân hàng: MBBank BIZ Official'''
        elif debit_amount != "0":
            content = f'''Số dư tài khoản vừa giảm {debit_amount} VND vào {trans_date}
Mô tả: {description}
Mã tham chiếu: {trans_ref}
Số tài khoản: 839689988
Ngân hàng: MBBank BIZ Official'''
        else:
            content = f'''Có giao dịch mới vào {trans_date}
Mô tả: {description}
Mã tham chiếu: {trans_ref}
Số tài khoản: 839689988
Ngân hàng: MBBank BIZ Official'''
        
        # Push to Lark
        result = API_service_lark.push_to_Lark_Channel(
            app_id=app_id,
            app_secret=app_secret,
            chat_id=chat_id,
            content=content
        )
        
        if result and isinstance(result, dict) and result.get("code") == 0:
            success_count += 1
        else:
            logger.warning(f"📱 Failed to push transaction {i}: {trans_ref}")
        
        time.sleep(0.5)  # Rate limiting
    
    logger.info(f"📱 Lark push complete: {success_count}/{len(transactions)} successful")
    return success_count > 0

def run_scheduler():
    global last_transaction_fetch_time, webdriver_instance, processing_transactions, recovery_in_progress
    
    try:
        # ✅ FIX 6: Validate environment variables first
        validate_environment()
        
        # Configuration
        transaction_interval = int(os.environ.get("TRANSACTION_FETCH_INTERVAL", "20"))
        restart_interval_minutes = int(os.environ.get("SESSION_RESTART_MINUTES", "10"))
        
        logger.info(f"Starting scheduler: fetch every {transaction_interval}s, restart every {restart_interval_minutes}min")
        
        # Initialize and login once
        initialize_driver()
        login_success = mb_actions.log_in_v2(
            driver=webdriver_instance,
            username=os.getenv("MB_USERNAME"),
            password=os.getenv("MB_PASSWORD"),
            corp_id=os.getenv("MB_CORP_ID")
        )
        
        if not login_success:
            logger.critical("❌ INITIAL LOGIN FAILED - STOPPING PROCESS")
            API_service_lark.push_to_Lark_Channel(
                app_id=os.getenv("APP_ID"),
                app_secret=os.getenv("APP_SECRET"),
                chat_id=os.getenv("TEST_14_CU"),
                content="❌ INITIAL LOGIN FAILED - STOPPING PROCESS"
            )
            shutdown_environment(force_docker_shutdown=True)
            sys.exit(1)

        # ✅ SIMPLIFIED: Remove all attempt variables
        start_time = time.time()
        session_start_time = start_time
        session_restart_interval = restart_interval_minutes * 60
        heartbeat_counter = 0
        last_health_check = 0  # ✅ FIX 3: Track last health check time
        
        logger.info("✅ Scheduler started successfully")
        
        while True:
            try:
                current_time = time.time()
                elapsed_time = int(current_time - start_time)
                session_elapsed_time = int(current_time - session_start_time)
                
                # Heartbeat every 5 minutes
                if elapsed_time % 300 == 0 and elapsed_time > 0:
                    heartbeat_counter += 1
                    logger.info(f"❤️ Heartbeat #{heartbeat_counter} - Running {elapsed_time//60}min")
                    
                    # ✅ FIX 7: Periodic garbage collection
                    import gc
                    gc.collect()
                    logger.debug("🧹 Performed garbage collection")
                
                # ✅ SIMPLIFIED: Scheduled restart (trust log_in_v2's decision)
                if session_elapsed_time >= session_restart_interval:
                    logger.info("🔄 Scheduled session restart...")
                    if restart_session():
                        session_start_time = time.time()
                        logger.info("✅ Scheduled restart successful")
                    else:
                        logger.critical("❌ Scheduled restart failed - log_in_v2 decided to stop")
                        shutdown_environment(force_docker_shutdown=True)
                        sys.exit(1)
                
                # ✅ ENHANCED: Session health check with 3-minute delay on failure
                if current_time - last_health_check >= 10 and not recovery_in_progress:
                    last_health_check = current_time
                    session_id = mb_actions.check_session(webdriver_instance)
                    
                    if not session_id:
                        logger.warning("🔴 Session died - waiting 3 minutes before recovery...")
                        recovery_in_progress = True
                        
                        # 🕐 SLEEP 3 MINUTES BEFORE RECOVERY ATTEMPT
                        logger.info("⏳ Sleeping for 3 minutes to allow session to stabilize...")
                        for minute in range(3):
                            logger.info(f"⏳ Waiting... {3-minute} minutes remaining")
                            time.sleep(60)  # Sleep 1 minute at a time for better logging
                        
                        logger.info("⏰ 3-minute wait complete - starting recovery...")
                        
                        try:
                            # ✅ FIX 4: Single recovery attempt with proper state management
                            logger.info("🔄 Starting single recovery attempt...")
                            
                            if webdriver_instance:
                                try:
                                    mb_actions.log_out(webdriver_instance)
                                    time.sleep(2)
                                except:
                                    pass  # Ignore logout errors during failure
                                
                                driver.close_driver()
                                webdriver_instance = None
                            
                            # Additional small delay after cleanup
                            time.sleep(5)
                            
                            initialize_driver()
                            
                            recovery_success = mb_actions.log_in_v2(
                                driver=webdriver_instance,
                                username=os.getenv("MB_USERNAME"),
                                password=os.getenv("MB_PASSWORD"),
                                corp_id=os.getenv("MB_CORP_ID")
                            )
                            
                            if recovery_success:
                                logger.info("✅ Session recovery successful after 3-minute wait")
                                session_start_time = time.time()  # Reset session timer
                            else:
                                logger.critical("❌ Session recovery failed after 3-minute wait - log_in_v2 decided to stop")
                                logger.critical("💥 Possible causes:")
                                logger.critical("   - Credential errors (invalid username/password/corp_id)")
                                logger.critical("   - Account locked (GW18)")
                                logger.critical("   - MB Bank system issues")
                                logger.critical("   - Manual login conflict")
                                
                                # Send failure notification
                                try:
                                    API_service_lark.push_to_Lark_Channel(
                                        app_id=os.getenv("APP_ID"),
                                        app_secret=os.getenv("APP_SECRET"),
                                        chat_id=os.getenv("TEST_14_CU"),
                                        content=f"❌ CRITICAL: Session recovery FAILED after 3-minute wait. Scheduler shutting down at {get_vietnam_time().strftime('%H:%M:%S')}. Check for credential issues, account lock, or manual login conflicts."
                                    )
                                except Exception as lark_error:
                                    logger.warning(f"Failed to send failure notification: {lark_error}")
                                
                                shutdown_environment(force_docker_shutdown=True)
                                sys.exit(1)
                                
                        except Exception as recovery_error:
                            logger.error(f"Recovery attempt failed: {recovery_error}")
                            logger.critical("❌ Could not attempt recovery after 3-minute wait - stopping process")
                            shutdown_environment(force_docker_shutdown=True)
                            sys.exit(1)
                        finally:
                            recovery_in_progress = False
                            # ✅ Additional cooldown after recovery
                            logger.info("😴 Brief cooldown after recovery...")
                            time.sleep(10)
                
                # ✅ FIX 4: Timezone-safe transaction fetch timing
                session_active = mb_actions.check_session(webdriver_instance) is not None
                
                # Convert both times to timestamps for comparison
                current_timestamp = current_time
                last_fetch_timestamp = last_transaction_fetch_time.timestamp() if last_transaction_fetch_time else 0
                
                fetch_due = (last_transaction_fetch_time is None or 
                            current_timestamp - last_fetch_timestamp >= transaction_interval)
                
                if session_active and fetch_due and not processing_transactions and not recovery_in_progress:
                    last_transaction_fetch_time = get_vietnam_time()
                    processing_transactions = True
                    
                    try:
                        logger.info("--- FETCHING TRANSACTIONS ---")
                        fetch_transactions_with_active_session_v2()
                        find_unique_transactions_v2()
                        logger.info("--- FETCH COMPLETE ---")
                    except Exception as e:
                        logger.error(f"Transaction fetch error: {e}")
                        last_transaction_fetch_time = get_vietnam_time() - datetime.timedelta(seconds=transaction_interval - 5)
                    finally:
                        processing_transactions = False
                
                time.sleep(0.5)
            
            except Exception as loop_error:
                logger.error(f"❌ Main loop error: {loop_error}")
                
                # 🕐 ALSO ADD 3-MINUTE DELAY FOR MAIN LOOP ERRORS
                logger.info("⏳ Main loop error detected - waiting 3 minutes before recovery...")
                for minute in range(3):
                    logger.info(f"⏳ Error recovery wait... {3-minute} minutes remaining")
                    time.sleep(60)
                
                # Single recovery attempt after wait
                if not recovery_in_progress:
                    if restart_session():
                        session_start_time = time.time()
                        logger.info("✅ Error recovery successful after 3-minute wait")
                    else:
                        logger.critical("❌ Error recovery failed after 3-minute wait")
                        shutdown_environment(force_docker_shutdown=True)
                        sys.exit(1)
                
    except Exception as e:
        logger.critical(f"FATAL ERROR: {e}")
        shutdown_environment(force_docker_shutdown=True)
        sys.exit(1)
    finally:
        shutdown_environment(force_docker_shutdown=False)

if __name__ == "__main__":
    logger.info("🚀 Starting MB Bank Transaction Scheduler...")
    
    try:
        run_scheduler()
    except KeyboardInterrupt:
        logger.info("⚠️ Scheduler interrupted by user")
    except Exception as e:
        logger.critical(f"💥 FATAL ERROR in main: {e}")
        sys.exit(1)
    finally:
        logger.info("🛑 Scheduler shutdown complete")
