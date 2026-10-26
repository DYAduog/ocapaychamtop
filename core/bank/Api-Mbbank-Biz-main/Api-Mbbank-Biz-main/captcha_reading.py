import easyocr
import cv2
import numpy as np
import os
import io
from datetime import datetime

def preprocess_image(image_source, is_bytes=False, save_images=True):
    """
    Preprocess the image to make it more readable for OCR
    
    Parameters:
    - image_source: path to the captcha image or bytes of image
    - is_bytes: whether the image_source is raw bytes
    - save_images: whether to save original and preprocessed images
    
    Returns:
    - processed image as a numpy array
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create captcha_image directory if it doesn't exist
    captcha_dir = os.path.join(os.path.dirname(__file__), "captcha_image")
    if not os.path.exists(captcha_dir):
        os.makedirs(captcha_dir)
        
    # Read the image
    if is_bytes:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_source, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Save original image if requested
        if save_images:
            original_path = os.path.join(captcha_dir, f"original_captcha_{timestamp}.png")
            cv2.imwrite(original_path, img)
            print(f"Original captcha saved to: {original_path}")
    else:
        img = cv2.imread(image_source)
        
        # Save original image with timestamp if requested
        if save_images:
            original_path = os.path.join(captcha_dir, f"original_captcha_{timestamp}.png")
            cv2.imwrite(original_path, img)
            print(f"Original captcha saved to: {original_path}")
        
    if img is None:
        raise ValueError(f"Could not read image {'from bytes' if is_bytes else f'at {image_source}'}")
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Make all non-black (not 100% black) pixels white
    # Adjust the threshold (0-30) as needed - lower means only very dark pixels stay black
    _, binary = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)
    
    # Additional preprocessing for better OCR results
    # Remove noise
    kernel = np.ones((1, 1), np.uint8)
    opening = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
    
    # Dilate to make characters more prominent
    kernel = np.ones((2, 2), np.uint8)
    dilated = cv2.dilate(opening, kernel, iterations=1)
    
    # Save preprocessed image with timestamp if requested
    if save_images:
        preprocessed_path = os.path.join(captcha_dir, f"preprocessed_captcha_{timestamp}.png")
        cv2.imwrite(preprocessed_path, dilated)
        print(f"Preprocessed captcha saved to: {preprocessed_path}")
    
    return dilated

# Tạo đối tượng OCR với mô hình tiếng Anh
reader = easyocr.Reader(['en'])

def read_captcha(image_source, is_bytes=False, save_images=True):
    """
    Read text from captcha image with preprocessing
    
    Parameters:
    - image_source: path to the captcha image or bytes of image
    - is_bytes: whether the image_source is raw bytes
    - save_images: whether to save original and preprocessed images
    
    Returns:
    - captcha text
    """
    try:
        # Preprocess the image
        processed_img = preprocess_image(image_source, is_bytes, save_images)
        
        # Use the preprocessed image for OCR
        result = reader.readtext(processed_img)
        
        # Extract and combine the text
        if result:
            captcha_text = ''.join([text[1] for text in result])
            return captcha_text
        else:
            # If no text found in preprocessed image, try with original
            print("Trying with original image...")
            if is_bytes:
                # For bytes, we need to convert to a format EasyOCR can read
                nparr = np.frombuffer(image_source, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                result = reader.readtext(img)
            else:
                result = reader.readtext(image_source)
                
            captcha_text = ''.join([text[1] for text in result])
            return captcha_text
    
    except Exception as e:
        print(f"Error processing captcha: {e}")
        return ""

# Main execution
if __name__ == "__main__":
    image_path = "image.png"  # Đường dẫn ảnh của bạn
    
    captcha_text = read_captcha(image_path).replace(" ", "")
    print("Mã captcha:", captcha_text)
