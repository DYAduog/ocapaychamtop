import os
import time
import logging
import base64
import json
import sys
import subprocess
from datetime import datetime, timedelta
import asyncio
import random
import socket
from typing import Optional, Dict, Any
import httpx
import re

# config logging
logger = logging.getLogger(__name__)

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
