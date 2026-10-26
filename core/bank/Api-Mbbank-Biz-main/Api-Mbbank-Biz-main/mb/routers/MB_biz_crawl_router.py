import os
import time
import logging
import base64
import json
import sys
import subprocess
import shutil
from datetime import datetime, timedelta
import pytz  # Added import for timezone support
import asyncio
import random
import socket
from typing import Optional, Dict, Any
import httpx
import re
from pathlib import Path  # Added import for Path

# This router supports detailed datetime filtering with minute precision
# You can pass dates in DD/MM/YYYY format (will use 00:00/23:59 as default times)
# or in DD/MM/YYYY HH:MM format for precise time filtering

# Import Selenium components
from selenium import webdriver
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException

from routers.captcha_reading import read_captcha
from routers.clear_tmp_file import cleanup_png_files

from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# config logging
logger = logging.getLogger(__name__)
# atexit.register(cleanup_png_files)

class GMT7Formatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        gmt7_time = time.localtime(record.created + 7 * 3600)
        return time.strftime(datefmt or "%Y-%m-%d %H:%M:%S", gmt7_time)


console_handler = logging.StreamHandler(sys.stdout)
# formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
formatter = GMT7Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)
logger.setLevel(logging.INFO)

router = APIRouter()

# Check if we're running in Docker or locally
def is_docker():
    """Check if we're running in a Docker container using multiple methods"""
    # Method 1: Check cgroup file
    try:
        with open('/proc/self/cgroup', 'r') as f:
            content = f.read()
            if 'docker' in content:
                logger.info("Docker detected via cgroup")
                return True
    except:
        pass
    
    # Method 2: Check for /.dockerenv file
    if os.path.exists('/.dockerenv'):
        logger.info("Docker detected via /.dockerenv file")
        return True
        
    # Method 3: Check environment variables
    if os.environ.get('DOCKER_CONTAINER', '') == 'true' or os.environ.get('IS_DOCKER', '') == 'true':
        logger.info("Docker detected via environment variables")
        return True
        
    # Method 4: Check hostname
    try:
        import socket
        if 'docker' in socket.gethostname():
            logger.info("Docker detected via hostname")
            return True
    except:
        pass
        
    # If SELENIUM_HOST is set to selenium-hub, assume we're in Docker
    if os.environ.get('SELENIUM_HOST', '') == 'selenium-hub':
        logger.info("Docker detected via SELENIUM_HOST environment variable")
        return True
    
    # Not in Docker
    logger.info("Not running in Docker")
    return False

# Get the correct Selenium Grid URL based on environment
def get_selenium_hub_url():
    """Get the correct Selenium Hub URL based on environment"""
    selenium_host = os.getenv("SELENIUM_HOST", "selenium-hub")
    selenium_port = os.getenv("SELENIUM_PORT", "4444")

    return f"http://{selenium_host}:{selenium_port}/wd/hub"


def test_selenium_hub_connection():
    """Test direct connection to Selenium hub without WebDriver"""
    try:
        selenium_host = os.getenv("SELENIUM_HOST", "selenium-hub")
        selenium_port = os.getenv("SELENIUM_PORT", "4444")
        status_url = f"http://{selenium_host}:{selenium_port}/status"

        response = httpx.get(status_url, timeout=5)
        response.raise_for_status()
        response_text = response.text.lower()
        is_ready = '"ready":true' in response_text or '"ready": true' in response_text or "ready" in response_text
        if is_ready:
            logger.info("Selenium Grid is available")
            return True

        logger.warning(f"Selenium Grid status endpoint returned unexpected body: {response.text[:200]}")
        return False
    except Exception as e:
        logger.error(f"Error testing Selenium Grid connection: {e}")
        return False


def find_data_directory():
    """Find or create the data directory for JSON output."""
    env_data_dir = os.environ.get("DATA_DIR")
    if env_data_dir:
        data_dir = Path(env_data_dir)
        data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir

    possible_paths = [
        Path("./data"),
        Path("data"),
        Path(__file__).resolve().parents[1] / "data",
    ]

    for path in possible_paths:
        try:
            if path.exists() and path.is_dir():
                return path
        except Exception:
            continue

    default_path = Path(__file__).resolve().parents[1] / "data"
    default_path.mkdir(parents=True, exist_ok=True)
    return default_path


def normalize_text_value(text: Any) -> str:
    """Normalize text scraped from Selenium elements."""
    if text is None:
        return ""
    return re.sub(r"\s+", " ", str(text).replace("\xa0", " ")).strip()


def _normalize_header_key(text: Any) -> str:
    """Normalize table header text for fuzzy field lookup."""
    value = normalize_text_value(text).lower()
    vietnamese_map = str.maketrans(
        "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ",
        "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd"
    )
    value = value.translate(vietnamese_map)
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def get_transaction_field(transaction: Dict[str, Any], header_name: str) -> str:
    """Return a transaction field by exact or normalized header name."""
    if not transaction:
        return ""

    if header_name in transaction:
        return normalize_text_value(transaction.get(header_name))

    expected_key = _normalize_header_key(header_name)
    for key, value in transaction.items():
        if _normalize_header_key(key) == expected_key:
            return normalize_text_value(value)

    return ""


def is_valid_transaction(transaction: Dict[str, Any]) -> bool:
    """Return True when a scraped table row contains meaningful transaction data."""
    if not transaction:
        return False

    values = [normalize_text_value(value) for value in transaction.values()]
    meaningful_values = [value for value in values if value and value.lower() not in {"không có dữ liệu", "no data", "n/a", "-"}]
    if not meaningful_values:
        return False

    joined_values = " ".join(meaningful_values).lower()
    invalid_markers = ["không tìm thấy", "khong tim thay", "không có giao dịch", "khong co giao dich"]
    return not any(marker in joined_values for marker in invalid_markers)


def clean_transaction_fields(transaction: Dict[str, Any]) -> Dict[str, Any]:
    """Trim and normalize all scraped transaction fields."""
    cleaned = {}
    for key, value in (transaction or {}).items():
        clean_key = normalize_text_value(key) or "unknown"
        clean_value = normalize_text_value(value)
        if clean_key in cleaned and clean_value:
            cleaned[clean_key] = f"{cleaned[clean_key]} {clean_value}".strip()
        else:
            cleaned[clean_key] = clean_value
    return cleaned


def parse_balance_field(balance_text: Any) -> Dict[str, Any]:
    """Parse a balance string into numeric value and currency metadata."""
    text = normalize_text_value(balance_text)
    currency_match = re.search(r"\b([A-Z]{3})\b", text)
    currency = currency_match.group(1) if currency_match else "VND"

    if not text or text.lower() in {"n/a", "not available", "error"}:
        return {"value": None, "currency": currency}

    numeric_text = re.sub(r"[^0-9,\.\-]", "", text)
    if not numeric_text:
        return {"value": None, "currency": currency}

    # MB balance values are normally integer VND values with separators.
    if "," in numeric_text and "." in numeric_text:
        if numeric_text.rfind(",") > numeric_text.rfind("."):
            normalized_number = numeric_text.replace(".", "").replace(",", ".")
        else:
            normalized_number = numeric_text.replace(",", "")
    elif "," in numeric_text:
        parts = numeric_text.split(",")
        normalized_number = numeric_text.replace(",", "") if len(parts[-1]) == 3 else numeric_text.replace(",", ".")
    else:
        normalized_number = numeric_text.replace(".", "")

    try:
        value = float(normalized_number) if "." in normalized_number else int(normalized_number)
    except ValueError:
        value = None

    return {"value": value, "currency": currency}


def click_element_with_fallback(driver, element, description: str = "element") -> bool:
    """Click a Selenium element with direct, JavaScript, and Actions fallbacks."""
    try:
        driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'center'});", element)
        time.sleep(0.2)
    except Exception:
        pass

    try:
        element.click()
        logger.info(f"Clicked {description} directly")
        return True
    except Exception as direct_error:
        logger.warning(f"Direct click failed for {description}: {direct_error}")

    try:
        driver.execute_script("arguments[0].click();", element)
        logger.info(f"Clicked {description} with JavaScript")
        return True
    except Exception as js_error:
        logger.warning(f"JavaScript click failed for {description}: {js_error}")

    try:
        ActionChains(driver).move_to_element(element).click().perform()
        logger.info(f"Clicked {description} with ActionChains")
        return True
    except Exception as action_error:
        logger.error(f"ActionChains click failed for {description}: {action_error}")
        return False


def wait_for_mb_biz_transaction_page(driver, timeout: int = 25) -> bool:
    """Wait until the current MB Business transaction inquiry UI is available."""
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "mbb-transaction-inquiry"))
    )
    WebDriverWait(driver, timeout).until(
        lambda d: d.find_elements(By.CSS_SELECTOR, "mbb-transaction-inquiry input[type='radio'][value='rank-radio']")
        or d.find_elements(By.CSS_SELECTOR, "mbb-transaction-inquiry .balance-wrapper")
        or d.find_elements(By.CSS_SELECTOR, "mbb-transaction-inquiry table#transactionListHistoryId")
    )
    return True


def select_transaction_date_range_option(driver):
    """Select the current MB Business 'Theo thời gian' / date-range radio option."""
    radio = WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((
            By.CSS_SELECTOR,
            "mbb-transaction-inquiry input[type='radio'][value='rank-radio']"
        ))
    )

    radio_id = radio.get_attribute("id")
    clicked = False
    if radio_id:
        labels = driver.find_elements(By.XPATH, f"//label[@for='{radio_id}']")
        for label in labels:
            if label.is_displayed():
                clicked = click_element_with_fallback(driver, label, "date-range radio label")
                if clicked:
                    break

    if not clicked:
        clicked = click_element_with_fallback(driver, radio, "date-range radio input")

    driver.execute_script(
        """
        const radio = arguments[0];
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        """,
        radio
    )
    time.sleep(0.5)

def set_biz_date_input_value(driver, placeholder: str, value: str):
    """Set a readonly Angular date input and dispatch events so the form receives the value."""
    date_input = WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((
            By.XPATH,
            f"//mbb-transaction-inquiry//input[@placeholder='{placeholder}']"
        ))
    )
    driver.execute_script("arguments[0].scrollIntoView({block: 'center', inline: 'center'});", date_input)
    time.sleep(0.2)
    driver.execute_script(
        """
        const input = arguments[0];
        const value = arguments[1];
        input.removeAttribute('readonly');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, value);
        input.setAttribute('value', value);
        for (const eventName of ['input', 'change', 'blur', 'keyup']) {
            input.dispatchEvent(new Event(eventName, { bubbles: true }));
        }
        """,
        date_input,
        value
    )
    logger.info(f"Set {placeholder} value to: {value}")

def click_transaction_search_button(driver) -> bool:
    """Click the current MB Business transaction inquiry search button."""
    query_button_xpaths = [
        "//mbb-transaction-inquiry//biz-button[.//*[normalize-space()='Tìm kiếm']]",
        "//mbb-transaction-inquiry//*[self::button or @role='button'][.//*[normalize-space()='Tìm kiếm'] or normalize-space()='Tìm kiếm']",
        "//mbb-transaction-inquiry//*[contains(@class, 'btn')][.//*[normalize-space()='Tìm kiếm'] or normalize-space()='Tìm kiếm']",
        "//mbb-transaction-inquiry//*[contains(normalize-space(), 'Tìm kiếm') and (self::button or self::biz-button or contains(@class, 'btn'))]",
        "//form//*[contains(normalize-space(), 'Tìm kiếm') and (self::button or self::biz-button or contains(@class, 'btn'))]",
    ]

    for xpath in query_button_xpaths:
        try:
            elements = WebDriverWait(driver, 5).until(
                EC.presence_of_all_elements_located((By.XPATH, xpath))
            )
            for element in elements:
                if element.is_displayed():
                    if click_element_with_fallback(driver, element, "transaction search button"):
                        return True
        except Exception as xpath_error:
            logger.warning(f"Search button not found with XPath {xpath}: {xpath_error}")

    logger.error("Could not find current transaction search button")
    return False

def set_transaction_date_filters(driver, from_date: str, to_date: str):
    """Set current MB Business transaction date filters and submit search."""
    select_transaction_date_range_option(driver)

    # Current /biz transaction inquiry UI uses date-only inputs. Keep accepting
    # DD/MM/YYYY HH:MM from the API, but send only the date part to the UI.
    ui_from_date = from_date.split(" ")[0]
    ui_to_date = to_date.split(" ")[0]
    if ui_from_date != from_date or ui_to_date != to_date:
        logger.info("Current MB Business date picker accepts date-only values; using date part for UI filters")

    set_biz_date_input_value(driver, "Từ ngày", ui_from_date)
    set_biz_date_input_value(driver, "Đến ngày", ui_to_date)

    try:
        driver.find_element(By.TAG_NAME, "body").click()
    except Exception:
        pass
    time.sleep(0.5)

    if click_transaction_search_button(driver):
        logger.info("Waiting for transaction query results to load...")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((
                By.CSS_SELECTOR,
                "mbb-transaction-inquiry .balance-wrapper, mbb-transaction-inquiry table#transactionListHistoryId"
            ))
        )
        time.sleep(2)

def extract_mb_biz_balance_values(driver) -> Dict[str, str]:
    """Extract current MB Business balance summary using label-based selectors."""
    balance_values = {
        "opening_balance": "Not available",
        "closing_balance": "Not available",
        "total_credit": "Not available",
        "total_debit": "Not available",
    }
    label_mapping = {
        "Số dư đầu": "opening_balance",
        "Số dư cuối": "closing_balance",
        "Tổng phát sinh có": "total_credit",
        "Tổng phát sinh nợ": "total_debit",
    }

    try:
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "mbb-transaction-inquiry .balance-wrapper"))
        )
        balance_items = driver.find_elements(By.CSS_SELECTOR, "mbb-transaction-inquiry .balance-wrapper .balance-item")
        for item in balance_items:
            try:
                title = normalize_text_value(item.find_element(By.CSS_SELECTOR, ".balance-title").text)
                amount = normalize_text_value(item.find_element(By.CSS_SELECTOR, ".balance-amount").text)
                if title in label_mapping and amount:
                    balance_values[label_mapping[title]] = amount
            except Exception as item_error:
                logger.warning(f"Could not parse a balance item: {item_error}")
    except Exception as balance_error:
        logger.warning(f"Label-based balance extraction failed: {balance_error}")

    # Fallback label-specific XPath, useful if the component class structure changes slightly.
    for label, key in label_mapping.items():
        if balance_values[key] != "Not available":
            continue
        try:
            amount = driver.find_element(
                By.XPATH,
                "//mbb-transaction-inquiry//*[contains(@class, 'balance-item')]"
                f"[.//*[contains(@class, 'balance-title') and normalize-space()='{label}']]"
                "//*[contains(@class, 'balance-amount')]"
            ).text
            amount = normalize_text_value(amount)
            if amount:
                balance_values[key] = amount
        except Exception:
            continue

    return balance_values

def extract_transactions_from_current_page(driver) -> list:
    """Extract transactions from table#transactionListHistoryId on the current page."""
    try:
        table = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "mbb-transaction-inquiry table#transactionListHistoryId"))
        )
    except TimeoutException:
        logger.warning("Transaction table #transactionListHistoryId was not found on the current page")
        return []

    header_elements = table.find_elements(By.CSS_SELECTOR, "thead th")
    headers = [normalize_text_value(header.text) for header in header_elements if normalize_text_value(header.text)]
    logger.info(f"Found {len(headers)} transaction table headers: {headers}")

    rows = table.find_elements(By.CSS_SELECTOR, "tbody tr")
    transactions = []
    logger.info(f"Found {len(rows)} transaction rows on current page")

    for row in rows:
        cell_elements = row.find_elements(By.CSS_SELECTOR, "td")
        row_data = [normalize_text_value(cell.text) for cell in cell_elements]
        if not any(row_data):
            continue

        transaction = {}
        for i, cell_value in enumerate(row_data):
            header_key = headers[i] if i < len(headers) else f"column_{i + 1}"
            transaction[header_key] = cell_value
        transactions.append(transaction)

    return transactions

def go_to_next_transaction_page(driver, current_page: int) -> bool:
    """Navigate to the next page in the current MB Business pagination component."""
    next_page_number = str(current_page + 1)

    # Prefer clicking the explicit next page number when it is visible.
    next_page_xpaths = [
        f"//mbb-transaction-inquiry//biz-pagination//biz-page[not(contains(@class, 'biz-active-page'))]//*[contains(@class, 'page-wrapper') and normalize-space()='{next_page_number}']",
        "//mbb-transaction-inquiry//biz-pagination//*[contains(concat(' ', normalize-space(@class), ' '), ' next ')]//biz-icon[not(contains(@class, 'disabled'))][.//i[contains(@class, 'icon-ALinear_Function_Right1')]]",
        "//mbb-transaction-inquiry//biz-pagination//*[contains(concat(' ', normalize-space(@class), ' '), ' next ')]//*[contains(@class, 'icon-ALinear_Function_Right1')]/ancestor::biz-icon[1][not(contains(@class, 'disabled'))]",
        "//button[normalize-space()='>']",
    ]

    for xpath in next_page_xpaths:
        try:
            candidates = driver.find_elements(By.XPATH, xpath)
            for candidate in candidates:
                candidate_class = candidate.get_attribute("class") or ""
                if "disabled" in candidate_class:
                    continue
                if candidate.is_displayed() and click_element_with_fallback(driver, candidate, "next transaction page"):
                    try:
                        WebDriverWait(driver, 8).until(
                            lambda d: any(
                                normalize_text_value(page.text) == next_page_number
                                for page in d.find_elements(
                                    By.XPATH,
                                    "//mbb-transaction-inquiry//biz-pagination//biz-page[contains(@class, 'biz-active-page')]//*[contains(@class, 'page-wrapper')]"
                                )
                            )
                        )
                    except TimeoutException:
                        logger.warning("Timed out waiting for active page indicator after clicking next page; continuing")
                    time.sleep(2)
                    return True
        except Exception as pagination_error:
            logger.warning(f"Next page XPath failed ({xpath}): {pagination_error}")

    logger.info("Next transaction page is not available")
    return False

# keep trying if wrong captcha
# stop if wrong corp_id, username or password 1 time
def log_in_v2(driver, username: str, password: str, corp_id: str):
    """
    Intelligent login function for MB Business Banking:
    - Keep trying if wrong captcha (GW715 error)
    - Stop immediately if wrong credentials or account locked (other error codes)
    """
    
    max_attempts = int(os.getenv("MB_LOGIN_MAX_ATTEMPTS", "3"))  # Default to 3 attempts if not set
    logger.info(f"🔐 Starting intelligent login process (max {max_attempts} attempts)")
    
    for attempt in range(max_attempts):
        logger.info(f"Attempting to log in, attempt {attempt + 1}/{max_attempts}")
        
        # Close any popup that might be open from previous failed attempt
        try:
            close_button_xpaths = [
                "//button[contains(text(), 'Close')]",
                "//button[contains(text(), 'Đóng')]",  # Vietnamese "Close"
                "//button[contains(@class, 'close')]"
            ]
            
            for xpath in close_button_xpaths:
                try:
                    close_buttons = driver.find_elements(By.XPATH, xpath)
                    if close_buttons:
                        for button in close_buttons:
                            if button.is_displayed():
                                logger.info("Closing popup...")
                                button.click()
                                time.sleep(0.5)
                                break
                except:
                    continue
        except:
            pass
                
        # Navigate to the login page
        url = 'https://ebank.mbbank.com.vn/cp/pl/login'
        logger.info(f"Navigating to: {url}")
        driver.get(url)
        
        # OPTIMIZED: Faster popup clearing with shorter timeouts
        try:
            close_button_xpaths = [
                '//*[@id="mat-dialog-0"]/mbb-dialog-common/div/div[4]/button',
                "//button[contains(@class, 'close')]",
                "//button[contains(@class, 'btn-close')]"
            ]
            
            for xpath in close_button_xpaths:
                try:
                    WebDriverWait(driver, 1.5).until(EC.presence_of_element_located((By.XPATH, xpath)))
                    close_buttons = driver.find_elements(By.XPATH, xpath)
                    if close_buttons:
                        for button in close_buttons:
                            if button.is_displayed():
                                logger.info(f"Closing initial popup using {xpath}...")
                                button.click()
                                time.sleep(0.3)
                                break
                except:
                    continue
        except Exception as popup_error:
            pass
                    
        # Page load wait
        time.sleep(0.5)
        
        current_url = driver.current_url
        logger.info(f"Current URL after navigation: {current_url}")
        
        # OPTIMIZED: Faster captcha detection with prioritized selectors
        captcha_img = None
        captcha_locating_methods = [
            {"method": "xpath", "selector": '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div/img'},
            {"method": "xpath", "selector": '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div[1]/div/img'},
            {"method": "xpath", "selector": "//mbb-word-captcha//img"},
            {"method": "xpath", "selector": "//img[contains(@src, 'captcha')]"},
            {"method": "xpath", "selector": "//div[contains(@class, 'captcha')]//img"}
        ]
                
        captcha_found = False
        for method in captcha_locating_methods:
            try:
                if method['method'] == 'xpath':
                    try:
                        captcha_img = WebDriverWait(driver, 3).until(
                            EC.presence_of_element_located((By.XPATH, method['selector']))
                        )
                        logger.info(f"Captcha found with XPath: {method['selector']}")
                        captcha_found = True
                        break
                    except TimeoutException:
                        continue
            except Exception as e:
                continue
                
        if not captcha_found:
            logger.error("Could not find captcha with any method")
            if attempt >= max_attempts - 1:
                logger.error("Maximum retry attempts reached")
                return False
            continue
        
        # Get image source and process captcha
        img_src = captcha_img.get_attribute("src")
        if not img_src:
            logger.error("Error: Could not get captcha image source")
            continue
        
        # Process captcha
        captcha_text = ""
        if img_src.startswith("data:image"):
            try:
                img_data = img_src.split(",")[1]
                img_bytes = base64.b64decode(img_data)
                captcha_text = read_captcha(img_bytes, is_bytes=True, save_images=True).replace(" ", "")
                logger.info(f"Captcha read as: {captcha_text}")
            except Exception as e:
                logger.error(f"Error processing captcha: {e}")
                continue
        else:
            logger.error("Captcha image is not a data URL")
            continue

        # Form filling
        try:
            # Corp ID field
            corp_id_xpath = '//*[@id="corp-id"]'
            WebDriverWait(driver, 8).until(
                EC.element_to_be_clickable((By.XPATH, corp_id_xpath))
            )
            corp_id_field = driver.find_element(By.XPATH, corp_id_xpath)
            corp_id_field.clear()
            corp_id_field.send_keys(corp_id)
            logger.info("Corp ID field filled")
            time.sleep(0.5)
            
            # Username field
            username_xpath = '//*[@id="user-id"]'
            username_field = driver.find_element(By.XPATH, username_xpath)
            username_field.clear()
            username_field.send_keys(username)
            logger.info("Username field filled")
            time.sleep(0.5)
            
            # Password field
            password_xpath = '//*[@id="password"]'
            password_field = driver.find_element(By.XPATH, password_xpath)
            password_field.clear()
            password_field.send_keys(password)
            logger.info("Password field filled")
            time.sleep(0.5)
            
            # Captcha input
            captcha_input_xpath = '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div[1]/input'
            try:
                captcha_field = WebDriverWait(driver, 2).until(
                    EC.element_to_be_clickable((By.XPATH, captcha_input_xpath))
                )
                captcha_field.clear()
                for char in captcha_text:
                    captcha_field.send_keys(char)
                    time.sleep(0.05)
                logger.info("Captcha field filled")
            except Exception as e:
                raise Exception("Captcha input field not found")
            
            time.sleep(0.3)
            
            # Sign-in button click
            signin_button_xpath = '//*[@id="login-btn"]'
            signin_button = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, signin_button_xpath))
            )
            
            try:
                signin_button.click()
                logger.info("Clicked sign-in button directly")
            except Exception as click_error:
                logger.warning(f"Direct click failed: {click_error}, trying JavaScript click...")
                driver.execute_script("arguments[0].click();", signin_button)
                logger.info("Clicked sign-in button using JavaScript")
            
            logger.info("Logging in, please wait...")
            
            # ✅ SIMPLIFIED: Wait 2 seconds then check login success
            time.sleep(2)  # Wait for login process
            
            try:
                current_url = driver.current_url
                page_title = driver.title
                
                # Check success indicators
                success_indicators = [
                    "/cp/" in current_url and "login" not in current_url,
                    "account-info" in current_url,
                    "transaction-inquiry" in current_url,
                    "Đăng nhập" not in page_title and page_title.strip() != "",
                ]
                
                if any(success_indicators):
                    logger.info(f"✅ LOGIN SUCCESS!")
                    return True  # Login successful
                else:
                    # ✅ INTELLIGENT ERROR DETECTION
                    try:
                        # Look for error dialog - try multiple XPaths for robustness
                        error_dialog_xpaths = [
                            '//*[@id="mat-dialog-0"]/mbb-dialog-error/div/div[1]/div[2]/b/p',
                            '//*[@id="mat-dialog-1"]/mbb-dialog-error/div/div[1]/div[2]/b/p',
                            '//*[@id="mat-dialog-2"]/mbb-dialog-error/div/div[1]/div[2]/b/p',
                            '//*[@id="mat-dialog-3"]/mbb-dialog-error/div/div[1]/div[2]/b/p',
                            "//mbb-dialog-error//p",
                            "//div[contains(@class, 'error')]//p"
                        ]
                        
                        error_message = None
                        for xpath in error_dialog_xpaths:
                            try:
                                error_element = driver.find_element(By.XPATH, xpath)
                                if error_element.is_displayed() and error_element.text.strip():
                                    error_message = error_element
                                    break
                            except:
                                continue
                        
                        if error_message:
                            error_text = error_message.text.strip()
                            logger.info(f"Error message detected: {error_text}")
                            
                            # ✅ DECISION LOGIC: GW715 vs Credential Errors
                            if 'GW715' in error_text:
                                # CAPTCHA ERROR - Continue retrying
                                logger.warning(f"⚠️ GW715 (Captcha) error - will retry (attempt {attempt + 1}/{max_attempts})")
                                
                                # Close error dialog quickly
                                try:
                                    close_button = driver.find_element(By.XPATH, "//mbb-dialog-error//button | //button[contains(@class, 'close')]")
                                    close_button.click()
                                    time.sleep(0.3)
                                except:
                                    pass
                                
                                continue  # Retry with next attempt
                                
                            elif 'GW18' in error_text:
                                # ACCOUNT LOCKED - Stop immediately
                                logger.error(f"❌ GW18 - MB Account is temporarily locked - {error_text}")
                                logger.info("Stopping all login attempts")
                                
                                # Close dialog
                                try:
                                    close_button = driver.find_element(By.XPATH, "//mbb-dialog-error//button | //button[contains(@class, 'close')]")
                                    close_button.click()
                                    time.sleep(0.2)
                                except:
                                    pass
                                
                                return False  # Stop immediately
                                
                            else:
                                # OTHER CREDENTIAL ERROR - Stop immediately  
                                logger.error(f"❌ CREDENTIAL ERROR - {error_text}")
                                logger.info("Stopping all login attempts")
                                
                                # Close dialog
                                try:
                                    close_button = driver.find_element(By.XPATH, "//mbb-dialog-error//button | //button[contains(@class, 'close')]")
                                    close_button.click()
                                    time.sleep(0.2)
                                except:
                                    pass
                                
                                return False  # Stop immediately
                        else:
                            # No specific error message found - assume retry needed
                            logger.warning("❌ Login failed - no specific error detected, will retry")
                            continue
                            
                    except Exception as error_check_error:
                        logger.warning(f"Error while checking for error messages: {error_check_error}")
                        # If we can't detect the error type, continue retrying
                        continue
    
            except Exception as check_error:
                logger.error(f"Error checking login result: {check_error}")
                continue
            
        except Exception as e:
            logger.error(f"Error during login process: {e}")
            continue
    
    # All attempts exhausted
    logger.error(f"❌ All {max_attempts} login attempts failed")
    return False

# ✅ UPDATED: Fixed mb_biz_login_v2 router to properly use log_in_v2
@router.get('/MB_biz_transaction_crawling_v2', tags=['MB'])
async def mb_biz_login_v2(
    corp_id: str = Query(..., description="MB business corporation ID"),
    username: str = Query(..., description="MB business username"),
    password: str = Query(..., description="MB business password"),
    fetch_transactions: bool = Query(False, description="Decide to retrieve transactions data or not"),
    use_selenium_grid: bool = Query(False, description="Use Selenium Grid instead of local WebDriver"),
    max_pages: Optional[int] = Query(1, description="Maximum number of transaction history pages to retrieve (null to retrieve all)"),
    from_date: Optional[str] = Query(None, description="Start date for transaction query (format: DD/MM/YYYY or DD/MM/YYYY HH:MM)"),
    to_date: Optional[str] = Query(None, description="End date for transaction query (format: DD/MM/YYYY or DD/MM/YYYY HH:MM)"),
    save_json: bool = Query(False, description="Whether to save the results as a JSON file")
) -> JSONResponse:
    try:
        logger.info("Starting MB Business transaction crawling with intelligent login...")
        
        # Validate date formats if provided
        date_validation_passed = False
        if from_date is not None:
            try:
                # Validate date format DD/MM/YYYY or DD/MM/YYYY HH:MM
                date_time_pattern = r'^(\d{2}/\d{2}/\d{4})( \d{2}:\d{2})?$'
                if not re.match(date_time_pattern, from_date):
                    return await generate_error_response("Invalid from_date format. Please use DD/MM/YYYY or DD/MM/YYYY HH:MM format.")
                
                # Parse date or date+time
                if ' ' in from_date:
                    date_part, time_part = from_date.split(' ')
                    day, month, year = map(int, date_part.split('/'))
                    hour, minute = map(int, time_part.split(':'))
                    datetime(year, month, day, hour, minute)  # Validate the datetime
                else:
                    day, month, year = map(int, from_date.split('/'))
                    datetime(year, month, day)  # Validate the date
                
                logger.info(f"Valid from_date provided: {from_date}")
                date_validation_passed = True
            except ValueError as e:
                logger.error(f"Invalid from_date: {e}")
                return await generate_error_response(f"Invalid from_date: {e}")
        
        if to_date is not None:
            try:
                # Validate date format DD/MM/YYYY or DD/MM/YYYY HH:MM
                date_time_pattern = r'^(\d{2}/\d{2}/\d{4})( \d{2}:\d{2})?$'
                if not re.match(date_time_pattern, to_date):
                    return await generate_error_response("Invalid to_date format. Please use DD/MM/YYYY or DD/MM/YYYY HH:MM format.")
                
                # Parse date or date+time
                if ' ' in to_date:
                    date_part, time_part = to_date.split(' ')
                    day, month, year = map(int, date_part.split('/'))
                    hour, minute = map(int, time_part.split(':'))
                    datetime(year, month, day, hour, minute)  # Validate the datetime
                else:
                    day, month, year = map(int, to_date.split('/'))
                    datetime(year, month, day)  # Validate the date
                
                logger.info(f"Valid to_date provided: {to_date}")
                date_validation_passed = True
            except ValueError as e:
                logger.error(f"Invalid to_date: {e}")
                return await generate_error_response(f"Invalid to_date: {e}")
        
        # Set to_date to today if from_date is provided but to_date is not
        if from_date is not None and to_date is None:
            to_date = datetime.now().strftime("%d/%m/%Y")
            logger.info(f"from_date provided without to_date. Setting to_date to today: {to_date}")
        
        # Set max_pages to None if date validation passed
        if date_validation_passed:
            logger.info("Valid date range provided. Setting max_pages to None to retrieve all pages.")
            max_pages = None
        
        # Try to scrape real data using Selenium
        driver = None
        try:
            logger.info("Initializing Selenium WebDriver...")
            
            # Initialize WebDriver (grid or local)
            if use_selenium_grid:
                # Test connection directly using curl
                grid_available = test_selenium_hub_connection()
                
                if grid_available:
                    selenium_grid_url = get_selenium_hub_url()
                    logger.info(f"Initializing Remote WebDriver with Selenium Grid at: {selenium_grid_url}")
                    
                    try:
                        options = webdriver.EdgeOptions()
                        options.add_argument("--start-maximized")
                        options.add_argument("--disable-notifications")
                        options.add_argument("--headless")  # Run in headless mode
                        
                        # Add these options to help with access denied issues
                        options.add_argument("--no-sandbox")
                        options.add_argument("--disable-dev-shm-usage")
                        options.add_argument("--disable-blink-features=AutomationControlled")
                        options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36 Edg/97.0.1072.62")
                        
                        # Set up capabilities with more detailed configuration
                        options.set_capability("browserName", "MicrosoftEdge")
                        options.set_capability("platformName", "linux")
                        
                        # Add HTTP client configuration with higher timeouts
                        options.set_capability("se:options", {
                            "timeouts": {"implicit": 15000, "pageLoad": 30000, "script": 30000}
                        })
                        
                        # Use direct connection to Selenium Grid
                        driver = webdriver.Remote(
                            command_executor=selenium_grid_url,
                            options=options,
                            keep_alive=True
                        )
                        logger.info("Successfully connected to Selenium Grid")
                    except Exception as grid_error:
                        logger.error(f"Error connecting to Selenium Grid: {grid_error}")
                        logger.info("Falling back to local WebDriver")
                        use_selenium_grid = False
                else:
                    logger.warning("Selenium Grid is not available. Falling back to local WebDriver")
                    use_selenium_grid = False
            
            # If not using grid (or grid failed), use local WebDriver
            if not use_selenium_grid:
                # Use local Edge WebDriver
                logger.info("Using local Edge WebDriver")
                edge_options = EdgeOptions()
                edge_options.add_argument("--start-maximized")
                edge_options.add_argument("--disable-notifications")
                # Don't use headless mode initially to diagnose issues
                # edge_options.add_argument("--headless")
                
                # Add extra options to help with detection issues
                edge_options.add_argument("--disable-blink-features=AutomationControlled")
                edge_options.add_argument("--disable-extensions")
                edge_options.add_argument("--disable-gpu")
                edge_options.add_argument("--no-sandbox")
                
                # Add flag to fix WebGL warnings
                edge_options.add_argument("--enable-unsafe-swiftshader")
                
                # Set user-agent to look more like a real browser
                edge_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36 Edg/97.0.1072.62")
                
                try:
                    driver = webdriver.Edge(options=edge_options)
                    logger.info("Local WebDriver initialized successfully")
                except WebDriverException as edge_error:
                    logger.error(f"Edge WebDriver failed: {edge_error}. Falling back to Chrome or Firefox.")
                    
                    # Try Chrome WebDriver
                    try:
                        chrome_options = ChromeOptions()
                        chrome_options.add_argument("--start-maximized")
                        chrome_options.add_argument("--disable-notifications")
                        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
                        chrome_options.add_argument("--no-sandbox")
                        chrome_options.add_argument("--disable-dev-shm-usage")
                        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36")
                        
                        driver = webdriver.Chrome(options=chrome_options)
                        logger.info("Chrome WebDriver initialized successfully")
                    except WebDriverException as chrome_error:
                        logger.error(f"Chrome WebDriver failed: {chrome_error}. Falling back to Firefox.")
                        
                        # Try Firefox WebDriver
                        try:
                            firefox_options = FirefoxOptions()
                            firefox_options.add_argument("--start-maximized")
                            firefox_options.add_argument("--disable-notifications")
                            firefox_options.add_argument("--disable-blink-features=AutomationControlled")
                            firefox_options.add_argument("--no-sandbox")
                            firefox_options.add_argument("--disable-dev-shm-usage")
                            firefox_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/97.0")
                            
                            driver = webdriver.Firefox(options=firefox_options)
                            logger.info("Firefox WebDriver initialized successfully")
                        except WebDriverException as firefox_error:
                            logger.error(f"Firefox WebDriver failed: {firefox_error}. No WebDriver could be initialized.")
                            return await generate_error_response(f"WebDriver error: {str(firefox_error)}")
            
            # ✅ USE INTELLIGENT LOGIN FUNCTION - NO LOOP NEEDED
            logger.info("=== STARTING INTELLIGENT LOGIN ===")
            login_success = log_in_v2(
                driver=driver,
                username=username,
                password=password,
                corp_id=corp_id
            )
            
            if not login_success:
                logger.error("❌ LOGIN FAILED - log_in_v2 refused login")
                if driver:
                    driver.quit()
                return await generate_error_response("Login failed. Check credentials or account status.", save_json=save_json)
            
            logger.info("✅ LOGIN SUCCESSFUL - Proceeding to transaction extraction...")

            # Navigate directly to the current MB Business transaction inquiry page
            transaction_url = 'https://ebank.mbbank.com.vn/biz/account/transaction-inquiry'
            logger.info(f"Navigating to transaction page: {transaction_url}")
            driver.get(transaction_url)

            # Wait for the transaction page to load
            logger.info("Waiting for current MB Business transaction page to load...")
            wait_for_mb_biz_transaction_page(driver)
            logger.info("Transaction page loaded successfully")

            # If date parameters are provided, set the date range filters
            if date_validation_passed:
                # click on period_option_button
                period_option_button = driver.find_element(By.XPATH, '//*[@id="mat-radio-3"]/label/div[1]')
                period_option_button.click()
                logger.info(f"Setting date range filters: from {from_date} to {to_date}")
                try:
                    # Locate and fill the from date input field
                    from_date_xpath = '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/form/div/div/div/div[2]/div/div/div[2]/div[1]/div[1]/div/mbb-date-time-picker/input'
                    
                    # Wait for the from date field to be present and clickable
                    from_date_field = WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, from_date_xpath))
                    )
                    # First click to focus, then clear, then send keys
                    from_date_field.click()
                    # from_date_field.clear()
                    for _ in range(12):
                        from_date_field.send_keys(Keys.BACKSPACE)
                    
                    # Add time component if not already included
                    full_from_date = from_date
                    if ' ' not in from_date:
                        full_from_date = from_date + " 00:00"
                        logger.info(f"Adding default time (00:00) to from_date: {full_from_date}")
                    else:
                        logger.info(f"Using provided time in from_date: {full_from_date}")
                    
                    from_date_field.send_keys(full_from_date)
                    logger.info(f"Entered from_date: {full_from_date}")
                    # accept the date
                    # driver.find_element(By.TAG_NAME, "body").click()
                    time.sleep(1)
                    # Locate and fill the to date input field
                    to_date_xpath = '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/form/div/div/div/div[2]/div/div/div[2]/div[1]/div[2]/div/mbb-date-time-picker/input'
                    
                    # Wait for the to date field to be present and clickable
                    to_date_field = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, to_date_xpath))
                    )
                    
                    # Make sure the to_date field is visible in the viewport
                    driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", to_date_field)
                    time.sleep(1)  # Wait for scroll to complete
                    
                    # First click more forcefully to focus on the field - try multiple approaches
                    try:
                        # Try standard click
                        to_date_field.click()
                        logger.info("Clicked to_date field with standard click")
                    except Exception as click_error:
                        logger.warning(f"Standard click on to_date field failed: {click_error}")
                        try:
                            # Try JavaScript click if standard click fails
                            driver.execute_script("arguments[0].click();", to_date_field)
                            logger.info("Clicked to_date field with JavaScript click")
                        except Exception as js_click_error:
                            logger.warning(f"JavaScript click on to_date field failed: {js_click_error}")
                            # Try Actions chain as a last resort
                            actions = ActionChains(driver)
                            actions.move_to_element(to_date_field).click().perform()
                            logger.info("Clicked to_date field with ActionChains")
                    
                    time.sleep(0.5)  # Short wait after click to ensure field is active
                    
                    # Clear the field
                    for _ in range(12):
                        to_date_field.send_keys(Keys.BACKSPACE)
                    
                    # Add time component if not already included
                    full_to_date = to_date
                    if ' ' not in to_date:
                        full_to_date = to_date + " 23:59"
                        logger.info(f"Adding default time (23:59) to to_date: {full_to_date}")
                    else:
                        logger.info(f"Using provided time in to_date: {full_to_date}")
                    
                    # Send keys with small delay between characters to ensure input is captured
                    for char in full_to_date:
                        to_date_field.send_keys(char)
                        time.sleep(0.1)  # Small delay between keypresses
                    
                    logger.info(f"Entered to_date: {full_to_date}")
                    # Ensure field loses focus by clicking elsewhere or pressing Tab
                    driver.find_element(By.TAG_NAME, "body").click()
                    time.sleep(0.5)  # Brief wait after losing focus
                    
                    # Click on "Truy Vấn" (Query) button - try multiple XPaths
                    query_button_xpaths = [
                        '//*[@id="btn-query"]',
                        '/html/body/app-root/div/ng-component/div[1]/div/div/div[1]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/form/div/div/div/div[2]/div/div/div[3]/div/div/button',
                        '//button[contains(text(), "Truy") and contains(text(), "Vấn")]',
                        '//button[contains(text(), "Query")]',
                        '//div[contains(@class, "footer")]//button'
                    ]
                    
                    # Try each XPath in sequence until we find the button
                    query_button = None
                    for xpath in query_button_xpaths:
                        try:
                            logger.info(f"Looking for query button with XPath: {xpath}")
                            potential_button = WebDriverWait(driver, 5).until(
                                EC.presence_of_element_located((By.XPATH, xpath))
                            )
                            if potential_button.is_displayed():
                                query_button = potential_button
                                logger.info(f"Found query button with XPath: {xpath}")
                                break
                        except Exception as xpath_error:
                            logger.warning(f"Query button not found with XPath {xpath}: {xpath_error}")
                    
                    if not query_button:
                        # Last resort - try to find any button that might be the query button
                        logger.info("Using fallback approach to find query button...")
                        try:
                            # Look for buttons in the form
                            form_buttons = driver.find_elements(By.XPATH, "//form//button")
                            for button in form_buttons:
                                if button.is_displayed() and button.is_enabled():
                                    button_text = button.text.strip().lower()
                                    # Check if button text contains keywords that might indicate it's the query button
                                    if any(keyword in button_text for keyword in ["truy", "vấn", "query", "search", "tìm"]):
                                        query_button = button
                                        logger.info(f"Found query button by text: {button.text}")
                                        break
                        except Exception as fallback_error:
                            logger.error(f"Fallback query button search failed: {fallback_error}")
                    
                    if query_button:
                        # Scroll to make the button visible
                        driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", query_button)
                        time.sleep(1)  # Wait for scroll to complete
                        
                        # Try multiple click methods
                        click_success = False
                        try:
                            # Method 1: Direct click
                            query_button.click()
                            logger.info("Clicked query button directly")
                            click_success = True
                        except Exception as direct_click_error:
                            logger.warning(f"Direct click on query button failed: {direct_click_error}")
                            try:
                                # Method 2: JavaScript click
                                driver.execute_script("arguments[0].click();", query_button)
                                logger.info("Clicked query button with JavaScript")
                                click_success = True
                            except Exception as js_click_error:
                                logger.warning(f"JavaScript click on query button failed: {js_click_error}")
                                try:
                                    # Method 3: Actions chain
                                    actions = ActionChains(driver)
                                    actions.move_to_element(query_button).click().perform()
                                    logger.info("Clicked query button with ActionChains")
                                    click_success = True
                                except Exception as actions_click_error:
                                    logger.error(f"ActionChains click on query button failed: {actions_click_error}")
                        if click_success:
                            logger.info("Successfully clicked 'Truy Vấn' (Query) button")
                            # Wait for query results to load - exactly 2 seconds as per requirement
                            logger.info("Waiting 2 seconds for query results to load...")
                            time.sleep(2)  # Wait exactly 2 seconds as required
                        else:
                            logger.error("All click methods for query button failed")
                    else:
                        logger.error("Could not find query button with any approach")
                    
                    
                except Exception as filter_error:
                    logger.error(f"Error setting date filters: {filter_error}")
                    logger.warning("Continuing with default date range")
            
            
            # Extract account information and balance
            try:
                logger.info("Extracting account information and balance data...")
                # Define XPath expressions for balance information
                opening_balance_xpath = '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/mbb-transaction-inquiry-info/div[1]/div[1]/mbb-card-summary-amount/div/div[2]/div'
                closing_balance_xpath = '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/mbb-transaction-inquiry-info/div[1]/div[2]/mbb-card-summary-amount/div/div[2]/div'
                total_credit_xpath = '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/mbb-transaction-inquiry-info/div[1]/div[3]/mbb-card-summary-amount/div/div[2]/div'
                total_debit_xpath = '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/mbb-transaction-inquiry-info/div[1]/div[4]/mbb-card-summary-amount/div/div[2]/div'
                
                # Get the account balance information from the page
                try:
                    # Wait for each balance element and extract text
                    opening_balance = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, opening_balance_xpath))
                    ).text.strip()
                    logger.info(f"Opening balance: {opening_balance}")
                    
                    closing_balance = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, closing_balance_xpath))
                    ).text.strip()
                    logger.info(f"Closing balance: {closing_balance}")
                    
                    total_credit = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, total_credit_xpath))
                    ).text.strip()
                    logger.info(f"Total credit: {total_credit}")
                    
                    total_debit = WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.XPATH, total_debit_xpath))
                    ).text.strip()
                    logger.info(f"Total debit: {total_debit}")
                except TimeoutException:
                    logger.warning("Timed out waiting for balance elements. Trying alternative approach...")
                    # Try an alternative approach with direct find_element
                    try:
                        opening_balance = driver.find_element(By.XPATH, opening_balance_xpath).text.strip()
                        closing_balance = driver.find_element(By.XPATH, closing_balance_xpath).text.strip()
                        total_credit = driver.find_element(By.XPATH, total_credit_xpath).text.strip()
                        total_debit = driver.find_element(By.XPATH, total_debit_xpath).text.strip()
                        logger.info("Successfully retrieved balance information using direct approach")
                    except NoSuchElementException:
                        logger.error("Could not find balance elements with either approach")
                        opening_balance = "Not available"
                        closing_balance = "Not available"
                        total_credit = "Not available"
                        total_debit = "Not available"
            except Exception as balance_error:
                logger.error(f"Error extracting balance information: {balance_error}")
                opening_balance = "Error"
                closing_balance = "Error"
                total_credit = "Error"
                total_debit = "Error"
            
            # Check if we need to fetch transaction data
            if not fetch_transactions:
                logger.info("fetch_transactions is False - skipping transaction data extraction")
                
                # Finalize and return the result with balance info only
                result_data = {
                    "timestamp": format_timestamp_gmt7(),
                    "status": "success",
                    "message": "Successfully retrieved balance data (transactions not requested)",
                    "account_info": {
                        "opening_balance": opening_balance if 'opening_balance' in locals() else "N/A",
                        "opening_balance_json": parse_balance_field(opening_balance if 'opening_balance' in locals() else "N/A"),
                        "closing_balance": closing_balance if 'closing_balance' in locals() else "N/A",
                        "closing_balance_json": parse_balance_field(closing_balance if 'closing_balance' in locals() else "N/A"),
                        "total_credit": total_credit if 'total_credit' in locals() else "N/A",
                        "total_credit_json": parse_balance_field(total_credit if 'total_credit' in locals() else "N/A"),
                        "total_debit": total_debit if 'total_debit' in locals() else "N/A",
                        "total_debit_json": parse_balance_field(total_debit if 'total_debit' in locals() else "N/A"),
                        "last_updated": format_timestamp_gmt7()
                    },
                    "transactions": []  # Empty list as transactions were not requested
                }
                
                # Save balance-only result to JSON file if save_json is True
                if save_json:
                    # Use the helper function to find or create data directory
                    data_dir = find_data_directory()
                    
                    json_path = os.path.join(data_dir, f"mb_biz_balance_{datetime.now().strftime('%Y%m%d_%H%M')}_success.json")
                    with open(json_path, 'w', encoding='utf-8') as jsonfile:
                        json.dump(result_data, jsonfile, ensure_ascii=False, indent=2)
                    
                    logger.info(f"Balance-only data saved to: {json_path}")
                else:
                    logger.info("save_json is False - not saving data to JSON file")
                
                # Clean up PNG files before returning
                try:
                    logger.info("Attempting to clean up PNG files...")
                    num_files_removed = cleanup_png_files()
                    logger.info(f"Successfully cleaned up {num_files_removed} PNG files")
                except Exception as cleanup_error:
                    logger.error(f"Error during PNG cleanup: {cleanup_error}")
                
                cleanup_png_files()
                return JSONResponse(content=result_data)

            # Extract transaction data from the first page
            transactions_list = []
            current_page = 1  # Initialize current_page here to avoid UnboundLocalError
            try:
                logger.info("Extracting transaction data from the first page...")
                
                # Get table headers
                header_elements = driver.find_elements(By.XPATH, "//table//th")
                headers = [header.text.strip() for header in header_elements if header.text.strip()]
                logger.info(f"Found {len(headers)} table headers: {headers}")
                
                # Get table rows
                rows = driver.find_elements(By.XPATH, "//table//tbody//tr")
                logger.info(f"Found {len(rows)} transaction rows on first page")
                
                for row in rows:
                    cell_elements = row.find_elements(By.XPATH, "./td")
                    row_data = [cell.text.strip() for cell in cell_elements]
                    
                    if row_data:  # Only add non-empty rows
                        transaction = {}
                        for i, header in enumerate(headers):
                            header_key = header.strip()
                            if i < len(row_data):
                                transaction[header_key] = row_data[i]
                            else:
                                transaction[header_key] = ""
                        
                        transactions_list.append(transaction)
                
                logger.info(f"Extracted {len(transactions_list)} transactions from first page")
            except Exception as extract_error:
                logger.error(f"Error extracting transaction data: {extract_error}")
            
            # Now handle pagination properly with more specific XPath
            logger.info("Beginning pagination process...")

            has_next_page = True
            # Use the provided max_pages or default to a high number if null (retrieve all)
            pages_limit = max_pages if max_pages is not None else 100
            logger.info(f"Will retrieve up to {pages_limit} transaction pages")

            # We already processed the first page above, now continue with pagination
            while has_next_page and current_page < pages_limit:
                logger.info(f"Currently on page {current_page}, attempting to go to next page")
                
                # Try to find and click the next page button with multiple approaches
                try:
                    # Find all button elements that might be the next button
                    button_candidates = driver.find_elements(By.XPATH, "//button")
                    next_button = None
                    
                    # Look for the button with ">" text
                    for button in button_candidates:
                        if button.text.strip() == ">":
                            next_button = button
                            logger.info("Found next button by '>' text")
                            break
                    
                    # If not found by text, try by position in pagination container
                    if not next_button:
                        logger.info("Trying to find next button in pagination container...")
                        try:
                            pagination_container = driver.find_element(By.XPATH, '//*[@id="page-items"]')
                            pagination_buttons = pagination_container.find_elements(By.TAG_NAME, "button")
                            
                            # Look for ">" button in pagination container
                            for btn in pagination_buttons:
                                if btn.text.strip() == ">":
                                    next_button = btn
                                    logger.info("Found next button in pagination container")
                                    break
                        except Exception as e:
                            logger.warning(f"Couldn't find pagination container: {e}")
                    
                    if next_button:
                        # Check if the button is actually enabled by examining its attributes and appearance
                        is_disabled = False
                        try:
                            disabled_attr = next_button.get_attribute("disabled")
                            aria_disabled = next_button.get_attribute("aria-disabled")
                            btn_class = next_button.get_attribute("class")
                            
                            logger.info(f"Next button disabled attribute: {disabled_attr}")
                            logger.info(f"Next button aria-disabled: {aria_disabled}")
                            logger.info(f"Next button class: {btn_class}")
                            
                            is_disabled = (
                                disabled_attr == "true" or 
                                disabled_attr == "" or 
                                aria_disabled == "true" or 
                                (btn_class and "disabled" in btn_class)
                            )
                        except Exception as e:
                            logger.warning(f"Error checking button disabled state: {e}")
                        
                        if is_disabled:
                            logger.info("Next button is disabled - reached the end of pagination")
                            has_next_page = False
                        else:
                            # The button is enabled, try to click it
                            try:
                                # Scroll to make the button visible
                                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", next_button)
                                time.sleep(1)
                                
                                # Check if it's visible before clicking
                                if next_button.is_displayed():
                                    logger.info("Next button is displayed and enabled, clicking...")
                                    
                                    # Try direct click first
                                    try:
                                        next_button.click()
                                        logger.info("Successfully clicked next button directly")
                                        click_success = True
                                    except Exception as click_error:
                                        logger.warning(f"Direct click failed: {click_error}")
                                        
                                        # Try JavaScript click as fallback
                                        try:
                                            driver.execute_script("arguments[0].click();", next_button)
                                            logger.info("Successfully clicked next button with JavaScript")
                                            click_success = True
                                        except Exception as js_error:
                                            logger.error(f"JavaScript click also failed: {js_error}")
                                            click_success = False
                                    
                                    # Wait for page to load after successful click
                                    if click_success:
                                        logger.info("Waiting for next page to load...")
                                        time.sleep(3)
                                        current_page += 1
                                        
                                        # Extract transactions from the new page
                                        logger.info(f"Extracting transaction data from page {current_page}...")
                                        new_rows = driver.find_elements(By.XPATH, "//table//tbody//tr")
                                        
                                        if new_rows:
                                            logger.info(f"Found {len(new_rows)} additional transactions on page {current_page}")
                                            
                                            # Re-fetch headers to ensure consistency
                                            header_elements = driver.find_elements(By.XPATH, "//table//th")
                                            headers = [header.text.strip() for header in header_elements if header.text.strip()]
                                            
                                            for row in new_rows:
                                                cell_elements = row.find_elements(By.XPATH, "./td")
                                                row_data = [cell.text.strip() for cell in cell_elements]
                                                
                                                if row_data:  # Only add non-empty rows
                                                    transaction = {}
                                                    for i, header in enumerate(headers):
                                                        header_key = header.strip()
                                                        if i < len(row_data):
                                                            transaction[header_key] = row_data[i]
                                                        else:
                                                            transaction[header_key] = ""
                                                    
                                                    transactions_list.append(transaction)
                                            

                                            logger.info(f"Total transactions collected so far: {len(transactions_list)}")
                                        else:
                                            logger.warning(f"No transaction rows found on page {current_page}")
                                            has_next_page = False
                                    else:
                                        logger.error("All click methods failed - cannot navigate to next page")
                                        has_next_page = False
                            except Exception as visibility_error:
                                logger.error(f"Error checking button visibility: {visibility_error}")
                                has_next_page = False
                    else:
                        logger.warning("Next page button not found - reached the end of pagination")
                        has_next_page = False
                except Exception as pagination_error:
                    logger.error(f"Error during pagination: {pagination_error}")
                    has_next_page = False
            
            logger.info(f"Pagination complete. Processed {current_page} pages with {len(transactions_list)} total transactions.")

            # Filter and clean transactions before returning the result
            transactions_list = [
                clean_transaction_fields(transaction)
                for transaction in transactions_list
                if is_valid_transaction(transaction)
            ]

            logger.info(f"Filtered and cleaned transactions: {len(transactions_list)} valid transactions remain.")
            
            # Finalize and return the result
            result_data = {
                "timestamp": format_timestamp_gmt7(),
                "status": "success",
                "message": f"Successfully retrieved transaction data from {from_date or 'latest page'} to {format_timestamp_gmt7() or 'now'}",
                "account_info": {
                    "opening_balance": opening_balance if 'opening_balance' in locals() else "N/A",
                    "opening_balance_json": parse_balance_field(opening_balance if 'opening_balance' in locals() else "N/A"),
                    "closing_balance": closing_balance if 'closing_balance' in locals() else "N/A",
                    "closing_balance_json": parse_balance_field(closing_balance if 'closing_balance' in locals() else "N/A"),
                    "total_credit": total_credit if 'total_credit' in locals() else "N/A",
                    "total_credit_json": parse_balance_field(total_credit if 'total_credit' in locals() else "N/A"),
                    "total_debit": total_debit if 'total_debit' in locals() else "N/A",
                    "total_debit_json": parse_balance_field(total_debit if 'total_debit' in locals() else "N/A"),
                    "last_updated": format_timestamp_gmt7()
                },
                "transactions": transactions_list if 'transactions_list' in locals() and transactions_list is not None else []
            }
            
            # Save successful result to JSON file if save_json is True
            if save_json:
                # Use the helper function to find or create data directory
                data_dir = find_data_directory()
                
                json_path = os.path.join(data_dir, f"mb_biz_transactions_{datetime.now().strftime('%Y%m%d_%H%M')}_success.json")
                with open(json_path, 'w', encoding='utf-8') as jsonfile:
                    json.dump(result_data, jsonfile, ensure_ascii=False, indent=2)
                
                logger.info(f"Successful transaction data saved to: {json_path}")
            else:
                logger.info("save_json is False - not saving data to JSON file")
            
            cleanup_png_files()
            return JSONResponse(content=result_data)
            
        except Exception as driver_error:
            logger.error(f"Error during web scraping: {driver_error}", exc_info=True)
            if driver:
                driver.quit()
            return await generate_error_response(f"WebDriver error: {str(driver_error)}", save_json=save_json)
            
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return await generate_error_response(f"An unexpected error occurred: {str(e)}", save_json=save_json)
    
async def generate_error_response(message: str, status_code: int = 500, save_json: bool = False) -> JSONResponse:
    """Generate a standardized error response"""
    result_data = {
        "timestamp": format_timestamp_gmt7(),
        "status": "false",  # Changed from "error" to "false" as requested
        "message": message,
        "account_info": {
            "opening_balance": "Not available",
            "opening_balance_json": {"value": None, "currency": "VND"},
            "closing_balance": "Not available",
            "closing_balance_json": {"value": None, "currency": "VND"},
            "total_credit": "Not available",
            "total_credit_json": {"value": None, "currency": "VND"},
            "total_debit": "Not available",
            "total_debit_json": {"value": None, "currency": "VND"},
            "last_updated": format_timestamp_gmt7()
        },
        "transactions": []
    }
    
    # Save to JSON file in data directory if save_json is True
    if save_json:
        # Use the helper function to find or create data directory
        data_dir = find_data_directory()
        
        json_path = os.path.join(data_dir, f"mb_biz_transactions_{datetime.now().strftime('%Y%m%d_%H%M')}_error.json")
        with open(json_path, 'w', encoding='utf-8') as jsonfile:
            json.dump(result_data, jsonfile, ensure_ascii=False, indent=2)
        
        logger.info(f"Error response saved to: {json_path}")
    else:
        logger.info("save_json is False - not saving error data to JSON file")
    
    # Clean up all PNG files from both folders
    try:
        logger.info("Attempting to clean up PNG files...")
        num_files_removed = cleanup_png_files()
        logger.info(f"Successfully cleaned up {num_files_removed} PNG files")
    except Exception as cleanup_error:
        logger.error(f"Error during PNG cleanup: {cleanup_error}")
    
    return JSONResponse(content=result_data, status_code=status_code)

def format_timestamp_gmt7():
    """Format current timestamp in GMT+7 timezone with format dd-mm-yyyy hh:mm:ss"""
    vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
    current_time = datetime.now(vietnam_tz)
    return current_time.strftime('%d-%m-%Y %H:%M:%S')
