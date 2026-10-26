#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Gateway - Local Offline Captcha Solver Engine
Module giải Captcha tự động 100% Offline (Không phụ thuộc bên thứ 3)
Sử dụng Deep Learning OCR (ddddocr ONNX) + OpenCV Image Preprocessing.
=============================================================================
"""

import os
import sys
import time
import base64
import io
import re
from typing import Union, Optional, Dict, Any
from PIL import Image

# Import deep learning OCR engine
try:
    import ddddocr
    HAS_DDDDOCR = True
except ImportError:
    HAS_DDDDOCR = False

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False

try:
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

CHARACTERS_MB = [
    'K', 'M', 'C', 'e', 'g', 'k', 'u', 'z', 't', '3', 'U', 'a', '5', 'A', 'y', 'H', 'q', 'Z', 'V', '7',
    'Q', '2', '4', 'Y', '-', 'h', '8', 'v', '6', 'd', 'b', 'n', 'p', 'P', 'E', 'c', 'm', 'D', 'B', '9',
    'N', 'G'
]


class LocalCaptchaSolver:
    """
    Bộ giải Captcha Offline bằng Deep Learning (ONNX) và OpenCV.
    - Tốc độ: ~5ms - 20ms / ảnh
    - Hỗ trợ chuyên biệt model_mb.onnx phân biệt chuẩn xác chữ hoa/thường cho MBBank
    - Tự động fallback ddddocr cho các ngân hàng khác (VCB, BIDV, Viettin, ACB...)
    - Chạy hoàn toàn cục bộ 100% Offline, không phụ thuộc API bên thứ 3
    """

    _instance = None
    _ocr = None
    _mb_session = None

    def __new__(cls, *args, **kwargs):
        # Singleton pattern để chỉ tải mô hình ONNX vào RAM một lần duy nhất
        if cls._instance is None:
            cls._instance = super(LocalCaptchaSolver, cls).__new__(cls)
        return cls._instance

    def __init__(self, show_ad: bool = False):
        if self._ocr is None and HAS_DDDDOCR:
            try:
                # Tắt quảng cáo ddddocr và nạp mô hình vào bộ nhớ
                self._ocr = ddddocr.DdddOcr(show_ad=show_ad)
            except Exception as e:
                print(f"[CaptchaSolver] Lỗi khởi tạo ddddocr: {e}", file=sys.stderr)

    @classmethod
    def get_ocr(cls):
        if cls._ocr is None and HAS_DDDDOCR:
            cls._ocr = ddddocr.DdddOcr(show_ad=False)
        return cls._ocr

    @classmethod
    def get_mb_session(cls):
        """Khởi tạo và cache ONNX InferenceSession cho mô hình chuyên biệt MBBank"""
        if cls._mb_session is None and HAS_ONNX:
            search_paths = [
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_mb.onnx"),
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "core", "bank", "bank-captcha-main", "bank-captcha-main", "model_mb.onnx"),
                r"d:\7bank\model_mb.onnx",
                r"d:\7bank\core\bank\bank-captcha-main\bank-captcha-main\model_mb.onnx",
            ]
            for p in search_paths:
                if os.path.isfile(p):
                    try:
                        cls._mb_session = ort.InferenceSession(p)
                        break
                    except Exception as e:
                        print(f"[CaptchaSolver] Lỗi tải model_mb.onnx từ {p}: {e}", file=sys.stderr)
        return cls._mb_session

    def solve_mb_onnx(self, img_bytes: bytes) -> Optional[str]:
        """Giải captcha MBBank bằng model ONNX chuyên biệt giữ nguyên chữ hoa/thường"""
        session = self.get_mb_session()
        if session is None or not HAS_OPENCV:
            return None
        try:
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if img is None:
                return None
            img = cv2.resize(img, (320, 80)).astype(np.float32) / 255.0
            img = np.transpose(np.expand_dims(img, axis=-1), (1, 0, 2))
            inp = np.expand_dims(img, axis=0) # Shape (1, 320, 80, 1)
            outputs = session.run(None, {'image': inp})
            argmax = np.argmax(outputs[0][0], axis=-1)
            text = []
            prev = -1
            for idx in argmax:
                if idx != prev:
                    if 0 < idx <= len(CHARACTERS_MB):
                        char = CHARACTERS_MB[idx - 1]
                        if char != '-':
                            text.append(char)
                    prev = idx
            result_str = ''.join(text).strip()
            if len(result_str) >= 4:
                return result_str
        except Exception as e:
            print(f"[CaptchaSolver] Lỗi solve_mb_onnx: {e}", file=sys.stderr)
        return None

    def clean_base64(self, b64_str: str) -> str:
        """Loại bỏ tiền tố data:image/png;base64,... nếu có"""
        if "," in b64_str:
            return b64_str.split(",", 1)[1].strip()
        return b64_str.strip()

    def preprocess_image(self, image_bytes: bytes) -> bytes:
        """
        Tiền xử lý ảnh captcha bằng OpenCV:
        - Tăng độ tương phản
        - Chuyển xám và nhị phân hóa (Otsu threshold)
        - Giảm nhiễu hạt và làm nét đường viền chữ
        """
        if not HAS_OPENCV:
            return image_bytes

        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return image_bytes

            # 1. Chuyển sang ảnh xám
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            # 2. Tăng cường độ tương phản (CLAHE)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)

            # 3. Khử nhiễu nhẹ
            denoised = cv2.medianBlur(enhanced, 3)

            # 4. Nhị phân hóa Otsu
            _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            # Encode lại ra PNG bytes
            is_success, buffer = cv2.imencode(".png", thresh)
            if is_success:
                return buffer.tobytes()
        except Exception:
            pass

        return image_bytes

    def solve(
        self,
        image_input: Union[str, bytes, io.BytesIO],
        use_preprocessing: bool = False,
        char_whitelist: Optional[str] = None,
        bank_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Giải mã captcha từ nhiều nguồn đầu vào:
        - Base64 string
        - Đường dẫn file ảnh cục bộ
        - Raw bytes
        - BytesIO stream
        - URL ảnh HTTP/HTTPS

        Trả về Dictionary:
          {"status": True, "prediction": "ABCD", "time_ms": 25.4, "method": "local_ocr"}
        """
        start_time = time.time()
        img_bytes = None

        # 1. Xác định kiểu đầu vào
        if isinstance(image_input, bytes):
            img_bytes = image_input
        elif isinstance(image_input, io.BytesIO):
            img_bytes = image_input.getvalue()
        elif isinstance(image_input, str):
            input_str = image_input.strip()

            # Nếu là URL
            if input_str.startswith("http://") or input_str.startswith("https://"):
                if HAS_REQUESTS:
                    try:
                        r = requests.get(input_str, timeout=10)
                        if r.status_code == 200:
                            img_bytes = r.content
                    except Exception as e:
                        return {"status": False, "msg": f"Không thể tải ảnh từ URL: {e}", "prediction": ""}
                else:
                    return {"status": False, "msg": "Thiếu thư viện requests để tải URL", "prediction": ""}

            # Nếu là đường dẫn file tồn tại
            elif os.path.isfile(input_str):
                try:
                    with open(input_str, "rb") as f:
                        img_bytes = f.read()
                except Exception as e:
                    return {"status": False, "msg": f"Không thể đọc file {input_str}: {e}", "prediction": ""}

            # Nếu là chuỗi Base64
            else:
                try:
                    cleaned_b64 = self.clean_base64(input_str)
                    img_bytes = base64.b64decode(cleaned_b64)
                except Exception as e:
                    return {"status": False, "msg": f"Base64 không hợp lệ: {e}", "prediction": ""}

        if not img_bytes:
            return {"status": False, "msg": "Không có dữ liệu ảnh hợp lệ", "prediction": ""}

        # 2. Kiểm tra nếu là MBBank hoặc ảnh có kích thước đặc trưng của MBBank (160x50)
        is_mbbank = False
        if bank_type and ("mb" in str(bank_type).lower()):
            is_mbbank = True
        elif HAS_OPENCV:
            try:
                nparr = np.frombuffer(img_bytes, np.uint8)
                probe_img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
                if probe_img is not None:
                    h, w = probe_img.shape[:2]
                    # Kích thước captcha chuẩn MBBank là 160 x 50 (tỉ lệ 3.2)
                    if (w == 160 and h == 50) or (abs(w / max(h, 1) - 3.2) < 0.2 and 40 <= h <= 60):
                        is_mbbank = True
            except Exception:
                pass

        if is_mbbank:
            mb_pred = self.solve_mb_onnx(img_bytes)
            if mb_pred:
                elapsed_ms = round((time.time() - start_time) * 1000, 2)
                return {
                    "status": True,
                    "prediction": mb_pred,
                    "captcha": mb_pred,
                    "time_ms": elapsed_ms,
                    "method": "local_mb_onnx"
                }

        # 3. Khởi tạo OCR engine mặc định (ddddocr) cho các ngân hàng khác
        ocr = self.get_ocr()
        if not ocr:
            return {"status": False, "msg": "Chưa cài đặt thư viện ddddocr (pip install ddddocr)", "prediction": ""}

        # 4. Lần nhận diện 1: Ảnh gốc
        text = ""
        try:
            target_bytes = img_bytes
            if use_preprocessing:
                target_bytes = self.preprocess_image(img_bytes)

            text = ocr.classification(target_bytes)
        except Exception as e:
            # Fallback nếu thử ảnh gốc lỗi -> thử tiền xử lý
            try:
                processed_bytes = self.preprocess_image(img_bytes)
                text = ocr.classification(processed_bytes)
            except Exception as e2:
                return {"status": False, "msg": f"Lỗi nhận diện OCR: {e2}", "prediction": ""}

        # Nếu nhận diện rỗng mà chưa thử preprocess -> thử tiền xử lý
        if (not text or len(text.strip()) == 0) and not use_preprocessing:
            try:
                processed_bytes = self.preprocess_image(img_bytes)
                text = ocr.classification(processed_bytes)
            except Exception:
                pass

        # 5. Hậu xử lý kết quả
        cleaned_text = str(text or "").strip()
        # Loại bỏ các ký tự đặc biệt vô nghĩa nếu có
        cleaned_text = re.sub(r"[^a-zA-Z0-9]", "", cleaned_text)

        if char_whitelist:
            cleaned_text = "".join([c for c in cleaned_text if c in char_whitelist])

        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        if cleaned_text:
            return {
                "status": True,
                "prediction": cleaned_text,
                "captcha": cleaned_text,
                "time_ms": elapsed_ms,
                "method": "local_ddddocr"
            }
        else:
            return {
                "status": False,
                "prediction": "",
                "captcha": "",
                "msg": "Không nhận diện được ký tự trong ảnh",
                "time_ms": elapsed_ms,
                "method": "local_ddddocr"
            }


# Khởi tạo singleton dùng nhanh
_default_solver = LocalCaptchaSolver()


def solve_captcha(
    image_input: Union[str, bytes, io.BytesIO],
    use_preprocessing: bool = False,
    bank_type: Optional[str] = None
) -> str:
    """Hàm tiện ích gọi trực tiếp trả về chuỗi text kết quả"""
    res = _default_solver.solve(image_input, use_preprocessing=use_preprocessing, bank_type=bank_type)
    return res.get("prediction", "")


def solve_captcha_dict(
    image_input: Union[str, bytes, io.BytesIO],
    use_preprocessing: bool = False,
    bank_type: Optional[str] = None
) -> Dict[str, Any]:
    """Hàm tiện ích trả về dictionary kết quả chi tiết"""
    return _default_solver.solve(image_input, use_preprocessing=use_preprocessing, bank_type=bank_type)


# =============================================================================
# Microservice HTTP Server (Tương thích 100% với pay2world.vip / thueapibank)
# =============================================================================
def start_local_captcha_server(host: str = "127.0.0.1", port: int = 8088):
    """
    Chạy một máy chủ HTTP mini nội bộ để thay thế hoàn toàn cho pay2world.vip
    API tương thích:
      POST http://127.0.0.1:8088/pgbank
      Payload: {"image_base64": "..."}
      Response: {"status": true, "prediction": "ABCD", "time_ms": 25.4}
    """
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    import uvicorn

    api_app = FastAPI(title="7Bank Local Captcha Solver Microservice", version="1.0.0")

    @api_app.get("/")
    def root():
        return {
            "status": "online",
            "service": "7Bank Local Offline Captcha Solver Engine",
            "engine": "model_mb.onnx + ddddocr + ONNX Runtime",
            "offline": True
        }

    @api_app.post("/pgbank")
    @api_app.post("/solve")
    @api_app.post("/api/captcha")
    async def solve_endpoint(request: Request):
        try:
            body = await request.json()
        except Exception:
            body = {}

        # Hỗ trợ nhiều tên trường khác nhau (image_base64, base64, image, img)
        b64 = (
            body.get("image_base64")
            or body.get("base64")
            or body.get("image")
            or body.get("img")
            or ""
        )
        bank_type = (
            body.get("bank_type")
            or body.get("type")
            or body.get("bank")
            or ""
        )
        if not b64:
            return JSONResponse(status_code=400, content={"status": False, "msg": "Thiếu dữ liệu image_base64"})

        result = solve_captcha_dict(b64, bank_type=bank_type)
        return JSONResponse(content=result)

    print(f"\n========================================================")
    print(f"🚀 LOCAL CAPTCHA SOLVER SERVER ĐANG CHẠY TẠI:")
    print(f"👉 http://{host}:{port}/pgbank")
    print(f"👉 http://{host}:{port}/solve")
    print(f"========================================================\n")
    uvicorn.run(api_app, host=host, port=port)


if __name__ == "__main__":
    if "--server" in sys.argv:
        port = 8088
        for arg in sys.argv:
            if arg.startswith("--port="):
                port = int(arg.split("=")[1])
        start_local_captcha_server(port=port)
    else:
        print("[CaptchaSolver] Module đã sẵn sàng. Chạy 'python test_captcha.py' để test!")
