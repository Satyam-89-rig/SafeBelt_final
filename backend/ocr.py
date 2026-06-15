"""
EasyOCR wrapper — lazy-loaded on first violation, never at startup.

Usage:
  - Call ensure_loaded() when a violation is detected (triggers background load).
  - Call read_plate(frame) to get text; returns None while model is loading.
  - Call is_ready() / is_loading() to report state to the frontend.
"""
import threading
import logging
import re

logger = logging.getLogger(__name__)

_reader  = None
_loading = False
_lock    = threading.Lock()


def _load_reader():
    global _reader, _loading
    try:
        import easyocr
        logger.info("EasyOCR: loading model (first-run may download ~100 MB)…")
        r = easyocr.Reader(["en"], gpu=False, verbose=False)
        with _lock:
            _reader = r
        logger.info("EasyOCR: ready.")
    except Exception as exc:
        logger.warning("EasyOCR failed to load: %s", exc)
    finally:
        with _lock:
            _loading = False


def ensure_loaded():
    """
    Kick off background EasyOCR load if not already started.
    Call this on first violation detection — NOT at startup.
    """
    global _loading
    with _lock:
        if _reader is not None or _loading:
            return
        _loading = True
    t = threading.Thread(target=_load_reader, daemon=True, name="easyocr-loader")
    t.start()
    logger.info("EasyOCR: background load triggered by first violation.")


def is_ready() -> bool:
    with _lock:
        return _reader is not None


def is_loading() -> bool:
    with _lock:
        return _loading


def score_plate_format(text: str) -> float:
    # Clean text to alphanumeric uppercase
    cleaned = re.sub(r'[^A-Z0-9]', '', text.upper())
    length = len(cleaned)
    if length < 6 or length > 12:
        return 0.0
        
    score = 0.0
    
    # Check if first two characters are state code (letters)
    if re.match(r'^[A-Z]{2}', cleaned):
        score += 2.0
    elif re.match(r'^[A-Z]', cleaned):
        score += 0.5
        
    # Check if next 2 characters are numbers (district code)
    if re.match(r'^[A-Z]{2}[0-9]{2}', cleaned):
        score += 2.0
    elif re.match(r'^[A-Z]{2}[0-9]', cleaned):
        score += 1.0
        
    # Check if ends with 4 numbers
    if re.search(r'[0-9]{4}$', cleaned):
        score += 3.0
    elif re.search(r'[0-9]{3}$', cleaned):
        score += 1.5
    elif re.search(r'[0-9]{2}$', cleaned):
        score += 0.5
        
    return score


def correct_plate_characters(text: str) -> str:
    cleaned = re.sub(r'[^A-Z0-9]', '', text.upper())
    if len(cleaned) < 6 or len(cleaned) > 12:
        return cleaned
        
    chars = list(cleaned)
    n = len(chars)
    
    to_letter = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B'}
    to_number = {'O': '0', 'I': '1', 'L': '1', 'Z': '2', 'S': '5', 'B': '8', 'T': '7'}
    
    # 1. First two characters should be letters
    for i in range(2):
        if chars[i] in to_letter:
            chars[i] = to_letter[chars[i]]
            
    # 2. Next two characters (index 2 and 3) should be numbers
    for i in range(2, 4):
        if i < n and chars[i] in to_number:
            chars[i] = to_number[chars[i]]
            
    # 3. Last four characters should be numbers
    for i in range(max(4, n - 4), n):
        if chars[i] in to_number:
            chars[i] = to_number[chars[i]]
            
    return "".join(chars)


def merge_horizontal_text(results) -> list[tuple[str, float]]:
    """
    Combine horizontally aligned text bounding boxes read by EasyOCR
    to handle plates that have spaces (e.g. MH12 EE 1234 -> MH12EE1234).
    """
    if not results:
        return []
        
    boxes = []
    for bbox, text, conf in results:
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(ys), max(ys)
        boxes.append({
            'xmin': xmin, 'xmax': xmax,
            'ymin': ymin, 'ymax': ymax,
            'text': text.strip(),
            'conf': conf
        })
        
    # Sort boxes by left-most position
    boxes = sorted(boxes, key=lambda b: b['xmin'])
    
    lines = []
    for box in boxes:
        placed = False
        for line in lines:
            ref = line[0]
            # Calculate vertical overlap
            overlap_ymin = max(box['ymin'], ref['ymin'])
            overlap_ymax = min(box['ymax'], ref['ymax'])
            overlap = overlap_ymax - overlap_ymin
            
            ref_height = ref['ymax'] - ref['ymin']
            box_height = box['ymax'] - box['ymin']
            min_height = min(ref_height, box_height)
            
            # If vertical overlap is significant, they belong to the same line/plate
            if min_height > 0 and (overlap / min_height) > 0.4:
                line.append(box)
                placed = True
                break
        if not placed:
            lines.append([box])
            
    merged_results = []
    for line in lines:
        full_text = " ".join([b['text'] for b in line])
        avg_conf = sum([b['conf'] for b in line]) / len(line)
        merged_results.append((full_text, avg_conf))
        
    return merged_results


def read_plate(frame) -> str | None:
    """
    Run OCR on frame, locate the plate using contours/preprocessing,
    merge horizontally aligned text blocks, correct characters, and
    score results based on standard Indian license plate formats.
    """
    with _lock:
        reader = _reader
    if reader is None:
        return None

    try:
        import cv2
        import numpy as np

        # Generate candidate images for OCR
        candidates = []

        # 1. Raw full frame
        candidates.append(frame)
        
        # 2. Contrast enhanced full frame (grayscale + CLAHE)
        try:
            gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            cl_frame = clahe.apply(gray_frame)
            candidates.append(cl_frame)
        except Exception:
            pass

        # 3. Try to isolate the license plate via edge and contour detection
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            cl = clahe.apply(gray)
            filtered = cv2.bilateralFilter(cl, 11, 17, 17)
            edged = cv2.Canny(filtered, 30, 200)
            
            contours, _ = cv2.findContours(edged.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            contours = sorted(contours, key=cv2.contourArea, reverse=True)[:15]

            for c in contours:
                peri = cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, 0.02 * peri, True)
                if len(approx) == 4:
                    x, y, w, h = cv2.boundingRect(approx)
                    aspect_ratio = float(w) / h
                    # Aspect ratio check for typical Indian plates (2.0 to 6.0)
                    if 2.0 <= aspect_ratio <= 6.0 and w > 30 and h > 10:
                        crop = frame[y:y+h, x:x+w]
                        
                        # Resize crop to make text larger (3x upscale)
                        crop_resized = cv2.resize(crop, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
                        candidates.append(crop_resized)
                        
                        # Preprocess crop (grayscale + CLAHE + Bilateral)
                        crop_gray = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2GRAY)
                        cl_crop = clahe.apply(crop_gray)
                        filt_crop = cv2.bilateralFilter(cl_crop, 9, 75, 75)
                        candidates.append(filt_crop)
                        
                        # Adaptive binarization crop
                        thresh_crop = cv2.adaptiveThreshold(filt_crop, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                                           cv2.THRESH_BINARY, 11, 2)
                        candidates.append(thresh_crop)
        except Exception:
            pass

        # Perform OCR and evaluate candidates
        best_plate = None
        best_score = -1.0

        for img in candidates:
            try:
                # Use beam search decoder for higher recognition accuracy
                results = reader.readtext(
                    img,
                    allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ",
                    decoder="beamsearch",
                    beamWidth=10,
                )
                
                # Merge horizontally aligned text boxes
                merged_results = merge_horizontal_text(results)
                
                for text_str, conf in merged_results:
                    if len(text_str) < 4:
                        continue

                    # Correct standard OCR character misreads
                    corrected = correct_plate_characters(text_str)
                    score = score_plate_format(corrected)

                    # Boost score if confidence is high
                    final_score = score + (conf * 2.0)

                    if final_score > best_score:
                        best_score = final_score
                        best_plate = corrected
            except Exception:
                pass

        if best_plate and best_score >= 4.5:
            # Clean plate string (remove any trailing/leading dashes or spaces)
            clean_res = re.sub(r'[^A-Z0-9]', '', best_plate)
            if 6 <= len(clean_res) <= 12:
                return clean_res
            
    except Exception as exc:
        logger.debug("OCR error: %s", exc)

    return None
