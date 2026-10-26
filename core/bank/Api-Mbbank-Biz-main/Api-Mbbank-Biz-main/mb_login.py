from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import base64
import getpass
import csv
import os
from datetime import datetime
from captcha_reading import read_captcha

def login_and_get_balance(max_retries=3):
    """
    Log into MB Bank account, submit the form with captcha, and retrieve account balance.
    Will retry on captcha/login failure up to max_retries times.
    
    Parameters:
        max_retries (int): Maximum number of login attempts
        
    Returns:
        tuple: (account_balance, transaction_data)
    """
    driver = None
    try:
        print("Initializing Chrome WebDriver...")
        
        # Set up Chrome options
        chrome_options = Options()
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument("--disable-notifications")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        
        # Initialize the Chrome driver
        driver = webdriver.Chrome(options=chrome_options)
        
        # Get username and password from user input (only once outside retry loop)
        username = input("Enter your MB Bank username: ")
        password = getpass.getpass("Enter your MB Bank password: ")
        
        # Login attempt loop
        for attempt in range(1, max_retries + 1):
            print(f"\n=== Login Attempt {attempt} of {max_retries} ===")
            
            # Close any popup that might be open from previous failed attempt
            try:
                # Look for common popup close buttons
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
                                    print("Closing popup...")
                                    button.click()
                                    time.sleep(1)
                                    break
                    except:
                        continue
            except:
                pass  # Ignore errors if no popup is present
            
            # Navigate to the login page (refresh for each attempt)
            url = 'https://online.mbbank.com.vn/pl/login'
            driver.get(url)
            
            # Wait for the page to load completely
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Step 1: Get the captcha image - using original specific XPath
            print("Looking for captcha image...")
            specific_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[5]/mbb-word-captcha/div/div[2]/div[1]/div[1]/img"
            # enterprise
            # /html/body/app-root/div/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div/img
            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.XPATH, specific_xpath))
                )
                captcha_img = driver.find_element(By.XPATH, specific_xpath)
                print("Captcha image found!")
            except Exception as e:
                print(f"Could not find captcha with specific XPath: {e}")
                continue  # Try again if we can't find the captcha
            
            # Get image source and process captcha
            img_src = captcha_img.get_attribute("src")
            if not img_src:
                print("Error: Could not get captcha image source")
                continue
            
            # Process captcha directly from the browser
            captcha_text = ""
            if img_src.startswith("data:image"):
                try:
                    img_data = img_src.split(",")[1]
                    img_bytes = base64.b64decode(img_data)
                    # Pass save_images=True to save both original and preprocessed captcha
                    captcha_text = read_captcha(img_bytes, is_bytes=True, save_images=True).replace(" ", "")
                except Exception as e:
                    print(f"Error processing captcha: {e}")
                    captcha_text = input("Please enter the captcha shown in the browser: ")
            else:
                captcha_text = input("Please enter the captcha shown in the browser: ")
            
            print(f"Using captcha: {captcha_text}")
            
            # Step 2: Fill in the login form with original XPaths
            try:
                # Enterprise: Comanpy code
                # company_code_xpath = "/html/body/app-root/div/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-input[1]/div/input"
                # WebDriverWait(driver, 10).until(
                # EC.element_to_be_clickable((By.XPATH, company_code_xpath))   
                #)
                # company_code_field = driver.find_element(By.XPATH, company_code_xpath)
                # company_code_field.clear()
                # company_code_field.send_keys(company_code)
                
                # Username field
                username_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[2]/mbb-input/div/input"
                WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, username_xpath))
                )
                username_field = driver.find_element(By.XPATH, username_xpath)
                username_field.clear()
                username_field.send_keys(username)
                
                # Password field
                password_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[4]/mbb-input/div/input"
                password_field = driver.find_element(By.XPATH, password_xpath)
                password_field.clear()
                password_field.send_keys(password)
                
                # Captcha field
                captcha_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[5]/mbb-word-captcha/div/div[2]/div[1]/div[2]/input"
                captcha_field = driver.find_element(By.XPATH, captcha_xpath)
                captcha_field.clear()
                captcha_field.send_keys(captcha_text)
                
                # Step 3: Click the sign-in button
                signin_button_xpath = "/html/body/app-root/div/mbb-welcome/div[2]/div[1]/div/div/mbb-login/form/div/div[6]/div/button"
                signin_button = driver.find_element(By.XPATH, signin_button_xpath)
                signin_button.click()
                
                # Wait for login process
                print("Logging in, please wait...")
                time.sleep(3)  # Increased wait time
                
                # Check for popup/dialog that appears after failed login
                try:
                    # Wait a short time for any popup to appear
                    WebDriverWait(driver, 2).until(
                        EC.presence_of_element_located((By.XPATH, "//div[contains(@class, 'modal') or contains(@class, 'popup') or contains(@class, 'dialog')]"))
                    )
                    
                    print("Login failed, popup detected.")
                    
                    # Try to handle the popup - look for a close/ok button
                    popup_button_xpaths = [
                        "//div[contains(@class, 'modal') or contains(@class, 'popup') or contains(@class, 'dialog')]//button",
                        "//button[contains(text(), 'Close') or contains(text(), 'Đóng') or contains(text(), 'OK')]"
                    ]
                    
                    for btn_xpath in popup_button_xpaths:
                        try:
                            buttons = driver.find_elements(By.XPATH, btn_xpath)
                            if buttons:
                                for button in buttons:
                                    if button.is_displayed():
                                        print("Closing error popup...")
                                        button.click()
                                        time.sleep(1)
                                        break
                        except:
                            continue
                    
                    # Try again with next attempt
                    continue
                except:
                    # No popup detected, continue checking login status
                    pass
                
                # Check if login was successful
                current_url = driver.current_url
                if "login" in current_url.lower():
                    # We might still be on the login page, check for error messages
                    try:
                        error_elements = driver.find_elements(By.XPATH, "//div[contains(@class,'error')]")
                        error_found = False
                        for error in error_elements:
                            if error.is_displayed():
                                error_found = True
                                print(f"Login error: {error.text}")
                        
                        if error_found:
                            print("Login failed. Retrying...")
                            continue  # Try again
                    except:
                        pass
                    
                    # If we're still on login page with no visible errors, captcha might be wrong
                    print("Login failed: Possible incorrect username, password, or captcha")
                    continue  # Try again
                
                # If we get here, login was successful
                print("Login successful! Retrieving account balance...")
                
                # Wait for the dashboard to fully load
                time.sleep(5)  # Give more time for the dashboard to stabilize
                
                # STEP 1: Navigate to the account information page first
                print("Navigating to account information page...")
                
                # First approach: Try to click the account info navigation button
                navigation_success = False
                try:
                    # Try using the provided full XPath
                    account_info_button_xpath = "/html/body/app-root/div/ng-component/div[1]/div/div/div[1]/div/div/div/mbb-dashboard/div/div/div[1]/mbb-finance-information/div[2]/div/div/div[2]/div/div[1]/mbb-tagcard/a"
                    
                    # Check if the element exists and is clickable
                    account_info_buttons = driver.find_elements(By.XPATH, account_info_button_xpath)
                    if account_info_buttons and account_info_buttons[0].is_displayed():
                        # Scroll to make sure it's in view
                        driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", account_info_buttons[0])
                        time.sleep(2)
                        
                        # Click using JavaScript for reliability
                        driver.execute_script("arguments[0].click();", account_info_buttons[0])
                        print("Clicked on account information navigation button")
                        navigation_success = True
                        
                        # Wait for the page to load
                        time.sleep(5)
                    else:
                        print("Account information button not found or not visible")
                except Exception as e:
                    print(f"Error clicking account information button: {e}")
                
                # If button click fails, try navigating directly to the URL
                if not navigation_success:
                    try:
                        direct_url = "https://online.mbbank.com.vn/information-account/source-account"
                        print(f"Directly navigating to: {direct_url}")
                        driver.get(direct_url)
                        navigation_success = True
                        
                        # Wait for the page to load
                        time.sleep(8)
                    except Exception as e:
                        print(f"Error navigating to account information URL: {e}")
                
                if not navigation_success:
                    print("Failed to navigate to account information page")
                    return account_balance, []
                
                # Try to find account balance with the working XPath (after navigation)
                balance_xpath = "/html/body/app-root/div/ng-component/div[1]/div/div/div[1]/div/div/div/mbb-information-account/mbb-source-account/div/div[2]/div/div[2]/div[2]/div/div/div[2]/span[2]"
                account_balance = None
                
                try:
                    WebDriverWait(driver, 8).until(
                        EC.presence_of_element_located((By.XPATH, balance_xpath))
                    )
                    balance_element = driver.find_element(By.XPATH, balance_xpath)
                    balance = balance_element.text.strip()
                    
                    # Add VND if not already included
                    if not balance.lower().endswith('vnd'):
                        balance = f"{balance} VND"
                    
                    account_balance = balance
                    print(f"Account Balance: {account_balance}")
                    
                except Exception:
                    # Try with the shorter XPath that worked previously
                    try:
                        balance_element = driver.find_element(By.XPATH, "//span[contains(@class, 'balance')]")
                        balance = balance_element.text.strip()
                        
                        # Add VND if not already included
                        if not balance.lower().endswith('vnd'):
                            balance = f"{balance} VND"
                        
                        account_balance = balance
                        print(f"Account Balance: {account_balance}")
                        
                    except Exception as e:
                        print(f"Could not find balance: {e}")
                        account_balance = "Unknown"
                
                # STEP 2: Now that we're on the correct page, click on the transaction history button
                print("Clicking on transaction history button...")
                
                # Try to find the search/query button with direct selector first
                transaction_button_found = False
                
                # Approach 1: Try with the select search/query button directly with common texts
                try:
                    # Try to find button with Vietnamese "Truy vấn" text (common search/query term)
                    buttons = driver.find_elements(By.XPATH, "//button[contains(text(), 'Truy vấn') or contains(text(), 'Tìm kiếm')]")
                    for button in buttons:
                        if button.is_displayed():
                            # Scroll to the button
                            driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", button)
                            time.sleep(2)
                            
                            # Click the button
                            driver.execute_script("arguments[0].click();", button)
                            print(f"Clicked button with text: {button.text}")
                            transaction_button_found = True
                            time.sleep(3)  # Wait after clicking
                            break
                except Exception as e:
                    print(f"Error finding button by text: {e}")
                
                # If direct approach fails, try by form structure
                if not transaction_button_found:
                    try:
                        # Find forms and their submit buttons
                        forms = driver.find_elements(By.TAG_NAME, "form")
                        for form in forms:
                            buttons = form.find_elements(By.TAG_NAME, "button")
                            if buttons:
                                # Use the last button in the form (typically the submit/search button)
                                last_button = buttons[-1]
                                if last_button.is_displayed():
                                    driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", last_button)
                                    time.sleep(2)
                                    driver.execute_script("arguments[0].click();", last_button)
                                    print(f"Clicked form submit button")
                                    transaction_button_found = True
                                    time.sleep(3)
                                    break
                    except Exception as e:
                        print(f"Error finding form submit buttons: {e}")
                
                # If still not found, try more comprehensive JavaScript approach
                # if not transaction_button_found:
                #     try:
                #         button_clicked = driver.execute_script("""
                #             // Find and click the transaction button
                #             function findAndClickButton() {
                #                 // Common button texts for transaction/search functions
                #                 const buttonTexts = ['Truy vấn', 'Tìm kiếm', 'Tra cứu', 'Search', 'Query'];
                                
                #                 // Find buttons with these texts
                #                 for (const text of buttonTexts) {
                #                     const buttons = Array.from(document.querySelectorAll('button')).filter(
                #                         btn => btn.offsetParent !== null && 
                #                                 btn.textContent.trim().toLowerCase().includes(text.toLowerCase())
                #                     );
                                    
                #                     if (buttons.length > 0) {
                #                         buttons[0].scrollIntoView({behavior: 'smooth', block: 'center'});
                #                         setTimeout(() => {}, 1000);
                #                         buttons[0].click();
                #                         return true;
                #                     }
                #                 }
                                
                #                 // If no text match, find submit buttons in forms
                #                 const forms = document.querySelectorAll('form');
                #                 for (const form of forms) {
                #                     const buttons = form.querySelectorAll('button[type="submit"], button');
                #                     if (buttons.length > 0) {
                #                         for (const btn of buttons) {
                #                             if (btn.offsetParent !== null) {
                #                                 btn.scrollIntoView({behavior: 'smooth', block: 'center'});
                #                                 setTimeout(() => {}, 1000);
                #                                 btn.click();
                #                                 return true;
                #                             }
                #                         }
                #                     }
                #                 }
                                
                #                 // Last resort: find any visible button in a likely container
                #                 const containers = document.querySelectorAll('.block-search, .search-form, .filter-form, .transaction-search');
                #                 for (const container of containers) {
                #                     const buttons = container.querySelectorAll('button');
                #                     for (const btn of buttons) {
                #                         if (btn.offsetParent !== null) {
                #                             btn.scrollIntoView({behavior: 'smooth', block: 'center'});
                #                             setTimeout(() => {}, 1000);
                #                             btn.click();
                #                             return true;
                #                         }
                #                     }
                #                 }
                                
                #                 return false;
                #             }
                            
                #             return findAndClickButton();
                #         """)
                        
                    #     if button_clicked:
                    #         print("Found and clicked transaction button using JavaScript")
                    #         transaction_button_found = True
                    #         time.sleep(3)
                    # except Exception as e:
                    #     print(f"JavaScript approach failed: {e}")
                
                # Wait for transaction data to load (if button was clicked)
                print("Waiting for transaction history to load...")
                time.sleep(5)
                
                # STEP 3: Try to retrieve transaction data from the page - only if it's a table
                try:
                    all_transactions = []  # To store transactions from all pages
                    current_page = 1
                    has_next_page = True
                    
                    while has_next_page:
                        print(f"Processing transaction page {current_page}...")
                        # Check if there's a table in the page
                        has_table = driver.execute_script("""
                            return Boolean(
                                document.querySelector('table') || 
                                document.querySelector('div[class*="table"]') ||
                                document.querySelector('div[role="table"]') ||
                                document.querySelector('div[class*="grid"]')
                            );
                        """)
                        
                        if not has_table:
                            print(f"No transaction table detected on page {current_page}")
                            if current_page == 1:
                                return account_balance, []  # No data at all
                            else:
                                break  # We've got data from previous pages, so stop here
                        
                        print(f"Transaction table detected on page {current_page}, extracting data...")
                        
                        # Extract table data with structure preserved - same JavaScript as before
                        table_data = driver.execute_script("""
                            // Helper function to check if an element is visible
                            function isVisible(elem) {
                                return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
                            }
                            
                            // Helper function to clean text
                            function cleanText(text) {
                                return text.replace(/\\n+/g, ' ').replace(/\\s+/g, ' ').trim();
                            }
                            
                            // Find table headers and rows
                            function extractTableData() {
                                // Look for standard HTML tables first
                                const tables = document.querySelectorAll('table');
                                for (const table of tables) {
                                    if (isVisible(table)) {
                                        // Get headers
                                        const headers = [];
                                        const headerCells = table.querySelectorAll('th');
                                        if (headerCells.length > 0) {
                                            headerCells.forEach(cell => headers.push(cleanText(cell.textContent)));
                                        } else {
                                            // If no TH elements, try first TR as header
                                            const firstRow = table.querySelector('tr');
                                            if (firstRow) {
                                                firstRow.querySelectorAll('td').forEach(cell => 
                                                    headers.push(cleanText(cell.textContent)));
                                            }
                                        }
                                        
                                        // Get rows
                                        const rows = [];
                                        table.querySelectorAll('tr').forEach((row, rowIndex) => {
                                            // Skip first row if we used it as headers
                                            if (headerCells.length === 0 && rowIndex === 0) return;
                                            
                                            const rowData = [];
                                            row.querySelectorAll('td').forEach(cell => 
                                                rowData.push(cleanText(cell.textContent)));
                                            
                                            if (rowData.length > 0) rows.push(rowData);
                                        });
                                        
                                        return { headers, rows };
                                    }
                                }
                                
                                // If no standard tables, look for div-based tables
                                const expectedHeaders = ['STT', 'NGÀY GIAO DỊCH', 'SỐ TIỀN', 'SỐ BÚT TOÁN', 'NỘI DUNG', 
                                                    'ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN', 'TÀI KHOẢN', 'NGÂN HÀNG ĐỐI TÁC'];
                                
                                const divTables = document.querySelectorAll('div[class*="table"], div[role="table"], div[class*="grid"]');
                                for (const divTable of divTables) {
                                    if (isVisible(divTable)) {
                                        // Try to identify header and row elements
                                        const headerElements = divTable.querySelectorAll('div[class*="header"], div[class*="heading"], div[class*="title"]');
                                        let headers = [];
                                        
                                        if (headerElements.length > 0) {
                                            headerElements.forEach(el => headers.push(cleanText(el.textContent)));
                                        } else {
                                            // Use expected headers
                                            headers = expectedHeaders;
                                        }
                                        
                                        // Look for row containers
                                        const rowElements = divTable.querySelectorAll('div[class*="row"], div[class*="item"]');
                                        const rows = [];
                                        
                                        rowElements.forEach(rowEl => {
                                            const cells = rowEl.querySelectorAll('div[class*="cell"], div[class*="column"], span');
                                            const rowData = [];
                                            cells.forEach(cell => rowData.push(cleanText(cell.textContent)));
                                            if (rowData.length > 0) rows.push(rowData);
                                        });
                                        
                                        if (rows.length > 0) {
                                            return { headers, rows };
                                        }
                                    }
                                }
                                
                                // Last resort: try to parse transaction data from text content
                                const mainContainer = document.querySelector('div[class*="transaction"], div[class*="history"], div[class*="result"]');
                                if (mainContainer) {
                                    // Return raw text for manual parsing
                                    return { rawText: mainContainer.textContent.trim() };
                                }
                                
                                return null;
                            }
                            
                            return extractTableData();
                        """)
                        
                        # Process current page data
                        if table_data:
                            # Process structured data
                            if 'headers' in table_data and 'rows' in table_data:
                                print(f"Found {len(table_data['rows'])} transactions on page {current_page}")
                                
                                # Store headers if this is first page
                                if current_page == 1:
                                    # Use known MB Bank transaction headers if headers are incomplete
                                    expected_headers = ['STT', 'NGÀY GIAO DỊCH', 'SỐ TIỀN', 'SỐ BÚT TOÁN', 'NỘI DUNG', 
                                                    'ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN', 'TÀI KHOẢN', 'NGÂN HÀNG ĐỐI TÁC']
                                    
                                    headers = table_data['headers']
                                    # If no headers or too few headers, use expected headers
                                    if not headers or len(headers) < 3:
                                        headers = expected_headers
                                    
                                    # Store headers for all pages
                                    all_transactions = {
                                        'headers': headers,
                                        'rows': []
                                    }
                                
                                # Add rows to the accumulated data
                                if table_data['rows']:
                                    all_transactions['rows'].extend(table_data['rows'])
                            
                            elif 'rawText' in table_data and table_data['rawText'] and current_page == 1:
                                # For raw text data, we just use the first page
                                print("Found transaction data as raw text")
                                all_transactions = {'raw_text': table_data['rawText']}
                                # We don't support paging for raw text mode
                                has_next_page = False
                                break
                        
                        # Try to click the next page button if available
                        if 'raw_text' not in all_transactions:  # Skip for raw text mode
                            # Wait briefly to make sure the page is fully loaded
                            time.sleep(1)
                            
                            # Check if next button exists and is clickable
                            next_button_found = False
                            
                            # Try with the full XPath
                            next_button_xpath = "/html/body/app-root/div/ng-component/div[1]/div/div/div[1]/div/div/div/mbb-information-account/mbb-source-account/div/div[4]/div/div[5]/div/mbb-pagination/div/div/div/button[3]/i"
                            try:
                                next_buttons = driver.find_elements(By.XPATH, next_button_xpath)
                                if next_buttons and next_buttons[0].is_displayed():
                                    # Check if the parent button is disabled
                                    parent_button = driver.execute_script("return arguments[0].parentElement;", next_buttons[0])
                                    is_disabled = driver.execute_script(
                                        "return arguments[0].disabled || arguments[0].classList.contains('disabled');", 
                                        parent_button
                                    )
                                    
                                    if not is_disabled:
                                        print(f"Navigating to page {current_page + 1}...")
                                        driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", parent_button)
                                        time.sleep(1)
                                        driver.execute_script("arguments[0].click();", parent_button)
                                        current_page += 1
                                        next_button_found = True
                                        time.sleep(1.5)  # Wait for page to load
                                    else:
                                        print("Next page button is disabled, reached last page")
                                        has_next_page = False
                                else:
                                    print("Next page button not found or not visible")
                                    has_next_page = False
                            except Exception as e:
                                print(f"Error finding next button with full XPath: {e}")
                                
                                # Try alternative approach with more general selector
                                try:
                                    # Look for next button with common patterns
                                    next_buttons = driver.find_elements(By.XPATH, "//button[contains(@class, 'next') or .//i[contains(@class, 'next')]]")
                                    if next_buttons:
                                        for btn in next_buttons:
                                            if btn.is_displayed():
                                                is_disabled = driver.execute_script(
                                                    "return arguments[0].disabled || arguments[0].classList.contains('disabled');", 
                                                    btn
                                                )
                                                
                                                if not is_disabled:
                                                    print(f"Navigating to page {current_page + 1} using alternative button...")
                                                    driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", btn)
                                                    time.sleep(1)
                                                    driver.execute_script("arguments[0].click();", btn)
                                                    current_page += 1
                                                    next_button_found = True
                                                    time.sleep(1.5)  # Wait for page to load
                                                    break
                                    
                                    if not next_button_found:
                                        print("No next button found with alternative approach")
                                        has_next_page = False
                                except Exception as alt_e:
                                    print(f"Error finding next button with alternative approach: {alt_e}")
                                    has_next_page = False
                        else:
                            # No more pages to process
                            has_next_page = False
                    
                    # End of pagination loop - save all collected data
                    if all_transactions:
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        csv_path = os.path.join(os.path.dirname(__file__), f"mb_transactions_{timestamp}.csv")
                        
                        if 'headers' in all_transactions and 'rows' in all_transactions:
                            headers = all_transactions['headers']
                            rows = all_transactions['rows']
                            
                            print(f"Saving {len(rows)} transactions from {current_page} pages...")
                            
                            with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
                                writer = csv.writer(csvfile)
                                writer.writerow(headers)  # Write headers
                                
                                for row in rows:
                                    # Make sure row has same number of cells as headers
                                    while len(row) < len(headers):
                                        row.append("")  # Pad with empty values if needed
                                    
                                    # Truncate if too many values
                                    if len(row) > len(headers):
                                        row = row[:len(headers)]
                                        
                                    writer.writerow(row)
                            
                            print(f"All transaction data saved to: {csv_path}")
                            
                        elif 'raw_text' in all_transactions:
                            # For raw text data
                            raw_text = all_transactions['raw_text']
                            
                            # Try to parse the raw text into structured data
                            # This uses expected MB Bank transaction structure
                            headers = ['STT', 'NGÀY GIAO DỊCH', 'SỐ TIỀN', 'SỐ BÚT TOÁN', 'NỘI DUNG', 
                                     'ĐƠN VỊ THỤ HƯỞNG/ĐƠN VỊ CHUYỂN', 'TÀI KHOẢN', 'NGÂN HÀNG ĐỐI TÁC']
                            
                            # Write raw text to CSV
                            with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
                                # First write expected headers
                                writer = csv.writer(csvfile)
                                writer.writerow(headers)
                                
                                # Then write the raw text as a comment
                                csvfile.write(f"\n# Raw transaction data - needs parsing:\n{raw_text}")
                                
                            print(f"Raw transaction data saved to: {csv_path}")
                        
                        # Sleep for 3 seconds before closing
                        print("\nClosing browser in 3 seconds...")
                        time.sleep(3)
                        
                        return account_balance, all_transactions
                    else:
                        print("No transaction data found")
                        return account_balance, []
                    
                except Exception as e:
                    print(f"Error processing transaction data: {e}")
                    return account_balance, []
                
            except Exception as e:
                print(f"Error during login attempt {attempt}: {e}")
                
                # Try to close any popups before next attempt
                try:
                    from selenium.webdriver.common.keys import Keys
                    webdriver.ActionChains(driver).send_keys(Keys.ESCAPE).perform()
                    time.sleep(1)
                except:
                    pass
                    
                if attempt < max_retries:
                    print("Retrying...")
                    continue
                
        # If we get here, all attempts failed
        return f"Error: Failed to login after {max_retries} attempts", []
        
    except Exception as e:
        print(f"Critical error occurred: {e}")
        return f"Error: {str(e)}", []
        
    finally:
        if driver:
            print("Closing browser...")
            driver.quit()

if __name__ == "__main__":
    print("Starting MB Bank login and balance retrieval...")
    account_balance, transactions = login_and_get_balance(max_retries=3)
    
    print(f"\nFinal Account Balance: {account_balance}")
    print(f"Retrieved {len(transactions)} page(s) of transactions")