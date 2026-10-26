import asyncio
from playwright.sync_api import sync_playwright
from steel import Steel
import random
from playwright.async_api import async_playwright

def get_random_steel_key(file_path="list_key.txt"):
    with open(file_path, "r") as f:
        keys = [line.strip() for line in f if line.strip()]
    if not keys:
        raise ValueError("No API keys found in list_key.txt")
    return random.choice(keys)

# Initialize Steel with a random API key
STEEL_API_KEY = get_random_steel_key()
# Initialize Steel client with API key
# Replace "YOUR_STEEL_API_KEY" with your actual API key

client = Steel(steel_api_key=STEEL_API_KEY)

def get_cookies(url: str) -> dict:
    session = None
    browser = None
    cookie_dict = {}

    try:
        print("Creating Steel session...")
        session = client.sessions.create()
        print(f"Session created: {session.session_viewer_url}")

        playwright = sync_playwright().start()
        browser = playwright.chromium.connect_over_cdp(
            f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}"
        )
        print("Connected to browser")

        
        context = browser.contexts[0]
        context.clear_cookies()
        page = context.pages[0]

        print(f"Navigating to {url}")
        page.goto(url, wait_until="networkidle")

        page.wait_for_load_state("networkidle")

        page.wait_for_selector('text="Đăng nhập"', timeout=20000, state="attached")

        cookies = context.cookies()
        cookie_dict = {cookie["name"]: cookie["value"] for cookie in cookies}

    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if browser:
            browser.close()
            print("Browser closed")
        if session:
            client.sessions.release(session.id)
            print("Session released")

    return cookie_dict

async def get_cookies_pl():
    cookie_dict = {}


    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--disable-infobars",
                    "--start-maximized"
                ]
        )

        context = await browser.new_context(
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
                        viewport={"width": 1920, "height": 1080},
                        locale="en-US"
                    )

            # Patch stealth scripts
        await context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                window.navigator.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3]});
            """)
        page = await context.new_page()

        try:
            await page.goto('https://www.ncb-bank.vn/')

            await page.wait_for_load_state("networkidle")

            await page.screenshot(path="screenshot0.png")

            await page.goto('https://www.ncb-bank.vn/nganhangso.khcn',wait_until="domcontentloaded")


            await page.wait_for_load_state("networkidle")

            await page.screenshot(path="screenshot.png")
            print("Screenshot captured!")

        finally:
            await browser.close()
