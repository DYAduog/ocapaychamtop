import easyocr
import cv2
import numpy as np
import os
from datetime import datetime
import logging
import base64
from PIL import Image
import warnings

# Suppress NNPACK warnings
warnings.filterwarnings("ignore", message="Could not initialize NNPACK!")

# Configure logging
logger = logging.getLogger(__name__)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Initialize EasyOCR with specific settings
reader = easyocr.Reader(['en'], gpu=False)

def preprocess_image(image_source, is_bytes=False, save_image=True):
    """
    Enhanced preprocessing for captcha images:
    1. Convert to grayscale
    2. Apply binary threshold to turn every non-black pixel to white
    """
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    captcha_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'captcha_image')
    if not os.path.exists(captcha_dir):
        os.makedirs(captcha_dir)
    
    # Load the image
    if is_bytes:
        nparr = np.frombuffer(image_source, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    else:
        original_img = cv2.imread(image_source)
    
    if original_img is None:
        raise ValueError("Image not found or unable to read the image.")
    
    # Save the original image if requested
    if save_image:
        original_path = os.path.join(captcha_dir, f"original_{timestamp}.png")
        cv2.imwrite(original_path, original_img)
        logger.info(f"Original image saved at {original_path}")
    
    # Step 1: Convert to grayscale
    gray = cv2.cvtColor(original_img, cv2.COLOR_BGR2GRAY)
    
    # Step 2: Apply strict binary threshold (around 50) to make non-black pixels white
    # This will keep only very dark pixels (0-50) as black (0) and turn everything else white (255)
    _, binary = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY)
    
    # Step 3: Apply noise removal
    kernel = np.ones((2, 2), np.uint8)
    processed_img = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    
    # Save the processed images if requested
    if save_image:
        processed_path = os.path.join(captcha_dir, f"processed_{timestamp}.png")
        cv2.imwrite(processed_path, processed_img)
        logger.info(f"Final processed image saved at {processed_path}")

    return processed_img

def read_captcha(image_source, is_bytes=False, save_images=True):
    """
    Read captcha by preprocessing the image and applying OCR
    """
    try:
        # Get processed image (grayscale with non-black pixels made white)
        processed_img = preprocess_image(image_source, is_bytes, save_images)
        
        # Apply EasyOCR with optimized settings
        result = reader.readtext(
            processed_img,
            allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            paragraph=False,
            detail=0
        )
        
        # Process the result
        if result:
            captcha_text = ''.join(result).replace(" ", "")
            logger.info(f"Captcha text detected: {captcha_text}")
            
            # If we get a reasonable result (4-8 characters), return it
            if 4 <= len(captcha_text) <= 8:
                return captcha_text
            else:
                logger.warning(f"Suspicious captcha length: {len(captcha_text)}")
        else:
            logger.warning("No text detected in the processed image")
        
        # If the processed image doesn't yield good results, try with just grayscale
        if is_bytes:
            nparr = np.frombuffer(image_source, np.uint8)
            original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            gray = cv2.cvtColor(original_img, cv2.COLOR_BGR2GRAY)
        else:
            original_img = cv2.imread(image_source)
            gray = cv2.cvtColor(original_img, cv2.COLOR_BGR2GRAY)
        
        # Try OCR on the grayscale image
        gray_result = reader.readtext(
            gray,
            allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
            paragraph=False,
            detail=0
        )
        
        if gray_result:
            gray_text = ''.join(gray_result).replace(" ", "")
            logger.info(f"Captcha text detected from grayscale: {gray_text}")
            
            if 4 <= len(gray_text) <= 8:
                return gray_text
        
        # If neither approach works well, return the best result we have
        if result:
            return ''.join(result).replace(" ", "")
        elif gray_result:
            return ''.join(gray_result).replace(" ", "")
        else:
            logger.error("Could not detect any text from the captcha")
            return ""
            
    except Exception as e:
        logger.error(f"Error processing captcha: {e}")
        return ""
