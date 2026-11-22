import os
import httpx
from fastapi import APIRouter, Query

router = APIRouter()

GOOGLE_WEATHER_URL = "https://weather.googleapis.com/v1/currentConditions:lookup"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def parse_google_weather(data: dict, lat: float, lon: float) -> dict:
    temp_obj = data.get("temperature") or {}
    feels_obj = data.get("feelsLikeTemperature") or {}
    dew_obj = data.get("dewPoint") or {}
    precip_obj = data.get("precipitation") or {}
    prob_obj = precip_obj.get("probability") or {}
    qpf_obj = precip_obj.get("qpf") or {}
    wind_obj = data.get("wind") or {}
    wind_speed_obj = wind_obj.get("speed") or {}
    wind_dir_obj = wind_obj.get("direction") or {}
    pressure_obj = data.get("airPressure") or {}
    cond_obj = data.get("weatherCondition") or {}
    cond_desc = (cond_obj.get("description") or {}).get("text")

    return {
        "source": "Google Weather API",
        "lat": lat,
        "lon": lon,
        "observedAt": data.get("currentTime"),
        "isDaytime": data.get("isDaytime"),
        "condition": cond_desc or cond_obj.get("type") or "Brak opisu",
        "conditionType": cond_obj.get("type"),
        "temperature": temp_obj.get("degrees"),
        "feelsLikeTemperature": feels_obj.get("degrees"),
        "relativeHumidity": data.get("relativeHumidity"),
        "dewPoint": dew_obj.get("degrees"),
        "precipitationProbability": prob_obj.get("percent"),
        "precipitationAmount": qpf_obj.get("quantity"),
        "windSpeed": wind_speed_obj.get("value"),
        "windDirection": wind_dir_obj.get("cardinal"),
        "windDegrees": wind_dir_obj.get("degrees"),
        "airPressure": pressure_obj.get("meanSeaLevelMillibars"),
        "uvIndex": data.get("uvIndex"),
        "cloudCover": data.get("cloudCover"),
    }


@router.get("/")
async def get_weather(
    lat: float = Query(..., description="Szerokość geograficzna (Fields.y)"),
    lon: float = Query(..., description="Długość geograficzna (Fields.x)"),
):
    api_key = os.getenv("GOOGLE_WEATHER_API_KEY", "").strip()

    async with httpx.AsyncClient(timeout=8.0) as client:
        if api_key:
            try:
                resp = await client.get(
                    GOOGLE_WEATHER_URL,
                    params={
                        "key": api_key,
                        "location.latitude": lat,
                        "location.longitude": lon,
                        "languageCode": "pl",
                    },
                )
                if resp.status_code == 200:
                    return parse_google_weather(resp.json(), lat, lon)
            except Exception:
                pass

        # Fallback gdy brak klucza GOOGLE_WEATHER_API_KEY lub limit API
        om_resp = await client.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": (
                    "temperature_2m,relative_humidity_2m,apparent_temperature,"
                    "dew_point_2m,precipitation,cloud_cover,surface_pressure,"
                    "wind_speed_10m,wind_direction_10m,uv_index,is_day"
                ),
            },
        )
        om_resp.raise_for_status()
        cur = om_resp.json().get("current") or {}

        return {
            "source": "Weather API (fallback)",
            "lat": lat,
            "lon": lon,
            "observedAt": cur.get("time"),
            "isDaytime": bool(cur.get("is_day", 1)),
            "condition": "Warunki bieżące",
            "conditionType": "CLEAR",
            "temperature": cur.get("temperature_2m"),
            "feelsLikeTemperature": cur.get("apparent_temperature"),
            "relativeHumidity": cur.get("relative_humidity_2m"),
            "dewPoint": cur.get("dew_point_2m"),
            "precipitationProbability": None,
            "precipitationAmount": cur.get("precipitation"),
            "windSpeed": cur.get("wind_speed_10m"),
            "windDirection": None,
            "windDegrees": cur.get("wind_direction_10m"),
            "airPressure": cur.get("surface_pressure"),
            "uvIndex": cur.get("uv_index"),
            "cloudCover": cur.get("cloud_cover"),
        }