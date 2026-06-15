import re

def _normalise_status(raw):
    return raw

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

# Test cases
test_cases = [
    "RJ14CP749T",  # Should correct T to 7 -> RJ14CP7497
    "MHl2EEI234",  # Should correct l (lower L) to 1 and I to 1 -> MH12EE1234
    "DL03CAYOOOI", # Should correct OOOI to 0001 -> DL03CAY0001
    "SPEED LIMIT 40", # Noise
]

print("Running OCR correction tests:")
for tc in test_cases:
    corrected = correct_plate_characters(tc)
    score_orig = score_plate_format(tc)
    score_corr = score_plate_format(corrected)
    print(f"Original:  {tc:<18} (score: {score_orig})")
    print(f"Corrected: {corrected:<18} (score: {score_corr})")
    print("-" * 40)
