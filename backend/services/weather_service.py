"""
Current weather for the outfit look-check, via Open-Meteo (free, no API key).
Non-fatal by design: any failure returns None and the look-check reports its
weather check as "unknown" instead of guessing.
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_URL = "https://api.open-meteo.com/v1/forecast"
# WMO weather codes for drizzle, rain, freezing rain, showers, thunderstorms.
_RAIN_CODES = set(range(51, 68)) | set(range(80, 83)) | {95, 96, 99}


async def get_current_weather(lat: float, lon: float) -> Optional[dict]:
    """Returns {"temp_c": float, "raining": bool, "source": "open-meteo"} or None."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,weather_code",
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(_URL, params=params)
            resp.raise_for_status()
            current = resp.json().get("current") or {}
    except Exception as e:
        logger.warning(f"Open-Meteo lookup failed ({lat},{lon}): {e}")
        return None

    temp = current.get("temperature_2m")
    if temp is None:
        return None
    raining = (current.get("precipitation") or 0) > 0 or current.get("weather_code") in _RAIN_CODES
    return {"temp_c": float(temp), "raining": bool(raining), "source": "open-meteo"}
