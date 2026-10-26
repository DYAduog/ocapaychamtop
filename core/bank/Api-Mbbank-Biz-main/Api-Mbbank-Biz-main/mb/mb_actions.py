# import os
import time
import logging
import sys
import os
import shutil
from datetime import datetime
import pytz  # ✅ ADD: Import pytz for proper timezone handling

import base64

from routers.captcha_reading import read_captcha

# Import Selenium components
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

# ✅ FIXED: Proper Vietnam timezone formatter using pytz
class VietnamFormatter(logging.Formatter):
    """Custom formatter that always uses Vietnam timezone - FIXED VERSION"""
    def formatTime(self, record, datefmt=None):
        # Force Vietnam timezone for all log timestamps
        vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        dt = datetime.fromtimestamp(record.created, vietnam_tz)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.strftime('%Y-%m-%d %H:%M:%S %Z')

# config logging
logger = logging.getLogger(__name__)

# ✅ FIXED: Use the corrected Vietnam formatter
console_handler = logging.StreamHandler(sys.stdout)
formatter = VietnamFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)
logger.setLevel(logging.INFO)

# global driver
driver = None

# docker is running -> selenium hub is running on http://selenium-hub:4444/wd/hub
# Get the correct Selenium Grid URL based on environment
def get_selenium_hub_url():
    """Get the correct Selenium Hub URL based on environment"""
    selenium_host = os.getenv("SELENIUM_HOST", "selenium-hub")
    selenium_port = os.getenv("SELENIUM_PORT", "4444")
    return f"http://{selenium_host}:{selenium_port}/wd/hub"

# Add a simple connection test function
def test_selenium_hub_connection():
    """Test direct connection to Selenium hub without WebDriver"""
    try:
        selenium_host = os.getenv("SELENIUM_HOST", "selenium-hub")
        selenium_port = os.getenv("SELENIUM_PORT", "4444")
        status_url = f"http://{selenium_host}:{selenium_port}/status"

        if not shutil.which("curl"):
            logger.warning("curl command not found; skipping Selenium Grid curl test")
            return False

        # Use subprocess for a simple connection test that doesn't depend on async
        import subprocess
        result = subprocess.run(
            ["curl", "-s", status_url], 
            capture_output=True, 
            text=True, 
            timeout=5
        )
        if result.returncode == 0 and "ready" in result.stdout:
            logger.info("Selenium Grid is available (direct curl test)")
            return True
        else:
            logger.error(f"Selenium Grid connection test failed: {result.returncode}")
            return False
    except Exception as e:
        logger.error(f"Error testing Selenium Grid connection: {e}")
        return False

def setup_driver():
    global driver
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
        
        # Create a new WebDriver session
        driver = webdriver.Remote(
            command_executor=get_selenium_hub_url(),
            options=options,
            keep_alive=True
        )
        
        logger.info("Created new WebDriver session")
        return driver
    except Exception as e:
        logger.error(f"Error setting up WebDriver: {e}")
        return None

# Modify functions to accept driver as a parameter
# def log_in(driver, username: str, password: str, corp_id: str):
#     """Log in to MB Bank with given credentials using the provided driver instance"""
#     for attempt in range(5):
#         logger.info(f"Attempting to log in, attempt {attempt + 1}")
        
#         # Close any popup that might be open from previous failed attempt
#         try:
#             close_button_xpaths = [
#                 "//button[contains(text(), 'Close')]",
#                 "//button[contains(text(), 'Đóng')]",  # Vietnamese "Close"
#                 "//button[contains(@class, 'close')]"
#             ]
            
#             for xpath in close_button_xpaths:
#                 try:
#                     close_buttons = driver.find_elements(By.XPATH, xpath)
#                     if close_buttons:
#                         for button in close_buttons:
#                             if button.is_displayed():
#                                 logger.info("Closing popup...")
#                                 button.click()
#                                 time.sleep(0.5)  # REDUCED: 1s → 0.5s
#                                 break
#                 except:
#                     continue
#         except:
#             pass
                
#         # Navigate to the login page
#         url = 'https://ebank.mbbank.com.vn/cp/pl/login'
#         driver.get(url)
        
#         # OPTIMIZED: Faster popup clearing with shorter timeouts
#         try:
#             close_button_xpaths = [
#                 '//*[@id="mat-dialog-0"]/mbb-dialog-common/div/div[4]/button',
#                 "//button[contains(@class, 'close')]",
#                 "//button[contains(@class, 'btn-close')]"
#             ]
            
#             for xpath in close_button_xpaths:
#                 try:
#                     WebDriverWait(driver, 1.5).until(EC.presence_of_element_located((By.XPATH, xpath)))  # REDUCED: 3s → 1.5s
#                     close_buttons = driver.find_elements(By.XPATH, xpath)
#                     if close_buttons:
#                         for button in close_buttons:
#                             if button.is_displayed():
#                                 logger.info(f"Closing initial popup using {xpath}...")
#                                 button.click()
#                                 time.sleep(0.3)  # REDUCED: 0.5s → 0.3s
#                                 break
#                 except:
#                     continue
#         except Exception as popup_error:
#             pass  # Don't log popup errors to save time
                    
#         # REDUCED: Page load wait
#         time.sleep(0.5)  # REDUCED: 1s → 0.5s
        
#         current_url = driver.current_url
        
#         # OPTIMIZED: Faster captcha detection with prioritized selectors
#         captcha_img = None
#         captcha_locating_methods = [
#             # Most likely to work first (prioritized order)
#             {"method": "xpath", "selector": '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div/img'},
#             {"method": "xpath", "selector": '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div[1]/div/img'},
#             {"method": "xpath", "selector": "//mbb-word-captcha//img"},  # More specific
#             {"method": "xpath", "selector": "//img[contains(@src, 'captcha')]"},
#             {"method": "xpath", "selector": "//div[contains(@class, 'captcha')]//img"}
#         ]
                
#         captcha_found = False
#         for method in captcha_locating_methods:
#             try:
#                 if method['method'] == 'xpath':
#                     try:
#                         captcha_img = WebDriverWait(driver, 3).until(  # REDUCED: 5s → 3s
#                             EC.presence_of_element_located((By.XPATH, method['selector']))
#                         )
#                         captcha_found = True
#                         break
#                     except TimeoutException:
#                         continue
#             except Exception as e:
#                 continue
                
#         if not captcha_found:
#             logger.error("Could not find captcha with any method")
#             if attempt >= 4:
#                 logger.error("Maximum retry attempts reached")
#                 return False
#             continue
        
#         # Get image source and process captcha
#         img_src = captcha_img.get_attribute("src")
#         if not img_src:
#             logger.error("Error: Could not get captcha image source")
#             continue
        
#         # REMOVED: Unnecessary sleep after getting captcha
#         # time.sleep(1)  # REMOVED
        
#         # Process captcha
#         captcha_text = ""
#         if img_src.startswith("data:image"):
#             try:
#                 img_data = img_src.split(",")[1]
#                 img_bytes = base64.b64decode(img_data)
#                 captcha_text = read_captcha(img_bytes, is_bytes=True, save_images=True).replace(" ", "")
#                 logger.info(f"Captcha read as: {captcha_text}")
#             except Exception as e:
#                 logger.error(f"Error processing captcha: {e}")
#                 continue
#         else:
#             logger.error("Captcha image is not a data URL")
#             continue

#         # OPTIMIZED: Faster form filling with reduced waits
#         try:
#             # Corp ID field
#             corp_id_xpath = '//*[@id="corp-id"]'
#             WebDriverWait(driver, 8).until(  # REDUCED: 10s → 8s
#                 EC.element_to_be_clickable((By.XPATH, corp_id_xpath))
#             )
#             corp_id_field = driver.find_element(By.XPATH, corp_id_xpath)
#             corp_id_field.clear()
#             corp_id_field.send_keys(corp_id)
            
#             time.sleep(0.5)  # REDUCED: 1s → 0.5s
            
#             # Username field
#             username_xpath = '//*[@id="user-id"]'
#             username_field = driver.find_element(By.XPATH, username_xpath)
#             username_field.clear()
#             username_field.send_keys(username)
            
#             time.sleep(0.5)  # REDUCED: 1s → 0.5s
            
#             # Password field
#             password_xpath = '//*[@id="password"]'
#             password_field = driver.find_element(By.XPATH, password_xpath)
#             password_field.clear()
#             password_field.send_keys(password)
            
#             time.sleep(0.5)  # REDUCED: 1s → 0.5s
            
#             # OPTIMIZED: Faster captcha input
#             captcha_input_xpath = '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div[1]/input'
#             try:
#                 captcha_field = WebDriverWait(driver, 2).until(  # REDUCED: 3s → 2s
#                     EC.element_to_be_clickable((By.XPATH, captcha_input_xpath))
#                 )
#                 captcha_field.clear()
#                 # OPTIMIZED: Faster captcha typing
#                 for char in captcha_text:
#                     captcha_field.send_keys(char)
#                     time.sleep(0.05)  # REDUCED: 0.1s → 0.05s
#             except Exception as e:
#                 raise Exception("Captcha input field not found")
            
#             time.sleep(0.3)  # REDUCED: 0.5s → 0.3s
            
#             # OPTIMIZED: Faster sign-in button click
#             signin_button_xpath = '//*[@id="login-btn"]'
#             try:
#                 signin_button = WebDriverWait(driver, 3).until(  # REDUCED: 5s → 3s
#                     EC.element_to_be_clickable((By.XPATH, signin_button_xpath))
#                 )
                
#                 try:
#                     signin_button.click()
#                 except Exception as click_error:
#                     driver.execute_script("arguments[0].click();", signin_button)
                
#                 logger.info("Logging in, please wait...")
                
#                 # ✅ SIMPLIFIED: Wait 1 second then check login success
#                 time.sleep(1)  # Single 1-second wait
                
#                 success_detected = False
#                 should_retry = True
                
#                 try:
#                     current_url = driver.current_url
#                     page_title = driver.title
                    
#                     # Check success indicators
#                     success_indicators = [
#                         "/cp/" in current_url and "login" not in current_url,
#                         "transaction-inquiry" in current_url,
#                         "account-info" in current_url,
#                         "Đăng nhập" not in page_title and page_title.strip() != "",
#                     ]
                    
#                     if any(success_indicators):
#                         logger.info(f"✅ LOGIN SUCCESS!")
#                         success_detected = True
                        
#                     else:
#                         # ✅ SIMPLIFIED ERROR DETECTION (only if still on login page)
#                         if "login" in current_url.lower():
#                             error_elements = driver.find_elements(By.XPATH, "//div[contains(@class, 'error')] | //span[contains(@class, 'error')]")
#                             if any(elem.is_displayed() and elem.text.strip() for elem in error_elements):
                                
#                                 # ✅ Check for GW715 error dialog
#                                 try:
#                                     error_dialog = driver.find_element(By.XPATH, '//*[@id="mat-dialog-3"]')
#                                     if error_dialog.is_displayed():
                                        
#                                         # Extract error information
#                                         error_code = ""
#                                         dialog_text = error_dialog.text.strip()
                                        
#                                         try:
#                                             error_code_element = driver.find_element(By.XPATH, '//*[@id="mat-dialog-3"]/mbb-dialog-error/div/div[1]/div[2]/b/p/span')
#                                             error_code = error_code_element.text.strip()
#                                         except:
#                                             pass  # Use dialog_text fallback
                                        
#                                         # ✅ DECISION LOGIC: GW715 vs Credential Errors
#                                         if "GW715" in error_code or "GW715" in dialog_text:
#                                             # CAPTCHA ERROR - Continue retrying
#                                             logger.warning(f"⚠️ GW715 (Captcha) error - will retry")
                                            
#                                             # Close error dialog quickly
#                                             try:
#                                                 close_button = driver.find_element(By.XPATH, '//*[@id="mat-dialog-3"]//button')
#                                                 close_button.click()
#                                                 time.sleep(0.3)
#                                             except:
#                                                 pass
                                            
#                                             should_retry = True
                                            
#                                         else:
#                                             # CREDENTIAL ERROR - Stop immediately  
#                                             if error_code:
#                                                 logger.error(f"❌ CREDENTIAL ERROR - Code: {error_code}")
#                                             else:
#                                                 logger.error(f"❌ CREDENTIAL ERROR - {dialog_text[:50]}...")
                                            
#                                             # Close dialog quickly
#                                             try:
#                                                 close_button = driver.find_element(By.XPATH, '//*[@id="mat-dialog-3"]//button')
#                                                 close_button.click()
#                                                 time.sleep(0.2)
#                                             except:
#                                                 pass
                                            
#                                             should_retry = False  # Stop all attempts
                                
#                                 except:
#                                     # No error dialog - treat as unknown error, continue retrying
#                                     logger.warning("❌ Unknown error - will retry")
#                                     should_retry = True
        
#                 except Exception:
#                     # Error during check - assume retry needed
#                     should_retry = True
    
#             except TimeoutException:
#                 logger.error("Timeout while waiting for sign-in button")
#                 continue
#         except Exception as e:
#             logger.error(f"Error during login process: {e}")
#             continue
    
#     logger.error("❌ All login attempts failed")
#     return False


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
        time.sleep(1)
        
        current_url = driver.current_url
        
        # OPTIMIZED: Faster captcha detection with prioritized selectors
        captcha_img = None
        # //*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div/img
        captcha_locating_methods = [
            {"method": "xpath", "selector": '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div/img'},
            {"method": "xpath", "selector": '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div'}
        ]
                
        captcha_found = False
        for method in captcha_locating_methods:
            try:
                if method['method'] == 'xpath':
                    try:
                        captcha_img = WebDriverWait(driver, 3).until(
                            EC.presence_of_element_located((By.XPATH, method['selector']))
                        )
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


def check_session(driver):
    """
    Check if the WebDriver session is still active and return the session ID.
    If the session is invalid or logged out, return None.
    """
    try:
        # Perform a lightweight call to check if the session is still active
        current_url = driver.current_url  # This will raise an exception if the session is invalid
        # logger.info(f"Current URL during session check: {current_url}")

        # Check if the current URL indicates a logged-out state
        if "login" in current_url.lower() or "session-expired" in current_url.lower():
            logger.warning("Session appears to be logged out or expired.")
            return None

        # If the session is active, return the session ID
        return driver.session_id
    except Exception as e:
        logger.error(f"Error checking WebDriver session: {e}")
        return None

# Modify log_out to accept driver parameter
def log_out(driver):
    """Log out and quit the driver session"""
    if driver:
        try:
            logger.info("Logging out and quitting WebDriver session")
            # Note: We don't call driver.quit() here since it's managed by FastAPI lifecycle
            # Just perform the MB Bank logout if needed
            try:
                pass
            except Exception as e:
                logger.warning(f"Error during MB Bank logout: {e}")
            
            logger.info("Logged out successfully")
        except Exception as e:
            logger.error(f"Error during logout: {e}")
    else:
        logger.warning("No active driver to log out")


def extract_account_info(driver):
    """
    Extract account information and balance from the MB Bank interface.
    """
    try:
        account_info = {
            "account_number": "",
            "account_name": "",
            "balance": "",
            "currency": "VND",
            "last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S')
        }
        
        # Based on your logs, extract the actual balance info from the query results
        try:
            # Wait for balance summary section to load after query
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'summary') or contains(@class, 'balance')]"))
            )
            
            # Try to extract opening balance
            try:
                opening_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Opening') or contains(text(), 'Số dư đầu')]")
                for elem in opening_elements:
                    parent = elem.find_element(By.XPATH, "./..")
                    balance_text = parent.text
                    # Extract the numeric part
                    import re
                    opening_match = re.search(r'Opening[=\s]*([0-9,]+)', balance_text)
                    if opening_match:
                        account_info["opening_balance"] = opening_match.group(1).strip()
                        break
            except Exception as e:
                logger.warning(f"Could not extract opening balance: {e}")
            
            # Try to extract closing balance
            try:
                closing_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Closing') or contains(text(), 'Số dư cuối')]")
                for elem in closing_elements:
                    parent = elem.find_element(By.XPATH, "./..")
                    balance_text = parent.text
                    closing_match = re.search(r'Closing[=\s]*([0-9,]+)', balance_text)
                    if closing_match:
                        account_info["closing_balance"] = closing_match.group(1).strip()
                        break
            except Exception as e:
                logger.warning(f"Could not extract closing balance: {e}")
            
            # Try to extract credit total
            try:
                credit_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Credit') or contains(text(), 'Có')]")
                for elem in credit_elements:
                    parent = elem.find_element(By.XPATH, "./..")
                    balance_text = parent.text
                    credit_match = re.search(r'Credit[=\s]*([0-9,]+)', balance_text)
                    if credit_match:
                        account_info["total_credit"] = credit_match.group(1).strip()
                        break
            except Exception as e:
                logger.warning(f"Could not extract credit total: {e}")
            
            # Try to extract debit total  
            try:
                debit_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Debit') or contains(text(), 'Nợ')]")
                for elem in debit_elements:
                    parent = elem.find_element(By.XPATH, "./..")
                    balance_text = parent.text
                    debit_match = re.search(r'Debit[=\s]*([0-9,]+)', balance_text)
                    if debit_match:
                        account_info["total_debit"] = debit_match.group(1).strip()
                        break
            except Exception as e:
                logger.warning(f"Could not extract debit total: {e}")
                
        except Exception as e:
            logger.warning(f"Could not extract balance information: {e}")
            
        return account_info
    except Exception as e:
        logger.error(f"Error extracting account info: {e}")
        return {"last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S')}

def extract_transaction_data_from_table_optimized(driver, from_date=None):
    """
    Optimized for typical case: 1 page with 1-2 transactions
    Now includes date filtering to remove transactions before from_date
    
    Args:
        driver: WebDriver instance
        from_date: String in format "DD/MM/YYYY HH:MM" or None
    """
    try:
        # OPTIMIZED: Quick empty check first (most common case)
        try:
            empty_element = driver.find_element(By.XPATH, "//span[contains(text(), 'Không có dữ liệu')]")
            if empty_element.is_displayed():
                logger.info("✅ No transactions found")
                return []
        except:
            pass  # Continue if no empty indicator
        
        # OPTIMIZED: Reduced wait for typical case
        time.sleep(0.3)  # REDUCED: 1s → 0.3s
        
        # OPTIMIZED: Try most likely table xpath first
        transaction_table = None
        priority_xpaths = [
            '//*[@id="tbl-transaction-history"]',  # Most likely to work
            '//mbb-table-history//table'           # Second most likely
        ]
        
        for xpath in priority_xpaths:
            try:
                table = driver.find_element(By.XPATH, xpath)
                if table.is_displayed():
                    transaction_table = table
                    break
            except:
                continue
        
        if not transaction_table:
            logger.info("ℹ️ No transaction table found")
            return []
        
        # Parse from_date for filtering if provided
        from_date_dt = None
        if from_date:
            try:
                import datetime
                import pytz
                
                # Handle different date formats
                date_str = from_date.strip()
                if " - " in date_str:
                    date_str = date_str.replace(" - ", " ")
                
                # Parse from_date: Handle both "/" and "-" formats
                try:
                    # Try DD/MM/YYYY format first
                    from_date_dt = datetime.datetime.strptime(date_str, "%d/%m/%Y %H:%M")
                except ValueError:
                    try:
                        # Try DD-MM-YYYY format (from MB Bank formatting)
                        from_date_dt = datetime.datetime.strptime(date_str, "%d-%m-%Y %H:%M")
                    except ValueError:
                        try:
                            # Try date only formats
                            if "/" in date_str:
                                from_date_dt = datetime.datetime.strptime(date_str.split()[0], "%d/%m/%Y")
                            else:
                                from_date_dt = datetime.datetime.strptime(date_str.split()[0], "%d-%m-%Y")
                        except ValueError:
                            logger.warning(f"Could not parse from_date for filtering: {from_date}")
                            from_date_dt = None
            
            except Exception as e:
                logger.warning(f"Error parsing from_date for filtering: {e}")
                from_date_dt = None
            
            if from_date_dt:
                # Localize to Vietnam timezone
                vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
                from_date_dt = vietnam_tz.localize(from_date_dt)
                logger.info(f"🔍 Will filter transactions after: {from_date_dt}")
            
            # except Exception as e:
            #     logger.warning(f"Error parsing from_date for filtering: {e}")
            #     from_date_dt = None
        
        # OPTIMIZED: Direct tbody row selection (most reliable)
        try:
            rows = transaction_table.find_elements(By.XPATH, './/tbody/tr')
            if not rows:
                return []
            
            transactions = []
            filtered_count = 0
            
            # OPTIMIZED: Process only data rows (skip validation for speed)
            for row in rows:
                cells = row.find_elements(By.TAG_NAME, 'td')
                
                if len(cells) >= 10:  # Full transaction row
                    transaction = {
                        'STT': cells[0].text.strip(),
                        'HÀNH ĐỘNG': cells[1].text.strip(),
                        'SỐ BÚT TOÁN': cells[2].text.strip(),
                        'PHÁT SINH NỢ': cells[3].text.strip(),
                        'PHÁT SINH CÓ': cells[4].text.strip(),
                        'SỐ DƯ': cells[5].text.strip(),
                        'ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN': cells[6].text.strip(),
                        'NỘI DUNG': cells[7].text.strip(),
                        'NGÀY GIAO DỊCH': cells[8].text.strip(),
                        'NGÀY HẠCH TOÁN': cells[9].text.strip()
                    }
                    
                    # OPTIMIZED: Quick validation (just check if has ID)
                    if not transaction['SỐ BÚT TOÁN']:
                        continue
                    
                    # NEW: Date filtering logic
                    if from_date_dt:
                        transaction_dt = None
                        trans_date_time = transaction.get("NGÀY GIAO DỊCH", "").strip()
                        
                        if trans_date_time:
                            try:
                                # Parse transaction date and time (already together in format "DD/MM/YYYY HH:MM:SS")
                                if "/" in trans_date_time and ":" in trans_date_time:
                                    transaction_dt = datetime.datetime.strptime(trans_date_time, "%d/%m/%Y %H:%M:%S")
                                elif "/" in trans_date_time:  # Only date without time
                                    transaction_dt = datetime.datetime.strptime(trans_date_time, "%d/%m/%Y")
                                    # Use end of day to be inclusive
                                    transaction_dt = transaction_dt.replace(hour=23, minute=59, second=59)
                                
                                if transaction_dt:
                                    # Localize to Vietnam timezone
                                    vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
                                    transaction_dt = vietnam_tz.localize(transaction_dt)
                                    
                                    # Filter: keep transactions >= from_date (inclusive)
                                    if transaction_dt >= from_date_dt:
                                        transactions.append(transaction)
                                    else:
                                        filtered_count += 1
                                        logger.debug(f"🗑️ Filtered out transaction from {transaction_dt} (before {from_date_dt}): {transaction['SỐ BÚT TOÁN']}")
                                else:
                                    # Can't create datetime - keep transaction (safer approach)
                                    transactions.append(transaction)
                            except Exception as date_error:
                                # Can't parse date - keep transaction (safer approach)
                                logger.warning(f"Could not parse transaction date '{trans_date_time}': {date_error}")
                                transactions.append(transaction)
                        else:
                            # No date field - keep transaction (safer approach)
                            transactions.append(transaction)
                    else:
                        # No from_date filter - keep all transactions
                        transactions.append(transaction)
            
            # Log filtering results
            if from_date_dt and filtered_count > 0:
                logger.info(f"✂️ Filtered out {filtered_count} transactions before {from_date}")
                logger.info(f"✅ Kept {len(transactions)} transactions after filtering")
            elif from_date_dt:
                logger.info(f"✅ All {len(transactions)} transactions are within date range")
            else:
                logger.info(f"✅ No date filtering applied - {len(transactions)} transactions extracted")
            
            return transactions
            
        except Exception as e:
            logger.error(f"Table extraction failed: {e}")
            return []
        
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return []

def fetch_transactions_v2(driver, from_date=None, max_pages=None):
    """
    Updated fetch_transactions function that ALWAYS navigates to transaction page
    but skips to_date input - only sets from_date
    """
    try:
        # Validate driver session first
        if not driver:
            logger.error("Driver is None - cannot fetch transactions")
            return {
                "status": "error",
                "message": "WebDriver session is not available",
                "count": 0,
                "transactions": [],
                "account_info": {"last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S')}
            }
        
        # Check if session is still valid
        try:
            current_url = driver.current_url
            # logger.info(f"Current URL before forced navigation: {current_url}")
            
            if "login" in current_url.lower():
                logger.error("Driver session has expired - on login page")
                return {
                    "status": "session_expired",
                    "message": "Session expired - please re-login",
                    "count": 0,
                    "transactions": [],
                    "account_info": {"last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S')}
                }
        except Exception as session_check_error:
            logger.error(f"Session validation failed: {session_check_error}")
            return {
                "status": "error",
                "message": "Driver session is invalid",
                "count": 0,
                "transactions": [],
                "account_info": {"last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S')}
            }
        
        # FORCE NAVIGATION - ALWAYS go to transaction page fresh
        transaction_url = 'https://ebank.mbbank.com.vn/cp/account-info/transaction-inquiry'
        driver.get(transaction_url)
        
        # ✅ FIX: Wait for loading overlay to disappear
        try:
            # Wait for loading indicator to disappear
            WebDriverWait(driver, 10).until_not(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".loadingActivityIndicator"))
            )
            logger.info("Loading overlay disappeared")
        except:
            # Fallback: just wait longer
            time.sleep(2)
            logger.info("Used fallback wait for page load")
    
        # Continue with date filters if from_date is provided
        if from_date:
            logger.info(f"Setting from_date filter: {from_date}")
            
            # Convert date formats properly
            def format_date_for_mb(date_str):
                """Convert date format for MB Bank input fields"""
                try:
                    # Handle different input formats
                    if "-" in date_str and "/" not in date_str:
                        # Format: "29-05-2025 11:00" -> "29/05/2025 - 11:00"
                        date_str = date_str.replace("-", "/")
                    
                    # Add dash before time if not present
                    if " " in date_str and " - " not in date_str:
                        date_str = date_str.replace(" ", " - ")
                    
                    return date_str
                except Exception as e:
                    logger.error(f"Error formatting date {date_str}: {e}")
                    return date_str
            
            formatted_from_date = format_date_for_mb(from_date)
            
            # logger.info(f"Formatted from_date: {formatted_from_date}")
            
            # Select period option for date filtering - FIXED XPATH
            try:
                # Use the exact XPath from your working test.ipynb
                # //*[@id="mat-radio-3"]/label/div[1]/div[1]
                period_button = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, '//*[@id="mat-radio-3"]/label/div[1]/div[1]'))
                )
                
                # period_button.click()  # Use the most reliable method
                driver.execute_script("arguments[0].click();", period_button)
                time.sleep(0.5)  # Wait for UI to respond
                
            except Exception as e:
                logger.error(f"Failed to select period option: {e}")
                return None
            
            # Set from_date ONLY
            try:
                from_date_field = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, '//*[@id="scroll-content"]/div/div/div/mbb-account-info/mbb-transaction-inquiry-v2/form/div/div/div/div[2]/div/div/div[2]/div[1]/div[1]/div/mbb-date-time-picker/input'))
                )
                
                from_date_field.click()
                
                from_date_field.send_keys(Keys.CONTROL + 'a')  # Select all text
                from_date_field.send_keys(Keys.BACKSPACE)  # Clear selected text
                
                
                from_date_field.send_keys(formatted_from_date) #optimized
                from_date_field.send_keys(Keys.TAB)
                from_date_field.send_keys(Keys.ESCAPE)
                logger.info(f"Entered from_date: {formatted_from_date}")
                
            except Exception as e:
                logger.error(f"Failed to set from_date: {e}")
                return None
            
            # SKIP TO_DATE INPUT - this is the main difference from fetch_transactions
            logger.info("Skipping to_date input (using default end date)")
            # Click query button - Use exact XPath from test.ipynb
            try:
                query_button = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, '//*[@id="btn-query"]'))
                )
                query_button.click()
                # logger.info("Clicked query button")
                
                # Wait for results to load
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Failed to click query button: {e}")
                return None
        
        # Extract account information and balance - TEMPORARILY DISABLED
        # logger.info("Skipping account information extraction (temporarily disabled)")
        account_info = {
            "account_number": "",
            "account_name": "",
            "balance": "",
            "currency": "VND",
            "last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S'),
            "opening_balance": "0",
            "closing_balance": "0",
            "total_credit": "0",
            "total_debit": "0"
        }
        
        # Extract transaction data using the corrected method with date filtering
        logger.info("Extracting transaction data...")
        all_transactions = extract_transaction_data_from_table_optimized(driver, from_date)
        
        # Handle pagination (keep existing pagination code with date filtering)
        logger.info("Checking for pagination...")
        page_num = 1
        max_pages_to_process = max_pages if max_pages else 1  # Default limit
        
        while page_num <= max_pages_to_process:
            try:
                # Look for pagination controls
                pagination_elements = driver.find_elements(By.XPATH, '//*[@id="page-items"]//button')
                
                if not pagination_elements:
                    break
                
                # Check if there's a next page button (usually second-to-last element)
                if len(pagination_elements) >= 2:
                    next_button = pagination_elements[-2]  # Second last element
                    
                    # Check if next button is clickable by looking for the disabled attribute
                    if next_button.get_attribute('disabled') is None:
                        next_button.click()
                        
                        # Wait for page to load
                        time.sleep(0.5)  # REDUCED: 1s → 0.5s
                        
                        # Extract transactions from new page WITH date filtering
                        page_transactions = extract_transaction_data_from_table_optimized(driver, from_date)
                        all_transactions.extend(page_transactions)
                        
                        page_num += 1
                    else:
                        break
                else:
                    break
                    
            except Exception as pagination_error:
                logger.warning(f"Error during pagination on page {page_num}: {pagination_error}")
                break
        
        logger.info(f"Pagination complete. Total transactions after filtering: {len(all_transactions)}")
        
        # Return data in expected format
        return {
            "status": "success",
            "count": len(all_transactions),
            "transactions": all_transactions,
            "account_info": account_info
        }
        
    except Exception as e:
        logger.error(f"Error in fetch_transactions_v2: {e}")
        return {
            "status": "error",
            "message": str(e),
            "count": 0,
            "transactions": [],
            "account_info": {"last_updated": datetime.now().strftime('%d-%m-%Y %H:%M:%S')}
        }