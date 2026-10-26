"""
Selenium WebDriver setup and management module.
Provides a global WebDriver instance and dependency injection for FastAPI.
"""
import logging
import os
from selenium import webdriver
# from selenium.webdriver.edge.options import Options
from fastapi import Depends

# Configure logging
logger = logging.getLogger(__name__)

# Global WebDriver instance
driver = None

def get_selenium_hub_url():
    """Get the correct Selenium Hub URL based on environment"""
    selenium_host = os.getenv("SELENIUM_HOST", "selenium-hub")
    selenium_port = os.getenv("SELENIUM_PORT", "4444")
    return f"http://{selenium_host}:{selenium_port}/wd/hub"

def setup_driver():
    """Create and configure a new Edge WebDriver instance"""
    global driver
    try:
        options = webdriver.EdgeOptions()
        
        # FORCE DESKTOP RENDERING - This is the key fix
        options.add_argument("--window-size=1920,1080")  # Desktop resolution
        options.add_argument("--start-maximized")
        options.add_argument("--disable-notifications")
        options.add_argument("--headless")  # Run in headless mode
        
        # CRITICAL: Force desktop user agent (not mobile)
        desktop_user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
        options.add_argument(f"--user-agent={desktop_user_agent}")
        
        # Force desktop viewport and disable mobile emulation
        options.add_argument("--disable-mobile-emulation")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-blink-features=AutomationControlled")
        
        # Force desktop rendering mode
        options.add_argument("--force-device-scale-factor=1")
        options.add_argument("--disable-features=VizDisplayCompositor")
        
        # Set viewport size explicitly
        options.add_experimental_option("mobileEmulation", {"deviceMetrics": {"width": 1920, "height": 1080, "pixelRatio": 1}})
        
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
        
        # FORCE DESKTOP VIEWPORT AFTER DRIVER CREATION
        driver.set_window_size(1920, 1080)
        driver.maximize_window()
        
        # Execute JavaScript to override any mobile detection
        driver.execute_script("""
            // Override mobile detection
            Object.defineProperty(navigator, 'userAgent', {
                get: function() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'; }
            });
            
            // Set desktop viewport
            window.screen = {
                width: 1920,
                height: 1080,
                availWidth: 1920,
                availHeight: 1040
            };
            
            // Override touch capabilities
            Object.defineProperty(navigator, 'maxTouchPoints', {
                get: function() { return 0; }
            });
        """)
        
        logger.info("Created new WebDriver session with FORCED DESKTOP rendering")
        logger.info(f"User Agent: {driver.execute_script('return navigator.userAgent;')}")
        logger.info(f"Viewport: {driver.get_window_size()}")
        
        return driver
    except Exception as e:
        logger.error(f"Error setting up WebDriver: {e}")
        return None

def init_driver():
    """Initialize the global WebDriver instance."""
    global driver
    if driver is None:
        logger.info("Initializing WebDriver on application startup...")
        driver = setup_driver()
        if driver:
            logger.info("WebDriver initialized successfully.")
        else:
            logger.error("Failed to initialize WebDriver!")
    return driver

def close_driver():
    """Close the global WebDriver instance."""
    global driver
    if driver:
        logger.info("Closing WebDriver on application shutdown...")
        try:
            driver.quit()
        except Exception as e:
            logger.error(f"Error closing WebDriver: {e}")
        finally:
            driver = None

def get_driver():
    """Dependency function to provide the WebDriver instance to routes."""
    global driver
    if driver is None:
        logger.warning("WebDriver not initialized! Attempting to initialize now.")
        driver = init_driver()
    return driver
