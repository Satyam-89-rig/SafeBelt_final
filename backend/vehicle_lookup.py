"""
Vehicle Lookup API integration.

Reads VEHICLE_API_KEY from env. Calls a configurable endpoint to retrieve
owner, make/model, color, fuel type, insurance, and PUC status by plate.

Configuration env vars:
  VEHICLE_API_KEY  – required; your API provider key
  VEHICLE_API_URL  – optional; defaults to the RapidAPI vehicleinfo endpoint

On any error (missing key, network error, bad response) returns VehicleInfo
with all fields as None — the frontend then displays "—" for each.

Field name mapping (JSON path in response):
  owner_name       ← response["owner_name"]
  make_model       ← response["make_model"]  or response["vehicle_model"]
  color            ← response["color"]        or response["vehicle_color"]
  fuel_type        ← response["fuel_type"]
  insurance_status ← response["insurance_status"] → normalised to ACTIVE/EXPIRED
  puc_status       ← response["puc_status"]        → normalised to ACTIVE/EXPIRED

If your provider uses different field names, edit _parse() below.
"""
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
_API_KEY = os.environ.get("VEHICLE_API_KEY", "")
_API_URL  = os.environ.get(
    "VEHICLE_API_URL",
    "https://backend.vahandetails.com/api/get-rc-details",
)
_API_HOST = os.environ.get(
    "VEHICLE_API_HOST",
    "vehicle-registration-plate-detail.p.rapidapi.com",
)

# ── Data model ────────────────────────────────────────────────────────────────
@dataclass
class VehicleInfo:
    owner_name:       Optional[str] = None   # masked e.g. "S*****R S***H"
    make_model:       Optional[str] = None   # e.g. "MARUTI SUZUKI SWIFT"
    color:            Optional[str] = None   # e.g. "WHITE"
    fuel_type:        Optional[str] = None   # e.g. "PETROL" / "PETROL(E20)"
    insurance_status: Optional[str] = None   # "ACTIVE" | "EXPIRED"
    puc_status:       Optional[str] = None   # "ACTIVE" | "EXPIRED"


# ── Helpers ───────────────────────────────────────────────────────────────────
def _normalise_status(raw: Optional[str]) -> Optional[str]:
    """Coerce various provider wordings to ACTIVE or EXPIRED."""
    if raw is None:
        return None
    up = raw.strip().upper()
    if any(w in up for w in ("ACTIVE", "VALID", "YES", "1", "TRUE")):
        return "ACTIVE"
    if any(w in up for w in ("EXPIRE", "INVALID", "NO", "0", "FALSE", "LAPSED")):
        return "EXPIRED"
    return up  # pass through unknown values verbatim


def _str_or_none(d: dict, *keys: str) -> Optional[str]:
    """Return first non-empty value found in dict for any of the given keys."""
    for k in keys:
        v = d.get(k)
        if v and str(v).strip():
            return str(v).strip().upper()
    return None


def _date_status(date_str: Optional[str]) -> Optional[str]:
    """Determine status based on a validity date string or fallback to normalisation."""
    if not date_str:
        return None
    try:
        # Extract date portion before 'T' (e.g. 2022-06-28)
        date_part = date_str.split("T")[0]
        dt = datetime.strptime(date_part, "%Y-%m-%d")
        if dt >= datetime.utcnow():
            return "ACTIVE"
        else:
            return "EXPIRED"
    except Exception:
        return _normalise_status(date_str)


def _parse(data: dict) -> VehicleInfo:
    """
    Map API response dict → VehicleInfo.
    Edit the key names here to match your actual API provider.
    """
    # Some providers nest data under a "result" or "data" key
    payload = data
    for nest in ("result", "data", "response", "vehicle_info"):
        if isinstance(data.get(nest), dict):
            payload = data[nest]
            break

    owner     = _str_or_none(payload,
                              "owner_name", "ownerName", "owner", "rc_owner_name")
    make_mdl  = _str_or_none(payload,
                              "make_model", "vehicle_model", "makeModel",
                              "rc_maker_model", "maker_model")
    color     = _str_or_none(payload,
                              "color", "vehicle_color", "vehicleColour",
                              "rc_colour", "colour", "rc_color", "rcColor")
    fuel      = _str_or_none(payload,
                              "fuel_type", "fuelType", "rc_fuel_desc",
                              "fuel_desc", "fuel")
    ins_raw   = _str_or_none(payload,
                              "insurance_status", "insuranceStatus",
                              "insurance_validity", "ins_status", "rc_insurance_upto", "rcInsuranceUpto")
    puc_raw   = _str_or_none(payload,
                              "puc_status", "pucStatus",
                              "pucc_validity", "puc_validity", "rc_pucc_upto", "rcPuccUpto", "rc_pucc_validity")

    return VehicleInfo(
        owner_name       = owner,
        make_model       = make_mdl,
        color            = color,
        fuel_type        = fuel,
        insurance_status = _date_status(ins_raw),
        puc_status       = _date_status(puc_raw),
    )


def _get_alternate_plates(plate: str) -> list[str]:
    """
    Generate variations of plate by swapping 1 and 4 in the last 4 characters.
    Handles typical OCR confusion where 1 is read as 4 or 4 as 1.
    """
    if len(plate) < 4:
        return []
    
    base = plate[:-4]
    last4 = plate[-4:]
    
    options = [last4]
    
    # 1. Swap all 1s with 4s and vice versa
    swapped = ""
    for char in last4:
        if char == '1':
            swapped += '4'
        elif char == '4':
            swapped += '1'
        else:
            swapped += char
    if swapped != last4:
        options.append(swapped)
        
    # 2. Swap only the last character if it is 1 or 4
    if last4[-1] in ('1', '4'):
        alt_last = last4[:-1] + ('4' if last4[-1] == '1' else '1')
        if alt_last not in options:
            options.append(alt_last)
            
    return [base + opt for opt in options if opt != last4]


def _do_lookup(plate: str) -> VehicleInfo:
    """Perform the actual API call for a specific plate string."""
    if not _API_KEY:
        logger.warning("VEHICLE_API_KEY not set — skipping vehicle lookup for plate %s", plate)
        return VehicleInfo()

    clean_plate = plate.replace(" ", "").upper()

    try:
        import httpx  # lazy import

        headers = {
            "Content-Type": "application/json",
            "x-api-key": _API_KEY,
            "Origin": "https://vahandetails.com",
            "Referer": "https://vahandetails.com/"
        }

        resp = httpx.post(
            _API_URL,
            json={"rc_number": clean_plate},
            headers=headers,
            timeout=8.0,
        )

        if resp.status_code != 200:
            return VehicleInfo()

        data = resp.json()
        info = _parse(data)
        return info

    except Exception as exc:
        logger.debug("API call error for plate %s: %s", plate, exc)
        return VehicleInfo()


# ── Public API ────────────────────────────────────────────────────────────────
def lookup(plate: str) -> VehicleInfo:
    """
    Fetch vehicle details for *plate* from the configured API.
    Attempts fallback lookups by swapping confusing digits (1 and 4) if the primary lookup fails.
    """
    # Try primary lookup
    info = _do_lookup(plate)
    if info.owner_name is not None:
        logger.info("Vehicle lookup OK for %s → %s / %s", plate, info.make_model, info.owner_name)
        return info

    # Try alternate plates swapping 1 and 4
    clean_plate = plate.replace(" ", "").upper()
    alternates = _get_alternate_plates(clean_plate)
    for alt in alternates:
        logger.info("Primary lookup failed for %s. Retrying alternate: %s", clean_plate, alt)
        alt_info = _do_lookup(alt)
        if alt_info.owner_name is not None:
            logger.info("Vehicle lookup OK (via alternate %s) → %s / %s", alt, alt_info.make_model, alt_info.owner_name)
            return alt_info

    logger.warning("Vehicle API lookup failed for plate %s and all alternates.", plate)
    return info
