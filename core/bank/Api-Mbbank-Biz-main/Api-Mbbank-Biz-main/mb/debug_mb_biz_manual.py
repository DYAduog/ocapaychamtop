"""Manual debug helper for MB Business web flow.

This script opens a real browser, logs in if credentials are supplied, then keeps
browser open so a developer can inspect the MB Business UI manually. It also
writes screenshots, HTML snapshots, and a text report to debug_reports/.

Usage from mb/:
    python debug_mb_biz_manual.py --corp-id "..." --username "..." --password "..."
    python debug_mb_biz_manual.py --no-login
"""

import argparse
import base64
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from getpass import getpass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

BASE_DIR = Path(__file__).resolve().parent
REPORT_DIR = BASE_DIR / "debug_reports" / datetime.now().strftime("%Y%m%d_%H%M%S")
LOGIN_URL = "https://ebank.mbbank.com.vn/cp/pl/login"
TRANSACTION_URL = "https://ebank.mbbank.com.vn/cp/account-info/transaction-inquiry"

load_dotenv(BASE_DIR / ".env")

REPORT_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("mb_biz_manual_debug")
logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(formatter)
file_handler = logging.FileHandler(REPORT_DIR / "debug.log", encoding="utf-8")
file_handler.setFormatter(formatter)
logger.addHandler(stream_handler)
logger.addHandler(file_handler)


def mask_secret(value: Optional[str], visible: int = 2) -> str:
    if not value:
        return ""
    if len(value) <= visible * 2:
        return "*" * len(value)
    return f"{value[:visible]}{'*' * (len(value) - visible * 2)}{value[-visible:]}"


def save_debug_artifacts(driver, label: str) -> None:
    safe_label = re.sub(r"[^a-zA-Z0-9_.-]+", "_", label).strip("_") or "snapshot"
    screenshot_path = REPORT_DIR / f"{safe_label}.png"
    html_path = REPORT_DIR / f"{safe_label}.html"

    try:
        driver.save_screenshot(str(screenshot_path))
        logger.info("Saved screenshot: %s", screenshot_path)
    except Exception as exc:
        logger.warning("Could not save screenshot %s: %s", label, exc)

    try:
        html_path.write_text(driver.page_source, encoding="utf-8")
        logger.info("Saved HTML: %s", html_path)
    except Exception as exc:
        logger.warning("Could not save HTML %s: %s", label, exc)

    save_browser_logs(driver, safe_label)


def save_browser_logs(driver, label: str) -> None:
    logs_path = REPORT_DIR / "browser_logs.jsonl"
    for log_type in ["browser", "performance"]:
        try:
            entries = driver.get_log(log_type)
        except Exception:
            continue

        if not entries:
            continue

        with logs_path.open("a", encoding="utf-8") as file:
            for entry in entries:
                entry["snapshot_label"] = label
                entry["log_type"] = log_type
                file.write(json.dumps(entry, ensure_ascii=False) + "\n")
        logger.info("Saved %s %s log entries", len(entries), log_type)


def append_navigation_state(driver, label: str) -> None:
    state = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "label": label,
        "current_url": driver.current_url,
        "title": driver.title,
    }
    with (REPORT_DIR / "navigation.jsonl").open("a", encoding="utf-8") as file:
        file.write(json.dumps(state, ensure_ascii=False) + "\n")


def create_driver(browser: str):
    browser = browser.lower()
    if browser == "edge":
        options = EdgeOptions()
        options.add_argument("--start-maximized")
        options.add_argument("--disable-notifications")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
        return webdriver.Edge(options=options)

    options = ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
    return webdriver.Chrome(options=options)


def close_initial_popup(driver) -> None:
    close_button_xpaths = [
        '//*[@id="mat-dialog-0"]/mbb-dialog-common/div/div[4]/button',
        "//button[contains(@class, 'close')]",
        "//button[contains(@class, 'btn-close')]",
        "//button[contains(text(), 'Đóng')]",
        "//button[contains(text(), 'Close')]",
    ]

    for xpath in close_button_xpaths:
        try:
            buttons = driver.find_elements(By.XPATH, xpath)
            for button in buttons:
                if button.is_displayed() and button.is_enabled():
                    button.click()
                    logger.info("Closed popup with XPath: %s", xpath)
                    time.sleep(0.5)
                    return
        except Exception:
            continue


def find_captcha_image(driver):
    captcha_xpaths = [
        '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div/div/img',
        '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div[1]/div/img',
        "//mbb-word-captcha//img",
        "//img[contains(@src, 'captcha')]",
        "//div[contains(@class, 'captcha')]//img",
    ]

    for xpath in captcha_xpaths:
        try:
            captcha = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.XPATH, xpath))
            )
            if captcha.is_displayed():
                logger.info("Found captcha with XPath: %s", xpath)
                return captcha
        except TimeoutException:
            continue
    return None


def read_captcha_from_element(captcha_img) -> str:
    from routers.captcha_reading import read_captcha

    src = captcha_img.get_attribute("src")
    if not src or not src.startswith("data:image"):
        raise RuntimeError("Captcha image is not a data URL")
    image_bytes = base64.b64decode(src.split(",", 1)[1])
    return read_captcha(image_bytes, is_bytes=True, save_images=True).replace(" ", "")


def keep_browser_open(driver, pause_seconds: int, snapshot_interval: int) -> None:
    logger.info("Keeping browser open for %s seconds. Press Ctrl+C in terminal to stop earlier.", pause_seconds)
    start = time.time()
    next_snapshot = start + max(snapshot_interval, 1)
    snapshot_index = 1

    while time.time() - start < pause_seconds:
        time.sleep(1)
        if snapshot_interval > 0 and time.time() >= next_snapshot:
            label = f"manual_{snapshot_index:03d}"
            append_navigation_state(driver, label)
            save_debug_artifacts(driver, label)
            snapshot_index += 1
            next_snapshot = time.time() + snapshot_interval

    append_navigation_state(driver, "final_timeout")
    save_debug_artifacts(driver, "final_timeout")


def fill_login_form(driver, corp_id: str, username: str, password: str, captcha_text: str) -> None:
    WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "corp-id"))).send_keys(corp_id)
    driver.find_element(By.ID, "user-id").send_keys(username)
    driver.find_element(By.ID, "password").send_keys(password)

    captcha_input_xpaths = [
        '//*[@id="main-content"]/mbb-welcome/div/div/div[2]/div[2]/div/mbb-login/form/div/div[2]/mbb-word-captcha/div/div[2]/div[1]/input',
        "//mbb-word-captcha//input",
    ]
    captcha_field = None
    for xpath in captcha_input_xpaths:
        try:
            captcha_field = WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.XPATH, xpath)))
            break
        except TimeoutException:
            continue
    if not captcha_field:
        raise RuntimeError("Captcha input field not found")

    captcha_field.send_keys(captcha_text)
    logger.info("Filled login fields. Password is not logged.")


def click_login(driver) -> None:
    login_button = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, "login-btn")))
    try:
        login_button.click()
    except Exception:
        driver.execute_script("arguments[0].click();", login_button)
    logger.info("Clicked login button")


def wait_for_login_result(driver, timeout: int = 12) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        current_url = driver.current_url
        if "/cp/" in current_url and "login" not in current_url:
            logger.info("Login success detected by URL: %s", current_url)
            return True

        error_texts = []
        for xpath in ["//mbb-dialog-error//p", "//div[contains(@class, 'error')]//p"]:
            try:
                for element in driver.find_elements(By.XPATH, xpath):
                    text = element.text.strip()
                    if text:
                        error_texts.append(text)
            except Exception:
                pass
        if error_texts:
            logger.error("Login error detected: %s", " | ".join(error_texts))
            return False
        time.sleep(0.5)

    logger.warning("Login result timeout. Current URL: %s", driver.current_url)
    return False


def write_report(args, login_success: Optional[bool], final_url: str) -> None:
    report = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "report_dir": str(REPORT_DIR),
        "login_url": LOGIN_URL,
        "transaction_url": TRANSACTION_URL,
        "browser": args.browser,
        "no_login": args.no_login,
        "corp_id": mask_secret(args.corp_id),
        "username": mask_secret(args.username),
        "password": "***" if args.password else "",
        "login_success": login_success,
        "final_url": final_url,
        "next_dev_notes": [
            "Inspect transaction page HTML/screenshot after manual login.",
            "Current crawler failed around XPath //*[@id=\"mat-radio-3\"]/label/div[1].",
            "Prefer stable selectors around visible text, form controls, or mbb-date-time-picker instead of generated mat-radio IDs.",
        ],
    }
    (REPORT_DIR / "manual_debug_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    markdown = f"""# MB Business Manual Debug Report

- Created: `{report['created_at']}`
- Login URL: `{LOGIN_URL}`
- Transaction URL: `{TRANSACTION_URL}`
- Browser: `{args.browser}`
- Login success: `{login_success}`
- Final URL: `{final_url}`
- Report folder: `{REPORT_DIR}`

## Current crawler failure

The current API run reached login successfully once, then failed on transaction page with:

`NoSuchElementException: //*[@id="mat-radio-3"]/label/div[1]`

This likely means the MB Business UI generated a different Material radio id or the page section had not loaded yet.

## Recommended next dev action

Use the saved HTML/screenshot from this folder and replace generated absolute XPath selectors with more stable selectors.
"""
    (REPORT_DIR / "README.md").write_text(markdown, encoding="utf-8")
    logger.info("Saved report: %s", REPORT_DIR / "manual_debug_report.json")
    logger.info("Saved report notes: %s", REPORT_DIR / "README.md")


def parse_args():
    parser = argparse.ArgumentParser(description="Open MB Business UI for manual debug and save report artifacts.")
    parser.add_argument("--corp-id", default=os.getenv("MB_CORP_ID", ""), help="MB Business corp ID")
    parser.add_argument("--username", default=os.getenv("MB_USERNAME", ""), help="MB Business username")
    parser.add_argument("--password", default=os.getenv("MB_PASSWORD", ""), help="MB Business password")
    parser.add_argument("--browser", default="chrome", choices=["chrome", "edge"], help="Browser to use")
    parser.add_argument("--no-login", action="store_true", help="Only open login page and keep browser open")
    parser.add_argument("--pause", type=int, default=900, help="Seconds to keep browser open for manual inspection")
    parser.add_argument("--snapshot-interval", type=int, default=30, help="Seconds between automatic screenshot/HTML/log snapshots. Use 0 to disable.")
    return parser.parse_args()


def main():
    args = parse_args()

    if not args.no_login:
        if not args.corp_id:
            args.corp_id = input("Corp ID: ").strip()
        if not args.username:
            args.username = input("Username: ").strip()
        if not args.password:
            args.password = getpass("Password: ")

    logger.info("Report folder: %s", REPORT_DIR)
    logger.info("Opening browser. Browser will stay open for manual debug.")

    driver = None
    login_success: Optional[bool] = None
    try:
        try:
            driver = create_driver(args.browser)
        except WebDriverException as exc:
            if args.browser == "edge":
                logger.warning("Edge failed, falling back to Chrome: %s", exc)
                args.browser = "chrome"
                driver = create_driver("chrome")
            else:
                raise

        driver.get(LOGIN_URL)
        time.sleep(1)
        close_initial_popup(driver)
        save_debug_artifacts(driver, "01_login_page")

        if not args.no_login:
            captcha_img = find_captcha_image(driver)
            if not captcha_img:
                raise RuntimeError("Could not find captcha image")

            captcha_text = read_captcha_from_element(captcha_img)
            logger.info("Captcha OCR result: %s", captcha_text)
            fill_login_form(driver, args.corp_id, args.username, args.password, captcha_text)
            save_debug_artifacts(driver, "02_login_form_filled")
            click_login(driver)
            login_success = wait_for_login_result(driver)
            save_debug_artifacts(driver, "03_after_login")

            if login_success:
                driver.get(TRANSACTION_URL)
                time.sleep(5)
                save_debug_artifacts(driver, "04_transaction_page")
                logger.info("Transaction page opened. Inspect and operate manually now.")
            else:
                logger.warning("Login did not succeed. Browser remains open for manual correction.")
        else:
            logger.info("--no-login selected. Login page is open for manual operation.")

        write_report(args, login_success, driver.current_url)
        logger.info("Manual debug URL: %s", driver.current_url)
        keep_browser_open(driver, args.pause, args.snapshot_interval)

    except KeyboardInterrupt:
        logger.info("Interrupted by user. Saving final artifacts before exit.")
        if driver:
            save_debug_artifacts(driver, "99_interrupted")
            write_report(args, login_success, driver.current_url)
    except Exception as exc:
        logger.exception("Manual debug failed: %s", exc)
        if driver:
            save_debug_artifacts(driver, "99_error")
            write_report(args, login_success, driver.current_url)
        raise
    finally:
        if driver:
            logger.info("Closing browser.")
            driver.quit()


if __name__ == "__main__":
    main()
