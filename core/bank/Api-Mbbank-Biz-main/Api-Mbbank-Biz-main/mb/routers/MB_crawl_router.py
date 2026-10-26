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

# Import Selenium components
from selenium import webdriver
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from routers.captcha_reading import read_captcha

from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# config logging
logger = logging.getLogger(__name__)
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
    """Check if we're running in a Docker container"""
    try:
        with open('/proc/self/cgroup', 'r') as f:
            return any('docker' in line for line in f)
    except:
        return False

# Get the correct Selenium Grid URL based on environment
def get_selenium_hub_url():
    """Get the correct Selenium Hub URL based on environment"""
    selenium_host = os.getenv("SELENIUM_HOST")
    selenium_port = os.getenv("SELENIUM_PORT", "4444")

    if selenium_host:
        return f"http://{selenium_host}:{selenium_port}/wd/hub"

    if is_docker():
        return "http://selenium-hub:4444/wd/hub"
    
    docker_host = os.environ.get("DOCKER_HOST", "localhost")
    return f"http://{docker_host}:{selenium_port}/wd/hub"

@router.get('/MB_transaction_crawling', tags=['MB'])
async def mb_login(
    username: str = Query(..., description="MB username"),
    password: str = Query(..., description="MB password"),
    max_retries: int = Query(3, description="Maximum number of retries for captcha reading"),
    use_selenium_grid: bool = Query(False, description="Use Selenium Grid instead of local WebDriver"),
    simulate: bool = Query(False, description="Use simulated data instead of real web scraping")
) -> JSONResponse:
    try:
        logger.info("Starting MB transaction crawling...")
        
        # If simulation is requested, return the simulated data
        if simulate:
            return await generate_simulated_data(username, password)
        
        # Try to scrape real data using Selenium
        driver = None
        try:
            logger.info("Initializing Selenium WebDriver...")
            
            # Initialize WebDriver (grid or local)
            if use_selenium_grid:
                # Try to resolve selenium-hub first to check if it's accessible
                try:
                    selenium_grid_url = get_selenium_hub_url()
                    logger.info(f"Attempting to connect to Selenium Grid at: {selenium_grid_url}")
                    
                    # Test connection to Selenium Grid
                    # If running locally, we'll use httpx to check if the service is up
                    grid_host = selenium_grid_url.split("//")[1].split(":")[0]
                    grid_port = int(selenium_grid_url.split(":")[-1].split("/")[0])
                    
                    if grid_host == "selenium-hub":
                        # We're likely in Docker, so try to resolve the hostname
                        try:
                            socket.gethostbyname(grid_host)
                            logger.info(f"Successfully resolved hostname: {grid_host}")
                        except socket.gaierror:
                            logger.error(f"Could not resolve hostname: {grid_host}")
                            logger.info("Falling back to local WebDriver")
                            use_selenium_grid = False
                    else:
                        # Try to connect to the Grid via httpx
                        try:
                            async with httpx.AsyncClient(timeout=5.0) as client:
                                grid_status_url = f"http://{grid_host}:{grid_port}/status"
                                logger.info(f"Checking Selenium Grid status: {grid_status_url}")
                                response = await client.get(grid_status_url)
                                if response.status_code == 200:
                                    logger.info("Selenium Grid is available")
                                else:
                                    logger.warning(f"Selenium Grid returned status code: {response.status_code}")
                                    logger.info("Falling back to local WebDriver")
                                    use_selenium_grid = False
                        except Exception as e:
                            logger.error(f"Could not connect to Selenium Grid: {e}")
                            logger.info("Falling back to local WebDriver")
                            use_selenium_grid = False
                    
                    if use_selenium_grid:
                        options = webdriver.EdgeOptions()
                        options.add_argument("--start-maximized")
                        options.add_argument("--disable-notifications")
                        options.add_argument("--headless")  # Run in headless mode
                        
                        # Add these options to help with access denied issues
                        options.add_argument("--no-sandbox")
                        options.add_argument("--disable-dev-shm-usage")
                        options.add_argument("--disable-blink-features=AutomationControlled")
                        options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36 Edg/97.0.1072.62")
                        
                        logger.info(f"Connecting to Selenium Grid at: {selenium_grid_url}")
                        try:
                            driver = webdriver.Remote(
                                command_executor=selenium_grid_url,
                                options=options
                            )
                            logger.info("Successfully connected to Selenium Grid")
                        except Exception as e:
                            logger.error(f"Failed to connect to Selenium Grid: {e}")
                            logger.info("Falling back to local WebDriver")
                            use_selenium_grid = False
                except Exception as grid_error:
                    logger.error(f"Error setting up Selenium Grid: {grid_error}")
                    logger.info("Falling back to local WebDriver")
                    use_selenium_grid = False
            
            # If not using grid (or grid failed), use local WebDriver
            if not use_selenium_grid:
                # Use local Edge WebDriver
                logger.info("Using local Edge WebDriver")
                edge_options = Options()
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
                except Exception as local_driver_error:
                    logger.error(f"Error initializing local WebDriver: {local_driver_error}")
                    return await generate_error_response(f"WebDriver error: {str(local_driver_error)}")
            
            # Login attempt loop
            for attempt in range(1, max_retries + 1):
                logger.info(f"\n=== Login Attempt {attempt} of {max_retries} ===")
                
                # Close any popup that might be open from previous failed attempt
                try:
                    close_button_xpaths = [
                        "//button[contains(text(), 'Close')]",
                        "//button[contains(text(), 'Đóng')]",  # Vietnamese "Close"
                        "//button[contains(@class, 'close')]",
                        "//button[contains(@class, 'btn-close')]",
                        "//div[contains(@class, 'modal')]//button",
                        "//div[contains(@class, 'popup')]//button",
                        "//span[contains(@class, 'close')]",
                        "//i[contains(@class, 'close')]",
                        "//button[contains(@aria-label, 'close')]",
                        "//button[contains(@aria-label, 'Close')]"
                    ]
                    
                    for xpath in close_button_xpaths:
                        try:
                            close_buttons = driver.find_elements(By.XPATH, xpath)
                            if close_buttons:
                                for button in close_buttons:
                                    if button.is_displayed():
                                        logger.info("Closing popup...")
                                        button.click()
                                        time.sleep(1)
                                        break
                        except:
                            continue
                except:
                    pass  # Ignore errors if no popup is present
                
                # Navigate to the login page
                url = 'https://online.mbbank.com.vn/pl/login'
                logger.info(f"Navigating to: {url}")
                driver.get(url)
                
                # Add 5 second sleep after page navigation to ensure complete loading
                logger.info("Waiting 5 seconds for page to fully load...")
                time.sleep(5)
                
                # Log the current URL to verify redirection
                current_url = driver.current_url
                logger.info(f"Current URL after navigation: {current_url}")
                
                # Take screenshot and analyze page
                try:
                    logger.info(f"Page title: {driver.title}")
                    logger.info("Taking screenshot of current page...")
                    
                    # Take a screenshot to help debug page loading issues
                    # screenshot_path = os.path.join(os.path.dirname(__file__), f"mb_login_screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                    # driver.save_screenshot(screenshot_path)
                    # logger.info(f"Screenshot saved to: {screenshot_path}")
                    
                    # Wait for the page to load completely
                    try:
                        WebDriverWait(driver, 15).until(
                            EC.presence_of_element_located((By.TAG_NAME, "body"))
                        )
                        logger.info("Body element loaded successfully")
                    except TimeoutException:
                        logger.error("Timeout waiting for page to load")
                    
                    # Check if page has document.readyState == 'complete'
                    ready_state = driver.execute_script("return document.readyState")
                    logger.info(f"Document ready state: {ready_state}")
                    
                    # Get page source length to check if content loaded
                    # page_source_length = len(driver.page_source)
                    # logger.info(f"Page source length: {page_source_length} bytes")
                    
                    # Check if login form exists
                    form_exists = driver.execute_script("""\
                        return Boolean(
                            document.querySelector('form') || 
                            document.querySelector('input[type="password"]')
                        );
                    """)
                    logger.info(f"Login form exists: {form_exists}")
                    
                    # Log the HTML structure to find the login form elements
                    logger.info("Analyzing page structure...")
                    page_structure = driver.execute_script("""\
                        function getElementInfo(element, depth = 0) {
                            if (!element) return '';
                            if (depth > 3) return '...'; // Limit depth
                            
                            let indent = ' '.repeat(depth * 2);
                            let info = indent + element.tagName;
                            
                            if (element.id) info += ' #' + element.id;
                            if (element.className) info += ' .' + element.className.replace(/ /g, ' .');
                            
                            if (element.tagName === 'INPUT') {
                                info += ' type="' + (element.type || '') + '"';
                                info += ' placeholder="' + (element.placeholder || '') + '"';
                            }
                            
                            let result = info + '\\n';
                            if (element.children && element.children.length > 0) {
                                for (let i = 0; i < element.children.length; i++) {
                                    result += getElementInfo(element.children[i], depth + 1);
                                }
                            }
                            return result;
                        }
                        
                        return getElementInfo(document.body);
                    """)
                    # logger.info(f"Page structure summary:\n{page_structure[:500]}...")
                    
                except Exception as page_analysis_error:
                    logger.error(f"Error analyzing page: {page_analysis_error}")
                
                # Step 1: Try different approaches to find the captcha image
                logger.info("Looking for captcha image using multiple approaches...")
                
                # Try general approaches first
                captcha_img = None
                captcha_locating_methods = [
                    # Original specific XPath
                    {"method": "xpath", "selector": "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[5]/mbb-word-captcha/div/div[2]/div[1]/div[1]/img"},
                    # CSS selector
                    {"method": "css", "selector": "mbb-word-captcha img"},
                    # More general XPath patterns
                    {"method": "xpath", "selector": "//img[contains(@src, 'captcha')]"},
                    {"method": "xpath", "selector": "//mbb-word-captcha//img"},
                    {"method": "xpath", "selector": "//div[contains(@class, 'captcha')]//img"},
                    # Try to find by tag name with JavaScript
                    {"method": "js", "selector": "document.querySelector('img')"}
                ]
                
                captcha_found = False
                for method in captcha_locating_methods:
                    try:
                        logger.info(f"Trying to find captcha using {method['method']}:")
                        
                        if method['method'] == 'xpath':
                            try:
                                captcha_img = WebDriverWait(driver, 5).until(
                                    EC.presence_of_element_located((By.XPATH, method['selector']))
                                )
                                logger.info(f"Captcha found with XPath: {method['selector']}")
                                captcha_found = True
                                break
                            except TimeoutException:
                                logger.info(f"Captcha not found with this XPath: {method['selector']}")
                                continue
                                
                        elif method['method'] == 'css':
                            try:
                                captcha_img = WebDriverWait(driver, 5).until(
                                    EC.presence_of_element_located((By.CSS_SELECTOR, method['selector']))
                                )
                                logger.info(f"Captcha found with CSS: {method['selector']}")
                                captcha_found = True
                                break
                            except TimeoutException:
                                logger.info(f"Captcha not found with this CSS: {method['selector']}")
                                continue
                                
                        elif method['method'] == 'js':
                            captcha_img = driver.execute_script(f"return {method['selector']}")
                            if captcha_img:
                                logger.info(f"Captcha found with JavaScript: {method['selector']}")
                                captcha_found = True
                                break
                            else:
                                logger.info(f"Captcha not found with this JavaScript: {method['selector']}")
                                continue
                    except Exception as e:
                        logger.info(f"Error trying to find captcha with {method['method']}: {e}")
                
                if not captcha_found:
                    logger.error("Could not find captcha with any method")
                    # Take another screenshot showing the failure state
                    # screenshot_path = os.path.join(os.path.dirname(__file__), f"mb_login_failure_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                    # driver.save_screenshot(screenshot_path)
                    # logger.info(f"Failure screenshot saved to: {screenshot_path}")
                    
                    if attempt >= max_retries:
                        logger.error("Maximum retry attempts reached, falling back to simulation")
                        if driver:
                            driver.quit()
                        return await generate_simulated_data(username, password, is_fallback=True)
                    continue
                
                # Get image source and process captcha
                img_src = captcha_img.get_attribute("src")
                if not img_src:
                    logger.error("Error: Could not get captcha image source")
                    continue
                
                # Add 2 second sleep after getting captcha image
                logger.info("Waiting 2 seconds after finding captcha image...")
                time.sleep(2)
                
                # Process captcha directly from the browser
                captcha_text = ""
                if img_src.startswith("data:image"):
                    try:
                        img_data = img_src.split(",")[1]
                        img_bytes = base64.b64decode(img_data)
                        captcha_text = read_captcha(img_bytes, is_bytes=True, save_images=True).replace(" ", "")
                        logger.info(f"Captcha read as: {captcha_text}")
                        
                        # Add verification for captcha length and content
                        if len(captcha_text) < 4 or len(captcha_text) > 8:
                            logger.warning(f"Captcha text length suspicious: {len(captcha_text)} characters")
                            # Take screenshot of captcha
                            # screenshot_path = os.path.join(os.path.dirname(__file__), f"captcha_image_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                            # driver.save_screenshot(screenshot_path)
                            # logger.info(f"Captcha screenshot saved to: {screenshot_path}")
                        
                        # Add 2 second sleep after processing captcha
                        logger.info("Waiting 2 seconds after processing captcha...")
                        time.sleep(2)
                    except Exception as e:
                        logger.error(f"Error processing captcha: {e}")
                        continue
                else:
                    logger.error("Captcha image is not a data URL")
                    continue

                # Step 2: Fill in the login form with original XPaths
                try:
                    # Username field
                    username_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[2]/mbb-input/div/input"
                    WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, username_xpath))
                    )
                    username_field = driver.find_element(By.XPATH, username_xpath)
                    username_field.clear()
                    username_field.send_keys(username)
                    logger.info("Username entered successfully")
                    
                    # Wait 1 second after entering username
                    time.sleep(1)
                    
                    # Password field
                    password_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[4]/mbb-input/div/input"
                    password_field = driver.find_element(By.XPATH, password_xpath)
                    password_field.clear()
                    password_field.send_keys(password)
                    logger.info("Password entered successfully")
                    
                    # Wait 1 second after entering password
                    time.sleep(1)
                    
                    # Try multiple approaches to find and input captcha text
                    captcha_found = False
                    
                    # Approach 1: Try the exact captcha input xpath from the error message
                    try:
                        exact_captcha_xpath = '//*[@id="form1"]/div/div[5]/mbb-word-captcha/div/div[2]/div[1]/div[2]/input'
                        captcha_field = WebDriverWait(driver, 3).until(
                            EC.element_to_be_clickable((By.XPATH, exact_captcha_xpath))
                        )
                        captcha_field.clear()
                        # Type each character with a slight delay for more human-like interaction
                        for char in captcha_text:
                            captcha_field.send_keys(char)
                            time.sleep(0.1)
                        logger.info(f"Captcha text '{captcha_text}' entered using exact xpath")
                        captcha_found = True
                    except Exception as e:
                        logger.info(f"Could not find captcha input with exact xpath: {e}")
                    
                    # Approach 2: Try multiple captcha selector approaches if the exact xpath fails
                    if not captcha_found:
                        captcha_selectors = [
                            "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[5]/mbb-word-captcha/div/div[2]/div[1]/div[2]/input",
                            "//mbb-word-captcha//input",
                            "//input[contains(@placeholder, 'captcha') or contains(@placeholder, 'Captcha')]",
                            "//div[contains(@class, 'captcha')]//input",
                            "//input[following-sibling::img or preceding-sibling::img]" 
                        ]
                        
                        for selector in captcha_selectors:
                            try:
                                logger.info(f"Trying to find captcha input field with selector: {selector}")
                                captcha_field = WebDriverWait(driver, 3).until(
                                    EC.element_to_be_clickable((By.XPATH, selector))
                                )
                                if captcha_field:
                                    logger.info(f"Captcha input field found with selector: {selector}")
                                    captcha_field.clear()
                                    # Type each character with a delay
                                    for char in captcha_text:
                                        captcha_field.send_keys(char)
                                        time.sleep(0.1)
                                    logger.info(f"Captcha text '{captcha_text}' entered successfully")
                                    captcha_found = True
                                    break
                            except:
                                logger.info(f"Captcha input field not found with selector: {selector}")
                    
                    # Approach 3: Try to find input near the captcha image using JavaScript
                    if not captcha_found:
                        logger.info("Trying to find captcha input using JavaScript proximity search")
                        captcha_field = driver.execute_script("""
                            const captchaImg = document.querySelector('img[src*="data:image"]');
                            if (!captchaImg) return null;
                            
                            // Look for any input near the captcha image
                            const inputs = document.querySelectorAll('input');
                            let closestInput = null;
                            let minDistance = Infinity;
                            
                            const imgRect = captchaImg.getBoundingClientRect();
                            const imgCenter = {
                                x: imgRect.left + imgRect.width / 2,
                                y: imgRect.top + imgRect.height / 2
                            };
                            
                            inputs.forEach(input => {
                                const inputRect = input.getBoundingClientRect();
                                const inputCenter = {
                                    x: inputRect.left + inputRect.width / 2,
                                    y: inputRect.top + inputRect.height / 2
                                };
                                
                                const distance = Math.sqrt(
                                    Math.pow(inputCenter.x - imgCenter.x, 2) + 
                                    Math.pow(inputCenter.y - imgCenter.y, 2)
                                );
                                
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    closestInput = input;
                                }
                            });
                            
                            return closestInput;
                        """)
                        
                        if captcha_field:
                            try:
                                driver.execute_script("arguments[0].value = '';", captcha_field)  # Clear the field
                                for char in captcha_text:
                                    driver.execute_script(f"arguments[0].value = arguments[0].value + '{char}';", captcha_field)
                                    time.sleep(0.1)
                                # Trigger change event to ensure the field value is recognized
                                driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", captcha_field)
                                logger.info(f"Captcha text '{captcha_text}' entered using JavaScript")
                                captcha_found = True
                            except Exception as js_error:
                                logger.error(f"Error entering captcha with JavaScript: {js_error}")
                    
                    if not captcha_found:
                        logger.error("Could not find captcha input field with any method")
                        raise Exception("Captcha input field not found")
                    
                    # Wait 2 seconds after entering captcha
                    logger.info("Waiting 2 seconds after entering all login information...")
                    time.sleep(2)
                    
                    # Step 3: Click the sign-in button with multiple approaches
                    signin_button = None
                    signin_button_selectors = [
                        "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[6]/div/button",
                        "//form//button[@type='submit']",
                        "//button[contains(text(), 'Login') or contains(text(), 'Sign in') or contains(text(), 'Đăng nhập')]",
                        "//form//button"
                    ]
                    
                    for selector in signin_button_selectors:
                        try:
                            logger.info(f"Trying to find sign-in button with selector: {selector}")
                            signin_button = WebDriverWait(driver, 3).until(
                                EC.element_to_be_clickable((By.XPATH, selector))
                            )
                            if signin_button:
                                logger.info(f"Sign-in button found with selector: {selector}")
                                break
                        except:
                            logger.info(f"Sign-in button not found with selector: {selector}")
                    
                    if not signin_button:
                        logger.error("Could not find sign-in button with any selector")
                        raise Exception("Sign-in button not found")
                    
                    # Take a screenshot before clicking the button
                    # before_click_screenshot = os.path.join(os.path.dirname(__file__), f"before_login_click_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                    # driver.save_screenshot(before_click_screenshot)
                    # logger.info(f"Screenshot before login click saved to: {before_click_screenshot}")
                    
                    # Try both direct click and JavaScript click
                    try:
                        signin_button.click()
                        logger.info("Clicked sign-in button directly")
                    except Exception as click_error:
                        logger.warning(f"Direct click failed: {click_error}, trying JavaScript click...")
                        driver.execute_script("arguments[0].click();", signin_button)
                        logger.info("Clicked sign-in button using JavaScript")
                    
                    # Wait for login process - increased from 3 to 8 seconds
                    logger.info("Logging in, please wait for 8 seconds...")
                    time.sleep(8)
                    
                    # Take a screenshot after clicking the button
                    # after_click_screenshot = os.path.join(os.path.dirname(__file__), f"after_login_click_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                    # driver.save_screenshot(after_click_screenshot)
                    # logger.info(f"Screenshot after login click saved to: {after_click_screenshot}")
                    
                    # Check if login was successful
                    current_url = driver.current_url
                    logger.info(f"Current URL after login attempt: {current_url}")
                    
                    if "login" in current_url.lower():
                        logger.warning("Login failed: Possible incorrect username, password, or captcha")
                        continue  # Try again
                    
                    # If we get here, login was successful
                    logger.info("Login successful! Retrieving account balance...")

                    # Navigate to account information page
                    logger.info("Navigating to account information page...")
                    account_info_url = "https://online.mbbank.com.vn/information-account/source-account"
                    driver.get(account_info_url)

                    # Wait for the page to load
                    logger.info("Waiting for account information page to load...")
                    time.sleep(8)

                    # Use the specific XPath to find the balance
                    try:
                        specific_balance_xpath = "//*[@id='content-wrapper']/div[1]/div/div/div/mbb-information-account/mbb-source-account/div/div[2]/div/div[2]/div[2]/div/div/div[2]/span[2]"
                        
                        balance_element = WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.XPATH, specific_balance_xpath))
                        )
                        
                        account_balance = balance_element.text.strip()
                        logger.info(f"Found account balance: {account_balance}")
                        
                        # Format the balance with VND if not already included
                        if not account_balance.lower().endswith('vnd'):
                            account_balance = f"{account_balance} VND"
                            
                    except Exception as balance_error:
                        logger.warning(f"Could not retrieve balance with specific XPath: {balance_error}")
                        
                        # Fallback to the more general approach if specific XPath fails
                        try:
                            balance_element = WebDriverWait(driver, 5).until(
                                EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'balance') or contains(@class, 'amount')]"))
                            )
                            account_balance = balance_element.text.strip()
                            if not account_balance.lower().endswith('vnd'):
                                account_balance = f"{account_balance} VND"
                            logger.info(f"Found account balance with fallback: {account_balance}")
                        except Exception as fallback_error:
                            logger.warning(f"Could not retrieve balance with fallback: {fallback_error}")
                            account_balance = "Not available"

                    # Now click on the transaction history button using the specific XPath
                    logger.info("Clicking transaction history button...")
                    transaction_button_xpath = "//*[@id=\"content-wrapper\"]/div[1]/div/div/div/mbb-information-account/mbb-source-account/div/div[4]/div/div[1]/form/div[3]/div[2]/button"

                    try:
                        transaction_button = WebDriverWait(driver, 10).until(
                            EC.element_to_be_clickable((By.XPATH, transaction_button_xpath))
                        )
                        
                        # Scroll to the button to make it visible
                        driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", transaction_button)
                        time.sleep(2)
                        
                        # Click the button
                        transaction_button.click()
                        logger.info("Transaction history button clicked successfully")
                        
                        # Wait for transaction data to load
                        logger.info("Waiting for transaction data to load...")
                        time.sleep(8)
                        
                    except Exception as button_error:
                        logger.error(f"Error clicking transaction button: {button_error}")
                        
                        # Take a screenshot of the failure
                        # error_screenshot_path = os.path.join(os.path.dirname(__file__), f"transaction_button_error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                        # driver.save_screenshot(error_screenshot_path)
                        # logger.info(f"Error screenshot saved to: {error_screenshot_path}")
                        
                        # Try fallback methods for finding the button
                        logger.info("Trying fallback methods for finding transaction button...")
                        
                        fallback_button_found = False
                        fallback_selectors = [
                            "//button[contains(text(), 'Truy vấn')]",
                            "//button[contains(text(), 'Tìm kiếm')]",
                            "//button[contains(@class, 'search')]",
                            "//button[contains(@class, 'query')]",
                            "//button[contains(@class, 'btn-primary')]"
                        ]
                        
                        for selector in fallback_selectors:
                            try:
                                buttons = driver.find_elements(By.XPATH, selector)
                                for button in buttons:
                                    if button.is_displayed():
                                        driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", button)
                                        time.sleep(2)
                                        driver.execute_script("arguments[0].click();", button)
                                        logger.info(f"Clicked button using fallback selector: {selector}")
                                        fallback_button_found = True
                                        time.sleep(8)  # Wait for transaction data to load
                                        break
                                
                                if fallback_button_found:
                                    break
                            except:
                                continue

                    # Extract transaction data with pagination support using the specific table XPath
                    logger.info("Extracting transaction data...")

                    all_transactions = []
                    current_page = 1
                    has_next_page = True
                    max_pages = 10  # Safety limit to prevent infinite loops

                    while has_next_page and current_page <= max_pages:
                        logger.info(f"Processing transaction page {current_page}...")
                        
                        # Use the specific table XPath to find the transaction table
                        specific_table_xpath = "//*[@id=\"content-wrapper\"]/div[1]/div/div/div/mbb-information-account/mbb-source-account/div/div[4]/div/div[5]/div/div/table"
                        
                        try:
                            # Wait for table to be present with specific xpath
                            WebDriverWait(driver, 10).until(
                                EC.presence_of_element_located((By.XPATH, specific_table_xpath))
                            )
                            logger.info("Transaction table found with specific XPath")
                            
                            # Extract table headers using XPath
                            headers = []
                            header_elements = driver.find_elements(By.XPATH, f"{specific_table_xpath}/thead/tr/th")
                            
                            if header_elements:
                                for header in header_elements:
                                    headers.append(header.text.strip())
                                logger.info(f"Found table headers: {headers}")
                            else:
                                logger.warning("No header elements found, using default headers")
                                headers = ['STT', 'NGÀY GIAO DỊCH', 'SỐ TIỀN', 'SỐ BÚT TOÁN', 'NỘI DUNG', 
                                           'ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN', 'TÀI KHOẢN', 'NGÂN HÀNG ĐỐI TÁC']
                            
                            # Extract table rows
                            rows = []
                            row_elements = driver.find_elements(By.XPATH, f"{specific_table_xpath}/tbody/tr")
                            
                            if row_elements:
                                logger.info(f"Found {len(row_elements)} transaction rows")
                                
                                for row in row_elements:
                                    cell_elements = row.find_elements(By.XPATH, "./td")
                                    row_data = [cell.text.strip() for cell in cell_elements]
                                    if row_data:  # Only add non-empty rows
                                        rows.append(row_data)
                                
                                if current_page == 1:
                                    all_transactions = {
                                        'headers': headers,
                                        'rows': rows
                                    }
                                else:
                                    all_transactions['rows'].extend(rows)
                                
                                # Check if there's a next page and click it if available
                                try:
                                    # Use the specific XPath with the icon element
                                    next_button_icon_xpath = "//*[@id=\"page-items\"]/button[3]/i"
                                    next_button_xpath = "//*[@id=\"page-items\"]/button[3]"
                                    
                                    # First try to find the icon element
                                    icon_exists = False
                                    try:
                                        icon_element = driver.find_element(By.XPATH, next_button_icon_xpath)
                                        if icon_element:
                                            icon_exists = True
                                            logger.info("Found next page button icon with specific XPath")
                                    except:
                                        logger.info("Next page button icon not found with specific XPath")
                                    
                                    # Then try to find the button element
                                    next_button_exists = False
                                    try:
                                        next_button = driver.find_element(By.XPATH, next_button_xpath)
                                        if next_button:
                                            next_button_exists = True
                                            logger.info("Found next page button with specific XPath")
                                    except:
                                        logger.info("Next page button not found with specific XPath")
                                    
                                    # If either the button or icon exists
                                    if next_button_exists or icon_exists:
                                        # Use the button element if it exists, otherwise use the parent of the icon
                                        button_to_click = next_button if next_button_exists else driver.execute_script("return arguments[0].parentElement", icon_element)
                                        
                                        # Check if button is disabled
                                        is_disabled = driver.execute_script(
                                            "return arguments[0].disabled || arguments[0].classList.contains('disabled');", 
                                            button_to_click
                                        )
                                        
                                        if not is_disabled:
                                            logger.info(f"Attempting to click next page button for page {current_page + 1}...")
                                            try:
                                                # Scroll to make button visible
                                                driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", button_to_click)
                                                time.sleep(1)
                                                
                                                # Try JavaScript click to avoid element intercepted errors
                                                driver.execute_script("arguments[0].click();", button_to_click)
                                                current_page += 1
                                                time.sleep(5)  # Wait for the new page data to load
                                                logger.info(f"Successfully navigated to page {current_page}")
                                            except Exception as click_error:
                                                logger.warning(f"Could not click next page button: {click_error}")
                                                logger.info("No more pages available or unable to click next page button, finishing pagination")
                                                has_next_page = False
                                        else:
                                            logger.info("Next page button is disabled, reached last page")
                                            has_next_page = False
                                    else:
                                        logger.info("Next page button not found, no more pages available")
                                        has_next_page = False
                                except Exception as e:
                                    logger.warning(f"Error checking for next page button: {e}")
                                    logger.info("Continuing with data collected so far")
                                    has_next_page = False

                            else:
                                logger.warning("No transaction rows found in the table")
                                has_next_page = False
                                
                        except Exception as table_error:
                            logger.error(f"Error finding transaction table with specific XPath: {table_error}")
                            
                            # Fallback to the original JavaScript table data extraction if specific XPath fails
                            try:
                                # Check if a table exists on the page using JavaScript
                                table_exists = driver.execute_script("""
                                    return Boolean(
                                        document.querySelector('table') || 
                                        document.querySelector('div[class*="table"]') ||
                                        document.querySelector('div[role="table"]')
                                    );
                                """)
                                
                                if not table_exists:
                                    logger.warning(f"No table found on page {current_page}")
                                    break
                                    
                                # Extract table data using JavaScript (original approach)
                                table_data = driver.execute_script("""
                                    function cleanText(text) {
                                        return text ? text.replace(/\\n+/g, ' ').replace(/\\s+/g, ' ').trim() : '';
                                    }
                                    
                                    // Find table or table-like structure
                                    let table = document.querySelector('table');
                                    if (!table) {
                                        // Try grid or div-based tables
                                        const gridContainer = document.querySelector('div[role="grid"], div[class*="table"], div[class*="grid"]');
                                        if (!gridContainer) return null;
                                    }
                                    
                                    // Extract headers and rows
                                    const headers = [];
                                    const headerElements = table ? table.querySelectorAll('th') : document.querySelectorAll('div[role="columnheader"], div[class*="header"]');
                                    
                                    headerElements.forEach(header => {
                                        headers.push(cleanText(header.textContent));
                                    });
                                    
                                    // If no headers found, try other approaches
                                    if (headers.length === 0) {
                                        const firstRow = table ? table.querySelector('tr') : document.querySelector('div[role="row"]');
                                        if (firstRow) {
                                            const firstRowCells = firstRow.querySelectorAll('td, div[role="cell"]');
                                            firstRowCells.forEach(cell => headers.push(cleanText(cell.textContent)));
                                        }
                                    }
                                    
                                    // Extract rows
                                    const rows = [];
                                    const rowElements = table ? 
                                        table.querySelectorAll('tr:not(:first-child)') : 
                                        document.querySelectorAll('div[role="row"]:not(:first-child), div[class*="row"]:not(:first-child)');
                                    
                                    rowElements.forEach(row => {
                                        const cells = row.querySelectorAll('td, div[role="cell"]');
                                        if (cells.length > 0) {
                                            const rowData = [];
                                            cells.forEach(cell => rowData.push(cleanText(cell.textContent)));
                                            rows.push(rowData);
                                        }
                                    });
                                    
                                    return { headers, rows };
                                """)
                                
                                # Process the table data
                                if table_data and 'headers' in table_data and 'rows' in table_data and len(table_data['rows']) > 0:
                                    logger.info(f"Found {len(table_data['rows'])} transactions on page {current_page}")
                                    
                                    if current_page == 1:
                                        all_transactions = {
                                            'headers': table_data['headers'],
                                            'rows': table_data['rows']
                                        }
                                    else:
                                        all_transactions['rows'].extend(table_data['rows'])
                                    
                                    # Check if there's a next page and click it if available
                                    try:
                                        # Use the specific XPath with the icon element
                                        next_button_icon_xpath = "//*[@id=\"page-items\"]/button[3]/i"
                                        next_button_xpath = "//*[@id=\"page-items\"]/button[3]"
                                        
                                        # First try to find the icon element
                                        icon_exists = False
                                        try:
                                            icon_element = driver.find_element(By.XPATH, next_button_icon_xpath)
                                            if icon_element:
                                                icon_exists = True
                                                logger.info("Found next page button icon with specific XPath")
                                        except:
                                            logger.info("Next page button icon not found with specific XPath")
                                        
                                        # Then try to find the button element
                                        next_button_exists = False
                                        try:
                                            next_button = driver.find_element(By.XPATH, next_button_xpath)
                                            if next_button:
                                                next_button_exists = True
                                                logger.info("Found next page button with specific XPath")
                                        except:
                                            logger.info("Next page button not found with specific XPath")
                                        
                                        # If either the button or icon exists
                                        if next_button_exists or icon_exists:
                                            # Use the button element if it exists, otherwise use the parent of the icon
                                            button_to_click = next_button if next_button_exists else driver.execute_script("return arguments[0].parentElement", icon_element)
                                            
                                            # Check if button is disabled
                                            is_disabled = driver.execute_script(
                                                "return arguments[0].disabled || arguments[0].classList.contains('disabled');", 
                                                button_to_click
                                            )
                                            
                                            if not is_disabled:
                                                logger.info(f"Attempting to click next page button for page {current_page + 1}...")
                                                try:
                                                    # Scroll to make button visible
                                                    driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", button_to_click)
                                                    time.sleep(1)
                                                    
                                                    # Try JavaScript click to avoid element intercepted errors
                                                    driver.execute_script("arguments[0].click();", button_to_click)
                                                    current_page += 1
                                                    time.sleep(5)  # Wait for the new page data to load
                                                    logger.info(f"Successfully navigated to page {current_page}")
                                                except Exception as click_error:
                                                    logger.warning(f"Could not click next page button: {click_error}")
                                                    logger.info("No more pages available or unable to click next page button, finishing pagination")
                                                    has_next_page = False
                                            else:
                                                logger.info("Next page button is disabled, reached last page")
                                                has_next_page = False
                                        else:
                                            logger.info("Next page button not found, no more pages available")
                                            has_next_page = False
                                    except Exception as e:
                                        logger.warning(f"Error checking for next page button: {e}")
                                        logger.info("Continuing with data collected so far")
                                        has_next_page = False
                            except Exception as navigation_error:
                                logger.warning(f"Error navigating to next page: {navigation_error}")
                                has_next_page = False

                    # Process the collected transaction data and prepare result
                    transactions_list = []

                    if all_transactions and 'headers' in all_transactions and 'rows' in all_transactions:
                        headers = all_transactions['headers']
                        rows = all_transactions['rows']
                        
                        logger.info(f"Processing {len(rows)} total transactions from {current_page} pages...")
                        
                        for row in rows:
                            transaction = {}
                            for i, header in enumerate(headers):
                                header_key = header.strip()
                                if i < len(row):
                                    transaction[header_key] = row[i]
                                else:
                                    transaction[header_key] = ""
                            
                            transactions_list.append(transaction)

                    # Format final result
                    result_data = {
                        'timestamp': datetime.now().isoformat(),
                        'status': 'success',
                        'account_info': {
                            'balance': account_balance
                        },
                        'transactions': transactions_list
                    }

                    # Create data directory if it doesn't exist
                    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
                    if not os.path.exists(data_dir):
                        os.makedirs(data_dir)
                        logger.info(f"Created data directory: {data_dir}")

                    # Save to JSON file in data directory
                    json_filename = f"mb_transactions_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                    json_path = os.path.join(data_dir, json_filename)
                    with open(json_path, 'w', encoding='utf-8') as jsonfile:
                        json.dump(result_data, jsonfile, ensure_ascii=False, indent=2)

                    logger.info(f"Transaction data saved to: {json_path}")

                    # Close the browser
                    driver.quit()

                    # Clean up all PNG files from both directories
                    cleanup_png_files()

                    return JSONResponse(content=result_data)
                    
                except Exception as e:
                    logger.error(f"Error during login attempt {attempt}: {e}")
                    
                    if attempt < max_retries:
                        logger.info("Retrying...")
                        continue
            
            # If we get here, all attempts failed
            if driver:
                driver.quit()
            return await generate_error_response(f"Failed to complete login process after {max_retries} attempts")
            
        except Exception as driver_error:
            logger.error(f"Error during web scraping: {driver_error}", exc_info=True)
            if driver:
                driver.quit()
            return await generate_error_response(f"WebDriver error: {str(driver_error)}")
            
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return await generate_error_response(f"An unexpected error occurred: {str(e)}")

async def generate_simulated_data(username: str, password: str, is_fallback: bool = False) -> JSONResponse:
    """Generate simulated transaction data for testing or fallback"""
    if is_fallback:
        logger.info("Falling back to simulated data after real scraping failed")
    else:
        logger.info("Generating simulated data as requested")
        
    # Generate simulated data
    account_id = f"MB_{username[-4:]}" if len(username) > 4 else f"MB_{username}"
    
    # Create a more realistic balance with commas for thousands
    balance_value = hash(username + password) % 100000000
    formatted_balance = f"{balance_value:,} VND".replace(",", ".")
    
    # Create transaction data
    transaction_types = ["Transfer", "Payment", "Deposit", "Withdrawal", "Interest", "Fee"]
    transaction_descriptions = [
        "Salary payment",
        "Electricity bill",
        "Water bill",
        "Internet service",
        "Grocery shopping",
        "Restaurant payment",
        "Transfer to family",
        "Online purchase",
        "Mobile phone top-up",
        "Insurance payment"
    ]
    
    transactions = []
    running_balance = balance_value
    days_of_history = 5
    
    for i in range(days_of_history):
        # Generate 1-3 transactions per day
        daily_transactions = random.randint(1, 3)
        
        for j in range(daily_transactions):
            txn_type = "credit" if random.random() > 0.6 else "debit"
            txn_amount = random.randint(10000, 2000000)
            
            if txn_type == "debit":
                running_balance += txn_amount
            else:
                running_balance -= min(txn_amount, running_balance - 10000)
                txn_amount = min(txn_amount, running_balance - 10000)
            
            description = random.choice(transaction_descriptions)
            category = random.choice(transaction_types)
            
            transactions.append({
                "date": (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d"),
                "time": f"{random.randint(0, 23):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}",
                "description": f"{description}",
                "category": category,
                "amount": f"{txn_amount:,} VND".replace(",", "."),
                "type": txn_type,
                "running_balance": f"{running_balance:,} VND".replace(",", ".")
            })
    
    # Sort transactions by date (newest first)
    transactions.sort(key=lambda x: (x["date"], x["time"]), reverse=True)
    
    message = "Using simulated data due to scraping failure" if is_fallback else "Using simulated data (simulation mode is enabled)"
    
    result_data = {
        "timestamp": datetime.now().isoformat(),
        "status": "success",
        "message": message,
        "account_info": {
            "account_number": account_id,
            "account_name": f"User {username}",
            "balance": formatted_balance,
            "currency": "VND",
            "last_updated": datetime.now().isoformat()
        },
        "transactions": transactions
    }
    
    # Create data directory if it doesn't exist
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    
    # Save to JSON file in data directory
    json_path = os.path.join(data_dir, f"mb_transactions_{datetime.now().strftime('%Y%m%d_%H%M%S')}_simulated.json")
    with open(json_path, 'w', encoding='utf-8') as jsonfile:
        json.dump(result_data, jsonfile, ensure_ascii=False, indent=2)
    
    logger.info(f"Simulated data saved to: {json_path}")
    return JSONResponse(content=result_data)

async def generate_error_response(message: str, status_code: int = 500) -> JSONResponse:
    """Generate a standardized error response"""
    result_data = {
        "timestamp": datetime.now().isoformat(),
        "status": "error",
        "message": message,
        "balance": "Not available",
        "transactions": []
    }
    
    # Create data directory if it doesn't exist
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    
    # Save to JSON file in data directory
    json_path = os.path.join(data_dir, f"mb_transactions_{datetime.now().strftime('%Y%m%d_%H%M%S')}_error.json")
    with open(json_path, 'w', encoding='utf-8') as jsonfile:
        json.dump(result_data, jsonfile, ensure_ascii=False, indent=2)
    
    logger.info(f"Error response saved to: {json_path}")
    
    # Clean up all PNG files from both folders
    cleanup_png_files()
    
    return JSONResponse(content=result_data, status_code=status_code)

# Add this function to clean up PNG files from both folders
def cleanup_png_files():
    """Remove all PNG files from captcha_image and routers directories"""
    # Clean up captcha_image folder
    captcha_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'captcha_image')
    if os.path.exists(captcha_dir):
        captcha_files_count = 0
        for file in os.listdir(captcha_dir):
            if file.endswith('.png'):
                try:
                    os.remove(os.path.join(captcha_dir, file))
                    captcha_files_count += 1
                except Exception as e:
                    logger.warning(f"Could not delete file {file} in captcha_image folder: {e}")
        logger.info(f"Cleaned up {captcha_files_count} PNG files from captcha_image folder")
    
    # Clean up routers/captcha_images folder (if it exists)
    router_captcha_dir = os.path.join(os.path.dirname(__file__), 'captcha_images')
    if os.path.exists(router_captcha_dir):
        router_files_count = 0
        for file in os.listdir(router_captcha_dir):
            if file.endswith('.png'):
                try:
                    os.remove(os.path.join(router_captcha_dir, file))
                    router_files_count += 1
                except Exception as e:
                    logger.warning(f"Could not delete file {file} in routers/captcha_images folder: {e}")
        logger.info(f"Cleaned up {router_files_count} PNG files from routers/captcha_images folder")
    
    # Clean up PNG files in the routers directory
    router_dir = os.path.dirname(__file__)
    router_png_count = 0
    for file in os.listdir(router_dir):
        if file.endswith('.png'):
            try:
                os.remove(os.path.join(router_dir, file))
                router_png_count += 1
            except Exception as e:
                logger.warning(f"Could not delete file {file} in routers directory: {e}")
    logger.info(f"Cleaned up {router_png_count} PNG files from routers directory")